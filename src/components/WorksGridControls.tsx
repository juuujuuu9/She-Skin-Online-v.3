import { useState, useEffect } from 'react';
import {
  WORKS_GRID_COLS_EVENT,
  DEFAULT_COLS_MOBILE,
  DEFAULT_COLS_DESKTOP,
  MOBILE_BREAKPOINT_PX,
} from '@components/WorksGrid';

function getDefaultCols(
  isMobile: boolean,
  overrides?: { desktop?: number; mobile?: number }
): number {
  const desktop = overrides?.desktop ?? DEFAULT_COLS_DESKTOP;
  const mobile = overrides?.mobile ?? DEFAULT_COLS_MOBILE;
  return isMobile ? mobile : desktop;
}

interface WorksGridControlsProps {
  /** Default columns on desktop (e.g. 6 for digital/collaborations) */
  defaultColsDesktop?: number;
  /** Default columns on mobile (e.g. 3 for digital/collaborations) */
  defaultColsMobile?: number;
}

export function WorksGridControls({
  defaultColsDesktop,
  defaultColsMobile,
}: WorksGridControlsProps = {}) {
  const overrides =
    defaultColsDesktop != null || defaultColsMobile != null
      ? { desktop: defaultColsDesktop, mobile: defaultColsMobile }
      : undefined;
  const [cols, setCols] = useState(
    defaultColsDesktop ?? DEFAULT_COLS_DESKTOP
  );
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const update = () => {
      const mobile = mql.matches;
      setIsMobile(mobile);
      setCols(getDefaultCols(mobile, overrides));
    };
    update();
    mql.addEventListener('change', update);
    const handler = (e: CustomEvent<number>) => setCols(e.detail);
    window.addEventListener(WORKS_GRID_COLS_EVENT, handler as EventListener);
    return () => {
      mql.removeEventListener('change', update);
      window.removeEventListener(WORKS_GRID_COLS_EVENT, handler as EventListener);
    };
  }, [defaultColsDesktop, defaultColsMobile]);

  const minCols = isMobile ? 1 : 2;
  const maxColsMobile = defaultColsMobile ?? 3;
  const maxCols = isMobile ? maxColsMobile : 6;

  const updateCols = (next: number) => {
    const clamped = Math.max(minCols, Math.min(maxCols, next));
    setCols(clamped);
    window.dispatchEvent(new CustomEvent(WORKS_GRID_COLS_EVENT, { detail: clamped }));
  };

  return (
    <div
      className="fixed right-6 top-16 md:top-24 z-[60] flex flex-col gap-1 bg-white"
      role="group"
      aria-label="Adjust grid columns"
    >
      <button
        type="button"
        onClick={() => updateCols(cols - 1)}
        disabled={cols <= minCols}
        className="w-8 h-8 flex items-center justify-center text-base font-light text-black hover:opacity-60 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        aria-label="Fewer columns"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => updateCols(cols + 1)}
        disabled={cols >= maxCols}
        className="w-8 h-8 flex items-center justify-center text-base font-light text-black hover:opacity-60 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        aria-label="More columns"
      >
        −
      </button>
    </div>
  );
}
