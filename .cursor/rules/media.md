# Media Handling Rules

## File Placement

**ALWAYS** put new media files in:
- `media/originals/images/` — for JPG, PNG, TIFF, WebP
- `media/originals/audio/` — for WAV, AIFF, FLAC, M4A

**NEVER** put raw media in `public/` or `src/`.

## Processing Workflow

After adding media files:

1. **For CLI workflows**: Run `npm run media:process`
2. **For dashboard users**: Direct them to `/admin/media` and click "Process Pending"
3. Wait for processing to complete before referencing in content

## Content References

**ALWAYS** use manifest ID (basename without extension):

```yaml
# ✅ CORRECT
coverImage: "EP-Artwork"
audioTrack: "ambient-soundscape"

# ❌ WRONG
coverImage: "EP-Artwork.jpg"
audioTrack: "/media/audio/ambient.wav"
```

## Component Usage

Use `OptimizedImage` for all images:

```astro
---
import OptimizedImage from '../components/ui/OptimizedImage.astro';
import { getManifestEntry } from '../lib/media-process';

const image = getManifestEntry(manifest, 'EP-Artwork');
---

<OptimizedImage 
  src={image.variants.md.url}
  alt="EP Cover"
  variants={image.variants}
  blurhash={image.blurhash}
  dominantColor={image.dominantColor}
/>
```

## Specifications

| Media | Spec |
|-------|------|
| Images | WebP only, 80% quality, sizes: 640/1024/1920/2560 |
| Audio | MP3 256k + OGG 192k + waveform JSON |
| Max Size | 100MB per file |
| Hashing | Content-hash in URL for cache busting |

## Common Mistakes

- **Don't** use UUIDs or timestamps in filenames — use readable names
- **Don't** reference files by path — always use manifest ID
- **Don't** commit processed files — they're generated
- **Don't** worry about cache — hashed URLs invalidate automatically

## Async Processing

Long audio (20+ min) processes asynchronously:
- File uploads instantly
- Shows in "Pending" queue
- Click "Process" to start compression
- May take 30-60 seconds for long tracks
- Page polls for completion
