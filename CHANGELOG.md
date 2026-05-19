# CHANGELOG

## [0.9.3] — 2026-05-19

### Added
- **Custom Cyberpunk Installer** — dedykowany instalator NSIS z mrocznym motywem, własnymi ikonami i dopasowaną kolorystyką (sidebar/header bitmaps).
- **Wielorozmiarowy zestaw ikon** — pełne wsparcie ikon Windows (`.ico`) oraz ikon systemowych dla aplikacji.

### Changed
- **FFT przeniesione do callbacku CPAL** (zero-lag) — FFT liczone na próbkach wychodzących na kartę dźwiękową zamiast z ring buffera w decoder_thread; eliminuje opóźnienie ~8s.
- **Akumulator między-callbackowy** dla FFT — natychmiastowa reakcja wizualizacji.
- **Decoder thread freeze na pauzie** — zapobiega skokom pozycji.
- **Noise floor gate** — wygładzenie wizualizacji przy ciszy.

### Fixed
- **Integracja instalatora NSIS** — naprawiono błędy budowania poprzez poprawną konfigurację zasobów w `tauri.conf.json` i uproszczenie szablonu instalatora.
- **Process naming Windows** — poprawiono widoczność procesów WebView2 w Menedżerze zadań jako "PulseCore".
- **Zero-delay mute** — aplikowanie głośności bezpośrednio w callbackach CPAL.
- **`ring.clear()` przy pauzie** — naprawiono problem "skoku" dźwięku po wznowieniu.

## [0.9.2] — 2026-05-15

### Added
- **Fuzja wizualizatora z Steel-Spectrum-Overlay**:
  - `VisualizerModule.tsx` — całkowicie przepisany system Canvas 2D
  - 4 tryby: Bars, Mirror, Oscilloscope, Ring (zamiast poprzedniego pojedynczego)
  - EMA decay (grawitacja) zamiast natychmiastowego opadania
  - Peak indicators (punkty na szczytach słupków)
  - Band correction — krzywa wykładnicza (`Math.pow(10, t * 0.8)`) na 256 pasm
  - Beat detection — bas (pasma 0–15) × threshold + glow multiplier ×2.5 na 80ms
  - 5 motywów (Neon Cyberpunk, Solar Flare, Matrix Green, Arctic Ice, Synthwave Dusk)
  - 3 suwaki UI (sensitivity 0.2–3.0, gravity 0.80–0.99, bass 0.3–1.5)
- **`App.tsx`** — przekazywanie `isPlaying`/`isPaused` do VisualizerModule; zerowanie wizualizacji po stanie React, nie po FFT.
- **`tauri.conf.json`** — `additionalBrowserArgs` z `--disable-features=...` dla GPU akceleracji Canvas w WebView2, `browserArgs` dla nazewnictwa procesów.
- **Dokumentacja w AGENTS.md** — pełne instrukcje dla agenta (architektura, pułapki Windows, wzorce, struktura).

### Changed
- **Backpressure loop** — sleep 2ms zamiast 1ms gdy ring pełny; zapobiega 100% CPU.
- **Play/Pause toggle** — jeden przycisk zamiast dwóch osobnych.
- **Wykrywanie finished** — `check_finished` porównuje `total_frames` z `duration` zamiast sprawdzać pusty ring.

### Fixed
- **Czarny ekran w WebView2** — Canvas `background: #050505`, `isolation: isolate`, usunięto `transparent: true` z okna.
- **Reset wizualizacji przy cichych fragmentach** — zerowanie tylko po `isPlaying`/`isPaused`, nie po niskich FFT.
- **Przerywanie przewijania (Seek)** — osobne `should_seek` atomic; seek nie jest blokowany przez backpressure.
- **Multiselect w bibliotece** — pojedynczy plik audio w folderze nie jest wybierany automatycznie.

## [0.9.1] — 2026-04-01

### Added
- Lazy loading biblioteki — load on scroll, 500 utworów na partię
- Dockerfile do budowania w środowisku CI

### Changed
- Zwiększono liczbę pasm FFT z 128 do 256

### Fixed
- Podwójne załadowanie przy zmianie kolekcji

## [0.9.0] — 2026-03-10

### Added
- Odtwarzanie audio przez symphonia + cpal
- Biblioteka utworów z SQLite przez sqlx
- Tagi ID3 przez lofty
- Wyszukiwarka utworów
- Play/Pause/Stop/Seek z zero-delay mute (play_state atomic)
- Volume control z zero-delay aplikowaniem w CPAL callback
- Wizualizacja FFT w Canvas 2D (podstawowa, 1 tryb)
- Bento Grid UI z glassmorphism
- 3 tryby sortowania (title, artist, date added)
- Auto-advance + auto-skip uszkodzonych plików
- Preferowanie plików FLAC nad MP3 przy duplikatach

### Technical
- Rust edition 2024
- symphonia 0.5+ z `SeekMode::Accurate`
- cpal 0.17+ z configiem urządzenia domyślnego
- rustfft 6.4.1 z `FftPlanner`
- sqlx z połączeniem async do SQLite
- Tauri v2 z komendami IPC
- Lock-free FFTState przez `Arc<Mutex<Vec<f32>>>`
- 30fps polling FFT + 60fps RAF rendering

## [0.8.0] — 2026-02-01

### Added
- Pierwsza wersja (proof of concept)
- Tauri v2 scaffold
- React + TypeScript + Vite
- Podstawowa biblioteka z SQLite
- Odtwarzanie pojedynczego pliku WAV (symphonia)
