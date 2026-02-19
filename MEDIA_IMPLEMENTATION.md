# Media Processing Protocol — Implementation Summary

## What Was Built

### Phase A: Simplified Processor ✅

**Files Modified:**
- `scripts/media-processor.ts` — WebP-only, local fallback, content hashing, async queue support
- `src/lib/bunny.ts` — Added `isBunnyConfigured()` helper
- `src/components/ui/OptimizedImage.astro` — Removed AVIF, WebP-only
- `src/content.config.ts` — Simplified variant schema
- `package.json` — Added `media:process:pending` script

**Key Changes:**
- WebP only (dropped AVIF)
- Local dev mode when Bunny credentials missing
- Content-hashed filenames: `EP-Artwork-a3f7b2d1-1024.webp`
- 256k MP3 / 192k OGG for audio
- 100MB file size guardrail
- Pending queue for async processing

### Phase B: Admin Dashboard ✅

**New Files:**
- `src/pages/admin/index.astro` — Admin landing page
- `src/pages/admin/media.astro` — Full media manager with drag-drop, queue, status polling
- `src/pages/api/admin/media/upload.ts` — Upload endpoint (queues files)
- `src/pages/api/admin/media/process-pending.ts` — Processing endpoint (async compression)
- `src/lib/media-process.ts` — Shared processing library (CLI + API)

**Dashboard Features:**
- Drag-and-drop upload zone
- Status bar (pending/processing/error/processed counts)
- "Process N Pending Files" button
- Real-time progress for uploads
- Polling for processing status
- Copy-to-clipboard manifest IDs
- Image grid with thumbnails
- Audio list with waveforms
- Mobile responsive

### Phase C: Documentation ✅

**New Files:**
- `media/README.md` — Protocol documentation for the artist
- `.cursor/rules/media.md` — AI assistant rules
- `media/originals/.gitkeep` — Guidance for artist

**Directory Structure:**
```
media/
├── originals/
│   ├── images/
│   ├── audio/
│   └── .gitkeep (with instructions)
├── processed/ (dev output)
└── manifest.json
```

## How It Works

### For the Artist (Virginia Upload Scenario)

1. **Upload**: Drops 20-minute WAV into `/admin/media`
   - File uploads instantly (just saves to `media/originals/audio/`)
   - Shows in "Pending" queue with ⏳ status
   - Status bar shows "1 Pending"

2. **Process**: Clicks "Process 1 Pending File"
   - Button shows spinner: "Processing... This may take a while for long audio"
   - Server compresses WAV → MP3 (256k) + OGG (192k) + waveform JSON
   - Content-hashed filenames generated
   - Old versions deleted if replacing
   - Manifest updated atomically

3. **Result**: 
   - "✅ Processed" appears
   - Manifest ID shown (e.g., `ambient-soundscape`)
   - Copy button to get ID for content
   - Page refreshes to show in media grid

4. **Hot Session Workflow**:
   - YouTube post (2:00 PM)
   - Upload cover + audio to admin (2:01 PM)
   - Process (2:02-2:05 PM)
   - Deploy (2:06 PM)
   - Instagram link (2:07 PM)
   - **Cache-safe**: Hashed URLs mean zero stale cache issues

### For You (Development)

```bash
# Process pending queue
npm run media:process:pending

# Process everything (scan + pending)
npm run media:process

# Process single file
npm run media:process -- --file ./media/originals/audio/track.wav
```

### Environment Variables

```bash
# Production (with Bunny CDN)
BUNNY_API_KEY=xxx
BUNNY_STORAGE_ZONE=sheskin
BUNNY_CDN_URL=https://sheskin.b-cdn.net

# Development (without Bunny)
# Omit Bunny vars → files save to media/processed/
```

## Cache Invalidation Strategy

The content-hashed filenames guarantee perfect cache behavior:

1. **Original**: `ambient-soundscape.wav`
2. **First process**: `ambient-soundscape-a3f7b2d1.mp3`
3. **Replace file**: `ambient-soundscape-9e4c1d8b.mp3`

- Old URL (`...a3f7b2d1.mp3`) returns 404 immediately (deleted from storage)
- New URL (`...9e4c1d8b.mp3`) serves fresh content
- CDN cache headers can be 1 year (immutable URLs)
- Artist never sees hashes — they're in the processed layer only

## Timeout Safety

Vercel limits:
- Hobby: 10s
- Pro: 60s

20-minute audio processing might exceed this. The implementation handles it:

- File saves to `originals/` instantly (fast)
- Processing is async (separate button)
- If timeout occurs during processing, the error shows in UI
- Artist can retry failed files
- For guaranteed success on long tracks, run `npm run media:process:pending` locally or use a Pro plan

## What's Next

1. **Test locally**: Add a test image and audio file, verify processing works
2. **Deploy**: Push to Vercel, test `/admin/media` route
3. **Set env vars**: Add Bunny credentials for production
4. **Train the artist**: Walk through the workflow once

## Migration Notes

If existing manifest has old-format entries:
- Script will process them fine (hash mismatch triggers re-process)
- Old AVIF variants remain in manifest but won't be generated for new uploads
- Recommend re-processing all media once to get consistent WebP-only output
