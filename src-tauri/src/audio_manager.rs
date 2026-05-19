use std::collections::VecDeque;
use std::fs::File;
use std::sync::atomic::{AtomicI32, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, OutputCallbackInfo, SampleFormat, Stream, StreamConfig};
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error;
use symphonia::core::formats::{FormatReader, FormatOptions, SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::Time;

const FFT_SIZE: usize = 1024;
const FFT_BINS: usize = 256;
const RING_CAPACITY: usize = 44100 * 8;

enum Command {
    Stop,
    Seek(f64),
    Pause,
    Resume,
}

struct AtomicF64(AtomicU64);

impl AtomicF64 {
    const fn new(v: f64) -> Self {
        Self(AtomicU64::new(v.to_bits()))
    }
    fn load(&self, order: Ordering) -> f64 {
        f64::from_bits(self.0.load(order))
    }
    fn store(&self, v: f64, order: Ordering) {
        self.0.store(v.to_bits(), order);
    }
}

struct Inner {
    ring: VecDeque<f32>,
    volume: f32,
    is_muted: bool,
    volume_before_mute: f32,
}

pub struct AudioManager {
    inner: Arc<Mutex<Inner>>,
    fft_state: Arc<Mutex<Vec<f32>>>,
    cmd_tx: Option<Sender<Command>>,
    decoder_handle: Option<JoinHandle<()>>,
    cpal_stream: Option<Stream>,
    play_state: Arc<AtomicI32>,
    is_finished: Arc<AtomicI32>,
    position: Arc<AtomicF64>,
    duration: Arc<AtomicF64>,
}

impl AudioManager {
    pub fn new(fft_state: Arc<Mutex<Vec<f32>>>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                ring: VecDeque::with_capacity(RING_CAPACITY),
                volume: 1.0,
                is_muted: false,
                volume_before_mute: 1.0,
            })),
            fft_state,
            cmd_tx: None,
            decoder_handle: None,
            cpal_stream: None,
            play_state: Arc::new(AtomicI32::new(0)),
            is_finished: Arc::new(AtomicI32::new(0)),
            position: Arc::new(AtomicF64::new(0.0)),
            duration: Arc::new(AtomicF64::new(0.0)),
        }
    }

    pub fn odtwarzaj(&mut self, sciezka: &str) -> Result<(), String> {
        self.stop_current();

        let path = std::path::Path::new(sciezka);
        if !path.exists() {
            return Err("FileNotFound".to_string());
        }

        let file = File::open(path).map_err(|e| format!("Cannot open file: {}", e))?;
        let mss = MediaSourceStream::new(Box::new(file), Default::default());
        let hint = Hint::new();
        let probed = symphonia::default::get_probe()
            .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
            .map_err(|e| format!("Format error: {}", e))?;

        let format = probed.format;
        let track = format
            .tracks()
            .first()
            .ok_or_else(|| "No audio track".to_string())?
            .clone();

        let codec_params = track.codec_params;
        let track_id = track.id;
        let sample_rate = codec_params.sample_rate.unwrap_or(44100);
        let channels = codec_params.channels.map(|c| c.count() as u16).unwrap_or(2);
        let duration = codec_params
            .n_frames
            .map(|n| n as f64 / sample_rate as f64)
            .unwrap_or(0.0);

        {
            let mut inner = self.inner.lock().unwrap();
            inner.ring.clear();
        }
        {
            let mut fft = self.fft_state.lock().unwrap();
            fft.fill(0.0);
        }

        let (cmd_tx, cmd_rx) = mpsc::channel();
        self.cmd_tx = Some(cmd_tx);
        self.duration.store(duration, Ordering::Release);
        self.position.store(0.0, Ordering::Release);
        self.play_state.store(1, Ordering::Release);
        self.is_finished.store(0, Ordering::Release);

        let inner_for_stream = self.inner.clone();
        let ps_for_stream = self.play_state.clone();
        let stream = Self::create_output_stream(inner_for_stream, ps_for_stream, sample_rate, channels)?;
        self.cpal_stream = Some(stream);

        let inner_for_decode = self.inner.clone();
        let fft_for_decode = self.fft_state.clone();
        let play_state = self.play_state.clone();
        let is_finished = self.is_finished.clone();
        let position = self.position.clone();
        let mut planner = FftPlanner::new();
        let fft_plan = planner.plan_fft_forward(FFT_SIZE);

        let handle = thread::Builder::new()
            .name("pulse-decode".into())
            .spawn(move || {
                Self::decoder_thread(
                    format,
                    codec_params,
                    track_id,
                    inner_for_decode,
                    fft_for_decode,
                    cmd_rx,
                    play_state,
                    is_finished,
                    position,
                    fft_plan,
                    sample_rate as f64,
                    channels as usize,
                );
            })
            .map_err(|e| format!("Thread spawn error: {}", e))?;

        self.decoder_handle = Some(handle);
        Ok(())
    }

    fn stop_current(&mut self) {
        if let Some(tx) = self.cmd_tx.take() {
            let _ = tx.send(Command::Stop);
        }
        if let Some(handle) = self.decoder_handle.take() {
            let _ = handle.join();
        }
        self.cpal_stream = None;
        self.play_state.store(0, Ordering::Release);
        self.is_finished.store(0, Ordering::Release);
        self.position.store(0.0, Ordering::Release);
        if let Ok(mut fft) = self.fft_state.lock() {
            fft.fill(0.0);
        }
    }

    fn create_output_stream(
        inner: Arc<Mutex<Inner>>,
        play_state: Arc<AtomicI32>,
        sample_rate: u32,
        channels: u16,
    ) -> Result<Stream, String> {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| "No audio device".to_string())?;

        let supported = device
            .default_output_config()
            .map_err(|e| format!("Default config error: {}", e))?;
        let sample_format = supported.sample_format();

        let config = StreamConfig {
            channels,
            sample_rate,
            buffer_size: BufferSize::Default,
        };

        let err_fn = |err: cpal::StreamError| eprintln!("CPAL: {}", err);

        let inner_f32 = inner.clone();
        let ps_f32 = play_state.clone();
        let f32_cb = move |data: &mut [f32], _: &OutputCallbackInfo| {
            if ps_f32.load(Ordering::Acquire) != 1 {
                data.fill(0.0);
                return;
            }
            if let Ok(mut g) = inner_f32.lock() {
                let vol = g.volume;
                for s in data.iter_mut() {
                    *s = g.ring.pop_front().unwrap_or(0.0) * vol;
                }
            }
        };

        let stream: Stream = match sample_format {
            SampleFormat::F32 => device
                .build_output_stream(&config, f32_cb, err_fn, None)
                .map_err(|e| format!("Failed to build F32 stream: {}", e))?,
            SampleFormat::I16 => {
                let inner_i16 = inner.clone();
                let ps_i16 = play_state.clone();
                let i16_cb = move |data: &mut [i16], _: &OutputCallbackInfo| {
                    if ps_i16.load(Ordering::Acquire) != 1 {
                        data.fill(0);
                        return;
                    }
                    if let Ok(mut g) = inner_i16.lock() {
                        let vol = g.volume;
                        for s in data.iter_mut() {
                            *s = (g.ring.pop_front().unwrap_or(0.0) * vol * i16::MAX as f32) as i16;
                        }
                    }
                };
                device
                    .build_output_stream(&config, i16_cb, err_fn, None)
                    .map_err(|e| format!("Failed to build I16 stream: {}", e))?
            }
            _ => return Err(format!("Unsupported sample format: {:?}", sample_format)),
        };

        stream
            .play()
            .map_err(|e| format!("Stream play error: {}", e))?;
        Ok(stream)
    }

    fn decoder_thread(
        mut format: Box<dyn FormatReader>,
        codec_params: symphonia::core::codecs::CodecParameters,
        track_id: u32,
        inner: Arc<Mutex<Inner>>,
        fft_state: Arc<Mutex<Vec<f32>>>,
        cmd_rx: Receiver<Command>,
        state: Arc<AtomicI32>,
        is_finished: Arc<AtomicI32>,
        position: Arc<AtomicF64>,
        fft_plan: Arc<dyn Fft<f32>>,
        sample_rate: f64,
        _channels: usize,
    ) {
        let mut decoder = symphonia::default::get_codecs()
            .make(&codec_params, &DecoderOptions::default())
            .expect("Failed to create decoder");

        let mut total_frames: u64 = 0;
        let fft_interval = (sample_rate as u64) / 30;
        let mut frames_since_fft: u64 = 0;

        loop {
            if let Ok(cmd) = cmd_rx.try_recv() {
                match cmd {
                    Command::Stop => break,
                    Command::Seek(secs) => {
                        let pos = secs.max(0.0);
                        let _ = format.seek(
                            SeekMode::Accurate,
                            SeekTo::Time {
                                time: Time::from(Duration::from_secs_f64(pos)),
                                track_id: None,
                            },
                        );
                        decoder = symphonia::default::get_codecs()
                            .make(&codec_params, &DecoderOptions::default())
                            .expect("Failed to recreate decoder after seek");
                        total_frames = (pos * sample_rate) as u64;
                        if let Ok(mut inner) = inner.lock() {
                            inner.ring.clear();
                        }
                    }
                    Command::Pause => {
                        state.store(2, Ordering::Release);
                        if let Ok(mut inner) = inner.lock() {
                            inner.ring.clear();
                        }
                        if let Ok(mut fft) = fft_state.lock() {
                            fft.fill(0.0);
                        }
                    }
                    Command::Resume => {
                        state.store(1, Ordering::Release);
                    }
                }
            }

            if state.load(Ordering::Acquire) == 2 {
                thread::sleep(Duration::from_millis(15));
                continue;
            }

            match format.next_packet() {
                Ok(packet) => {
                    if packet.track_id() != track_id {
                        continue;
                    }
                    match decoder.decode(&packet) {
                        Ok(audio_buf) => {
                            let frames = audio_buf.frames() as u64;
                            total_frames += frames;
                            position.store(
                                total_frames as f64 / sample_rate,
                                Ordering::Release,
                            );

                            let spec = *audio_buf.spec();
                            let n_frames = audio_buf.frames() as usize;
                            let n_channels = spec.channels.count() as usize;

                            let mut sample_buf =
                                SampleBuffer::<f32>::new((n_frames * n_channels) as u64, spec);
                            let _ = sample_buf.copy_interleaved_ref(audio_buf);
                            let raw = sample_buf.samples();

                            // backpressure: block until ring has room
                            loop {
                                if let Ok(mut inner) = inner.lock() {
                                    if inner.ring.len() + raw.len() <= RING_CAPACITY {
                                        inner.ring.extend(raw);
                                        break;
                                    }
                                }
                                thread::sleep(Duration::from_millis(2));
                            }

                            frames_since_fft += frames;
                            if frames_since_fft >= fft_interval {
                                frames_since_fft = 0;
                                Self::compute_fft(&inner, &fft_state, &fft_plan, n_channels);
                            }
                        }
                        Err(Error::DecodeError(_)) => continue,
                        Err(Error::ResetRequired) => {
                            decoder = symphonia::default::get_codecs()
                                .make(&codec_params, &DecoderOptions::default())
                                .expect("Failed to recreate decoder after reset");
                        }
                        Err(_) => {
                            thread::sleep(Duration::from_millis(5));
                        }
                    }
                }
                Err(Error::IoError(ref e))
                    if e.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    break;
                }
                Err(Error::ResetRequired) => {
                    decoder = symphonia::default::get_codecs()
                        .make(&codec_params, &DecoderOptions::default())
                        .expect("Failed to recreate decoder after reset");
                }
                Err(_) => {
                    thread::sleep(Duration::from_millis(10));
                }
            }
        }

        state.store(0, Ordering::Release);
        is_finished.store(1, Ordering::Release);
    }

    fn compute_fft(
        inner: &Mutex<Inner>,
        fft_state: &Mutex<Vec<f32>>,
        plan: &Arc<dyn Fft<f32>>,
        channels: usize,
    ) {
        let needed = FFT_SIZE * channels;
        let inner_guard = match inner.lock() {
            Ok(g) => g,
            Err(_) => return,
        };

        if inner_guard.ring.len() < needed {
            return;
        }

        let len = inner_guard.ring.len();
        let start = len - needed;

        let samples: Vec<f32> = inner_guard.ring.iter().skip(start).copied().collect();
        drop(inner_guard);

        let mut buffer: Vec<Complex<f32>> = Vec::with_capacity(FFT_SIZE);

        for i in 0..FFT_SIZE {
            let idx = i * channels;
            let window = 0.5
                * (1.0
                    - (2.0 * std::f32::consts::PI * i as f32 / (FFT_SIZE - 1) as f32).cos());
            let sample = samples.get(idx).copied().unwrap_or(0.0) * window;
            buffer.push(Complex::new(sample, 0.0));
        }

        plan.process(&mut buffer);

        let mut magnitudes = vec![0.0f32; FFT_BINS];
        let scale = 1.0 / (FFT_SIZE as f32);
        for i in 0..FFT_BINS.min(FFT_SIZE / 2) {
            let mag = (buffer[i].re * buffer[i].re + buffer[i].im * buffer[i].im).sqrt() * scale;
            magnitudes[i] = (mag * 12.0).min(1.0);
        }

        if let Ok(mut fft) = fft_state.lock() {
            *fft = magnitudes;
        }
    }

    pub fn pauzuj(&self) -> Result<(), String> {
        self.play_state.store(2, Ordering::Release);
        if let Some(tx) = &self.cmd_tx {
            let _ = tx.send(Command::Pause);
        }
        Ok(())
    }

    pub fn wznow(&self) -> Result<(), String> {
        self.play_state.store(1, Ordering::Release);
        if let Some(tx) = &self.cmd_tx {
            let _ = tx.send(Command::Resume);
        }
        Ok(())
    }

    pub fn zatrzymaj(&mut self) -> Result<(), String> {
        self.stop_current();
        Ok(())
    }

    pub fn seek(&self, seconds: f64) -> Result<(), String> {
        if let Some(tx) = &self.cmd_tx {
            tx.send(Command::Seek(seconds))
                .map_err(|e| format!("Seek error: {}", e))?;
        }
        Ok(())
    }

    pub fn set_volume(&mut self, volume: f32) -> Result<(), String> {
        if let Ok(mut inner) = self.inner.lock() {
            inner.volume = if inner.is_muted { 0.0 } else { volume };
        }
        Ok(())
    }

    pub fn wycisz(&mut self, mute: bool) -> Result<(), String> {
        if let Ok(mut inner) = self.inner.lock() {
            inner.is_muted = mute;
            if mute {
                inner.volume_before_mute = inner.volume;
                inner.volume = 0.0;
            } else {
                inner.volume = inner.volume_before_mute;
            }
        }
        Ok(())
    }

    pub fn get_position(&self) -> f64 {
        self.position.load(Ordering::Acquire)
    }

    pub fn get_is_finished(&self) -> bool {
        self.is_finished.load(Ordering::Acquire) != 0
    }

}

pub struct AudioState {
    pub manager: Mutex<AudioManager>,
}
