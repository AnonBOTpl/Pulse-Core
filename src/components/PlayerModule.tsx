import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface TrackMetadata {
  path: string;
  title: string;
  artist: string;
  duration: number;
  format?: string;
  sample_rate?: number;
  bitrate?: number;
}

interface PlayerModuleProps {
  trackInfo: TrackMetadata | null;
  isPlaying: boolean;
  isPaused: boolean;
  onPlay: (path: string) => void;
  onPause: () => void;
  onStop: () => void;
}

export const PlayerModule = ({
  trackInfo,
  isPlaying,
  isPaused,
  onPlay,
  onPause,
  onStop,
}: PlayerModuleProps) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(80);
  const isDraggingTimeline = useRef(false);

  // Pobieranie pozycji odtwarzania
  useEffect(() => {
    let interval: number;
    if (isPlaying && !isPaused && !isDraggingTimeline.current) {
        interval = window.setInterval(async () => {
            try {
                const pos = await invoke<number>("get_playback_position");
                setCurrentTime(pos);
            } catch (e) {
                console.error("Błąd pobierania pozycji:", e);
            }
        }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, isPaused]);

  // Reset czasu przy nowym utworze
  useEffect(() => {
    if (trackInfo) {
        setCurrentTime(0);
    }
  }, [trackInfo?.path]);

  const handleSeek = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    try {
        await invoke("seek", { seconds: val });
    } catch (e) {
        console.error("Seek error:", e);
    }
  };

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setVolume(val);
    try {
        await invoke("set_volume", { volume: val / 100 });
    } catch (e) {
        console.error("Volume error:", e);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatRemaining = (seconds: number, duration: number) => {
    const remaining = duration - seconds;
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    return `-${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const selectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Audio", extensions: ["mp3", "flac", "wav", "ogg"] }],
      });

      if (selected && typeof selected === "string") {
        onPlay(selected);
      }
    } catch (error) {
      console.error("Błąd podczas wybierania pliku:", error);
    }
  };

  const selectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected && typeof selected === "string") {
        await invoke("scan_folder", { sciezka: selected });
      }
    } catch (error) {
      console.error("Błąd podczas wybierania folderu:", error);
    }
  };

  return (
    <div className="bento-module player-module">
      <div className="player-top-row">
        <div className="track-info-display">
            {trackInfo ? (
            <>
                <h2 className="display-title">{trackInfo.title}</h2>
                <p className="display-artist">{trackInfo.artist}</p>
            </>
            ) : (
            <>
                <h2 className="display-title">PulseCore Player</h2>
                <p className="display-artist">Wybierz utwór, aby rozpocząć</p>
            </>
            )}
        </div>

        {trackInfo && (
            <div className="audiophile-panel">
                <span className="badge-format">{trackInfo.format}</span>
                <span className="tech-info">{trackInfo.sample_rate ? (trackInfo.sample_rate / 1000).toFixed(1) : "0"} kHz</span>
                <span className="tech-info">{trackInfo.bitrate ? Math.round(trackInfo.bitrate / 1000) : "0"} kbps</span>
            </div>
        )}
      </div>

      <div className="timeline-module">
        <input
            type="range"
            className="timeline-slider"
            min="0"
            max={trackInfo?.duration || 0}
            value={currentTime}
            onChange={handleSeek}
            onMouseDown={() => isDraggingTimeline.current = true}
            onMouseUp={() => isDraggingTimeline.current = false}
        />
        <div className="time-stamps">
            <span>{formatTime(currentTime)}</span>
            <span>{trackInfo ? formatRemaining(currentTime, trackInfo.duration) : "0:00"}</span>
        </div>
      </div>

      <div className="player-controls-row">
        <div className="import-controls">
          <button className="btn-icon btn-secondary" onClick={selectFile} title="Dodaj plik">
            📂
          </button>
          <button className="btn-icon btn-secondary" onClick={selectFolder} title="Dodaj folder">
            📁
          </button>
        </div>

        <div className="main-btns">
            {isPlaying && !isPaused ? (
                <button className="btn-circle btn-primary" onClick={onPause}>⏸</button>
            ) : (
                <button
                  className="btn-circle btn-primary"
                  onClick={() => trackInfo && onPlay(trackInfo.path)}
                  disabled={!trackInfo}
                >
                  ▶
                </button>
            )}
            <button
              className="btn-circle btn-danger"
              onClick={onStop}
              disabled={!isPlaying && !isPaused}
            >
              ■
            </button>
        </div>

        <div className="volume-control">
            <span className="vol-icon">{volume === 0 ? "🔇" : "🔊"}</span>
            <input
                type="range"
                className="vol-slider"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
            />
        </div>
      </div>
    </div>
  );
};
