# Plan Napraw i Rozwoju — PulseCore

> Żeby było jasne: ten plik to żywy dokument. Priorytety się zmieniają, rzeczy są odkładane, a czasem w ogóle zmieniamy zdanie.

## Status ogólny

Wszystkie plany napraw z v0.9.0 zrealizowane. Obecny fokus: stabilizacja po fuzji wizualizatora z Steel-Spectrum-Overlay, optymalizacja procesów Windows i eliminacja laga FFT.

## Zrealizowane (v0.9.0 → v0.9.3)

### Naprawy
- [x] Czarny ekran WebView2 — Canvas `background: #050505`, `isolation: isolate`
- [x] Czarny ekran przy pauzie — zerowanie visuala po stanie React, nie po FFT
- [x] FFT lag ~8s — przeniesione do CPAL callback (zero-lag)
- [x] Przycisk Play/Pause nie działa po pauzie — usunięto `ring.clear()` z `Command::Pause`
- [x] Procesy WebView2 nazwane "Microsoft Edge WebView2" — `additionalBrowserArgs` z `--webview-process-program-name=PulseCore`
- [x] 100% CPU przy pełnym ringu — backpressure sleep 2ms
- [x] Seek blokowany przez backpressure — osobny `should_seek` atomic
- [x] Ciche fragmenty resetują wizualizację — zerowanie tylko po `isPlaying`/`isPaused`
- [x] Multiselect w bibliotece wybiera pierwszy plik — fix warunku

### Fuzja Steel-Spectrum-Overlay
- [x] Canvas 2D z 4 trybami (Bars, Mirror, Oscilloscope, Ring)
- [x] EMA decay (grawitacja) zamiast natychmiastowego opadania
- [x] Peak indicators
- [x] Band correction (krzywa wykładnicza)
- [x] Beat detection (bas + threshold + glow)
- [x] 5 motywów
- [x] 3 suwaki (sensitivity, gravity, bass)
- [x] Noise floor gate (0.01)

### Techniczne
- [x] FFT w CPAL callback z akumulatorem
- [x] Zero-delay pause (play_state atomic)
- [x] Zero-delay volume (w CPAL callback)
- [x] Procesy Windows nazwane "PulseCore"

## Do zrobienia (kolejność priorytetowa)

### 1. Wsparcie dla więcej formatów
- [ ] AAC (`symphonia` — sprawdzić czy domyślnie wspiera)
- [ ] Opus
- [ ] AIFF

### 2. Tagi i okładki
- [ ] Wyświetlanie tagów ID3 w UI (tytuł, artysta, album, rok)
- [ ] Okładki albumów z tagów (lofty → base64 → React img)
- [ ] Edycja tagów

### 3. Głośność
- [ ] Pasek głośności (range input)
- [ ] Wyświetlanie aktualnej głośności w %
- [ ] Mute toggle z ikonką
- [ ] Zapamiętywanie głośności między sesjami

### 4. Skróty klawiszowe
- [ ] Spacja → Play/Pause
- [ ] Strzałki → Next/Previous
- [ ] Ctrl + → / ← → Seek ±5s
- [ ] M → Mute
- [ ] 0–9 → Głośność 0%–100%

### 5. Playlisty
- [ ] Tworzenie playlist
- [ ] Zapisywanie do bazy
- [ ] Drag & drop w bibliotece
- [ ] Zapętlanie (utwór / playlistę)

### 6. Equalizer
- [ ] 10-pasmowy equalizer graficzny
- [ ] Aplikowanie w CPAL callback (IIR/Biquad)
- [ ] Presety (Rock, Pop, Klasyczny, itp.)

### 7. Wyszukiwarka
- [ ] Filtrowanie po artystach
- [ ] Filtrowanie po albumach
- [ ] Wyszukiwanie w trakcie odtwarzania (bez przerw)
- [ ] Ostatnio grane

### 8. Wizualizacje 3D
- [ ] Three.js lub WebGL dla 3D spectrum
- [ ] Tryb kuli/cylinder/pyramid
- [ ] Przełączanie między 2D a 3D

### 9. UI/UX
- [ ] Notification toasts
- [ ] Smooth transitions między utworami (crossfade — wymaga drugiego dekodera)
- [ ] Skalowalne UI (responsywność)
- [ ] Minimize to tray
- [ ] Skróty klawiszowe w tle (globalne hotkeys — `windows_hotkeys` crate)

### 10. Biblioteka
- [ ] Synchronizacja z folderami (watch folder)
- [ ] Deduplikacja (MD5 hash)
- [ ] Cache okładek na dysku
- [ ] Import/Export playlist

## Po za tym

- [ ] Testy jednostkowe (Rust — `#[cfg(test)]`)
- [ ] Testy frontendu (Vitest + React Testing Library)
- [ ] Logging (tracing crate + Tauri console)
- [ ] Error handling (nie panikować w CPAL callbacku)
- [ ] Benchmark FFT (sprawdzić CPU usage)
- [ ] GitHub Actions CI (build + test na Windows)

## Znane problemy

1. **Brak synchronizacji czasu przy seeku** — po seeku `check_finished` może zwrócić false zanim ring się opróżni. Obecnie zaakceptowane jako feature.
2. **symphonia nie wspiera gapless** — przerwa między utworami ~50ms. Do poprawy z crossfade.
3. **WebView2 lekko mruga przy zmianie motywu** — związane z repaintem Canvas. Niska priorytetowość.

## Decyzje architektoniczne

- **Brak WebSocket/Python** — backend audio jest w 100% natywnym Rustem. Steel-Spectrum-Overlay został zaadaptowany (Canvas 2D logika), nie zaimportowany.
- **FFT w CPAL callback** — lag z ring buffera był nieakceptowalny; FFT na próbkach wychodzących na kartę dźwiękową daje zero lag.
- **`ring.clear()` usunięte z pauzy** — pauza to tylko atomowy stan; ring przechowuje bufory. Zero skoku pozycji po Resume.
- **Osobny wątek pollingu** — 33ms zamiast RAF do IPC; RAF tylko do renderowania. Rozdzielenie odpowiedzialności.
- **CSS Custom Properties** — zero runtime overhead w porównaniu do CSS-in-JS; idealne dla wielu motywów.

## Uwagi

- Rust edition 2024 — sprawdź czy wszystkie crate wspierają.
- Windows 10/11 — WebView2 wbudowany, ale starsze buildy wymagają instalatora.
- Proces naming — `additionalBrowserArgs` na WebView2 to jedyny sposób na zmianę nazwy podprocesów.
