# Audio Player Best Practices — she_skin Reference

A comprehensive guide to building well-behaved, system-integrated audio players on the web. Based on implementation work for she_skin (nucleus-commerce).

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Media Session API](#media-session-api)
3. [Mobile Behavior & "Manners"](#mobile-behavior--manners)
4. [Audio Store Architecture](#audio-store-architecture)
5. [iOS Safari Quirks](#ios-safari-quirks)
6. [Implementation Checklist](#implementation-checklist)

---

## Core Principles

### 1. The User is in Control

**Never** fight the OS for audio focus. If the user switches apps, receives a call, or activates Siri—the audio should pause gracefully and stay paused until the user explicitly resumes.

### 2. System Integration is Mandatory

On mobile, users expect:
- Lock screen controls
- Control Center integration
- Proper metadata display
- Headphone button support

### 3. Touch ≠ Hover

Mobile devices don't have hover states. Any UI that requires hover to reveal controls is broken on touch devices.

---

## Media Session API

### Basic Setup

```typescript
if ('mediaSession' in navigator) {
  // Set metadata for lock screen
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.coverArt ? [
      { src: track.coverArt, sizes: '512x512', type: 'image/jpeg' },
      { src: track.coverArt, sizes: '256x256', type: 'image/jpeg' },
      { src: track.coverArt, sizes: '128x128', type: 'image/jpeg' },
    ] : [],
  });

  // Action handlers
  navigator.mediaSession.setActionHandler('play', () => resume());
  navigator.mediaSession.setActionHandler('pause', () => pause());
  navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
  navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
  navigator.mediaSession.setActionHandler('seekbackward', (details) => {
    const skipTime = details.seekOffset || 10;
    audio.currentTime = Math.max(0, audio.currentTime - skipTime);
  });
  navigator.mediaSession.setActionHandler('seekforward', (details) => {
    const skipTime = details.seekOffset || 10;
    audio.currentTime = Math.min(audio.duration, audio.currentTime + skipTime);
  });
}
```

### Position State for Scrubbing

Enable the progress bar in Control Center:

```typescript
if ('setPositionState' in navigator.mediaSession) {
  navigator.mediaSession.setPositionState({
    duration: state.duration || 0,
    playbackRate: 1.0,
    position: state.progress || 0,
  });
}
```

**Note:** Wrap in try-catch. Safari throws if duration is 0 or invalid.

---

## Mobile Behavior & "Manners"

### Detecting External Interruptions

Listen for when the OS pauses your audio (phone calls, Siri, other apps):

```typescript
const handleAudioInterruption = () => {
  if (audio.paused && store.get().isPlaying) {
    // Audio was paused externally
    pause(); // Update your state to match reality
  }
};

audio.addEventListener('pause', handleAudioInterruption);
```

### Visibility Change (Optional)

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Page hidden — remember state but don't auto-pause
    // (iOS will typically pause audio anyway)
  } else {
    // Page visible again
    // Optional: could resume if was playing before hide
    // But manual control is usually preferred
  }
});
```

### User Gesture Requirements

Mobile browsers require user interaction to start audio:

```typescript
// ❌ This fails on mobile
setTimeout(() => audio.play(), 1000);

// ✅ This works (inside click handler)
button.addEventListener('click', () => audio.play());

// ✅ For programmatic play after user gesture
function playFromUserGesture() {
  const p = audio.play();
  if (p && p.catch) {
    p.catch((err) => {
      if (err.name === 'NotAllowedError') {
        // User gesture required — show play button
        showPlayButton();
      }
    });
  }
}
```

---

## Audio Store Architecture

### Recommended State Shape

```typescript
interface AudioState {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number;      // Current time in seconds
  duration: number;      // Total duration
  volume: number;        // 0-1
  isMuted: boolean;
  queue: Track[];
  currentIndex: number;
  isExpanded: boolean;   // For expanded player view
}
```

### Why Nanostores?

Nanostores provides reactive state without framework lock-in:

```typescript
import { map, computed } from 'nanostores';

export const $audio = map<AudioState>({ /* ... */ });

// Derived state
export const $hasNext = computed($audio, (state) => 
  state.currentIndex < state.queue.length - 1
);

// Actions
export function playTrack(track: Track, queue: Track[] = []) {
  const trackIndex = queue.findIndex(t => t.id === track.id);
  $audio.set({
    ...$audio.get(),
    currentTrack: track,
    queue: queue.length > 0 ? queue : [track],
    currentIndex: trackIndex >= 0 ? trackIndex : 0,
    isPlaying: true,
    progress: 0,
  });
}
```

### Hook Pattern

```typescript
export function useAudio() {
  return {
    audio: useStore($audio),
    hasNext: useStore($hasNext),
    hasPrev: useStore($hasPrev),
    playTrack,
    togglePlay,
    pause,
    resume,
    // ... etc
  };
}
```

---

## iOS Safari Quirks

### Background Audio Behavior

iOS Safari **will pause audio when you switch apps**. This is OS-level behavior—you cannot override it. Your app should:

1. Accept the pause gracefully
2. Update UI state to match (show paused state)
3. Allow user to resume when they return

### Audio Element Requirements

```typescript
const audio = new Audio();

// iOS requires these for background playback
audio.setAttribute('playsinline', '');  // Prevents fullscreen video
audio.setAttribute('preload', 'metadata');

// Volume is system-controlled on iOS
// Setting audio.volume has no effect
```

### User Gesture Chain

Once a user interacts with your page, you can play audio. But if they switch away and come back, you may need a new gesture.

### Lock Screen Artwork

Artwork URLs must be:
- Absolute URLs (not relative)
- HTTPS (not HTTP)
- Accessible without authentication
- Reasonable size (512x512 max recommended)

---

## Implementation Checklist

### Before Shipping

- [ ] **Media Session API** — Lock screen shows track info
- [ ] **Control Center** — Play/pause/next/prev work
- [ ] **Interruption Handling** — Phone calls pause audio
- [ ] **Touch Targets** — All controls work on mobile (no hover-only)
- [ ] **Background Behavior** — App pauses when switching, stays paused
- [ ] **User Gesture** — First play requires user interaction
- [ ] **Error Handling** — Graceful fallback if audio fails to load
- [ ] **Reduced Motion** — Respect `prefers-reduced-motion`

### CSS for Touch Devices

```css
/* Show controls on touch devices */
@media (hover: none) and (pointer: coarse) {
  .touch-device\:opacity-100 {
    opacity: 1;
  }
  
  .audio-grid-item {
    touch-action: manipulation;
  }
}
```

### Grid Animation (Zune-style)

Grid column transitions don't animate smoothly in browsers. Use item-level animations instead:

```css
.grid-item {
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.grid[data-changing="true"] .grid-item {
  animation: gridPulse 0.4s ease;
}

@keyframes gridPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  40% { transform: scale(0.92); opacity: 0.8; }
}
```

---

## Common Pitfalls

### ❌ Don't: Fight for Audio Focus

```typescript
// Bad: Trying to keep audio playing when user switches apps
window.addEventListener('blur', () => {
  audio.play(); // iOS will ignore this
});
```

### ✅ Do: Respect System Pause

```typescript
// Good: Update state when system pauses audio
audio.addEventListener('pause', () => {
  if (store.get().isPlaying) {
    pause(); // Update your state
  }
});
```

### ❌ Don't: Auto-play on Load

```typescript
// Bad: Auto-play violates mobile policies
useEffect(() => {
  audio.play(); // Blocked on mobile
}, []);
```

### ✅ Do: Require User Gesture

```typescript
// Good: Only play after user interaction
<button onClick={() => playTrack(track)}>Play</button>
```

---

## Grid Column Picker Pattern

A reusable pattern for adjustable grid density (used on audio, physical, and shop grids).

### Architecture

```typescript
// Grid component exports
export const DEFAULT_COLS_DESKTOP = 3;
export const DEFAULT_COLS_MOBILE = 2;
export const MOBILE_BREAKPOINT_PX = 640;
export const GRID_COLS_EVENT = 'my-grid-cols-changed';

// In Grid component
export function MyGrid({ items }) {
  const [cols, setCols] = useState(DEFAULT_COLS_DESKTOP);
  const [isMobile, setIsMobile] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  
  useEffect(() => {
    // Listen for column change events
    const handler = (e: CustomEvent<number>) => {
      setIsChanging(true);
      setCols(e.detail);
      setTimeout(() => setIsChanging(false), 400);
    };
    window.addEventListener(GRID_COLS_EVENT, handler as EventListener);
    return () => window.removeEventListener(GRID_COLS_EVENT, handler);
  }, []);
  
  // ...
}

// In Controls component
export function MyGridControls() {
  const updateCols = (next: number) => {
    const clamped = Math.max(minCols, Math.min(maxCols, next));
    setCols(clamped);
    window.dispatchEvent(new CustomEvent(GRID_COLS_EVENT, { detail: clamped }));
  };
  
  return (
    <button onClick={() => updateCols(cols - 1)}>+</button>
    <button onClick={() => updateCols(cols + 1)}>−</button>
  );
}
```

### Key Features

- **Sync across instances**: Multiple controls on same page stay in sync via custom events
- **Mobile constraints**: Different min/max columns for mobile vs desktop
- **Smooth animations**: Use `data-changing` attribute + CSS animations (grid columns don't transition)
- **Sticky positioning**: Controls use `sticky top-24` to stay visible while scrolling

### Mobile Touch Support

```css
.grid-item {
  touch-action: manipulation; /* Prevents double-tap zoom */
  pointer-events: auto;       /* Ensures clicks work */
}

/* Always show controls on touch */
@media (hover: none) {
  .grid-overlay {
    opacity: 1;
    background: rgba(0,0,0,0.4);
  }
}
```

## References

- [MDN: Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)
- [MDN: Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [iOS Audio Guidelines](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/AudioandVideoTagBasics/AudioandVideoTagBasics.html)
- [Nanostores](https://github.com/nanostores/nanostores)
- [CSS Grid Animations](https://css-tricks.com/animating-css-grid-how-to-examples/)

---

*Last updated: February 2026 — she_skin project*
