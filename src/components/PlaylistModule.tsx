import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Track {
  path: string;
  title: string;
  artist: string;
  duration: number;
  available: number;
}

interface PlaylistModuleProps {
  onSelectTrack: (path: string) => void;
  currentPath?: string;
  deadTracks: Set<string>;
  setDeadTracks: React.Dispatch<React.SetStateAction<Set<string>>>;
  onTracksLoaded?: (tracks: Track[]) => void;
  refreshTrigger?: number;
}

export const PlaylistModule = ({
    onSelectTrack,
    currentPath,
    deadTracks,
    setDeadTracks,
    onTracksLoaded,
    refreshTrigger
}: PlaylistModuleProps) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadTracks = async () => {
    try {
      const result = await invoke<Track[]>("get_all_tracks");
      setTracks(result);
      if (onTracksLoaded) {
          onTracksLoaded(result);
      }
    } catch (error) {
      console.error("Nie udało się załadować playlisty:", error);
    }
  };

  useEffect(() => {
    loadTracks();
    // Odświeżaj co jakiś czas lub po akcji (uproszczenie)
    const interval = setInterval(loadTracks, 5000);
    return () => clearInterval(interval);
  }, [refreshTrigger]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const syncLibrary = async () => {
    setIsSyncing(true);
    try {
      await invoke("sync_library");
      setDeadTracks(new Set());
      await loadTracks();
    } catch (error) {
      console.error("Błąd synchronizacji:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const clearLibrary = async () => {
    if (window.confirm("Czy na pewno chcesz wyczyścić całą bibliotekę?")) {
        try {
            await invoke("clear_library_cmd");
            setDeadTracks(new Set());
            await loadTracks();
        } catch (error) {
            console.error("Błąd czyszczenia bazy:", error);
        }
    }
  };

  return (
    <div className="bento-module playlist-module">
      <div className="module-header">
        <div className="header-title-group">
          <h3>BIBLIOTEKA UTWORÓW</h3>
          <div className="header-actions">
            <button
                className={`btn-sync ${isSyncing ? 'syncing' : ''}`}
                onClick={syncLibrary}
                disabled={isSyncing}
                title="Synchronizuj status plików"
            >
                🔄
            </button>
            <button
                className="btn-clear"
                onClick={clearLibrary}
                title="Wyczyść bibliotekę"
            >
                🗑️
            </button>
          </div>
        </div>
      </div>
      <div className="playlist-container">
        {tracks.length === 0 ? (
          <p className="empty-msg">Brak utworów w bazie danych. Wybierz plik, aby go dodać.</p>
        ) : (
          <table className="tracks-table">
            <thead>
              <tr>
                <th>TYTUŁ</th>
                <th>WYKONAWCA</th>
                <th className="text-right">CZAS</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track, idx) => (
                <tr
                  key={idx}
                  className={`
                    ${currentPath === track.path ? "active" : ""}
                    ${deadTracks.has(track.path) || track.available === 0 ? "dead-link" : ""}
                  `}
                  onClick={() => onSelectTrack(track.path)}
                >
                  <td className="track-title-cell">{track.title}</td>
                  <td>{track.artist}</td>
                  <td className="text-right">{formatDuration(track.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
