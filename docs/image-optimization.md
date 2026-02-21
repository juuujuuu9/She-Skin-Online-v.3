# Image Optimization Guide — she_skin

Complete guide to lightning-fast image delivery across all pages.

## Current Architecture

### Components
- **`LightningImage.astro`** — Astro pages (works, featured)
- **`LightningImg.tsx`** — React grids (WorksGrid)

### Features
- **Multiple formats**: AVIF (best), WebP (fallback), original (legacy)
- **Responsive srcset**: Automatic resolution switching
- **Blurhash placeholders**: Instant visual feedback
- **Priority loading**: First 6 images load immediately
- **CDN optimization**: Automatic compression parameters

## Image Sources

### 1. Content Collection (works/)
Stored in `src/content/works/` with processed variants:
```yaml
media:
  - type: image
    src: https://cdn.b-cdn.net/works/artwork.webp
    variants:
      sm: { url: ..., width: 640 }
      md: { url: ..., width: 1024 }
      lg: { url: ..., width: 1920 }
    blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj"
    dominantColor: "#8B5A2B"
```

### 2. Public Directory (digital/, physical/)
Files in `public/media/digital/` and `public/media/physical/`
- Served directly (no processing)
- Should be manually optimized WebP
- Use for bulk uploads where CMS isn't needed

### 3. External Hotlinks (collaborations/)
⚠️ **PROBLEM**: WordPress URLs like:
```
https://www.sheskin.org/wp-content/uploads/2025/11/Screenshot-2025-11-04-at-1.06.25-PM-1024x570.png
```

**Issues**:
- No format optimization (PNG instead of WebP)
- No responsive sizing
- Extra DNS lookup
- Slower TTFB

## Migration Strategy

### Option 1: Bunny.net CDN (Recommended)

1. **Download WordPress images**:
```bash
# Create migration script
node scripts/migrate-wp-images.js
```

2. **Process and upload**:
```bash
# Convert to WebP, generate variants, upload to Bunny
node scripts/optimize-images.js --source tmp/wp-images --output collaborations
```

3. **Update collaborations.json**:
Replace WordPress URLs with Bunny CDN URLs.

### Option 2: Proxy with Optimization

Use Bunny.net's reverse proxy to optimize WordPress images on-the-fly:
```
https://your-zone.b-cdn.net/wp-content/uploads/...?width=800&quality=85&format=webp
```

### Option 3: Next-Gen Image Formats (Future)

Process all images through Sharp pipeline:
- WebP: ~30% smaller than JPEG
- AVIF: ~50% smaller than JPEG
- Responsive variants: 320w, 640w, 960w, 1280w, 1920w

## Performance Targets

| Metric | Target | Current (WordPress) |
|--------|--------|---------------------|
| First Contentful Paint | < 1.5s | ~3-4s |
| Largest Contentful Paint | < 2.5s | ~5-6s |
| Image load time | < 200ms | ~800ms-2s |
| Total image weight | < 500KB/page | ~2-5MB/page |

## Implementation Checklist

### Immediate (5 min setup)
- [x] LightningImage components created
- [x] WorksGrid updated with LightningImg
- [ ] Update collaborations.json with CDN URLs
- [ ] Add preload hints for hero images

### Short-term (1-2 hours)
- [ ] Migrate WordPress images to Bunny CDN
- [ ] Generate blurhashes for all images
- [ ] Set up automated image processing pipeline

### Long-term (Ongoing)
- [ ] Implement service worker for image caching
- [ ] Add art direction for responsive images
- [ ] Implement progressive JPEG loading

## Usage Examples

### Hero/Featured Images (Priority)
```astro
<LightningImage
  src={work.data.media[0].src}
  alt={work.data.media[0].alt}
  variants={work.data.media[0].variants}
  blurhash={work.data.media[0].blurhash}
  width={1200}
  height={800}
  sizes="(max-width: 640px) 100vw, 50vw"
  priority={true}  ← Loads immediately
  preload={true}   ← Adds <link rel="preload">
/>
```

### Grid Images (Lazy)
```tsx
<LightningImg
  src={image.src}
  alt={image.alt}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
  priority={false}  ← Lazy loaded
/>
```

### Background/Dominant Color
```astro
<LightningImage
  src={image.src}
  alt={image.alt}
  dominantColor="#8B5A2B"  ← Shows while loading
  blurhash="LEHV6nWB2yk8pyo0adR*.7kCMdnj"
/>
```

## Bunny.net Configuration

### Environment Variables
```bash
BUNNY_API_KEY=your-api-key
BUNNY_STORAGE_ZONE=sheskin
BUNNY_CDN_URL=https://sheskin.b-cdn.net
BUNNY_STORAGE_ENDPOINT=ny.storage.bunnycdn.com
```

### Optimization Parameters
Append to any Bunny CDN URL:
- `?width=800` — Resize to 800px width
- `?quality=85` — 85% quality (sweet spot)
- `?format=webp` — Convert to WebP
- `?crop=800,600` — Crop to dimensions

Example:
```
https://sheskin.b-cdn.net/works/artwork.jpg?width=800&quality=85&format=webp
```

## Migration Script

```javascript
// scripts/migrate-images.js
import { downloadImage, processImage, uploadToBunny } from './image-utils';
import collaborations from '../src/data/collaborations.json';

async function migrate() {
  for (const item of collaborations) {
    if (item.image.src.includes('sheskin.org')) {
      // Download
      const buffer = await downloadImage(item.image.src);
      
      // Process: WebP, multiple sizes
      const variants = await processImage(buffer, {
        sizes: [640, 1024, 1920],
        format: 'webp',
        quality: 85,
      });
      
      // Upload to Bunny
      const urls = await Promise.all(
        variants.map(v => uploadToBunny(v.buffer, `collaborations/${item.slug}-${v.width}.webp`))
      );
      
      // Update JSON
      item.image.src = urls[1]; // Medium as default
      item.image.variants = {
        sm: { url: urls[0], width: 640 },
        md: { url: urls[1], width: 1024 },
        lg: { url: urls[2], width: 1920 },
      };
    }
  }
  
  // Save updated JSON
  await fs.writeFile(
    './src/data/collaborations.json',
    JSON.stringify(collaborations, null, 2)
  );
}
```

## Testing Performance

### Before/After
```bash
# Install Lighthouse
npm install -g lighthouse

# Test collaborations page
lighthouse http://localhost:4321/works/collaborations --output=json

# Key metrics to watch:
# - First Contentful Paint
# - Largest Contentful Paint  
# - Total Blocking Time
# - Speed Index
```

### Network Tab Checklist
- [ ] Images load from b-cdn.net (not sheskin.org)
- [ ] WebP format (not PNG/JPEG)
- [ ] Properly sized (not 3000px wide displayed at 300px)
- [ ] Cached (304 or from disk cache on reload)

## Troubleshooting

### Images not showing
- Check browser console for 404s
- Verify Bunny.net CORS headers
- Ensure SSL certificates are valid

### Blurhash not decoding
- Check blurhash string validity
- Verify blurhash package is installed
- Check for canvas security errors

### Slow loading still
- Verify CDN URLs are being used
- Check if images are actually WebP (Network tab)
- Ensure lazy loading is working (images below fold shouldn't load immediately)

---

*Last updated: February 2026*
