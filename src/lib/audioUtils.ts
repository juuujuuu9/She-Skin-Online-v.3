import { useEffect, useRef, useCallback } from 'react';
import { $audio, playTrack, nextTrack, prevTrack, setProgress, setDuration, pause, resume } from '@lib/audioStore';
import type { Track } from '../lib/audioStore';

// ============================================================================
// AUDIO ENGINE HOOK
// ============================================================================

export function useAudioEngine() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedSrcRef = useRef<string | null>(null);
  const wasPlayingBeforeHiddenRef = useRef(false);

  // Sync audio element with store state
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    // Event listeners
    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
    };

    const handleDurationChange = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      nextTrack();
    };

    const handleError = (e: ErrorEvent) => {
      console.error('Audio error:', e);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError as EventListener);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError as EventListener);
      audio.pause();
      audioRef.current = null;
      loadedSrcRef.current = null;
    };
  }, []);

  // Media Session API - Lock screen / control center integration
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const unsubscribe = $audio.subscribe((state) => {
      const track = state.currentTrack;
      if (!track) {
        navigator.mediaSession.metadata = null;
        return;
      }

      // Set metadata for lock screen
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || 'ICT★SNU SOUND',
        artwork: track.coverArt ? [
          { src: track.coverArt, sizes: '512x512', type: 'image/jpeg' },
          { src: track.coverArt, sizes: '256x256', type: 'image/jpeg' },
          { src: track.coverArt, sizes: '128x128', type: 'image/jpeg' },
        ] : [],
      });

      // Playback state
      navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
    });

    // Set up action handlers
    navigator.mediaSession.setActionHandler('play', () => resume());
    navigator.mediaSession.setActionHandler('pause', () => pause());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const audio = audioRef.current;
      if (audio) {
        const skipTime = details.seekOffset || 10;
        audio.currentTime = Math.max(0, audio.currentTime - skipTime);
      }
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const audio = audioRef.current;
      if (audio) {
        const skipTime = details.seekOffset || 10;
        audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + skipTime);
      }
    });

    return () => {
      unsubscribe();
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    };
  }, []);

  // Handle page visibility - pause when user switches apps/tabs
  useEffect(() => {
    const handleVisibilityChange = () => {
      const state = $audio.get();
      
      if (document.hidden) {
        // Page is hidden - remember if we were playing
        wasPlayingBeforeHiddenRef.current = state.isPlaying;
        // Note: We don't auto-pause on hide - user may want audio to continue
        // But iOS Safari will typically pause background audio anyway
      } else {
        // Page is visible again
        // Optional: could resume if wasPlayingBeforeHiddenRef.current
        // But most users prefer manual control
      }
    };

    // Handle audio interruptions (phone calls, Siri, other apps)
    const handleAudioInterruption = () => {
      const audio = audioRef.current;
      if (!audio) return;

      // iOS/safari fires this when audio session is interrupted
      if (audio.paused && $audio.get().isPlaying) {
        // Audio was paused externally but we think we're playing
        pause();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Listen for audio interruptions (iOS specific)
    const audio = audioRef.current;
    if (audio) {
      audio.addEventListener('pause', handleAudioInterruption);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (audio) {
        audio.removeEventListener('pause', handleAudioInterruption);
      }
    };
  }, []);

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = $audio.subscribe((state) => {
      const audio = audioRef.current;
      if (!audio) return;

      const trackSrc = state.currentTrack?.src ?? null;

      // Handle track changes - only load when src actually changes
      if (trackSrc && loadedSrcRef.current !== trackSrc) {
        loadedSrcRef.current = trackSrc;
        audio.src = trackSrc;
        audio.load();

        // Call play() synchronously so it's part of the user gesture (required on iOS/mobile)
        if (state.isPlaying) {
          const p = audio.play();
          if (p && typeof p.catch === 'function') {
            p.catch((err: Error) => {
              if (err?.name === 'NotAllowedError') {
                console.warn('Play blocked (user gesture required). Tap play again.');
                return;
              }
              const onCanPlay = () => {
                audio.removeEventListener('canplay', onCanPlay);
                if ($audio.get().isPlaying) audio.play().catch(() => {});
              };
              audio.addEventListener('canplay', onCanPlay);
            });
          }
        }

        return;
      }

      // Handle play/pause (when same track, no load needed)
      if (trackSrc && loadedSrcRef.current === trackSrc) {
        if (state.isPlaying) {
          if (audio.paused) {
            audio.play().catch((err) => {
              console.error('Play failed:', err);
            });
          }
        } else {
          if (!audio.paused) {
            audio.pause();
          }
        }
      } else if (!trackSrc) {
        loadedSrcRef.current = null;
        audio.pause();
      }

      // Handle volume
      const effectiveVolume = state.isMuted ? 0 : state.volume;
      if (audio.volume !== effectiveVolume) {
        audio.volume = effectiveVolume;
      }

      // Handle seeking (when progress changes significantly)
      if (trackSrc && Math.abs(audio.currentTime - state.progress) > 1) {
        audio.currentTime = state.progress;
      }

      // Update media session position state for scrubbing
      if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
        try {
          navigator.mediaSession.setPositionState({
            duration: state.duration || 0,
            playbackRate: 1.0,
            position: state.progress || 0,
          });
        } catch {
          // Ignore errors from invalid states
        }
      }
    });

    return unsubscribe;
  }, []);

  // Seek function
  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  }, []);

  return { audioRef, seek };
}

// ============================================================================
// FORMAT UTILS
// ============================================================================

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// SAMPLE TRACKS (for testing)
// ============================================================================

export const SAMPLE_TRACKS: Track[] = [
  {
    id: '1',
    title: 'Midnight Rain',
    artist: 'SheSkin',
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    album: 'ICT★SNU SOUND Vol. 1',
    year: 2024,
  },
  {
    id: '2',
    title: 'Static Dreams',
    artist: 'SheSkin',
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    album: 'ICT★SNU SOUND Vol. 1',
    year: 2024,
  },
  {
    id: '3',
    title: 'Neon Ghost',
    artist: 'SheSkin',
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    album: 'ICT★SNU SOUND Vol. 1',
    year: 2024,
  },
];
