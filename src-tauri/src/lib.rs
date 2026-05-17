mod audio_manager;
mod db;
mod metadata;

use audio_manager::{AudioManager, AudioState};
use db::DbState;
use metadata::{extract_metadata, TrackMetadata};
use std::sync::Mutex;
use tauri::{Manager, State};

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

#[tauri::command]
async fn load_track_info(
    sciezka: String,
    db_state: State<'_, DbState>,
) -> Result<TrackMetadata, String> {
    // 1. Spróbuj wyciągnąć metadane z pliku
    let meta = extract_metadata(&sciezka)?;

    // 2. Zapisz/Aktualizuj w bazie danych
    sqlx::query(
        "INSERT INTO tracks (path, title, artist, duration)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(path) DO UPDATE SET
            title=excluded.title,
            artist=excluded.artist,
            duration=excluded.duration"
    )
    .bind(&meta.path)
    .bind(&meta.title)
    .bind(&meta.artist)
    .bind(meta.duration)
    .execute(&db_state.pool)
    .await
    .map_err(|e| {
        let msg = format!("BŁĄD BAZY DANYCH: {}", e);
        eprintln!("{}", msg);
        msg
    })?;

    Ok(meta)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
         .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::init_db(&handle).await.expect("Nie udało się zainicjować bazy danych");
                handle.manage(DbState { pool });
            });
            Ok(())
        })
        .manage(AudioState {
            manager: Mutex::new(AudioManager::new()),
        })
        .invoke_handler(tauri::generate_handler![
            odtwarzaj,
            pauzuj,
            wznow,
            zatrzymaj,
            load_track_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
