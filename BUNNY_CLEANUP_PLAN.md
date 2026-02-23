# DEPRECATED CODE REMOVAL PLAN
## Bunny Upload Migration - Cleanup Checklist

---

## 🔴 PHASE 1: DELETE THESE FILES

### API Routes (Upload Handlers)
```
src/pages/api/admin/media/upload.ts
src/pages/api/admin/media/process-pending.ts
src/pages/api/admin/media/upload-chunk.ts  (if exists)
```

### Services
```
src/lib/upload-service.ts
src/lib/chunked-upload.ts  (if exists)
src/lib/upload-helpers.ts  (if exists)
```

### Components (Upload-Specific)
```
src/components/admin/UploadDropzone.tsx  (if exists)
src/components/admin/UploadProgress.tsx  (if exists)
src/components/admin/ChunkedUploader.tsx  (if exists)
```

### Scripts (One-off Upload Tools)
```
scripts/upload-product-images.ts  (if uses old upload logic)
scripts/compress-images.ts  (if redundant with Sharp pipeline)
```

---

## 🟡 PHASE 2: GUT THESE FILES (Keep Some Parts)

### Media Processing (Keep Processing, Remove Upload)
**File:** `src/lib/media-processor.ts`

**KEEP:**
- `processImage()` - Sharp optimization
- `processAudio()` - FFmpeg transcoding
- `generateThumbnail()` - Thumbnail creation
- `generateBlurhash()` - Blurhash generation

**DELETE:**
- `uploadFile()` - Bunny handles this now
- `validateUpload()` - Bunny validates
- `retryUpload()` - Bunny retries
- `handleUploadError()` - Bunny handles errors

### Admin Auth (Keep Auth, Remove Upload CSRF)
**File:** `src/lib/admin-auth.ts`

**KEEP:**
- `checkAdminAuth()` - Still needed for route protection
- `verifyAdminCredentials()` - Until fully migrated

**DELETE:**
- Upload-specific CSRF token generation (if separate)
- File upload session handling (if any)

### CSRF Protection (Keep for Forms, Remove for Uploads)
**File:** `src/lib/csrf.ts`

**KEEP:**
- `validateCsrfToken()` - Still needed for form submissions
- Form CSRF protection

