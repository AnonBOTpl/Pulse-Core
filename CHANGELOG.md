# Changelog

Wszystkie istotne zmiany w tym projekcie będą dokumentowane w tym pliku.

## [0.2.0] - 2026-05-22

### Dodano
- Inteligentne formatowanie nazw plików: automatyczne usuwanie rozszerzeń oraz parsowanie formatu "Wykonawca - Tytuł" w przypadku braku tagów ID3.
- Poprawka logiki: wyeliminowano opóźnienie startu odtwarzania przy wyborze pliku poprzez bezpośrednie przekazywanie ścieżki do backendu.
- Poprawka stabilności: naprawiono błąd "unable to open database file" poprzez jawne tworzenie katalogów danych aplikacji i użycie zaawansowanej konfiguracji połączenia SQLite.
- Integracja bazy danych SQLite przy użyciu `sqlx`.
- Implementacja wyciągania metadanych audio (Wykonawca, Tytuł, Czas trwania) za pomocą `lofty`.
- Nowa komenda Tauri `load_track_info` do asynchronicznego pobierania i zapisywania informacji o utworach.
- Aktualizacja UI: wyświetlanie tagów ID3 zamiast surowej nazwy pliku.
- Automatyczna migracja bazy danych przy starcie aplikacji.

## [0.1.0] - 2026-05-22

### Dodano
- Inicjalizacja struktury backendu w Rust.
- Konfiguracja `Cargo.toml` z bibliotekami `bass-rs` i `tokio`.
- Podstawowa struktura komend Tauri: `odtwarzaj`, `pauzuj`, `zatrzymaj`.
- Szkielet `audio_manager.rs` do obsługi silnika BASS.
- Implementacja interfejsu React dla Fazy 1 (komponent `PlayerControls`).
- Integracja pluginu dialogowego Tauri do wyboru plików audio.
- Nowoczesne stylowanie CSS z obsługą zmiennych dla przyszłych skórek.
