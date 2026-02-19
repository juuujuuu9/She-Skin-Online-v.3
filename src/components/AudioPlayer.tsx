import { useAudioEngine, formatTime, formatDuration } from '@lib/audioUtils';
import { useAudio } from '@lib/audioStore';
import { useState, useRef, useEffect } from 'react';

// ============================================================================
// PERSISTENT AUDIO PLAYER
// ============================================================================

export function AudioPlayer() {
  const { 
    audio, 
    playerVisible, 
    hasNext, 
    hasPrev,
    togglePlay, 
    nextTrack, 
    prevTrack,
    setVolume,
    toggleMute,
    toggleExpanded,
  } = useAudio();
  
  const { seek } = useAudioEngine();
  const [isDragging, setIsDragging] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  // Don't render anything if player not visible
  if (!playerVisible) return null;

  const progressPercent = audio.duration 
    ? (audio.progress / audio.duration) * 100 
    : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !audio.duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * audio.duration;
    seek(newTime);
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleProgressClick(e);
  };

  return (
    <>
      {/* Main Player Bar */}
      <footer 
        className="fixed bottom-0 left-0 right-0 z-50 bg-white text-black border-t border-black transition-transform duration-300"
        style={{ transform: audio.isExpanded ? 'translateY(-200px)' : 'translateY(0)' }}
      >
        <div className="flex items-center h-16 px-4 sm:px-6">
          {/* Track Info */}
          <div className="flex items-center gap-4 min-w-0 flex-1 sm:flex-none sm:w-64">
            {audio.currentTrack?.coverArt && (
              <img 
                src={audio.currentTrack.coverArt} 
                alt=""
                className="w-10 h-10 bg-gray-200 object-cover hidden sm:block"
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">
                {audio.currentTrack?.title || 'Unknown Track'}
              </p>
              <p className="text-[10px] text-gray-600 truncate">
                {audio.currentTrack?.artist || 'Unknown Artist'}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 flex-1">
            <button 
              onClick={prevTrack}
              disabled={!hasPrev}
              className="p-2 text-gray-600 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
              </svg>
            </button>

            <button 
              onClick={togglePlay}
              className="p-2 text-black hover:text-gray-700 transition-colors"
              aria-label={audio.isPlaying ? 'Pause' : 'Play'}
            >
              {audio.isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>

            <button 
              onClick={nextTrack}
              disabled={!hasNext}
              className="p-2 text-gray-600 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
              </svg>
            </button>
          </div>

          {/* Progress + Volume (Desktop) */}
          <div className="hidden sm:flex items-center gap-4 flex-1">
            <span className="text-[10px] text-gray-600 w-10 text-right">
              {formatTime(audio.progress)}
            </span>
            
            <div 
              ref={progressRef}
              className="flex-1 h-1 bg-gray-300 cursor-pointer relative group"
              onClick={handleProgressClick}
              onMouseDown={handleProgressMouseDown}
            >
              <div 
                className="absolute h-full bg-black group-hover:bg-gray-700"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            
            <span className="text-[10px] text-gray-600 w-10">
              {formatDuration(audio.duration)}
            </span>

            {/* Volume */}
            <button 
              onClick={toggleMute}
              className="p-2 text-gray-600 hover:text-black transition-colors"
              aria-label={audio.isMuted ? 'Unmute' : 'Mute'}
            >
              {audio.isMuted || audio.volume === 0 ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              )}
            </button>
          </div>

          {/* Expand / Queue Toggle */}
          <button 
            onClick={toggleExpanded}
            className="p-2 text-gray-600 hover:text-black transition-colors ml-2"
            aria-label={audio.isExpanded ? 'Collapse' : 'Expand'}
          >
            <svg 
              className={`w-4 h-4 transition-transform ${audio.isExpanded ? 'rotate-180' : ''}`} 
              fill="currentColor" 
              viewBox="0 0 24 24"
            >
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
            </svg>
          </button>
        </div>

        {/* Mobile Progress Bar */}
        <div className="sm:hidden h-0.5 bg-gray-300">
          <div 
            className="h-full bg-black"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </footer>

      {/* Expanded Queue Panel */}
      {audio.isExpanded && (
        <div className="fixed bottom-16 left-0 right-0 h-48 bg-gray-100 border-t border-black z-40 overflow-auto">
          <div className="p-4">
            <h3 className="text-xs font-medium text-gray-600 uppercase mb-3">Queue</h3>
            {audio.queue.length === 0 ? (
              <p className="text-sm text-gray-500">No tracks in queue</p>
            ) : (
              <ul className="space-y-2">
                {audio.queue.map((track, index) => (
                  <li 
                    key={`${track.id}-${index}`}
                    className={`flex items-center gap-3 p-2 text-sm ${
                      index === audio.currentIndex 
                        ? 'bg-gray-200 text-black' 
                        : 'text-gray-600 hover:bg-gray-200/50'
                    }`}
                  >
                    <span className="text-xs text-gray-500 w-6">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`truncate ${index === audio.currentIndex ? 'font-medium' : ''}`}>
                        {track.title}
                      </p>
                      <p className="text-xs text-gray-500">{track.artist}</p>
                    </div>
                    {index === audio.currentIndex && audio.isPlaying && (
                      <span className="text-xs text-green-700">Playing</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
