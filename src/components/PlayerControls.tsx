import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface TrackMetadata {
  path: string;
  title: string | null;
  artist: string | null;
  duration: number;
}

export const PlayerControls = () => {
  const [trackInfo, setTrackInfo] = useState<TrackMetadata | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const selectFile = async () => {
    setErrorMessage(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Audio",
            extensions: ["mp3", "flac", "wav", "ogg"],
          },
        ],
      });

      if (selected && typeof selected === "string") {
        try {
          // Natychmiastowe zatrzymanie obecnego utworu i start nowego przy użyciu surowej ścieżki
          await invoke("zatrzymaj");
          await invoke("odtwarzaj", { sciezka: selected });

          setIsPlaying(true);
          setIsPaused(false);

          // Ładowanie metadanych w tle
          const info = await invoke<TrackMetadata>("load_track_info", { sciezka: selected });
          setTrackInfo(info);
        } catch (err) {
          const msg = String(err);
          console.error("Błąd odtwarzania:", msg);
          setErrorMessage(`Błąd odtwarzania: ${msg}`);
          setIsPlaying(false);
        }
      }
    } catch (error) {
      console.error("Błąd podczas wybierania pliku:", error);
    }
  };

  const handlePlay = async () => {
    if (!trackInfo) return;
    setErrorMessage(null);

    try {
      if (isPaused) {
        await invoke("wznow");
        setIsPaused(false);
      } else {
        await invoke("odtwarzaj", { sciezka: trackInfo.path });
      }
      setIsPlaying(true);
    } catch (error) {
      const msg = String(error);
      console.error("Błąd podczas odtwarzania:", msg);
      setErrorMessage(`Błąd podczas odtwarzania: ${msg}`);
    }
  };

  const handlePause = async () => {
    try {
      await invoke("pauzuj");
      setIsPaused(true);
    } catch (error) {
      const msg = String(error);
      console.error("Błąd podczas pauzowania:", msg);
      setErrorMessage(`Błąd podczas pauzowania: ${msg}`);
    }
  };

  const handleStop = async () => {
    try {
      await invoke("zatrzymaj");
      setIsPlaying(false);
      setIsPaused(false);
      setErrorMessage(null);
    } catch (error) {
      const msg = String(error);
      console.error("Błąd podczas zatrzymywania:", msg);
      setErrorMessage(`Błąd podczas zatrzymywania: ${msg}`);
    }
  };

  return (
    <div className="player-controls">
      <div className="file-info">
        {trackInfo ? (
          <div className="track-details">
            <p className="track-title">{trackInfo.title}</p>
            <p className="track-artist">{trackInfo.artist}</p>
          </div>
        ) : (
          <p>Nie wybrano żadnego pliku</p>
        )}
      </div>

      <div className="controls-group">
        <button className="btn-secondary" onClick={selectFile}>
          Wybierz Plik
        </button>

        <div className="playback-buttons">
          {isPlaying && !isPaused ? (
            <button className="btn-primary" onClick={handlePause}>
              Pauza
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={handlePlay}
              disabled={!trackInfo}
            >
              {isPaused ? "Wznów" : "Graj"}
            </button>
          )}

          <button
            className="btn-danger"
            onClick={handleStop}
            disabled={!isPlaying && !isPaused}
          >
            Stop
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="error-message">
          {errorMessage}
        </div>
      )}
    </div>
  );
};
