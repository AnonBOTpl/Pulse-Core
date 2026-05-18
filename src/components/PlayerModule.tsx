import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  FileAudio,
  FolderOpen
} from "lucide-react";

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
  onNext: () => void;
  onPrevious: () => void;
}

export const PlayerModule = ({
  trackInfo,
  isPlaying,
  isPaused,
  onPlay,
  onPause,
  onStop,
  onNext,
  onPrevious,
}: PlayerModuleProps) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
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
        if (val > 0 && isMuted) {
            setIsMuted(false);
            await invoke("wycisz", { mute: false });
        }
    } catch (e) {
        console.error("Volume error:", e);
    }
  };

  const toggleMute = async () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    try {
        await invoke("wycisz", { mute: nextMute });
    } catch (e) {
        console.error("Mute error:", e);
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
                <div className="audiophile-row">
                  <span className="badge-format">{trackInfo.format}</span>
                  <span className="tech-info">{trackInfo.sample_rate ? (trackInfo.sample_rate / 1000).toFixed(1) : "0"} kHz</span>
                  <span className="tech-info">{trackInfo.bitrate ? Math.round(trackInfo.bitrate) : "0"} kbps</span>
                </div>
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
            <FileAudio size={20} />
          </button>
          <button className="btn-icon btn-secondary" onClick={selectFolder} title="Dodaj folder">
            <FolderOpen size={20} />
          </button>
        </div>

        <div className="main-btns">
            <button className="btn-small btn-secondary" onClick={onPrevious}>
              <SkipBack size={20} fill="currentColor" />
            </button>
            {isPlaying && !isPaused ? (
                <button className="btn-circle btn-primary" onClick={onPause}>
                  <Pause size={24} fill="currentColor" />
                </button>
            ) : (
                <button
                  className="btn-circle btn-primary"
                  onClick={() => trackInfo && onPlay(trackInfo.path)}
                  disabled={!trackInfo}
                >
                  <Play size={24} fill="currentColor" style={{marginLeft: '2px'}} />
                </button>
            )}
            <button
              className="btn-circle btn-danger"
              onClick={onStop}
              disabled={!isPlaying && !isPaused}
            >
              <Square size={24} fill="currentColor" />
            </button>
            <button className="btn-small btn-secondary" onClick={onNext}>
              <SkipForward size={20} fill="currentColor" />
            </button>
        </div>

        <div className="volume-control">
            <button className="btn-icon-small" onClick={toggleMute}>
              {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
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
