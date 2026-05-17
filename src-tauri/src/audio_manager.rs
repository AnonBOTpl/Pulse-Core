use bass_rs::Bass;
use bass_rs::channel::StreamChannel;
use std::sync::Mutex;

pub struct AudioState {
    pub manager: Mutex<AudioManager>,
}

pub struct AudioManager {
    _bass: Bass,
    current_channel: Option<StreamChannel>,
}

impl AudioManager {
    pub fn new() -> Self {
        let bass = Bass::init_default().expect("Nie udało się zainicjować silnika BASS");
        Self {
            _bass: bass,
            current_channel: None,
        }
    }

    pub fn odtwarzaj(&mut self, sciezka: &str) -> Result<(), String> {
        // Jeśli coś już gra, zatrzymaj to
        if let Some(ref channel) = self.current_channel {
            let _ = channel.stop();
        }

        let channel = StreamChannel::load_from_path(sciezka, 0i32)
            .map_err(|e| {
                let msg = format!("BŁĄD BASS przy próbie otwarcia pliku: {:?}", e);
                eprintln!("{}", msg);
                msg
            })?;

        channel.play(false)
            .map_err(|e| {
                let msg = format!("BŁĄD BASS podczas startu odtwarzania: {:?}", e);
                eprintln!("{}", msg);
                msg
            })?;

        self.current_channel = Some(channel);
        Ok(())
    }

    pub fn pauzuj(&self) -> Result<(), String> {
        if let Some(ref channel) = self.current_channel {
            channel.pause().map_err(|e| {
                let msg = format!("BŁĄD BASS przy pauzowaniu: {:?}", e);
                eprintln!("{}", msg);
                msg
            })?;
        }
        Ok(())
    }

    pub fn wznow(&self) -> Result<(), String> {
        if let Some(ref channel) = self.current_channel {
            channel.play(false).map_err(|e| {
                let msg = format!("BŁĄD BASS przy wznawianiu: {:?}", e);
                eprintln!("{}", msg);
                msg
            })?;
        }
        Ok(())
    }

    pub fn zatrzymaj(&mut self) -> Result<(), String> {
        if let Some(ref channel) = self.current_channel {
            channel.stop().map_err(|e| {
                let msg = format!("BŁĄD BASS przy zatrzymywaniu: {:?}", e);
                eprintln!("{}", msg);
                msg
            })?;
        }
        self.current_channel = None;
        Ok(())
    }
}
