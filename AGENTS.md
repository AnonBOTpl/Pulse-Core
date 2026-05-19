# Instrukcje dla Agenta

## Kontekst Projektu

PulseCore — cyberpunkowy odtwarzacz audio z wizualizacją FFT w czasie rzeczywistym.  
Backend: Rust (Tauri v2). Frontend: React + TypeScript (Vite).

**Rok:** 2026. Używaj najnowszych stabilnych wersji bibliotek.

---

## Stos Technologiczny (aktualny)

| Warstwa | Technologia | Uwagi |
|---------|------------|-------|
| Backend | Rust (edition 2024) | W 100% natywny, zero FFI/C |
| Most | Tauri v2 | Komendy + `State` |
| Dekodowanie | `symphonia` 0.5+ | MP3, FLAC, WAV, OGG, AAC |
| Wyjście audio | `cpal` 0.17+ | Callback w czasie rzeczywistym |
| FFT | `rustfft` 6.4.1+ | 1024 próbki, okno Hanninga, 256 pasm |
| Baza | SQLite przez `sqlx` | Asynchroniczna, migracje przy starcie |
| Tagi | `lofty` | Ekstrakcja ID3/metadanych |
| Frontend | React 19 + TypeScript | Vite, HMR |
| Wizualizacja | HTML5 Canvas 2D | Bars / Ring, 60fps |
| Ikony | `lucide-react` | SVG |
| Stylowanie | CSS Custom Properties | System skórek |

---

## Krytyczne pułapki systemowe (Windows)

### 1. Izolacja procesów w WebView2

WebView2 działa w osobnym procesie (`WebView2.exe`). Ma własną pętlę GPU i throttling.

**Problemy napotkane:**
- `requestAnimationFrame` może być throttlowany gdy okno traci fokus
- Canvas z przezroczystym tłem (`clearRect` do `rgba(0,0,0,0)`) komponuje się jako **czarny** w WebView2 — zawsze ustawiaj `background` na elemencie `<canvas>`
- `getBoundingClientRect()` może zwracać `0x0` dla elementów z `contain: strict` (szczególnie z `size`)

**Rozwiązania wdrożone:**
- `additionalBrowserArgs: "--enable-accelerated-2d-canvas --ignore-gpu-blocklist --force-gpu-rasterization --disable-gpu-vsync"`
- CSS `isolation: isolate` na kontenerze wizualizatora
- `ResizeObserver` zamiast ręcznego pomiaru w RAF
- Separacja pollingu FFT (setInterval 33ms) od renderowania (RAF)

### 2. Blokowanie uchwytów plików (NTFS)

Windows blokuje pliki otwarte przez inny proces. Problem z BASS: biblioteka utrzymywała uchwyt pliku przez cały czas odtwarzania, uniemożliwiając seek i ponowne otwarcie.

**Rozwiązanie:** `symphonia` otwiera plik, dekoduje do bufora, zamyka. Brak trwałych uchwytów.

### 3. Backpressure ring buffera

Przy `RING_CAPACITY = 44100 * 8` (~8s audio), gdy bufor jest pełny, wątek dekodera czeka:

```rust
loop {
    if let Ok(mut inner) = inner.lock() {
        if inner.ring.len() + raw.len() <= RING_CAPACITY {
            inner.ring.extend(raw);
            break;
        }
    }
    thread::sleep(Duration::from_millis(2));
}
```

Nie używaj `Condvar` — zbyt agresywne budzenie. Backpressure z `thread::sleep(2ms)` jest wystarczające.

---

## Wzorce projektowe (nie zmieniaj!)

### 1. Volume — aplikacja w callbacku CPAL

Próbki w ringbufferze są **surowne** (bez volume). Volume aplikowane w callbacku:

```rust
let vol = g.volume;
for s in data.iter_mut() {
    *s = g.ring.pop_front().unwrap_or(0.0) * vol;
}
```

**Nie** aplikuj volume w wątku dekodera — spowoduje ~8s opóźnienia.

### 2. FFT — osobny stan (lock-free dla frontendu)

`fft_data` jest w osobnym `Arc<Mutex<Vec<f32>>>` zarządzanym przez Tauri jako `FftState`:

```rust
pub struct FftState(pub Arc<Mutex<Vec<f32>>>);
```

- `compute_fft()` w wątku dekodera zapisuje do tego stanu
- `get_fft_data` w Tauri czyta go bezpośrednio — **nigdy nie blokuje** `AudioManager`
- Frontend polluje co 33ms (setInterval), renderuje co 16ms (RAF)

### 3. Mute + Volume

`set_volume` sprawdza `is_muted` przed zapisem. `wycisz` ustawia volume na 0.0 lub 1.0.
Callback CPAL czyta `g.volume` — nie sprawdza osobno `is_muted`.

### 4. Seek

```rust
Command::Seek(secs) => {
    format.seek(SeekMode::Accurate, SeekTo::Time { time: Time::from(...), track_id: None });
    decoder = symphonia::default::get_codecs().make(&codec_params, &DecoderOptions::default()).expect(...);
    total_frames = (pos * sample_rate) as u64;
    inner.ring.clear();
}
```

Zawsze **rekreuj decoder** po seeku i **czyść ring buffer**.

### 5. Brak technologii Microsoft

Zakaz: C#, .NET, Avalonia, WPF, `DispatcherTimer`.  
Obsługa czasu: `tokio` w Rust, `setInterval`/`requestAnimationFrame` w JS.

---

## Struktura backendu

```
src-tauri/src/
├── main.rs              # Entry point (cfg desktop/mobile)
├── lib.rs               # Rejestracja komend Tauri + FftState + setup DB
├── audio_manager.rs     # AudioManager, Inner, decoder_thread, compute_fft, CPAL stream
├── db.rs                # init_db, clear_library
└── metadata.rs          # extract_metadata, TrackMetadata
```

### Zarządzanie stanem w Tauri

```
FftState(Arc<Mutex<Vec<f32>>>)  ← zarządzany osobno, lock-free od AudioManager
AudioState { manager: Mutex<AudioManager> }  ← główny stan audio
DbState { pool: SqlitePool }  ← pula połączeń SQLite
```

### Kluczowe stałe

| Stała | Wartość | Opis |
|-------|---------|------|
| `FFT_SIZE` | 1024 | Rozmiar okna FFT |
| `FFT_BINS` | 256 | Liczba pasm spektrum |
| `RING_CAPACITY` | 44100 × 8 | ~8s bufora PCM |
| `POLL_INTERVAL` | 33ms | Interwał pollingu FFT na froncie |
| `fft_interval` | sample_rate / 30 | Co ~33ms FFT w wątku dekodera |

---

## Fazy Rozwoju (stan: FAZA 3 ukończona)

- [x] FAZA 1: Odtwarzanie, pauza, stop (Rust ↔ Frontend)
- [x] FAZA 2: Baza SQLite, tagi ID3, biblioteka, playlisty
- [x] FAZA 3: Wizualizacja FFT (Canvas 2D), system skórek (CSS Variables)
- [ ] FAZA 4: Crossfading, HTTP (`reqwest`/`scraper`), okładki, radio internetowe
