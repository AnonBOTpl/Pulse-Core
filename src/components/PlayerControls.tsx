import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export const PlayerControls = () => {
  const [currentFile, setCurrentFile] = useState<string | null>(null);
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
        setCurrentFile(selected);
        // Automatyczne zatrzymanie obecnego utworu przy wyborze nowego
        if (isPlaying) {
            await handleStop();
        }
      }
    } catch (error) {
      console.error("Błąd podczas wybierania pliku:", error);
    }
  };

  const handlePlay = async () => {
    if (!currentFile) return;

    try {
      if (isPaused) {
        await invoke("wznow");
        setIsPaused(false);
      } else {
        await invoke("odtwarzaj", { sciezka: currentFile });
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
        {currentFile ? (
          <p>Wybrany plik: <span>{currentFile.split(/[\\/]/).pop()}</span></p>
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
              disabled={!currentFile}
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
