use bass_rs::Bass;
use bass_rs::channel::{StreamChannel, Channel};
use bass_rs::prelude::*;
use bass_sys::*;
use std::sync::Mutex;
use std::ffi::c_void;

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

        // Konwersja ścieżki na format szerokich znaków (UTF-16) dla Windows i BASS_UNICODE
        #[cfg(target_os = "windows")]
        let (path_ptr, flags) = {
            use std::os::windows::ffi::OsStrExt;
            let mut wide: Vec<u16> = std::path::Path::new(sciezka).as_os_str().encode_wide().collect();
            wide.push(0);
            (wide.as_ptr() as *const c_void, BASS_STREAM_PRESCAN | BASS_UNICODE)
        };

        #[cfg(not(target_os = "windows"))]
        let (c_path, flags) = {
            let c_str = std::ffi::CString::new(sciezka).unwrap_or_default();
            (c_str, BASS_STREAM_PRESCAN)
        };

        #[cfg(not(target_os = "windows"))]
        let path_ptr = c_path.as_ptr() as *const c_void;

        let handle = BASS_StreamCreateFile(
            0, // mem = false
            path_ptr,
            0,
            0,
            flags
        );

        if handle == 0 {
            let err = BassError::get_last_error();
            let msg = format!("BŁĄD BASS przy próbie otwarcia pliku: {:?}", err);
            eprintln!("{}", msg);
            return Err(msg);
        }

        let channel = StreamChannel::load_from_path(sciezka, 0i32).map(|mut c| {
            // Podmieniamy uchwyt na ten utworzony z flagą UNICODE
            // Uwaga: To jest obejście ograniczeń biblioteki bass-rs, która nie wspiera UNICODE w load_from_path
            c.channel = Channel::new(handle);
            c
        }).map_err(|e| format!("{:?}", e))?;

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
