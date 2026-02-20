import { useState, useEffect } from 'react';

export const PHYSICAL_GRID_STORAGE_KEY = 'sheskin-physical-grid-cols';
const DEFAULT_COLS = 4;
export const PHYSICAL_GRID_COLS_EVENT = 'physical-grid-cols-changed';

interface PhysicalGridProps {
  count: number;
}

function readColsFromStorage(): number {
  if (typeof window === 'undefined') return DEFAULT_COLS;
  const saved = localStorage.getItem(PHYSICAL_GRID_STORAGE_KEY);
  if (!saved) return DEFAULT_COLS;
  const n = parseInt(saved, 10);
  return n >= 2 && n <= 6 ? n : DEFAULT_COLS;
}

export function PhysicalGrid({ count }: PhysicalGridProps) {
  const [cols, setCols] = useState(DEFAULT_COLS);

  useEffect(() => {
    setCols(readColsFromStorage());
    const handler = () => setCols(readColsFromStorage());
    window.addEventListener(PHYSICAL_GRID_COLS_EVENT, handler);
    return () => window.removeEventListener(PHYSICAL_GRID_COLS_EVENT, handler);
  }, []);

  const gridColsClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  }[cols];

  const placeholders = Array.from({ length: count }, (_, i) => i + 1);

  return (
    <div className={`grid ${gridColsClass} gap-4`}>
      {placeholders.map((i) => (
        <div
          key={i}
          className="relative aspect-4/5 overflow-hidden bg-gray-100 group"
        >
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-xs text-gray-400">Work {i}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
