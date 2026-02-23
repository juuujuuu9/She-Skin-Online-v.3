import { map, computed } from 'nanostores';
import { useStore } from '@nanostores/react';

// ============================================================================
// TYPES
// ============================================================================

export interface Track {
  id: string;
  title: string;
  artist: string;
  src: string; // Audio file URL
  duration?: number; // Duration in seconds
  coverArt?: string; // Optional cover image
  album?: string;
  year?: number;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
}

export interface Release {
  id: string;
  title: string;
  year: number;
  coverArt: string | null;
  tracks: Track[];
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
}

export interface AudioState {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number; // Current time in seconds
  duration: number; // Total duration in seconds
  volume: number; // 0-1
  isMuted: boolean;
  queue: Track[];
  currentIndex: number;
  isExpanded: boolean; // For expanded player view
}

// ============================================================================
// ATOMS
// ============================================================================

// Core audio state
export const $audio = map<AudioState>({
  currentTrack: null,
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  queue: [],
  currentIndex: -1,
  isExpanded: false,
});

// Derived: Is player visible? (true once any track has played)
export const $playerVisible = computed($audio, (state) => state.currentTrack !== null);

// Derived: Has next track?
export const $hasNext = computed($audio, (state) => 
  state.currentIndex < state.queue.length - 1
);

// Derived: Has previous track?
export const $hasPrev = computed($audio, (state) => 
  state.currentIndex > 0
);

// ============================================================================
// ACTIONS
// ============================================================================

export function playTrack(track: Track, queue: Track[] = []) {
  console.log('[audioStore] playTrack called:', track.title, track.id);
  const trackIndex = queue.findIndex(t => t.id === track.id);
  const newState = {
    ...$audio.get(),
    currentTrack: track,
    queue: queue.length > 0 ? queue : [track],
    currentIndex: trackIndex >= 0 ? trackIndex : 0,
    isPlaying: true,
    progress: 0,
  };
  console.log('[audioStore] Setting state:', { currentTrack: newState.currentTrack?.title, isPlaying: newState.isPlaying });
  $audio.set(newState);
}

export function togglePlay() {
  const state = $audio.get();
  $audio.set({ ...state, isPlaying: !state.isPlaying });
}

export function pause() {
  $audio.set({ ...$audio.get(), isPlaying: false });
}

export function resume() {
  $audio.set({ ...$audio.get(), isPlaying: true });
}

export function stop() {
  $audio.set({
    ...$audio.get(),
    isPlaying: false,
    progress: 0,
  });
}

export function nextTrack() {
  const state = $audio.get();
  if (state.currentIndex < state.queue.length - 1) {
    const newIndex = state.currentIndex + 1;
    $audio.set({
      ...state,
      currentTrack: state.queue[newIndex],
      currentIndex: newIndex,
      isPlaying: true,
      progress: 0,
    });
  }
}

export function prevTrack() {
  const state = $audio.get();
  if (state.currentIndex > 0) {
    const newIndex = state.currentIndex - 1;
    $audio.set({
      ...state,
      currentTrack: state.queue[newIndex],
      currentIndex: newIndex,
      isPlaying: true,
      progress: 0,
    });
  }
}

export function setProgress(time: number) {
  $audio.set({ ...$audio.get(), progress: time });
}

export function setDuration(duration: number) {
  $audio.set({ ...$audio.get(), duration });
}

export function setVolume(volume: number) {
  $audio.set({ ...$audio.get(), volume: Math.max(0, Math.min(1, volume)) });
}

export function toggleMute() {
  const state = $audio.get();
  $audio.set({ ...state, isMuted: !state.isMuted });
}

export function toggleExpanded() {
  const state = $audio.get();
  $audio.set({ ...state, isExpanded: !state.isExpanded });
}

export function addToQueue(track: Track) {
  const state = $audio.get();
  const newQueue = [...state.queue, track];

  // If queue was empty, show player with this track (paused) so user can see their queue
  if (state.queue.length === 0) {
    $audio.set({
      ...state,
      currentTrack: track,
      queue: newQueue,
      currentIndex: 0,
      isPlaying: false,
      progress: 0,
      duration: 0,
    });
    return;
  }

  $audio.set({
    ...state,
    queue: newQueue,
  });
}

export function clearQueue() {
  const state = $audio.get();
  $audio.set({
    ...state,
    queue: state.currentTrack ? [state.currentTrack] : [],
    currentIndex: 0,
  });
}

export function removeFromQueue(index: number) {
  const state = $audio.get();
  const newQueue = state.queue.filter((_, i) => i !== index);
  
  // Adjust current index if we removed a track before or at current
  let newIndex = state.currentIndex;
  if (index < state.currentIndex) {
    newIndex = state.currentIndex - 1;
  } else if (index === state.currentIndex) {
    // Removed currently playing track
    newIndex = Math.min(state.currentIndex, newQueue.length - 1);
    const newTrack = newQueue[newIndex] || null;
    $audio.set({
      ...state,
      queue: newQueue,
      currentIndex: newIndex,
      currentTrack: newTrack,
      isPlaying: newTrack ? state.isPlaying : false,
    });
    return;
  }
  
  $audio.set({
    ...state,
    queue: newQueue,
    currentIndex: newIndex,
  });
}

// ============================================================================
// REACT HOOK
// ============================================================================

export function useAudio() {
  return {
    audio: useStore($audio),
    playerVisible: useStore($playerVisible),
    hasNext: useStore($hasNext),
    hasPrev: useStore($hasPrev),
    playTrack,
    togglePlay,
    pause,
    resume,
    stop,
    nextTrack,
    prevTrack,
    setProgress,
    setDuration,
    setVolume,
    toggleMute,
    toggleExpanded,
    addToQueue,
    clearQueue,
    removeFromQueue,
  };
}
