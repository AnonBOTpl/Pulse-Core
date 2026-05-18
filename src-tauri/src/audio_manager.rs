use bass_rs::prelude::*;
use bass_rs::Bass;
use std::sync::Mutex;

pub struct AudioState {
    pub manager: Mutex<AudioManager>,
}

pub struct AudioManager {
    _bass: Bass,
    current_channel: Option<StreamChannel>,
    last_volume: f32,
    is_muted: bool,
}

impl AudioManager {
    pub fn new() -> Self {
        // Inicjalizacja BASS: urządzenie domyślne (-1), 44100 Hz
        let bass = Bass::init_default().expect("Nie udało się zainicjować silnika BASS");

        Self {
            _bass: bass,
            current_channel: None,
            last_volume: 1.0,
            is_muted: false,
        }
    }

    pub fn odtwarzaj(&mut self, sciezka: &str) -> Result<(), String> {
        if !std::path::Path::new(sciezka).exists() {
            return Err("FileNotFound".to_string());
        }

        // Kluczowe: Jawne zwolnienie poprzedniego strumienia przed otwarciem nowego.
        // Ustawienie na None powoduje wywołanie Drop dla StreamChannel, co wykonuje BASS_StreamFree.
        if let Some(channel) = self.current_channel.take() {
            let _ = channel.stop();
            // Drop następuje tutaj
        }

        // Utwórz nowy kanał strumieniowy z pliku (offset 0) z pętlą retry dla błędu FileOpen
        let mut retry_count = 0;
        let channel = loop {
            match StreamChannel::load_from_path(sciezka, 0) {
                Ok(ch) => break ch,
                Err(e) => {
                    if retry_count < 5 {
                        retry_count += 1;
                        eprintln!("Błąd otwarcia pliku (prawdopodobnie blokada), ponawiam próbę {}/5...", retry_count);
                        std::thread::sleep(std::time::Duration::from_millis(20));
                        continue;
                    }
                    return Err(format!("BŁĄD BASS przy otwieraniu pliku po 5 próbach: {:?}", e));
                }
            }
        };

        // Ustaw głośność (BASS używa wartości 0.0 - 1.0)
        let vol = if self.is_muted { 0.0 } else { self.last_volume };
        let _ = channel.set_volume(vol);

        // Zacznij odtwarzanie (restart = true)
        channel.play(true).map_err(|e| format!("BŁĄD BASS podczas odtwarzania: {:?}", e))?;

        self.current_channel = Some(channel);

        Ok(())
    }

    pub fn pauzuj(&self) -> Result<(), String> {
        if let Some(channel) = &self.current_channel {
            channel.pause().map_err(|e| format!("Błąd pauzy: {:?}", e))?;
        }
        Ok(())
    }

    pub fn wznow(&self) -> Result<(), String> {
        if let Some(channel) = &self.current_channel {
            channel.play(false).map_err(|e| format!("Błąd wznowienia: {:?}", e))?;
        }
        Ok(())
    }

    pub fn zatrzymaj(&mut self) -> Result<(), String> {
        if let Some(channel) = &self.current_channel {
            channel.stop().map_err(|e| format!("Błąd zatrzymania: {:?}", e))?;
        }
        self.current_channel = None;
        Ok(())
    }

    pub fn seek(&self, seconds: f64) -> Result<(), String> {
        if let Some(channel) = &self.current_channel {
            // set_position oczekuje milisekund
            channel.set_position(seconds * 1000.0)
                .map_err(|e| format!("Błąd przewijania: {:?}", e))?;
        }
        Ok(())
    }

    pub fn set_volume(&mut self, volume: f32) -> Result<(), String> {
        self.last_volume = volume;
        if !self.is_muted {
            if let Some(channel) = &self.current_channel {
                channel.set_volume(volume).map_err(|e| format!("Błąd głośności: {:?}", e))?;
            }
        }
        Ok(())
    }

    pub fn wycisz(&mut self, mute: bool) -> Result<(), String> {
        self.is_muted = mute;
        if let Some(channel) = &self.current_channel {
            let vol = if mute { 0.0 } else { self.last_volume };
            channel.set_volume(vol).map_err(|e| format!("Błąd wyciszania: {:?}", e))?;
        }
        Ok(())
    }

    pub fn get_position(&self) -> f64 {
        if let Some(channel) = &self.current_channel {
            // get_position zwraca milisekundy
            channel.get_position().unwrap_or(0.0) / 1000.0
        } else {
            0.0
        }
    }

    pub fn get_fft_data(&self) -> Vec<f32> {
        if let Some(channel) = &self.current_channel {
            // Sprawdź czy kanał jest wciąż aktywny
            match channel.get_playback_state() {
                Ok(PlaybackState::Playing) | Ok(PlaybackState::Paused) | Ok(PlaybackState::Stalled) => {
                    // FFT512 zwraca 256 pasm jako float. Oczekiwany rozmiar w bajtach to 256 * 4 = 1024.
                    channel.get_data(DataType::FFT512, 1024).unwrap_or_else(|e| {
                        eprintln!("BŁĄD FFT BASS: {:?}", e);
                        vec![0.0; 256]
                    })
                },
                _ => vec![0.0; 256],
            }
        } else {
            vec![0.0; 256]
        }
    }
}