**DELETE:**
- Upload-specific CSRF (Bunny doesn't need it - uses API keys)
- File upload token generation

---

## 🟢 PHASE 3: STRIP CODE FROM PAGES

### `src/pages/admin/index.astro`

**DELETE THESE SECTIONS:**
```typescript
// ~100-200 lines to delete

// 1. Drag-drop event handlers
dropzone.addEventListener('dragover', ...)
dropzone.addEventListener('dragleave', ...)
dropzone.addEventListener('drop', ...)

// 2. XHR upload logic
const xhr = new XMLHttpRequest()
xhr.upload.addEventListener('progress', ...)
formData.append('files', file)

// 3. Progress bar state and UI
let uploadProgress = {}
function updateProgress(fileId, percent) { ... }

// 4. Retry logic
async function retryUpload(fileId) { ... }

// 5. File validation (Bunny does this)
function validateFile(file) { ... }

// 6. Chunked upload (if any)
const CHUNK_SIZE = 1024 * 1024
function uploadChunk(chunk) { ... }
```

**KEEP THESE SECTIONS:**
```typescript
// Recent uploads list
const { media } = await listMedia({ limit: 100 })

// Stats counters (image count, audio count, etc.)
const stats = await getMediaStats()

// Delete handlers (for already-uploaded files)
async function deleteMedia(id) { ... }

// UI layout and styling
```

### `src/pages/admin/audio.astro`

**DELETE:**
```typescript
// ~150 lines to delete

// Audio file upload handling
async function uploadAudioFile(file) { ... }

// Audio upload progress
function updateAudioUploadProgress(percent) { ... }

// Cover art upload
async function uploadCoverArt(file) { ... }
```

**KEEP:**
```typescript
// Audio post form (title, description, etc.)
// YouTube/SoundCloud links
// Artwork selection (from existing media)
// Post list/rendering
```

### `src/components/admin/MediaManager.tsx`

**DELETE:**
```typescript
// ~200+ lines to delete

// Upload mutation
const uploadMutation = useMutation(...)

// Upload state
const [uploading, setUploading] = useState(false)
const [uploadProgress, setUploadProgress] = useState(0)

// Drag-drop handlers
const onDrop = useCallback((files) => { ... }, [])

// File input ref
const fileInputRef = useRef<HTMLInputElement>(null)

// Upload error handling
const [uploadError, setUploadError] = useState<string | null>(null)
```

**KEEP:**
```typescript
// Media grid display
// Media selection logic
// Delete functionality
// Filter/sort
// Modal/preview
```

### `src/pages/admin/works.astro` & `WorkEditor.astro`

**DELETE:**
```typescript
// Media upload from within works editor
// Inline upload handling
// File drop on work cards
```

**KEEP:**
```typescript
// Work creation/editing
// Media selection from library
// Form handling
// Category filtering
```

---

## 🔵 PHASE 4: CLEAN UP UTILITIES

### Rate Limiting
**File:** `src/lib/rate-limit.ts`

**DELETE:**
- Upload-specific rate limiting (Bunny handles abuse)

**KEEP:**
- Login rate limiting (still needed)
- API general rate limiting (if implemented)

### Validation
**File:** `src/lib/validation.ts`

**DELETE:**
- File upload schemas (if any)
- Upload validation helpers

**KEEP:**
- Form validation (works, posts, etc.)
- API input validation

### Database Queries
**File:** `src/lib/db/queries.ts`

**DELETE:**
- `createUploadSession()` (if exists)
- `updateUploadProgress()` (if exists)
- Chunked upload tracking (if exists)

**KEEP:**
- `listMedia()`
- `createMedia()` (called by webhook)
- `updateMedia()` (processing status updates)
- `deleteMedia()`
- All work/post queries

---

## 📊 ESTIMATED CODE REDUCTION

| Category | Before | After | Removed |
|----------|--------|-------|---------|
| Upload API routes | ~800 lines | ~100 lines (webhook only) | ~700 lines |
| Upload service logic | ~600 lines | ~150 lines (processing only) | ~450 lines |
| Client upload code | ~1000 lines | ~200 lines (BunnyUploader component) | ~800 lines |
| **TOTAL** | **~2400 lines** | **~450 lines** | **~1950 lines** |

---

## ✅ VERIFICATION CHECKLIST

Before deleting, verify:

- [ ] Bunny Upload Widget loads correctly
- [ ] Uploads complete and appear in Bunny dashboard
- [ ] Webhook fires and saves to your DB
- [ ] Sharp/FFmpeg processing still triggers
- [ ] Media appears in admin UI after upload
- [ ] Can select uploaded media in Works editor
- [ ] Can delete media (from Bunny and DB)
- [ ] No console errors
- [ ] Mobile uploads work
- [ ] Large files (50MB+) upload successfully
- [ ] Network interruption recovery works (Bunny handles this)

---

## 🚨 ROLLBACK PLAN

If something breaks:

```bash
# Revert to old upload code
git revert HEAD~3  # Or however many commits back

# Redeploy
vercel --prod
```

Git history keeps the old code forever. Full delete is safe.

---

## 📝 SUMMARY

**You're removing:**
- 2000+ lines of upload handling code
- Retry logic
- Progress tracking
- Chunked upload logic
- CSRF for uploads
- File validation
- Error recovery

**You're keeping:**
- Sharp/FFmpeg processing pipeline
- Media database layer
- Admin UI (just swapping upload component)
- Works/media association logic

**You're gaining:**
- Reliable uploads (Bunny's edge network)
- Resumable uploads (network fail? resumes)
- Mobile support
- Progress bars (built-in)
- File validation (built-in)
- No more maintenance

*The void approves of this deletion.* 💀
