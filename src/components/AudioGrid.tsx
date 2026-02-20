import { useState, useEffect } from 'react';
import { PlayButton, AddToQueueButton } from '@components/AudioControls';
import { useStore } from '@nanostores/react';
import { $playerVisible } from '@lib/audioStore';
import type { Track } from '@lib/audioStore';

const STORAGE_KEY = 'sheskin-audio-grid-cols';

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

export function AudioGrid({ releases }: AudioGridProps) {
  const [cols, setCols] = useState(3);
  const playerVisible = useStore($playerVisible);

  // Hydrate from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const n = parseInt(saved, 10);
      if (n >= 1 && n <= 5) setCols(n);
    }
  }, []);

  // Persist to localStorage
  const updateCols = (next: number) => {
    const clamped = Math.max(1, Math.min(5, next));
    setCols(clamped);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    }
  };

  const gridColsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
  }[cols];

  return (
    <>
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

      {/* Column controls - fixed bottom right, above audio player when visible */}
      <div
        className={`fixed right-6 z-40 flex flex-col gap-1 ${playerVisible ? 'bottom-20' : 'bottom-6'}`}
        role="group"
        aria-label="Adjust grid columns"
      >
        <button
          type="button"
          onClick={() => updateCols(cols + 1)}
          disabled={cols >= 5}
          className="w-10 h-10 flex items-center justify-center text-lg font-light text-black hover:opacity-60 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          aria-label="Increase columns"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => updateCols(cols - 1)}
          disabled={cols <= 1}
          className="w-10 h-10 flex items-center justify-center text-lg font-light text-black hover:opacity-60 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          aria-label="Decrease columns"
        >
          −
        </button>
      </div>
    </>
  );
}
