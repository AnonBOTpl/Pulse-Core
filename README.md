# PulseCore

> Cyberpunkowy odtwarzacz audio z wizualizacją FFT w czasie rzeczywistym.  
> Powered by Rust + Tauri v2 + React.

![](https://img.shields.io/badge/Rust-000?logo=rust) ![](https://img.shields.io/badge/Tauri_v2-000?logo=tauri) ![](https://img.shields.io/badge/React-000?logo=react) ![](https://img.shields.io/badge/TypeScript-000?logo=typescript) ![](https://img.shields.io/badge/SQLite-000?logo=sqlite)

---

## Architektura

```
┌─────────────────────────────────────────────────────┐
│                  Frontend (React/TS)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Player   │  │ Playlist │  │  Visualizer FFT  │  │
│  │  Module   │  │  Module  │  │  (Canvas 2D)     │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                    Bento Grid UI                     │
├─────────────────── Tauri IPC ───────────────────────┤
│                  Backend (Rust)                      │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  AudioManager│  │    FFT   │  │      DB      │  │
│  │ symphonia    │  │ rustfft  │  │    sqlx      │  │
│  │ + cpal       │  │ Hanning  │  │   SQLite     │  │
│  └──────────────┘  └──────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Frontend
- **React 19** + **TypeScript** — komponenty funkcyjne, hooks, state zarządzany lokalnie
- **Vite** — szybki bundler deweloperski z HMR
- **HTML5 Canvas 2D** — wizualizacja spektrum (tryby: słupkowy / pierścień)
- **Lucide React** — ikony SVG
- **CSS Custom Properties** — dynamiczne zmienne do systemu skórek

### Backend
- **Tauri v2** — most komunikacyjny (komendy + stan zarządzany)
- **symphonia** — dekodowanie audio (MP3, FLAC, WAV, OGG, AAC) — 100% natywny Rust, brak FFI
- **cpal** — wyjście audio z callbackiem w czasie rzeczywistym
- **rustfft** — obliczenia FFT (1024 próbek, okno Hanninga, 256 pasm)
- **sqlx** — asynchroniczna baza SQLite dla biblioteki utworów i metadanych
- **lofty** — ekstrakcja tagów ID3

### Kluczowe cechy
- Błyskawiczne przewijanie (seeking) przez `symphonia::SeekMode::Accurate`
- Volume z zero-delay — aplikowane w callbacku CPAL, nie w wątku dekodera
- Osobny stan FFT (`Arc<Mutex<Vec<f32>>>`) — zero lock contention z komendami audio
- Polling FFT 30fps + rendering 60fps przez osobne pętle (setInterval + requestAnimationFrame)
- Bento Grid z efektem glassmorphism
- Auto-advance do następnego utworu
- Wykrywanie "martwych linków" (Auto-Skip + ghosting)

---

## Wymagania

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (edition 2024)
- [Tauri CLI](https://v2.tauri.app/start/cli/) (`cargo install tauri-cli --version "^2"`)
- Windows: WebView2 (wbudowany w Windows 10/11)

## Instalacja

```bash
# 1. Sklonuj repozytorium
git clone https://github.com/twoja-nazwa/pulsecore.git
cd pulsecore

# 2. Zainstaluj zależności frontendowe
npm install

# 3. Uruchom w trybie deweloperskim
npm run tauri dev
```

Aplikacja otworzy się w natywnym oknie Tauri.  
Backend Rust kompiluje się automatycznie przy pierwszym uruchomieniu.

## Komendy

| Komenda | Opis |
|---------|------|
| `npm run dev` | Frontend dev server (http://localhost:1420) |
| `npm run build` | Buduje frontend (TypeScript + Vite) |
| `npm run tauri dev` | Pełny dev z backendem Rust |
| `npm run tauri build` | Buduje instalator (.msi/.exe) |
| `cargo build` (w `src-tauri/`) | Buduje tylko backend |

## Struktura projektu

```
pulsecore/
├── src/                          # Frontend React
│   ├── components/
│   │   ├── PlayerModule.tsx      # Panel sterowania
│   │   ├── PlaylistModule.tsx    # Biblioteka utworów
│   │   └── VisualizerModule.tsx  # Wizualizator FFT
│   ├── App.tsx                   # Główny komponent
│   ├── App.css                   # Style (Bento Grid + glassmorphism)
│   └── main.tsx                  # Entry point
├── src-tauri/                    # Backend Rust
│   ├── src/
│   │   ├── main.rs               # Entry point Tauri
│   │   ├── lib.rs                # Rejestracja komend + setup
│   │   ├── audio_manager.rs      # Silnik audio + FFT
│   │   ├── db.rs                 # Baza SQLite
│   │   └── metadata.rs           # Ekstrakcja tagów
│   ├── tauri.conf.json           # Konfiguracja okna + WebView2
│   └── capabilities/             # Permisje Tauri
├── package.json
└── README.md
```

---

## Podziękowania

Ten projekt wykorzystuje logikę wizualizacji Canvas 2D zaadaptowaną z:
- **[Steel-Spectrum-Overlay](https://github.com/AnonBOTpl/Steel-Spectrum-Overlay)** — zaawansowana fizyka słupków (EMA decay, peak indicators), tryby Mirror i Oscilloscope, beat detection oraz system gradientów. Przeniesiono do natywnej architektury Rust+React, całkowicie odrzucając backend Python/WebSocket.

---

## Licencja

MIT
