mod audio_manager;
mod db;
mod metadata;

use audio_manager::{AudioManager, AudioState};
use db::DbState;
use metadata::{extract_metadata, TrackMetadata};
use std::sync::Mutex;
use tauri::{Manager, State};

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
            // Jeśli utwór się odtworzył, upewnij się, że w bazie jest oznaczony jako dostępny
            let _ = sqlx::query("UPDATE tracks SET available = 1 WHERE path = ?1")
                .bind(&sciezka)
                .execute(&db_state.pool)
                .await;
            Ok(())
        },
        Err(e) => {
            if e == "FileNotFound" {
                // Oznacz jako niedostępny w bazie
                let _ = sqlx::query("UPDATE tracks SET available = 0 WHERE path = ?1")
                    .bind(&sciezka)
                    .execute(&db_state.pool)
                    .await;
            }
            Err(e)
        }
    }
}

#[tauri::command]
async fn sync_library(
    db_state: State<'_, DbState>,
) -> Result<(), String> {
    let tracks = sqlx::query_as::<_, TrackMetadata>(
        "SELECT path, title, artist, duration, available FROM tracks"
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

#[tauri::command]
async fn get_all_tracks(
    db_state: State<'_, DbState>,
) -> Result<Vec<TrackMetadata>, String> {
    let tracks = sqlx::query_as::<_, TrackMetadata>(
        "SELECT path, title, artist, duration, available FROM tracks ORDER BY id DESC"
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

                    // Wyciągamy metadane
                    if let Ok(meta) = extract_metadata(&path_str) {
                        // Zapisujemy do bazy
                        let _ = sqlx::query(
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
                        .execute(&pool)
                        .await;
                    }
                }
            }
        }
        println!("Skanowanie folderu zakończone: {}", sciezka);
    });

    Ok(())
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
            load_track_info,
            get_all_tracks,
            scan_folder,
            sync_library
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
