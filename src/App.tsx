import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { PlayerModule } from "./components/PlayerModule";
import { PlaylistModule } from "./components/PlaylistModule";
import { VisualizerModule } from "./components/VisualizerModule";

interface TrackMetadata {
  path: string;
  title: string;
  artist: string;
  duration: number;
}

function App() {
  const [trackInfo, setTrackInfo] = useState<TrackMetadata | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deadTracks, setDeadTracks] = useState<Set<string>>(new Set());
  const [allTracks, setAllTracks] = useState<TrackMetadata[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleTrackSelect = async (path: string) => {
    setError(null);
    try {
      await invoke("zatrzymaj");
      await invoke("odtwarzaj", { sciezka: path });
      setIsPlaying(true);
      setIsPaused(false);

      const info = await invoke<TrackMetadata>("load_track_info", { sciezka: path });
      setTrackInfo(info);

      // Jeśli udało się odtworzyć, usuwamy ze zbioru martwych linków (jeśli tam był)
      setDeadTracks(prev => {
          if (prev.has(path)) {
              const next = new Set(prev);
              next.delete(path);
              return next;
          }
          return prev;
      });

      // Wymuszamy odświeżenie listy z bazy danych
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      if (err === "FileNotFound") {
        setDeadTracks(prev => new Set(prev).add(path));
        setError("Plik nie został znaleziony na dysku. Przeskakuję...");
        // Auto-skip logic
        skipToNext(path);
      } else {
        setError(String(err));
        setIsPlaying(false);
      }
    }
  };

  const skipToNext = (currentPath: string) => {
    if (allTracks.length === 0) return;

    const currentIndex = allTracks.findIndex(t => t.path === currentPath);
    // Szukaj następnego sprawnego utworu (maksymalnie przez całą listę)
    for (let i = 1; i <= allTracks.length; i++) {
        const nextIndex = (currentIndex + i) % allTracks.length;
        const nextTrack = allTracks[nextIndex];
        if (!deadTracks.has(nextTrack.path)) {
            handleTrackSelect(nextTrack.path);
            break;
        }
    }
  };

  const handlePause = async () => {
    try {
      await invoke("pauzuj");
      setIsPaused(true);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleStop = async () => {
    try {
      await invoke("zatrzymaj");
      setIsPlaying(false);
      setIsPaused(false);
    } catch (err) {
      setError(String(err));
    }
  };

  const handlePlayDirect = async (path: string) => {
    if (isPaused) {
        await invoke("wznow");
        setIsPaused(false);
        setIsPlaying(true);
    } else {
        handleTrackSelect(path);
    }
  }

  return (
    <div className="app-shell">
      <div className="bento-grid">
        <div className="grid-area-player">
          <PlayerModule
            trackInfo={trackInfo}
            isPlaying={isPlaying}
            isPaused={isPaused}
            onPlay={handlePlayDirect}
            onPause={handlePause}
            onStop={handleStop}
          />
        </div>

        <div className="grid-area-visualizer">
          <VisualizerModule />
        </div>

        <div className="grid-area-playlist">
          <PlaylistModule
            onSelectTrack={handleTrackSelect}
            currentPath={trackInfo?.path}
            deadTracks={deadTracks}
            onTracksLoaded={setAllTracks}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>

      {error && (
        <div className="global-error-toast">
          {error}
        </div>
      )}
    </div>
  );
}

export default App;
