mod audio_manager;

use audio_manager::{AudioManager, AudioState};
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
fn odtwarzaj(sciezka: String, state: State<'_, AudioState>) -> Result<(), String> {
    let mut manager = state.manager.lock().unwrap();
    manager.odtwarzaj(&sciezka)
}

#[tauri::command]
fn pauzuj(state: State<'_, AudioState>) -> Result<(), String> {
    let manager = state.manager.lock().unwrap();
    manager.pauzuj()
}

#[tauri::command]
fn wznow(state: State<'_, AudioState>) -> Result<(), String> {
    let manager = state.manager.lock().unwrap();
    manager.wznow()
}

#[tauri::command]
fn zatrzymaj(state: State<'_, AudioState>) -> Result<(), String> {
    let mut manager = state.manager.lock().unwrap();
    manager.zatrzymaj()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
         .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AudioState {
            manager: Mutex::new(AudioManager::new()),
        })
        .invoke_handler(tauri::generate_handler![odtwarzaj, pauzuj, wznow, zatrzymaj])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
