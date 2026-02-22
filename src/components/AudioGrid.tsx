import { useState, useEffect } from 'react';
import { PlayButton, AddToQueueButton } from '@components/AudioControls';
import type { Track } from '@lib/audioStore';

export const DEFAULT_COLS_DESKTOP = 3;
export const DEFAULT_COLS_MOBILE = 2;
export const MOBILE_BREAKPOINT_PX = 640; // sm
export const AUDIO_GRID_COLS_EVENT = 'audio-grid-cols-changed';

interface Release {
  id: string;
  title: string;
  year: number;
  coverArt: string | null;
  tracks: Track[];
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
}

interface AudioGridProps {
  releases: Release[];
}

function getDefaultCols(isMobile: boolean): number {
  return isMobile ? DEFAULT_COLS_MOBILE : DEFAULT_COLS_DESKTOP;
}

export function AudioGrid({ releases }: AudioGridProps) {
  const [cols, setCols] = useState(DEFAULT_COLS_DESKTOP);
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
                    }}
                    queue={release.tracks.map((t) => ({
                      ...t,
                      coverArt: release.coverArt ?? undefined,
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
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.052-.1-.1-.1m-.899.828c-.06 0-.091.037-.104.094L0 14.479l.165 1.308c.014.057.045.094.09.094s.089-.037.099-.094l.19-1.308-.206-1.352c-.01-.06-.052-.094-.09-.094m1.83-1.229c-.061 0-.12.045-.12.104l-.21 2.563.225 2.458c0 .06.045.104.106.104.061 0 .12-.045.12-.104l.24-2.474-.24-2.547c0-.06-.045-.104-.12-.104m.945-.089c-.075 0-.135.06-.15.135l-.193 2.64.21 2.544c.016.077.075.138.149.138.075 0 .135-.061.15-.138l.21-2.544-.21-2.635c-.015-.075-.06-.135-.15-.135m.93-.069c-.09 0-.149.075-.165.165l-.18 2.7.195 2.52c.016.09.075.165.165.165.089 0 .164-.076.164-.166l.21-2.52-.21-2.69c0-.09-.06-.165-.165-.165m.96-.061c-.104 0-.18.09-.18.18l-.18 2.774.18 2.49c.016.104.09.18.18.18.105 0 .18-.09.18-.18l.195-2.49-.195-2.76c0-.105-.075-.18-.18-.18m.99-.045c-.119 0-.209.105-.209.225l-.165 2.82.165 2.46c.016.12.09.225.21.225.119 0 .209-.105.209-.225l.18-2.46-.18-2.805c0-.12-.09-.225-.21-.225m1.02-.03c-.135 0-.225.12-.225.24l-.165 2.865.165 2.445c.016.135.105.24.24.24.119 0 .225-.12.225-.24l.18-2.445-.18-2.865c0-.135-.09-.24-.225-.24m1.02-.015c-.15 0-.24.135-.24.27l-.165 2.895.165 2.415c.015.15.12.27.255.27.135 0 .24-.135.24-.27l.18-2.415-.18-2.895c0-.15-.09-.27-.24-.27m1.02-.015c-.15 0-.255.15-.255.285l-.165 2.91.165 2.385c.016.165.12.285.27.285.149 0 .255-.15.255-.285l.165-2.385-.165-2.91c0-.165-.09-.285-.24-.285m1.005-.015c-.18 0-.285.165-.285.315l-.165 2.925.165 2.37c.016.165.12.3.285.3.165 0 .285-.165.285-.315l.165-2.37-.165-2.91c-.015-.18-.12-.315-.285-.315m1.035-.015c-.18 0-.3.18-.3.33l-.165 2.925.165 2.37c.016.18.135.315.3.315.18 0 .3-.165.3-.33l.165-2.37-.165-2.91c-.016-.18-.12-.315-.285-.315m1.02 0c-.195 0-.315.18-.315.345l-.165 2.925.165 2.355c.016.18.135.33.315.33.18 0 .315-.18.315-.345l.165-2.355-.165-2.91c-.016-.195-.12-.345-.3-.345m1.02.015c-.195 0-.33.195-.33.36l-.165 2.91.165 2.34c.016.195.15.345.33.345.195 0 .345-.18.345-.36l.165-2.34-.165-2.895c-.015-.195-.135-.36-.33-.36m1.02.03c-.21 0-.345.21-.345.39l-.165 2.895.165 2.325c.016.195.15.36.345.36.21 0 .36-.195.36-.39l.165-2.325-.165-2.865c-.016-.21-.135-.375-.345-.39m1.005.045c-.21 0-.36.21-.36.405l-.165 2.865.165 2.31c.016.21.165.375.36.375.21 0 .375-.195.375-.405l.165-2.31-.165-2.85c-.015-.21-.15-.39-.345-.405m1.005.06c-.225 0-.375.225-.39.42l-.165 2.85.165 2.295c.016.21.165.39.375.39.21 0 .375-.21.39-.42l.165-2.295-.165-2.82c-.015-.225-.15-.405-.36-.42m.99.075c-.225 0-.39.24-.405.45l-.165 2.82.165 2.28c.016.225.18.405.39.405.225 0 .39-.225.405-.45l.165-2.28-.165-2.79c-.015-.225-.165-.42-.375-.435m.99.105c-.24 0-.405.255-.42.465l-.15 2.775.165 2.25c.016.225.18.42.405.42.225 0 .405-.24.42-.465l.165-2.25-.18-2.76c-.015-.24-.165-.435-.39-.465m.99.135c-.24 0-.42.27-.435.495l-.15 2.76.165 2.235c.016.225.195.435.42.435.24 0 .42-.255.435-.48l.165-2.235-.18-2.73c-.015-.24-.165-.45-.405-.48m1.005.165c-.255 0-.45.285-.465.525l-.135 2.715.15 2.205c.016.24.195.45.435.45.24 0 .435-.27.45-.51l.165-2.205-.18-2.7c-.015-.255-.165-.465-.405-.48z"/>
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
