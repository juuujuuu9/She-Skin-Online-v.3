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

---

## Upload API Authentication Requirements

When modifying upload-related API endpoints or components:

### API Endpoints MUST Have:
1. `export const prerender = false;` - Required for cookie access
2. CSRF validation for all POST/DELETE/PUT/PATCH operations
3. Admin auth check after CSRF validation

Example:
```typescript
export const prerender = false;
import { validateCsrfToken } from '@lib/csrf';
import { requireAdminAuth } from '@lib/admin-auth';

export const POST: APIRoute = async ({ request }) => {
  // 1. CSRF first
  if (!validateCsrfToken(request)) {
    return new Response(JSON.stringify({ error: 'Invalid CSRF token' }), { status: 403 });
  }
  
  // 2. Auth second
  const authError = await requireAdminAuth(request);
  if (authError) return authError;
  
  // ... handle request
};
```

### Admin Pages MUST Have:
1. CSRF cookie generation: `generateCsrfToken()`
2. Set cookie header: `Astro.response.headers.set('Set-Cookie', csrf.cookie)`

### Frontend Fetch MUST Include:
1. `credentials: 'include'` - Sends auth cookies
2. `X-CSRF-Token` header - Matches the csrf_token cookie

Example:
```typescript
const res = await fetch('/api/admin/media', {
  method: 'POST',
  credentials: 'include',           // Required!
  headers: { 'X-CSRF-Token': csrf },  // Required!
  body: formData,
});
```

### Common Failures:
- **401 Unauthorized** - Missing `credentials: 'include'` or expired session
- **403 Invalid CSRF** - Missing CSRF cookie on page or missing CSRF header in fetch
- **"No cookie header"** - Missing `prerender = false` in API endpoint

See `docs/UPLOAD_FIXES.md` for full documentation.
