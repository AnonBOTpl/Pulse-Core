use rodio::{Decoder, Player, DeviceSinkBuilder, MixerDeviceSink};
use std::fs::File;
use std::io::BufReader;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub struct AudioState {
    pub manager: Mutex<AudioManager>,
}

pub struct AudioManager {
    _sink_handle: MixerDeviceSink,
    player: Arc<Mutex<Player>>,
}

impl AudioManager {
    pub fn new() -> Self {
        let sink_handle = DeviceSinkBuilder::open_default_sink()
            .expect("Nie udało się otworzyć domyślnego urządzenia wyjściowego audio");

        let player = Player::connect_new(&sink_handle.mixer());

        Self {
            _sink_handle: sink_handle,
            player: Arc::new(Mutex::new(player)),
        }
    }

    pub fn odtwarzaj(&mut self, sciezka: &str) -> Result<(), String> {
        if !std::path::Path::new(sciezka).exists() {
            let msg = "FileNotFound".to_string();
            eprintln!("BŁĄD: Plik nie istnieje: {}", sciezka);
            return Err(msg);
        }

        let file = File::open(sciezka).map_err(|e| {
            let msg = format!("BŁĄD RODIO przy próbie otwarcia pliku: {}", e);
            eprintln!("{}", msg);
            msg
        })?;

        let reader = BufReader::new(file);
        let source = Decoder::try_from(reader).map_err(|e| {
            let msg = format!("BŁĄD RODIO podczas dekodowania: {}", e);
            eprintln!("{}", msg);
            msg
        })?;

        let player = self.player.lock().unwrap();
        player.stop(); // Czyści kolejkę i zatrzymuje
        player.append(source);
        player.play();

        Ok(())
    }

    pub fn pauzuj(&self) -> Result<(), String> {
        let player = self.player.lock().unwrap();
        player.pause();
        Ok(())
    }

    pub fn wznow(&self) -> Result<(), String> {
        let player = self.player.lock().unwrap();
        player.play();
        Ok(())
    }

    pub fn zatrzymaj(&mut self) -> Result<(), String> {
        let player = self.player.lock().unwrap();
        player.stop();
        Ok(())
    }

    pub fn seek(&self, seconds: f64) -> Result<(), String> {
        let player = self.player.lock().unwrap();
        player.try_seek(Duration::from_secs_f64(seconds))
            .map_err(|e| format!("Błąd przewijania: {:?}", e))
    }

    pub fn set_volume(&self, volume: f32) -> Result<(), String> {
        let player = self.player.lock().unwrap();
        player.set_volume(volume);
        Ok(())
    }

    pub fn get_position(&self) -> f64 {
        let player = self.player.lock().unwrap();
        player.get_pos().as_secs_f64()
    }
}
