mod audio_manager;
mod db;
mod metadata;

use audio_manager::{AudioManager, AudioState};
use db::DbState;
use metadata::{extract_metadata, TrackMetadata};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct FftState(pub Arc<Mutex<Vec<f32>>>);

#[tauri::command]
async fn odtwarzaj(
    sciezka: String,
    state: State<'_, AudioState>,
    db_state: State<'_, DbState>,
) -> Result<(), String> {
    let result = {
        let mut manager = state.manager.lock().unwrap();
        manager.odtwarzaj(&sciezka)
    };

    match result {
        Ok(_) => {
            let _ = sqlx::query("UPDATE tracks SET available = 1 WHERE path = ?1")
                .bind(&sciezka)
                .execute(&db_state.pool)
                .await;
            Ok(())
        }
        Err(ref e) if e == "FileNotFound" => {
            let _ = sqlx::query("UPDATE tracks SET available = 0 WHERE path = ?1")
                .bind(&sciezka)
                .execute(&db_state.pool)
                .await;
            Err(e.to_string())
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
fn check_finished(state: State<'_, AudioState>) -> bool {
    state.manager.lock().unwrap().get_is_finished()
}

#[tauri::command]
fn get_fft_data(fft: State<'_, FftState>) -> Vec<f32> {
    fft.0.lock().map(|d| d.clone()).unwrap_or_else(|_| vec![0.0; 256])
}

#[tauri::command]
async fn sync_library(
    db_state: State<'_, DbState>,
) -> Result<(), String> {
    let tracks = sqlx::query_as::<_, TrackMetadata>(
        "SELECT path, title, artist, duration, available, format, sample_rate, bitrate FROM tracks"
    )
    .fetch_all(&db_state.pool)
    .await
    .map_err(|e| e.to_string())?;

    for track in tracks {
        let exists = std::path::Path::new(&track.path).exists();
        let new_status = if exists { 1 } else { 0 };

        if track.available != new_status {
            let _ = sqlx::query("UPDATE tracks SET available = ?1 WHERE path = ?2")
                .bind(new_status)
                .bind(&track.path)
                .execute(&db_state.pool)
                .await;
        }
    }

    Ok(())
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
fn seek(seconds: f64, state: State<'_, AudioState>) -> Result<(), String> {
    let manager = state.manager.lock().unwrap();
    manager.seek(seconds)
}

#[tauri::command]
fn set_volume(volume: f32, state: State<'_, AudioState>) -> Result<(), String> {
    let mut manager = state.manager.lock().unwrap();
    manager.set_volume(volume)
}

#[tauri::command]
fn wycisz(mute: bool, state: State<'_, AudioState>) -> Result<(), String> {
    let mut manager = state.manager.lock().unwrap();
    manager.wycisz(mute)
}

#[tauri::command]
async fn clear_library_cmd(db_state: State<'_, DbState>) -> Result<(), String> {
    db::clear_library(&db_state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn get_playback_position(state: State<'_, AudioState>) -> f64 {
    let manager = state.manager.lock().unwrap();
    manager.get_position()
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
        "INSERT INTO tracks (path, title, artist, duration, format, sample_rate, bitrate)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(path) DO UPDATE SET
            title=excluded.title,
            artist=excluded.artist,
            duration=excluded.duration,
            format=excluded.format,
            sample_rate=excluded.sample_rate,
            bitrate=excluded.bitrate"
    )
    .bind(&meta.path)
    .bind(&meta.title)
    .bind(&meta.artist)
    .bind(meta.duration)
    .bind(&meta.format)
    .bind(meta.sample_rate)
    .bind(meta.bitrate)
    .execute(&db_state.pool)
    .await
    .map_err(|e| {
        let msg = format!("BŁĄD BAZY DANYCH: {}", e);
        eprintln!("{}", msg);
        msg
    })?;

    Ok(meta)
}

#[tauri::command]
async fn get_all_tracks(
    db_state: State<'_, DbState>,
) -> Result<Vec<TrackMetadata>, String> {
    let tracks = sqlx::query_as::<_, TrackMetadata>(
        "SELECT path, title, artist, duration, available, format, sample_rate, bitrate FROM tracks ORDER BY id DESC"
    )
    .fetch_all(&db_state.pool)
    .await
    .map_err(|e| {
        let msg = format!("BŁĄD SQL w get_all_tracks: {}", e);
        eprintln!("{}", msg);
        msg
    })?;

    Ok(tracks)
}

#[tauri::command]
async fn scan_folder(
    sciezka: String,
    app_handle: AppHandle,
    db_state: State<'_, DbState>,
) -> Result<(), String> {
    use walkdir::WalkDir;

    let pool = db_state.pool.clone();
    let root = sciezka.clone();

    tokio::spawn(async move {
        for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                let path = entry.path();
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();

                if ["mp3", "flac", "wav", "ogg", "m4a"].contains(&ext.as_str()) {
                    let path_str = path.to_string_lossy().to_string();

                    if let Ok(meta) = extract_metadata(&path_str) {
                        let _ = sqlx::query(
                            "INSERT INTO tracks (path, title, artist, duration, format, sample_rate, bitrate)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                             ON CONFLICT(path) DO UPDATE SET
                                title=excluded.title,
                                artist=excluded.artist,
                                duration=excluded.duration,
                                format=excluded.format,
                                sample_rate=excluded.sample_rate,
                                bitrate=excluded.bitrate"
                        )
                        .bind(&meta.path)
                        .bind(&meta.title)
                        .bind(&meta.artist)
                        .bind(meta.duration)
                        .bind(&meta.format)
                        .bind(meta.sample_rate)
                        .bind(meta.bitrate)
                        .execute(&pool)
                        .await;
                    }
                }
            }
        }
        let _ = app_handle.emit("scan_complete", ());
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::init_db(&handle).await.expect("Nie udało się zainicjować bazy danych");
                handle.manage(DbState { pool });
            });
            let fft_state: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(vec![0.0f32; 256]));
            app.manage(FftState(fft_state.clone()));
            app.manage(AudioState {
                manager: Mutex::new(AudioManager::new(fft_state)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            odtwarzaj,
            pauzuj,
            wznow,
            zatrzymaj,
            load_track_info,
            get_all_tracks,
            scan_folder,
            sync_library,
            seek,
            set_volume,
            wycisz,
            clear_library_cmd,
            get_playback_position,
            get_fft_data,
            check_finished
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
