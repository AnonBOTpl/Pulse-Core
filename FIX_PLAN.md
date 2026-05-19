# Plan napraw — sesja 2

## Problem 1: Opóźnienie regulacji głośności

**Przyczyna:** Głośność (`volume`) jest aplikowana w wątku dekodera przed zapisem do ring
buffera. Przy `RING_CAPACITY = 44100*8` (~8s) próbki ze starą głośnością czekają w buforze,
zanim zostaną odtworzone.

**Rozwiązanie:** Przenieść aplikację głośności do callbacka CPAL — tuż przed wysłaniem na
kartę dźwiękową. Ring buffer przechowuje surowe próbki (bez volume). Zmiana
`inner.volume` jest słyszalna natychmiast w następnym callbacku.

```rust
// CPAL callback — volume applied here, zero delay
for s in data.iter_mut() {
    *s = inner.ring.pop_front().unwrap_or(0.0) * vol;
}
```

Plik: `src-tauri/src/audio_manager.rs`

## Problem 2: Wizualizacja FFT nie działa

**Hipoteza A — lock contention w `get_fft_data`:**

```
get_fft_data → state.manager.try_lock() → jeśli zajęty → zwraca [0; 256]
```

Jeśli inna komenda Tauri (np. `odtwarzaj`) trzyma `state.manager.lock()`,
`try_lock()` failuje i frontend dostaje same zera.

**Hipoteza B — FFT nigdy się nie wykonuje:**

`frames_since_fft` może nie osiągnąć progu `fft_interval`, jeśli kodzik ma logikę
zależną od formatu lub rzadkich dekodowanych pakietów.

**Rozwiązanie (oba problemy):**

- Wydzielić `fft_data` do osobnego `Arc<Mutex<Vec<f32>>>` zarządzanego
  bezpośrednio przez Tauri (poza `AudioManager`)
- `compute_fft` aktualizuje ten niezależny stan
- `get_fft_data` czyta go natychmiast, bez `try_lock` na `AudioManager`

## Pliki do modyfikacji

| Plik | Zmiana |
|---|---|
| `src-tauri/src/audio_manager.rs` | Volume w callbacku CPAL; wydzielenie `fft_data` do zewnętrznego `Arc` |
| `src-tauri/src/lib.rs` | `get_fft_data` bez `try_lock`, bezpośredni odczyt z `FftState` |
