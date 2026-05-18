import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface TrackMetadata {
  path: string;
  title: string;
  artist: string;
  duration: number;
}

interface PlayerModuleProps {
  trackInfo: TrackMetadata | null;
  isPlaying: boolean;
  isPaused: boolean;
  onPlay: (path: string) => void;
  onPause: () => void;
  onStop: () => void;
  onTrackLoaded: (info: TrackMetadata) => void;
}

export const PlayerModule = ({
  trackInfo,
  isPlaying,
  isPaused,
  onPlay,
  onPause,
  onStop,
  onTrackLoaded
}: PlayerModuleProps) => {

  const selectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Audio", extensions: ["mp3", "flac", "wav", "ogg"] }],
      });

      if (selected && typeof selected === "string") {
        await invoke("zatrzymaj");
        await invoke("odtwarzaj", { sciezka: selected });

        onPlay(selected);

        const info = await invoke<TrackMetadata>("load_track_info", { sciezka: selected });
        onTrackLoaded(info);
      }
    } catch (error) {
      console.error("Błąd podczas wybierania pliku:", error);
    }
  };

  return (
    <div className="bento-module player-module">
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

      <div className="timeline-placeholder">
        <div className="timeline-bar">
          <div className="timeline-progress" style={{ width: isPlaying ? '35%' : '0%' }}></div>
        </div>
        <div className="time-stamps">
            <span>0:00</span>
            <span>{trackInfo ? `${Math.floor(trackInfo.duration / 60)}:${Math.floor(trackInfo.duration % 60).toString().padStart(2, '0')}` : "0:00"}</span>
        </div>
      </div>

      <div className="player-controls-row">
        <button className="btn-icon btn-secondary" onClick={selectFile}>
          📂
        </button>

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
            <span className="vol-icon">🔊</span>
            <input type="range" className="vol-slider" min="0" max="100" defaultValue="80" />
        </div>
      </div>
    </div>
  );
};
