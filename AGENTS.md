# Instrukcje dla Agenta (Google Jules)

## Kontekst Projektu
Tworzymy nowoczesny, wysokowydajny odtwarzacz audio. Projekt w całości porzuca środowisko .NET/C# na rzecz wydajnego backendu i lekkiego frontendu webowego.
Obecny rok: 2026. Bezwzględnie korzystaj z najnowszych, stabilnych wersji bibliotek i frameworków dostępnych na ten moment.

## Stos Technologiczny
*   **Backend (Rdzeń):** Rust
*   **Most Komunikacyjny:** Tauri v2+
*   **Silnik Audio:** `bass-rs` (Zarządzanie odtwarzaniem, DSP, wyciąganie tagów, buforowanie, gapless)
*   **Baza Danych:** SQLite (obsługiwane asynchronicznie przez `sqlx`)
*   **Obliczenia FFT:** `rustfft` (uruchamiane po stronie Rusta, wysyłające zoptymalizowane tablice przez Tauri IPC do frontendu)
*   **Frontend (UI):** React + TypeScript (Vite) oraz React Three Fiber / WebGL do wizualizacji.
*   **Stylowanie:** Tailwind CSS (opcjonalnie) oraz dynamiczne zmienne CSS (CSS Custom Properties) do obsługi skórek.

## Główne Zasady Programowania i Generowania Kodu
1.  **Brak technologii Microsoftu:** Pod żadnym pozorem nie generuj kodu w C#, nie używaj Avalonia UI, WPF, ani `DispatcherTimer`. Czas i zdarzenia obsługuj asynchronicznie za pomocą środowiska `tokio` w Rust.
2.  **Zarządzanie stanem (React):** Używaj nowoczesnych wzorców React (Hooks, Context API lub lekkich bibliotek jak Zustand) do synchronizacji stanu odtwarzacza z backendem Rust poprzez Tauri Events.
3.  **Odseparowanie logiki:** Frontend odpowiada WYŁĄCZNIE za renderowanie UI i animacji. Cała ciężka logika, parsowanie plików, zapytania HTTP (`reqwest`) i przeliczanie częstotliwości odbywa się w języku Rust.
4.  **Wydajność GPU/CPU:** Przy implementacji wizualizacji (Canvas/WebGL) zawsze dbaj o zdejmowanie obciążenia z GPU (odmontowywanie komponentów lub pauzowanie pętli renderującej), gdy okno jest zminimalizowane.
5.  **Integracje AI:** Jeśli w ramach rozwoju projektu (np. automatyzacja, asystenci) zostaniesz poproszony o implementację rozwiązań Google AI, **wymagane jest** korzystanie z ujednoliconej biblioteki `google-genai`. Bezwzględnie zakazuje się wykorzystywania jakichkolwiek przestarzałych bibliotek oraz odwoływania się do starszych modeli (w tym całkowity zakaz używania nazw takich jak "Model 1.5 Pro").

## Architektura i Pętla Audio
*   Zamiast `BASS_SYNC_END` z .NET, używaj odpowiedników z `bass-rs` w asynchronicznych wątkach Rusta, wysyłając eventy do interfejsu Reacta.
*   Zadbaj o wysoką przepustowość kanałów IPC podczas wysyłania danych FFT (Float Arrays) z Rusta do Frontendu (najlepiej batchowanie paczek danych w celu utrzymania stałych 60/120 FPS).

## Fazy Rozwoju
*   [ ] FAZA 1: Odtwarzanie, pauza, stop (Komunikacja Rust <-> Frontend).
*   [ ] FAZA 2: Baza SQLite, wydobywanie tagów (ID3) asynchronicznie, zarządzanie stanem i playlistą.
*   [ ] FAZA 3: Minimal Radial Ring (FFT przeliczane w Rust, renderowane w WebGL), System Skórek (CSS Variables).
*   [ ] FAZA 4: Crossfading, zapytania HTTP (`reqwest`/`scraper`), pobieranie okładek i tekstów, radio internetowe.