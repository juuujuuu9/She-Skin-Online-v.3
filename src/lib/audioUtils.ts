import { useEffect, useRef, useCallback } from 'react';
import { $audio, playTrack, nextTrack, setProgress, setDuration } from '@lib/audioStore';
import type { Track } from '../lib/audioStore';

// ============================================================================
// AUDIO ENGINE HOOK
// ============================================================================

export function useAudioEngine() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
      // Could dispatch error action here
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
    };
  }, []);

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = $audio.subscribe((state) => {
      const audio = audioRef.current;
      if (!audio) return;

      // Handle track changes
      if (state.currentTrack && audio.src !== state.currentTrack.src) {
        audio.src = state.currentTrack.src;
        audio.load();
      }

      // Handle play/pause
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

      // Handle volume
      const effectiveVolume = state.isMuted ? 0 : state.volume;
      if (audio.volume !== effectiveVolume) {
        audio.volume = effectiveVolume;
      }

      // Handle seeking (when progress changes significantly)
      if (Math.abs(audio.currentTime - state.progress) > 1) {
        audio.currentTime = state.progress;
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
