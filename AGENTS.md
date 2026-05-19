# Instrukcje dla Agenta — PulseCore

> PulseCore to cyberpunkowy odtwarzacz audio z wizualizacją FFT w czasie rzeczywistym.  
> Stack: Rust (edition 2024) + Tauri v2 + React 19 + TypeScript + Vite.

## Stack technologiczny

- **Rust edition 2024** — wszystkie CLI i lintery muszą obsługiwać `edition = "2024"`
- **symphonia 0.5+** — dekodowanie audio (MP3, FLAC, WAV, OGG, AAC) — 100% natywny Rust, zero FFI
- **cpal 0.17+** — wyjście audio z callbackiem w czasie rzeczywistym
- **rustfft 6.4.1+** — obliczenia FFT przez `FftPlanner`
- **sqlx** — asynchroniczna baza SQLite
- **lofty** — ekstrakcja tagów ID3
- **Tauri v2** — most IPC z React (komendy, eventy, stan)
- **React 19** + **TypeScript** + **Vite** — frontend z HMR
- **CSS Custom Properties** — dynamiczne zmienne do systemu skórek
- **Lucide React** — ikony SVG

## Ważne ścieżki

- Silnik audio: `src-tauri/src/audio_manager.rs`
- Komendy IPC: `src-tauri/src/lib.rs`
- Wizualizator: `src/components/VisualizerModule.tsx`
- Stan odtwarzania: `src/App.tsx` (w tym isPlaying/isPaused/isFinished)
- Style: `src/App.css`
- Konfig: `src-tauri/tauri.conf.json`

## Pułapki Windows

1. **WebView2 Canvas rendering** — Canvas NIE może być przezroczysty.
   - Tauri okno: `transparent: false`
   - W tle: `background: #050505`
   - CSS: `isolation: isolate`
   - Bez tych ustawień WebView2 renderuje czarny ekran na Windows 10/11.

2. **Process naming** — Aby podprocesy WebView2 nazywały się "PulseCore" zamiast "Microsoft Edge WebView2":
   - `tauri.conf.json`: `additionalBrowserArgs: ["--webview-process-program-name=PulseCore", "--title-is-program-name"]`
   - `browserArgs` nie działa dla nazwy procesu; tylko `additionalBrowserArgs` na WebView2.

3. **symphonia na Windows** — wymaga `features = ["mp3", "flac", "wav", "ogg", "aac"]` w Cargo.toml.
   - Zawsze sprawdzaj dostępność kodeków w `supported_codecs()`.

4. **Ścieżki Windows** — `std::path::PathBuf` + `canonicalize()`, nigdy `String` z `/`.
   - SQLite przechowuje ścieżki jako `TEXT`, ale Rust operuje na `PathBuf`.

## Wzorce

### Volume w CPAL callback (zero-delay)
```rust
// audio_manager.rs
let volume = Arc::new(AtomicF32::new(1.0));
// W callbacku CPAL:
for sample in data.iter_mut() {
    *sample = (*sample * vol.load(Ordering::Relaxed)).clamp(-1.0, 1.0);
}
```

### FFT w CPAL callback (zero-lag)
```rust
// audio_manager.rs
const FFT_SIZE: usize = 1024;

struct FftAccumState {
    buffer: Vec<f32>,        // akumulator między-callbackowy
    index: usize,            // pozycja zapisu w akumulatorze
    fft_state: Arc<Mutex<Vec<f32>>>,  // wynik FFT (256 pasm)
}
// W CPAL callbacku:
// 1. Dopisz mono próbki do accum.buffer
// 2. Gdy accum.index >= FFT_SIZE:
//    - Zastosuj okno Hanninga
//    - Wykonaj FFT
//    - Oblicz 256 pasm (mag × 12.0, clamp(1.0))
//    - Zapisz do fft_state
//    - accum.index = 0

// W get_fft_data polling:
// - Pobierz fft_state
// - Noise gate: if val < 0.01 { val = 0.0 }
// - Band correction: Math.pow(10, t * 0.8)
// - Sensitivity scaling
// - Return do frontendu
```

### Zero-delay pause
```rust
// audio_manager.rs
let play_state = Arc::new(AtomicU8::new(0));
// 0 = stopped, 1 = playing, 2 = paused

// W decoder_thread:
loop {
    if ps.load(Ordering::Acquire) == 2 { // paused
        continue; // freeze dekodera
    }
    if ps.load(Ordering::Acquire) != 1 { // stopped
        break;
    }
    // dekoduj + push do ringa
}

// W CPAL callback:
if ps.load(Ordering::Relaxed) != 1 {
    data.fill(0.0);
    return;
}
```

### Visual reset po stanie, nie po FFT
```rust
// App.tsx
// Nie zeruj wizualizacji gdy FFT < progu — ciche fragmenty utworu
// to resetują. Zamiast tego:
<VisualizerModule isPlaying={isPlaying} isPaused={isPaused} ... />
// W VisualizerModule:
useEffect(() => {
    if (!isPlaying) {
        peaks.fill(0);
        decay.fill(0);
    }
}, [isPlaying]);
```

