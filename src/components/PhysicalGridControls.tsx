import { useState, useEffect } from 'react';
import {
  PHYSICAL_GRID_COLS_EVENT,
  DEFAULT_COLS_MOBILE,
  DEFAULT_COLS_DESKTOP,
  MOBILE_BREAKPOINT_PX,
} from '@components/PhysicalGrid';

function getDefaultCols(isMobile: boolean): number {
  return isMobile ? DEFAULT_COLS_MOBILE : DEFAULT_COLS_DESKTOP;
}

export function PhysicalGridControls() {
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

  const minCols = isMobile ? 1 : 2;
  const maxCols = isMobile ? 3 : 6;

  const updateCols = (next: number) => {
    const clamped = Math.max(minCols, Math.min(maxCols, next));
    setCols(clamped);
    window.dispatchEvent(new CustomEvent(PHYSICAL_GRID_COLS_EVENT, { detail: clamped }));
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
        disabled={cols <= minCols}
        className="w-8 h-8 flex items-center justify-center text-base font-light text-black hover:opacity-60 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        aria-label="Grow (fewer columns)"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => updateCols(cols + 1)}
        disabled={cols >= maxCols}
        className="w-8 h-8 flex items-center justify-center text-base font-light text-black hover:opacity-60 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        aria-label="Shrink (more columns)"
      >
        −
      </button>
    </div>
  );
}
