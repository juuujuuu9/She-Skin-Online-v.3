import { useState, useEffect } from 'react';
import { PlayButton, AddToQueueButton } from '@components/AudioControls';
import type { Track, Release } from '@lib/audioStore';

export const DEFAULT_COLS_DESKTOP = 5;
export const DEFAULT_COLS_MOBILE = 2;
export const MOBILE_BREAKPOINT_PX = 640; // sm
export const AUDIO_GRID_COLS_EVENT = 'audio-grid-cols-changed';

interface AudioGridProps {
  releases: Release[];
}

function getDefaultCols(isMobile: boolean): number {
  return isMobile ? DEFAULT_COLS_MOBILE : DEFAULT_COLS_DESKTOP;
}

export function AudioGrid({ releases }: AudioGridProps) {
  const [cols, setCols] = useState(() => DEFAULT_COLS_DESKTOP);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    console.log('[AudioGrid] Mounted with releases:', releases.length);
    releases.forEach((r, i) => {
      console.log(`[AudioGrid] Release ${i}:`, r.title, 'tracks:', r.tracks.length);
    });
  }, [releases]);

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
    window.addEventListener(AUDIO_GRID_COLS_EVENT, handler as EventListener);
    return () => {
      mql.removeEventListener('change', update);
      window.removeEventListener(AUDIO_GRID_COLS_EVENT, handler as EventListener);
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

  if (releases.length === 0) {
    console.log('[AudioGrid] No releases to render');
    return <div className="text-center text-gray-500">No releases available</div>;
  }

  return (
    <div className={`grid ${gridColsClass} gap-4`}>
      {releases.map((release, index) => {
        console.log(`[AudioGrid] Rendering release ${index}:`, release.title, 'tracks:', release.tracks.length);
        return (
          <div
            key={release.id}
            className="relative aspect-square overflow-hidden bg-white group flex items-center justify-center"
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
            <div
              className={`absolute inset-0 transition-colors ${
                effectiveCols === 1
                  ? 'flex items-end justify-between p-3'
                  : 'flex items-center justify-center gap-2 bg-black/0 group-hover:bg-black/20'
              }`}
            >
              {release.tracks.length > 0 && (
                <>
                  <PlayButton
                    track={{
                      ...release.tracks[0],
                      coverArt: release.coverArt ?? undefined,
                      youtubeLink: release.youtubeLink,
                      soundcloudLink: release.soundcloudLink,
                    }}
                    queue={release.tracks.map((t) => ({
                      ...t,
                      coverArt: release.coverArt ?? undefined,
                      youtubeLink: release.youtubeLink,
                      soundcloudLink: release.soundcloudLink,
                    }))}
                    variant="overlay"
                    size="lg"
                    className={`transition-opacity bg-transparent! border! border-white! text-white! hover:bg-white! hover:text-black! ${
                      effectiveCols === 1 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  />
                  <AddToQueueButton
                    track={{
                      ...release.tracks[0],
                      coverArt: release.coverArt ?? undefined,
                      youtubeLink: release.youtubeLink,
                      soundcloudLink: release.soundcloudLink,
                    }}
                    className={`transition-opacity h-12! w-12! border-white! text-white! hover:bg-white! hover:text-black! ${
                      effectiveCols === 1 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  />
                </>
              )}
              
              {/* YouTube Link */}
              {release.youtubeLink && (
                <a
                  href={release.youtubeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center justify-center h-12 w-12 rounded-full bg-red-600 text-white hover:bg-red-700 transition-opacity ${
                    effectiveCols === 1 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  title="Watch on YouTube"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </a>
              )}
              
              {/* SoundCloud Link */}
              {release.soundcloudLink && (
                <a
                  href={release.soundcloudLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center justify-center h-12 w-12 rounded-full bg-orange-500 text-white hover:bg-orange-600 transition-opacity ${
                    effectiveCols === 1 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  title="Listen on SoundCloud"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="-271 345.8 256 111.2" xmlns="http://www.w3.org/2000/svg">
                    <path d="M-238.4,398.1c-0.8,0-1.4,0.6-1.5,1.5l-2.3,28l2.3,27.1c0.1,0.8,0.7,1.5,1.5,1.5c0.8,0,1.4-0.6,1.5-1.5l2.6-27.1l-2.6-28 C-237,398.7-237.7,398.1-238.4,398.1z"/>
                    <path d="M-228.2,399.9c-0.9,0-1.7,0.7-1.7,1.7l-2.1,26l2.1,27.3c0.1,1,0.8,1.7,1.7,1.7c0.9,0,1.6-0.7,1.7-1.7l2.4-27.3l-2.4-26 C-226.6,400.6-227.3,399.9-228.2,399.9z"/>
                    <path d="M-258.6,403.5c-0.5,0-1,0.4-1.1,1l-2.5,23l2.5,22.5c0.1,0.6,0.5,1,1.1,1c0.5,0,1-0.4,1.1-1l2.9-22.5l-2.9-23 C-257.7,404-258.1,403.5-258.6,403.5z"/>
                    <path d="M-268.1,412.3c-0.5,0-1,0.4-1,1l-1.9,14.3l1.9,14c0.1,0.6,0.5,1,1,1s0.9-0.4,1-1l2.2-14l-2.2-14.2 C-267.2,412.8-267.6,412.3-268.1,412.3z"/>
                    <path d="M-207.5,373.5c-1.2,0-2.1,0.9-2.2,2.1l-1.9,52l1.9,27.2c0.1,1.2,1,2.1,2.2,2.1s2.1-0.9,2.2-2.1l2.1-27.2l-2.1-52 C-205.4,374.4-206.4,373.5-207.5,373.5z"/>
                    <path d="M-248.6,399c-0.7,0-1.2,0.5-1.3,1.3l-2.4,27.3l2.4,26.3c0.1,0.7,0.6,1.3,1.3,1.3c0.7,0,1.2-0.5,1.3-1.2l2.7-26.3l-2.7-27.3 C-247.4,399.6-247.9,399-248.6,399z"/>
                    <path d="M-217.9,383.4c-1,0-1.9,0.8-1.9,1.9l-2,42.3l2,27.3c0.1,1.1,0.9,1.9,1.9,1.9s1.9-0.8,1.9-1.9l2.3-27.3l-2.3-42.3 C-216,384.2-216.9,383.4-217.9,383.4z"/>
                    <path d="M-154.4,359.3c-1.8,0-3.2,1.4-3.2,3.2l-1.2,65l1.2,26.1c0,1.8,1.5,3.2,3.2,3.2c1.8,0,3.2-1.5,3.2-3.2l1.4-26.1l-1.4-65 C-151.1,360.8-152.6,359.3-154.4,359.3z"/>
                    <path d="M-197.1,368.9c-1.3,0-2.3,1-2.4,2.4l-1.8,56.3l1.8,26.9c0,1.3,1.1,2.3,2.4,2.3s2.3-1,2.4-2.4l2-26.9l-2-56.3 C-194.7,370-195.8,368.9-197.1,368.9z"/>
                    <path d="M-46.5,394c-4.3,0-8.4,0.9-12.2,2.4C-61.2,368-85,345.8-114,345.8c-7.1,0-14,1.4-20.1,3.8c-2.4,0.9-3,1.9-3,3.7v99.9 c0,1.9,1.5,3.5,3.4,3.7c0.1,0,86.7,0,87.3,0c17.4,0,31.5-14.1,31.5-31.5C-15,408.1-29.1,394-46.5,394z"/>
                    <path d="M-143.6,353.2c-1.9,0-3.4,1.6-3.5,3.5l-1.4,70.9l1.4,25.7c0,1.9,1.6,3.4,3.5,3.4c1.9,0,3.4-1.6,3.5-3.5l1.5-25.8l-1.5-70.9 C-140.2,354.8-141.7,353.2-143.6,353.2z"/>
                    <path d="M-186.5,366.8c-1.4,0-2.5,1.1-2.6,2.6l-1.6,58.2l1.6,26.7c0,1.4,1.2,2.6,2.6,2.6s2.5-1.1,2.6-2.6l1.8-26.7l-1.8-58.2 C-184,367.9-185.1,366.8-186.5,366.8z"/>
                    <path d="M-175.9,368.1c-1.5,0-2.8,1.2-2.8,2.8l-1.5,56.7l1.5,26.5c0,1.6,1.3,2.8,2.8,2.8s2.8-1.2,2.8-2.8l1.7-26.5l-1.7-56.7 C-173.1,369.3-174.3,368.1-175.9,368.1z"/>
                    <path d="M-165.2,369.9c-1.7,0-3,1.3-3,3l-1.4,54.7l1.4,26.3c0,1.7,1.4,3,3,3c1.7,0,3-1.3,3-3l1.5-26.3l-1.5-54.7 C-162.2,371.3-163.5,369.9-165.2,369.9z"/>
                  </svg>
                </a>
              )}
              
              {/* Show "No audio" if no tracks AND no external links */}
              {release.tracks.length === 0 && !release.youtubeLink && !release.soundcloudLink && (
                <div className="text-white text-xs bg-black/50 px-3 py-1 rounded-full">
                  No audio
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
