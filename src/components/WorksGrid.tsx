import { useState, useEffect } from 'react';

export const DEFAULT_COLS_DESKTOP = 4;
export const DEFAULT_COLS_MOBILE = 3;
export const MOBILE_BREAKPOINT_PX = 640;
export const WORKS_GRID_COLS_EVENT = 'works-grid-cols-changed';

export interface WorkGridItem {
  slug: string;
  title?: string;
  year?: number;
  forSale?: boolean;
  image: { src: string; alt: string } | null;
  /** When set (e.g. for digital grid with no detail pages), used instead of /works/{slug} */
  href?: string;
}

interface WorksGridProps {
  works: WorkGridItem[];
  /** Optional class for the title label (e.g. text-[13px] for collaborations) */
  titleClassName?: string;
  /** Default columns on desktop (e.g. 6 for digital/collaborations) */
  defaultColsDesktop?: number;
  /** Default columns on mobile (e.g. 3 for digital/collaborations) */
  defaultColsMobile?: number;
}

function getDefaultCols(
  isMobile: boolean,
  overrides?: { desktop?: number; mobile?: number }
): number {
  const desktop = overrides?.desktop ?? DEFAULT_COLS_DESKTOP;
  const mobile = overrides?.mobile ?? DEFAULT_COLS_MOBILE;
  return isMobile ? mobile : desktop;
}

export function WorksGrid({
  works,
  titleClassName,
  defaultColsDesktop,
  defaultColsMobile,
}: WorksGridProps) {
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

  const maxColsMobile = defaultColsMobile ?? 3;
  const effectiveCols = isMobile
    ? Math.max(1, Math.min(maxColsMobile, cols))
    : cols;
  const gridColsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  }[effectiveCols];

  return (
    <div className={`grid ${gridColsClass} gap-6 items-start`}>
      {works.map((work) => (
        <a
          key={work.slug}
          href={work.href ?? `/works/${work.slug}`}
          className="group block"
        >
          <div className="overflow-hidden bg-gray-100 mb-4">
            {work.image ? (
              <img
                src={work.image.src}
                alt={work.image.alt}
                className="w-full h-auto block object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
            ) : (
              <div className="w-full aspect-square flex items-center justify-center text-gray-400">
                <span className="text-sm">No image</span>
              </div>
            )}
          </div>
          {work.title != null && work.title !== '' && (
            <h3
              className={
                titleClassName ??
                'font-medium text-gray-900 group-hover:text-gray-700 line-clamp-2'
              }
            >
              {work.title}
            </h3>
          )}
          {work.year != null && work.year > 0 && (
            <time className="text-sm text-gray-500">
              {work.year}
            </time>
          )}
          {work.forSale && (
            <span className="inline-block mt-2 text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
              For Sale
            </span>
          )}
        </a>
      ))}
    </div>
  );
}
