# Plan Rozwoju — PulseCore

> Mapa drogowa na przyszłość.  
> Stan: v0.9.0 — stabilny silnik audio + wizualizacja FFT w WebView2.

---

## Etap 1: Drobne szlify

### 1.1 Obsługa dodatkowych formatów audio

`symphonia` już wspiera MP3, FLAC, WAV, OGG, AAC (przez `features = ["all"]`).  
Należy dodać rozpoznawanie i wyświetlanie wspieranych formatów w UI oraz rozszerzyć listę w `scan_folder`.

**Pliki:**
- `src-tauri/src/metadata.rs` — dodaj mapowanie formatów na etykiety
- `src/components/PlaylistModule.tsx` — wyświetlanie ikony formatu

### 1.2 Wykrywanie tagów ID3 i okładek albumów

`lofty` wspiera ekstrakcję tagów. Dodać: odczyt okładek jako `Vec<u8>` → Base64 → przesył do frontendu.

**Pliki:**
- `src-tauri/src/metadata.rs` — `extract_metadata`: dodaj pole `cover_base64: Option<String>`
- `src-tauri/src/lib.rs` — komenda `get_cover`
- `src/components/PlayerModule.tsx` — wyświetlanie okładki

### 1.3 Zapamiętywanie głośności między sesjami

Obecnie volume resetuje się do 1.0 przy starcie. Zapisać do SQLite.

**Pliki:**
- `src-tauri/src/db.rs` — tabela `settings` (key, value)
- `src-tauri/src/audio_manager.rs` — odczyt przy starcie, zapis przy zmianie

### 1.4 Skróty klawiszowe

Dodać globalne skróty (Space = play/pause, Strzałki = głośność, Ctrl+P = poprzedni, Ctrl+N = następny).

**Pliki:**
- `src/components/PlayerModule.tsx` — nasłuch `keydown`
- `src-tauri/src/lib.rs` — komendy dla skrótów

---

## Etap 2: Nowe funkcje audio

### 2.1 Playlisty (zapisywane w SQLite)

Obecnie playlisty są wirtualne (cała biblioteka). Dodać tworzenie, zapisywanie i edycję playlist.

**Pliki:**
- `src-tauri/src/db.rs` — tabela `playlists` + `playlist_tracks`
- `src-tauri/src/lib.rs` — komendy CRUD dla playlist
- `src/components/PlaylistModule.tsx` — UI playlist z drag & drop
- `src/components/PlaylistSidebar.tsx` — lista playlist (nowy komponent)

### 2.2 Equalizer (10-pasmowy)

Dodać filtr DSP między dekoderem a ring bufferem. Użyć biblioteki lub ręcznych filtrów IIR.

**Rozwiązanie:**
- 10 pasm: 31Hz, 62Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz
- Filtry biquad (IIR) w wątku dekodera
- Wartości przechowywane w `Arc<[f32; 10]>`
- UI: suwaki na froncie (`EqualizerModule.tsx`)

### 2.3 Crossfade między utworami

Gdy utwór dobiega końca (ostatnie ~3s), zaczyna cichnąć (fade-out), a następny zaczyna narastać (fade-in).

**Rozwiązanie:**
- Wykrywanie końca utworu w `auto-advance` (już istnieje)
- Drugi dekoder pre-buffering następnego utworu
- Mieszanie dwóch strumieni w callbacku CPAL
- `crossfade_duration` w `settings`

### 2.4 Kolejka odtwarzania (Queue)

Możliwość dodawania utworów do kolejki "play next" / "play last". Kolejka ma priorytet przed playlistą.

**Pliki:**
- `src-tauri/src/audio_manager.rs` — `VecDeque` dla kolejki
- `src-tauri/src/lib.rs` — komendy `queue_add`, `queue_clear`, `queue_remove`
- `src/components/QueueModule.tsx` — panel kolejki

---

## Etap 3: Rozbudowa wizualizacji

### 3.1 Dodatkowe tryby renderowania Canvas

Obecnie: "Bars" (słupki) i "Ring" (pierścień). Dodać:

- **Waveform** — wyświetlanie surowej fali dźwiękowej pobranej z ring buffera
- **Spectrogram** — wizualizacja 2D (częstotliwość × czas) renderowana przez `ImageData`
- **Circle VU** — okrągłe wskaźniki VU przypominające sprzęt audio

**Pliki:**
- `src/components/VisualizerModule.tsx` — nowe funkcje `drawWaveform`, `drawSpectrogram`, `drawCircleVU`
- `src-tauri/src/audio_manager.rs` — endpoint `get_waveform_data` (fragment ring buffera)

### 3.2 Pełnoekranowy tryb "Party Mode"

Przycisk "Party Mode" rozszerza wizualizator na całe okno (lub drugi monitor).  
Canvas zajmuje 100% ekranu, sterowanie znika (lub pojawia się po najechaniu).

**Pliki:**
- `src/components/VisualizerModule.tsx` — `fullscreenRef` + `requestFullscreen()`
- `src/App.css` — klasa `.party-mode` (100vw, 100vh, brak paddingów)

### 3.3 WebGL dla wydajności

Przy wysokich rozdzielczościach (4K+) CPU Canvas 2D może być wąskim gardłem.  
Dodać WebGL jako backend renderowania z fallbackiem do Canvas 2D.

**Pliki:**
- `src/shaders/` — shadery GLSL dla pasm FFT
- `src/hooks/useWebGL.ts` — hook inicjalizujący WebGL
- `src/components/VisualizerModule.tsx` — wybór backendu

### 3.4 FFT — rozszerzenie API

Obecnie FFT przesyła 256 pasm. Na potrzeby spektrogramu i waveform przyda się:

- `get_raw_fft` — pełne 512 binów FFT (niezredukowane)
- `get_waveform` — ostatnie 2048 surowych próbek z ring buffera
- `get_fft_history` — ostatnie N klatek FFT (dla spektrogramu)

---

## Etap 4: Integracje i radio

### 4.1 Radio internetowe

Odtwarzanie strumieni HTTP/MP3 przez `symphonia` + `reqwest` (jako `MediaSourceStream`).

### 4.2 Pobieranie okładek

Automatyczne wyszukiwanie okładek przez `reqwest` + scraper (Last.fm / Deezer API).

### 4.3 Teksty utworów (synced lyrics)

Pobieranie tekstów z LRC/API + wyświetlanie synchroniczne z playbackiem.

### 4.4 Skórki i motywy

Rozbudowa CSS Variables: gotowe palety (Cyberpunk, Dark, Light, Matrix) + edytor własnych kolorów.

---

## Etap 5: Optymalizacje

### 5.1 Buforowanie spektrogramu

Renderuj spektrogram do `OffscreenCanvas` / ImageBitmap — zmniejsza obciążenie GPU.

### 5.2 Web Workers dla FFT

Przenieś polling `get_fft_data` do Web Workera — zwalnia główny wątek React.

### 5.3 Lazy loading playlist

Wirtualny scroll dla biblioteki >1000 utworów (react-window / tanstack-virtual).

---

## Znane bugi do naprawy

- Brak wizualnego feedbacku przy zmianie głośności (poza suwakiem)
- Auto-advance nie wyzwala się gdy utwór jest na pauzie
- `get_playback_position` może zwracać 0.0 przy pierwszym odczycie po seeku
