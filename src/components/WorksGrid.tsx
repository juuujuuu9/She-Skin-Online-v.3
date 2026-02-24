import { useState, useEffect } from 'react';
import { LightningImg } from './ui/LightningImg';

export const DEFAULT_COLS_DESKTOP = 4;
export const DEFAULT_COLS_MOBILE = 3;
export const MOBILE_BREAKPOINT_PX = 640;
export const WORKS_GRID_COLS_EVENT = 'works-grid-cols-changed';

export interface WorkGridItem {
  slug: string;
  title?: string;
  year?: number;
  forSale?: boolean;
  image: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    variants?: { sm?: { url: string; width: number }; md?: { url: string; width: number }; lg?: { url: string; width: number } };
    dominantColor?: string;
  } | null;
  /** When set (e.g. for digital grid with no detail pages), used instead of /works/{slug} */
  href?: string;
}

// Helper to extract YouTube video ID from various YouTube URL formats
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Helper to check if URL is external
function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

interface WorksGridProps {
  works: WorkGridItem[];
  /** Optional class for the title label (e.g. text-[13px] for collaborations) */
  titleClassName?: string;
  /** Default columns on desktop (e.g. 6 for digital/collaborations) */
  defaultColsDesktop?: number;
  /** Default columns on mobile (e.g. 3 for digital/collaborations) */
  defaultColsMobile?: number;
  /** Center items vertically within each row (e.g. for physical) */
  alignRowsCenter?: boolean;
  /** Category to determine special rendering (e.g. ear icon for physical) */
  category?: string;
  /** Base path for work detail links (e.g. '/works/physical') */
  basePath?: string;
  /** Whether to re-fetch data client-side to ensure fresh data after uploads */
  refreshOnMount?: boolean;
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
  works: initialWorks,
  titleClassName,
  defaultColsDesktop,
  defaultColsMobile,
  alignRowsCenter,
  category,
  basePath,
  refreshOnMount = true,
}: WorksGridProps) {
  const overrides =
    defaultColsDesktop != null || defaultColsMobile != null
      ? { desktop: defaultColsDesktop, mobile: defaultColsMobile }
      : undefined;
  const [cols, setCols] = useState(
    defaultColsDesktop ?? DEFAULT_COLS_DESKTOP
  );
  const [isMobile, setIsMobile] = useState(false);
  const [works, setWorks] = useState<WorkGridItem[]>(initialWorks);
  const [isLoading, setIsLoading] = useState(false);
  const [youtubeModal, setYoutubeModal] = useState<{ isOpen: boolean; videoId: string | null; title?: string }>({
    isOpen: false,
    videoId: null,
  });

  // Re-fetch data client-side to ensure fresh data after uploads
  useEffect(() => {
    if (!refreshOnMount || !category) return;

    let cancelled = false;
    setIsLoading(true);

    fetch(`/api/works/${category}`, {
      headers: { 'Accept': 'application/json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch works');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.works && Array.isArray(data.works)) {
          setWorks(data.works);
        }
      })
      .catch((err) => {
        console.error('WorksGrid refresh error:', err);
        // Keep using initialWorks on error
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category, refreshOnMount]);

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

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && youtubeModal.isOpen) {
        setYoutubeModal({ isOpen: false, videoId: null });
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [youtubeModal.isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (youtubeModal.isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [youtubeModal.isOpen]);

  const handleWorkClick = (e: React.MouseEvent, work: WorkGridItem) => {
    if (!work.href) return; // Let default behavior navigate to /works/{slug}

    const youtubeId = extractYouTubeId(work.href);
    if (youtubeId) {
      e.preventDefault();
      setYoutubeModal({ isOpen: true, videoId: youtubeId, title: work.title });
    } else if (isExternalUrl(work.href)) {
      // External non-YouTube link - let it open in new tab
      e.preventDefault();
      window.open(work.href, '_blank', 'noopener,noreferrer');
    }
    // Otherwise it's an internal link, let default behavior handle it
  };

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

  // Helper to get the correct href for a work
  const getWorkHref = (work: WorkGridItem): string => {
    if (work.href) return work.href;
    if (basePath) return `${basePath}/${work.slug}`;
    return `/works/${work.slug}`;
  };

  return (
    <>
      <div className={`grid ${gridColsClass} gap-6 ${alignRowsCenter ? 'items-center' : 'items-start'}`}>
        {works.map((work) => (
          <a
            key={work.slug}
            href={getWorkHref(work)}
            onClick={(e) => handleWorkClick(e, work)}
            className="group block"
            target={work.href && !extractYouTubeId(work.href) && isExternalUrl(work.href) ? '_blank' : undefined}
            rel={work.href && !extractYouTubeId(work.href) && isExternalUrl(work.href) ? 'noopener noreferrer' : undefined}
          >
          <div className="overflow-hidden bg-gray-100 mb-4">
            {work.image ? (
              <LightningImg
                src={work.image.src}
                alt={work.image.alt}
                variants={work.image.variants}
                width={work.image.width}
                height={work.image.height}
                dominantColor={work.image.dominantColor}
                className="w-full block group-hover:scale-105 transition-transform duration-500"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                priority={false}
                naturalAspect
              />
            ) : (
              <div className="w-full min-h-[200px] flex items-center justify-center text-gray-400">
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

      {/* YouTube Modal */}
      {youtubeModal.isOpen && youtubeModal.videoId && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setYoutubeModal({ isOpen: false, videoId: null })}
        >
          <div
            className="relative w-[75vw] bg-black rounded-lg overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-black">
              <h3 className="text-white font-medium truncate">
                {youtubeModal.title}
              </h3>
              <button
                onClick={() => setYoutubeModal({ isOpen: false, videoId: null })}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* YouTube Embed */}
            <div className="relative aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${youtubeModal.videoId}?autoplay=1&rel=0&modestbranding=1`}
                title={youtubeModal.title || 'YouTube video'}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
