import { useState, useEffect } from 'react';

export const DEFAULT_COLS_MOBILE = 3;
export const DEFAULT_COLS_DESKTOP = 6;
export const MOBILE_BREAKPOINT_PX = 640; // sm
export const PHYSICAL_GRID_COLS_EVENT = 'physical-grid-cols-changed';

interface PhysicalGridProps {
  count: number;
}

function getDefaultCols(isMobile: boolean): number {
  return isMobile ? DEFAULT_COLS_MOBILE : DEFAULT_COLS_DESKTOP;
}

export function PhysicalGrid({ count }: PhysicalGridProps) {
  const [cols, setCols] = useState(DEFAULT_COLS_DESKTOP);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const update = () => {
      const mobile = mql.matches;
      setIsMobile(mobile);
      setCols(getDefaultCols(mobile));
    };
    update();
    mql.addEventListener('change', update);
    const handler = (e: CustomEvent<number>) => setCols(e.detail);
    window.addEventListener(PHYSICAL_GRID_COLS_EVENT, handler as EventListener);
    return () => {
      mql.removeEventListener('change', update);
      window.removeEventListener(PHYSICAL_GRID_COLS_EVENT, handler as EventListener);
    };
  }, []);

  const effectiveCols = isMobile ? Math.max(1, Math.min(3, cols)) : cols;
  const gridColsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  }[effectiveCols];

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
