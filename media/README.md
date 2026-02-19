# Media Protocol — Sole-Artist Edition

Radically simple media processing for a single artist managing their own site.

## Philosophy

- **Upload first, process later** — Files queue immediately, compress asynchronously
- **WebP only** — No AVIF decision fatigue
- **Content-hashed URLs** — Replace files freely, cache busts automatically
- **Zero storage bloat** — Old versions deleted on replace

## File Structure

```
media/
├── originals/           # Raw uploads (you touch these)
│   ├── images/          # JPG, PNG, TIFF, WebP
│   └── audio/           # WAV, AIFF, FLAC, M4A
├── processed/           # Generated files (dev mode only)
└── manifest.json        # Registry of all processed media
```

## Workflow

### 1. Upload

**Via Admin Dashboard** (recommended):
1. Go to `/admin/media`
2. Drop files into upload zone
3. Files appear in "Pending" queue

**Via CLI** (when coding locally):
```bash
# Copy files to originals folder
cp ~/Downloads/cover-art.jpg media/originals/images/
```

### 2. Process

**Via Admin Dashboard**:
1. Click "Process N Pending Files"
2. Wait for compression (5-60 seconds depending on file size)
3. Copy manifest ID for use in content

**Via CLI**:
```bash
# Process pending queue only
npm run media:process -- --pending

# Process all new/changed files (scans + pending)
npm run media:process

# Process single file
npm run media:process -- --file ./media/originals/audio/ambient-piece.wav
```

### 3. Reference in Content

Use the **manifest ID** (filename without extension):

```yaml
# In works/my-piece.md
---
title: "Ambient Soundscape"
coverImage: "cover-art"  # NOT the full filename
date: 2026-02-19
media:
  - type: audio
    src: "ambient-piece"  # Manifest ID
---
```

## Specifications

### Images

| Size | Width | Use Case |
|------|-------|----------|
| sm | 640px | Thumbnails, mobile |
| md | 1024px | Standard display |
| lg | 1920px | Full-width, retina |
| xl | 2560px | Hero images |

- **Format**: WebP only
- **Quality**: 80%
- **Metadata**: blurhash, dominant color
- **Output filename**: `{id}-{hash}-{size}.webp`

### Audio

- **MP3**: 256k CBR (streaming)
- **OGG**: 192k Vorbis (fallback)
- **Waveform**: 100-point JSON for visualization
- **Output filename**: `{id}-{hash}.{mp3|ogg}`

### File Size Limit

**100MB maximum** per file.

If exceeded, you'll see:
> "File too large. Consider compressing to FLAC or reducing sample rate."

## Replacement Workflow

Uploading a file with the same name **replaces** the old version:

1. New file gets new content hash
2. New variants uploaded with hashed URLs
3. Old variants deleted from storage
4. Manifest updated atomically

**Cache behavior**: Old URLs (with old hashes) stop working immediately. New URLs work instantly. No stale cache.

## Environment Variables

```bash
# Optional — for CDN uploads (production)
BUNNY_API_KEY=your-api-key
BUNNY_STORAGE_ZONE=your-zone
BUNNY_CDN_URL=https://your-zone.b-cdn.net

# Optional — for local dev
MEDIA_SOURCE_DIR=./media/originals
MEDIA_OUTPUT_DIR=./media/processed
MEDIA_MANIFEST=./media/manifest.json
```

Without Bunny credentials, files save to `media/processed/` and serve from relative URLs.

## Troubleshooting

**"Processing timeout" on long audio**
- Expected for 20+ minute tracks
- Processing continues in background
- Check status bar, refresh page

**"File too large"**
- Compress source to FLAC (lossless, smaller)
- Or reduce sample rate (44.1kHz is standard)

**Wrong image showing**
- Check manifest ID matches exactly (case-sensitive)
- Verify file processed successfully (check queue)

## For AI Assistants

When adding media to this project:

1. **Always** place files in `media/originals/{images|audio}/`
2. **Never** commit processed files to git
3. After adding files, run `npm run media:process` (CLI) or guide user to `/admin/media` (dashboard)
4. Reference media by manifest ID (basename without extension) in content
5. Use `<OptimizedImage>` component with manifest data
