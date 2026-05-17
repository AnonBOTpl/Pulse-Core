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
  const [isPaused, setIsPaused] = useState(false);

  const selectFile = async () => {
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
        // Natychmiastowe zatrzymanie obecnego utworu i start nowego przy użyciu surowej ścieżki
        await invoke("zatrzymaj");
        await invoke("odtwarzaj", { sciezka: selected });

        setIsPlaying(true);
        setIsPaused(false);

        // Ładowanie metadanych w tle, aby nie blokować interfejsu
        invoke<TrackMetadata>("load_track_info", { sciezka: selected })
          .then((info) => {
            setTrackInfo(info);
          })
          .catch((err) => {
            console.error("Nie udało się załadować metadanych:", err);
            // Ustawienie podstawowych informacji w razie błędu
            setTrackInfo({
              path: selected,
              title: null,
              artist: null,
              duration: 0
            });
          });
      }
    } catch (error) {
      console.error("Błąd podczas wybierania pliku:", error);
    }
  };

  const handlePlay = async () => {
    if (!trackInfo) return;

    try {
      if (isPaused) {
        await invoke("wznow");
        setIsPaused(false);
      } else {
        await invoke("odtwarzaj", { sciezka: trackInfo.path });
      }
      setIsPlaying(true);
    } catch (error) {
      console.error("Błąd podczas odtwarzania:", error);
    }
  };

  const handlePause = async () => {
    try {
      await invoke("pauzuj");
      setIsPaused(true);
    } catch (error) {
      console.error("Błąd podczas pauzowania:", error);
    }
  };

  const handleStop = async () => {
    try {
      await invoke("zatrzymaj");
      setIsPlaying(false);
      setIsPaused(false);
    } catch (error) {
      console.error("Błąd podczas zatrzymywania:", error);
    }
  };

  return (
    <div className="player-controls">
      <div className="file-info">
        {trackInfo ? (
          <div className="track-details">
            <p className="track-title">{trackInfo.title || trackInfo.path.split(/[\\/]/).pop()}</p>
            <p className="track-artist">{trackInfo.artist || "Nieznany wykonawca"}</p>
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
    </div>
  );
};
