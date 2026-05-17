use sqlx::{sqlite::SqliteConnectOptions, sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::fs;
use tauri::AppHandle;
use tauri::Manager;

pub struct DbState {
    pub pool: Pool<Sqlite>,
}

pub async fn init_db(app_handle: &AppHandle) -> Result<Pool<Sqlite>, sqlx::Error> {
    let app_dir = app_handle.path().app_data_dir().expect("Nie udało się pobrać katalogu danych aplikacji");

    // Upewnij się, że katalog danych istnieje
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).expect("Nie udało się utworzyć katalogu danych aplikacji");
    }

    let db_path = app_dir.join("pulsecore.db");

    // Konfiguracja połączenia z jawnym tworzeniem pliku
    let connect_options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_options)
        .await?;

    // Inicjalizacja tabeli
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT UNIQUE NOT NULL,
            title TEXT,
            artist TEXT,
            duration REAL
        )"
    )
    .execute(&pool)
    .await?;

    Ok(pool)
}