### Backpressure dla decoder_thread
```rust
// audio_manager.rs
while ring.is_full() {
    if ps.load(Ordering::Acquire) != 1 {
        break; // pauza lub stop — nie czekaj
    }
    spin_sleep::sleep(Duration::from_millis(2));
}
```

### Noise gate dla FFT
```rust
// lib.rs (get_fft_data)
const NOISE_FLOOR: f32 = 0.01;
for val in data.iter_mut() {
    if *val < NOISE_FLOOR {
        *val = 0.0;
    }
}
```

## Stałe

| Stała | Wartość | Opis |
|-------|---------|------|
| `FFT_SIZE` | 1024 | Rozmiar FFT (próbki) |
| `NUM_BANDS` | 256 | Liczba pasm wyjściowych |
| `RING_CAPACITY` | 44100 × 8 | Pojemność ring buffera (~8s audio) |
| `NOISE_FLOOR` | 0.01 | Próg szumu dla FFT |
| `POLL_INTERVAL_MS` | 33 | Interwał pollingu FFT (~30fps) |
| `BACKPRESSURE_SLEEP_MS` | 2 | Czas snu przy pełnym ringu |
| `BASS_BANDS` | 0..16 | Pasma basowe dla beat detection |
| `BEAT_THRESHOLD` | 0.6 | Próg wykrycia bitu |
| `BEAT_DURATION_MS` | 80 | Czas trwania efektu bitu |

## Stany atomowe

| Zmienna | Typ | Opis |
|---------|-----|------|
| `play_state` | `AtomicU8` | 0=stopped, 1=playing, 2=paused |
| `should_seek` | `AtomicBool` | Flaga seeku (odblokowuje backpressure) |
| `total_frames` | `AtomicU64` | Liczba ramek wypchniętych do ringa |
| `current_position` | `AtomicU64` | Pozycja odtwarzania (ramki) |
| `volume` | `AtomicF32` | Głośność (0.0–1.0) |
| `is_muted` | `AtomicBool` | Wyciszenie |
| `fft_data` | `Arc<Mutex<Vec<f32>>>` | Wynik FFT (256 pasm) |

## Komendy IPC

| Komenda | Zwraca | Opis |
|---------|--------|------|
| `play(path)` | `Result<()>` | Odtwarzanie pliku |
| `pause()` | `Result<()>` | Pauza (tylko atomowy stan + cisza) |
| `resume()` | `Result<()>` | Wznowienie (atomowy stan 2→1) |
| `stop()` | `Result<()>` | Stop + zerowanie FFT |
| `seek(position_secs)` | `Result<()>` | Przewijanie (SeekMode::Accurate) |
| `get_fft_data()` | `Result<Vec<f32>>` | 256 pasm FFT z noise gate + band correction |
| `check_finished()` | `Result<bool>` | Czy utwór się skończył |
| `set_volume(volume)` | `Result<()>` | Ustaw głośność (0.0–1.0) |
| `toggle_mute()` | `Result<()>` | Przełącz wyciszenie |
| `sync_library(path)` | `Result<()>` | Skanuj folder i dodaj do bazy |
| `scan_folder(path)` | `Result<Vec<...>>` | Skanuj folder (zwróć pliki) |

## Tryby wizualizacji (VisualizerModule.tsx)

1. **Bars** — klasyczne słupki (bas po lewej, sopran po prawej)
2. **Mirror** — lustrzane odbicie (center-out)
3. **Oscilloscope** — fala audio z quadraticCurveTo
4. **Ring** — okrągłe widmo (radial)

Wszystkie tryby dzielą: EMA decay, peak indicators, band correction, beat detection, noise gate.

## Motywy kolorystyczne (VisualizerModule.tsx)

| Motyw | Tło | Gradient |
|-------|-----|----------|
| Neon Cyberpunk | #0a0a1a → #1a0a2e | #ff00ff → #00ffff |
| Solar Flare | #1a0a00 → #3a1a00 | #ff4400 → #ffaa00 |
| Matrix Green | #000a00 → #001a00 | #00ff41 → #00ff88 |
| Arctic Ice | #000a1a → #001a3a | #00ccff → #0088ff |
| Synthwave Dusk | #1a002a → #2a0040 | #ff00aa → #ff6600 |

## Procesy i wątki

```
main thread (Tauri) — setup + IPC handlers
├── decoder_thread ("pulse-decode") — symphonia dekodowanie + push do ringa
├── CPAL callback thread (audio OS) — odczyt z ringa + FFT + wyjście na kartę
├── polling loop (33ms setInterval) — IPC get_fft_data → React state
└── RAF loop (60fps) — Canvas render z decay/peaks/beat
```

## Proces w Windows

- Proces główny: `PulseCore.exe`
- Podprocesy WebView2: `PulseCore.exe` (via `--webview-process-program-name=PulseCore`)
- GPU process, Crashpad, itp. → nazwane jako "PulseCore" w Task Managerze
