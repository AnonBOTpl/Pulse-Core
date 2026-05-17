import "./App.css";
import { PlayerControls } from "./components/PlayerControls";

function App() {
  return (
    <main className="container">
      <header>
        <h1>PulseCore Audio</h1>
        <p className="subtitle">Nowoczesny odtwarzacz dźwięku</p>
      </header>

      <section className="player-section">
        <PlayerControls />
      </section>

      <footer>
        <p>&copy; 2026 PulseCore Team</p>
      </footer>
    </main>
  );
}

export default App;
