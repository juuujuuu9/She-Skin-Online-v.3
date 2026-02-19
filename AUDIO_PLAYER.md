# Audio Player Architecture

## Overview
Persistent audio player like march2004.com — hidden until first play, then fixed at bottom across navigation.

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/audioStore.ts` | Nanostores-based state management (tracks, queue, playback) |
| `src/lib/audioUtils.ts` | Audio engine hook, time formatting, sample tracks |
| `src/components/AudioPlayer.tsx` | Persistent bottom player UI (hidden until initiated) |
| `src/components/AudioControls.tsx` | Play buttons, queue controls, track rows |

## Integration

### Layout (`src/layouts/Layout.astro`)
```astro
<AudioPlayer client:load />
```
- Player renders at bottom of body
- `pb-16` padding on page content prevents overlap
- Only visible after first play (reactive to store state)

### Usage on Pages

**Play a track with queue:**
```tsx
import { PlayButton, TrackRow } from '@components/AudioControls';
import { SAMPLE_TRACKS } from '@lib/audioUtils';

<PlayButton 
  client:load
  track={track} 
  queue={allTracks}
  variant="primary"
  size="md"
>
  Play Album
</PlayButton>
```

**Track list row:**
```tsx
<TrackRow 
  client:load
  track={track}
  queue={allTracks}
  index={0}
/>
```

## Features

- **Hidden by default** — No UI until user clicks play
- **Persistent** — Survives Astro navigation (client:load island)
- **Queue management** — Add/remove tracks, next/prev
- **Progress scrubbing** — Click or drag to seek
- **Volume/mute** — Individual track control
- **Expandable queue** — Click up arrow to view queue
- **Mobile responsive** — Simplified controls on small screens

## State Structure

```typescript
interface AudioState {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  queue: Track[];
  currentIndex: number;
  isExpanded: boolean;
}
```

## Next Steps

1. Replace `SAMPLE_TRACKS` with CMS data
2. Connect to real audio files (CDN or self-hosted)
3. Add waveform visualization if desired
4. Persist queue to localStorage for cross-session continuity

## Reference

Similar to: march2004.com bottom player bar
