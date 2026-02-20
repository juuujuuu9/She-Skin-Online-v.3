import { useState, useEffect } from 'react';
import {
  AUDIO_GRID_STORAGE_KEY,
  AUDIO_GRID_COLS_EVENT,
} from '@components/AudioGrid';

const DEFAULT_COLS = 4;

function readColsFromStorage(): number {
  if (typeof window === 'undefined') return DEFAULT_COLS;
  const saved = localStorage.getItem(AUDIO_GRID_STORAGE_KEY);
  if (!saved) return DEFAULT_COLS;
  const n = parseInt(saved, 10);
  return n >= 2 && n <= 6 ? n : DEFAULT_COLS;
}

export function AudioGridControls() {
  const [cols, setCols] = useState(DEFAULT_COLS);

  useEffect(() => {
    setCols(readColsFromStorage());
    const handler = () => setCols(readColsFromStorage());
    window.addEventListener(AUDIO_GRID_COLS_EVENT, handler);
    return () => window.removeEventListener(AUDIO_GRID_COLS_EVENT, handler);
  }, []);

  const updateCols = (next: number) => {
    const clamped = Math.max(2, Math.min(6, next));
    setCols(clamped);
    if (typeof window !== 'undefined') {
      localStorage.setItem(AUDIO_GRID_STORAGE_KEY, String(clamped));
      window.dispatchEvent(new CustomEvent(AUDIO_GRID_COLS_EVENT));
    }
  };

  return (
    <div
      className="fixed right-6 top-24 z-[60] flex flex-col gap-1 bg-white"
      role="group"
      aria-label="Adjust grid cell size"
    >
      <button
        type="button"
        onClick={() => updateCols(cols - 1)}
        disabled={cols <= 2}
        className="w-8 h-8 flex items-center justify-center text-base font-light text-black hover:opacity-60 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        aria-label="Grow (fewer columns)"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => updateCols(cols + 1)}
        disabled={cols >= 6}
        className="w-8 h-8 flex items-center justify-center text-base font-light text-black hover:opacity-60 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        aria-label="Shrink (more columns)"
      >
        −
      </button>
    </div>
  );
}
