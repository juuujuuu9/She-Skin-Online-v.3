import { useState, useEffect } from 'react';
import { PlayButton, AddToQueueButton } from '@components/AudioControls';
import type { Track } from '@lib/audioStore';

export const AUDIO_GRID_STORAGE_KEY = 'sheskin-audio-grid-cols-v2';
const DEFAULT_COLS = 4;
export const AUDIO_GRID_COLS_EVENT = 'audio-grid-cols-changed';

interface Release {
  id: string;
  title: string;
  year: number;
  coverArt: string | null;
  tracks: Track[];
}

interface AudioGridProps {
  releases: Release[];
}

function readColsFromStorage(): number {
  if (typeof window === 'undefined') return DEFAULT_COLS;
  const saved = localStorage.getItem(AUDIO_GRID_STORAGE_KEY);
  if (!saved) return DEFAULT_COLS;
  const n = parseInt(saved, 10);
  return n >= 2 && n <= 6 ? n : DEFAULT_COLS;
}

export function AudioGrid({ releases }: AudioGridProps) {
  const [cols, setCols] = useState(DEFAULT_COLS);

  useEffect(() => {
    setCols(readColsFromStorage());
    const handler = () => setCols(readColsFromStorage());
    window.addEventListener(AUDIO_GRID_COLS_EVENT, handler);
    return () => window.removeEventListener(AUDIO_GRID_COLS_EVENT, handler);
  }, []);

  const gridColsClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  }[cols];

  return (
    <div className={`grid ${gridColsClass} gap-4`}>
      {releases.map((release) => (
        <div
          key={release.id}
          className="relative aspect-square overflow-hidden bg-gray-100 group"
        >
          {release.coverArt ? (
            <img
              src={release.coverArt}
              alt={release.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-xs text-gray-400">Album Art</span>
            </div>
          )}
          {release.tracks.length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 group-hover:bg-black/20 transition-colors">
              <PlayButton
                track={{
                  ...release.tracks[0],
                  coverArt: release.coverArt ?? undefined,
                }}
                queue={release.tracks.map((t) => ({
                  ...t,
                  coverArt: release.coverArt ?? undefined,
                }))}
                variant="overlay"
                size="lg"
                className="opacity-0 group-hover:opacity-100 transition-opacity bg-transparent! border! border-white! text-white! hover:bg-white! hover:text-black!"
              />
              <AddToQueueButton
                track={{
                  ...release.tracks[0],
                  coverArt: release.coverArt ?? undefined,
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity h-12! w-12! border-white! text-white! hover:bg-white! hover:text-black!"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
