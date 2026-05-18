# Changelog

Wszystkie istotne zmiany w tym projekcie będą dokumentowane w tym pliku.

## [0.7.0] - 2026-05-22

### Dodano
- **Auto-advance:** Automatyczne przechodzenie do kolejnego utworu po zakończeniu obecnego.
- **Profesjonalne Ikony:** Zastąpienie emoji systemowych zestawem ikon SVG z biblioteki `lucide-react`.
- **Taktylne Animacje:** Nowe efekty CSS (skalowanie, neony, responsywne stany `:active`) poprawiające odczucia z użytkowania.
- **Wizualizator FFT:** W pełni funkcjonalny moduł analizy widma oparty na Canvas 2D. Oferuje dwa tryby: "Cyber-Bars" (słupki z peak hold) oraz "Cyber-Ring" (pulsujący pierścień). Dodano przycisk płynnego przełączania trybów.

### Zmieniono
- **Migracja silnika audio:** Całkowite przejście na silnik **BASS** (via `bass-rs`) w celu wyeliminowania problemów z mikro-stutteringiem oraz brakiem wsparcia dla przewijania (seeking) w `rodio`.
- Refaktoryzacja `AudioManager`: optymalizacja obsługi strumieni BASS, zarządzania głośnością i precyzyjnego pozycjonowania utworu.

### Naprawiono
- **Bitrate Display:** Poprawiono błąd wyświetlania bitrate (usunięto zbędne dzielenie przez 1000).
- **ID Reset:** Funkcja czyszczenia biblioteki teraz poprawnie resetuje licznik ID w bazie danych (`sqlite_sequence`).

## [0.6.0] - 2026-05-22

### Dodano
- Realna kontrola odtwarzania: wdrożono funkcjonalny Timeline z obsługą przewijania (seeking) oraz regulację głośności (Volume Control).
- Panel Audiofila: wyświetlanie technicznych parametrów utworu (Format, Sample Rate, Bitrate) pobieranych bezpośrednio z silnika audio.
- Komendy Tauri `seek`, `set_volume` oraz `get_playback_position` do komunikacji z silnikiem `rodio`.
- Precyzyjne odmierzanie czasu: wyświetlanie czasu minionego oraz czasu pozostałego do końca utworu w formacie MM:SS.

## [0.5.0] - 2026-05-22

### Dodano
- Stabilizacja layoutu Bento: Naprawiono błąd rozciągania się modułu playlisty poza okno programu poprzez zastosowanie `min-height: 0` oraz obliczeń wysokości `100vh`.
- Nowoczesny szlif wizualny: dodano stylowy, dyskretny pasek przewijania dla biblioteki utworów, spójny z motywem dark mode.
- Fix krytyczny: Naprawiono błąd mapowania SQL w `get_all_tracks`, przywracając widoczność biblioteki utworów.
- Naprawa UI: Wymuszono przewijanie (scrollbar) listy utworów wewnątrz Bento Grid, naprawiając uciekanie interfejsu poza okno.
- Synchronizacja "martwych linków": przycisk odświeżania teraz poprawnie usuwa wyszarzenie utworów, które wróciły na dysk.
- Natychmiastowe odświeżanie UI: dodano `refreshTrigger` do natychmiastowej synchronizacji statusu utworu po udanym odtworzeniu.
- System synchronizacji biblioteki (Bulk Re-check): przycisk odświeżania statusu plików w bazie danych.
- Dynamiczny Un-ghosting: automatyczne przywracanie statusu dostępności utworu w UI i bazie danych po udanym odtworzeniu.
- Ulepszony scrollbar i stały layout Bento: biblioteka utworów posiada teraz własne przewijanie, nie wpływając na resztę interfejsu.
- Migracja bazy danych: dodano kolumnę `available` do tabeli `tracks`.

## [0.4.0] - 2026-05-22

### Dodano
- Asynchroniczne, rekurencyjne skanowanie folderów: nowa komenda `scan_folder` w Rust z wykorzystaniem `walkdir`.
- System obsługi martwych linków: automatyczne sprawdzanie istnienia pliku przed odtwarzaniem.
- Mechanizm Auto-Skip: automatyczne przeskakiwanie do następnego sprawnego utworu w przypadku braku pliku na dysku.
- Efekt ghostingu w UI: wizualne oznaczanie niedostępnych utworów na liście (zmniejszona przezroczystość).
- Przycisk "Dodaj folder" w panelu sterowania.

## [0.3.0] - 2026-05-22

### Dodano
- Nowoczesny interfejs użytkownika oparty na Bento Grid z efektami glassmorphism.
- Moduł biblioteki utworów (Playlist Module) z automatycznym odświeżaniem listy z bazy SQLite.
- Modularny panel sterowania (Player Module) z timeline'em i głośnością.
- Animowany placeholder wizualizacji spektrum (Visualizer Module).
- Pełna integracja między listą utworów a silnikiem odtwarzania.

## [0.2.0] - 2026-05-22

### Dodano
- Migracja na natywny silnik audio `rodio`: całkowita rezygnacja z zewnętrznych bibliotek dynamicznych BASS na rzecz bezpiecznego, natywnego rozwiązania w Rust.
- Obsługa wielu formatów audio (MP3, FLAC, WAV, Vorbis, AAC) dzięki integracji z `symphonia`.
- Pełna natywna obsługa znaków UNICODE w ścieżkach plików dzięki standardowej bibliotece Rust i `rodio`.
- Zaawansowana obsługa błędów: błędy silnika audio i bazy danych są logowane w terminalu oraz wyświetlane w interfejsie użytkownika.
- Backendowe inteligentne formatowanie metadanych: logika czyszczenia nazw plików i parsowania formatu "Wykonawca - Tytuł" przeniesiona do Rusta.
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
