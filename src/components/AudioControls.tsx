import { playTrack, togglePlay, useAudio, addToQueue, type Track } from '@lib/audioStore';

// ============================================================================
// PLAY BUTTON COMPONENT
// ============================================================================

interface PlayButtonProps {
  track: Track;
  queue?: Track[];
  variant?: 'primary' | 'minimal' | 'overlay';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

export function PlayButton({ 
  track, 
  queue = [], 
  variant = 'primary',
  size = 'md',
  className = '',
  children,
}: PlayButtonProps) {
  const { audio } = useAudio();
  const isCurrentTrack = audio.currentTrack?.id === track.id;
  const isPlaying = isCurrentTrack && audio.isPlaying;

  const handleClick = () => {
    console.log('[PlayButton] Clicked:', track.title, 'isCurrent:', isCurrentTrack);
    // If clicking the currently playing track, toggle play/pause
    if (isCurrentTrack) {
      console.log('[PlayButton] Toggling play/pause');
      togglePlay();
    } else {
      // Start playing this track with the provided queue
      // If no queue provided, just play this single track
      const trackQueue = queue.length > 0 ? queue : [track];
      console.log('[PlayButton] Playing track:', track.id, 'src:', track.src?.slice(0, 50), 'queue length:', trackQueue.length);
      playTrack(track, trackQueue);
    }
  };

  const baseClasses = 'inline-flex items-center justify-center transition-all duration-200';
  
  const variantClasses = {
    primary: 'bg-black text-white hover:bg-gray-800 border border-black',
    minimal: 'bg-transparent text-black hover:bg-black/5 border border-transparent',
    overlay: 'bg-black/70 text-white hover:bg-black/90 backdrop-blur-sm',
  };

  const sizeClasses = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-12 px-6 text-sm gap-2.5',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <button
      onClick={handleClick}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      aria-label={isPlaying ? 'Pause' : 'Play'}
    >
      {isPlaying ? (
        <svg className={iconSizes[size]} fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
      ) : (
        <svg className={iconSizes[size]} fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
      )}
      {children && <span>{children}</span>}
    </button>
  );
}

// ============================================================================
// ADD TO QUEUE BUTTON
// ============================================================================

interface AddToQueueButtonProps {
  track: Track;
  className?: string;
}

export function AddToQueueButton({ track, className = '' }: AddToQueueButtonProps) {
  const handleClick = () => {
    addToQueue(track);
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center justify-center h-10 w-10 border border-black text-black hover:bg-black hover:text-white transition-colors ${className}`}
      aria-label="Add to queue"
      title="Add to queue"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
      </svg>
    </button>
  );
}

// ============================================================================
// TRACK ROW COMPONENT (for lists)
// ============================================================================

interface TrackRowProps {
  track: Track;
  queue?: Track[];
  index?: number;
  showAddToQueue?: boolean;
}

export function TrackRow({ 
  track, 
  queue = [], 
  index,
  showAddToQueue = true,
}: TrackRowProps) {
  const { audio } = useAudio();
  const isCurrentTrack = audio.currentTrack?.id === track.id;
  const isPlaying = isCurrentTrack && audio.isPlaying;

  return (
    <div className={`flex items-center gap-4 py-3 border-b border-gray-100 ${isCurrentTrack ? 'bg-gray-50' : ''}`}>
      {index !== undefined && (
        <span className="text-xs text-gray-400 w-6 text-center">
          {isPlaying ? (
            <span className="inline-flex gap-0.5">
              <span className="w-0.5 h-3 bg-black animate-pulse"/>
              <span className="w-0.5 h-3 bg-black animate-pulse delay-75"/>
              <span className="w-0.5 h-3 bg-black animate-pulse delay-150"/>
            </span>
          ) : (
            index + 1
          )}
        </span>
      )}

      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${isCurrentTrack ? 'font-medium' : ''}`}>
          {track.title}
        </p>
        <p className="text-xs text-gray-500">{track.artist}</p>
      </div>

      <div className="flex items-center gap-2">
        <PlayButton 
          track={track} 
          queue={queue} 
          variant="minimal" 
          size="sm"
        />
        {showAddToQueue && <AddToQueueButton track={track} />}
      </div>
    </div>
  );
}
