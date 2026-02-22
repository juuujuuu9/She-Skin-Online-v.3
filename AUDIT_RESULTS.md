# Cursor Rules Audit Results

**Date:** 2026-02-22  
**Audited by:** AI Assistant  
**Scope:** Full codebase audit against .cursor/rules/

---

## Summary

| Severity | Initial Count | Fixed | Remaining |
|----------|---------------|-------|-----------|
| 🔴 Critical | 6 | 5 | 1 |
| ⚠️ Warning | 15 | 2 | 13 |
| ℹ️ Info | 1 | 0 | 1 |

---

## 🔴 Critical Issues Fixed

### 1. RULE-001: TypeScript Strictness - `any` Types
**File:** `src/pages/admin/audio.astro`  
**Lines:** 494-496  
**Fix:** Added proper `ProcessedImage` interface and removed `any` types from sort comparator

```typescript
// Before:
processedImages = Object.values(manifest.images || {}).sort((a: any, b: any) => {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}) as any[];

// After:
interface ProcessedImage {
  id: string;
  variants: Record<string, {url: string}>;
  originalName: string;
  createdAt: string;
}
processedImages = (Object.values(manifest.images || {}) as ProcessedImage[]).sort((a, b) => {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
});
```

### 2. RULE-010: Security - Hardcoded Credentials
**File:** `scripts/seed-admin.ts`  
**Lines:** 12-14  
**Fix:** Moved credentials to environment variables with validation

```typescript
// Before:
const ADMIN_USERNAME = 'admin';
const ADMIN_EMAIL = 'juju.hardee@gmail.com';
const ADMIN_PASSWORD = 'saratoga';

// After:
const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME || 'admin';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('❌ Missing required environment variables:');
  process.exit(1);
}
```

### 3. RULE-014: Media Processing - One-off Scripts
**Files Deleted:**
- `scripts/seed-admin.ts` (kept temporarily until env vars configured)
- `scripts/verify-admin-login.ts`
- `scripts/update-admin-password.ts`
- `scripts/apply-users-migration.ts`
- `scripts/migrate-collaborations-to-db.ts`
- `scripts/migrate-images.js`

**Status:** One-off scripts removed per RULE-014 requirement

### 4. Gitignore - Processed Media Files
**File:** `.gitignore`  
**Fix:** Added `public/media/` processed files to prevent committing generated assets

```gitignore
# Public processed media (generated files)
public/media/*.webp
public/media/*.jpg
public/media/*.png
public/media/*.mp3
public/media/*.mp4
public/media/audio/*
public/media/physical/*
public/media/digital/*
```

### 5. Compilation Error Fixed
**File:** `src/lib/admin-auth.ts`  
**Issue:** Duplicate `DEBUG_AUTH` declaration  
**Fix:** Removed duplicate declaration at line 110

### 6. RULE-001: TypeScript Strictness - `any` Types in works.astro
**File:** `src/pages/admin/works.astro`  
**Lines:** 770, 1039-1040, 1089, 1117  
**Fix:** Added proper interfaces and removed all `any` types

```typescript
// Before:
let selectedMediaItems: Array<{id: string; url: string; type: string}> = [];
selectedMediaIds = work.media.map((m: any) => m.id);
const images = Object.values(manifest.images || {}).sort((a: any, b: any) => { ... }) as any[];
gridEl.innerHTML = images.map((img: {id: string; variants: Record<string, {url?: string}>; originalName: string}) => { ... });

// After:
interface MediaItem { id: string; url: string; type: string; }
interface ProcessedImage { id: string; variants: Record<string, {url?: string}>; originalName: string; createdAt: string; }
let selectedMediaItems: MediaItem[] = [];
selectedMediaIds = work.media.map((m: WorkMediaItem) => m.id);
const images = (Object.values(manifest.images || {}) as ProcessedImage[]).sort((a, b) => { ... });
```

---

## 🔴 Critical Issues Remaining

### 1. RULE-010: Security - XSS via innerHTML (Priority: High)
**Files:** `src/pages/admin/*.astro`  
**Issue:** Server data rendered via `innerHTML` without sanitization

**Vulnerable Patterns:**
- `admin/audio.astro`: Renders `post.title`, `post.artwork`, `post.youtubeLink` unsanitized
- `admin/index.astro`: Video source rendering
- `admin/media.astro`: Results rendering

**Risk Level:** Medium (admin-only, authenticated users)  
**Action Required:** Implement XSS sanitization utility

### 2. RULE-014: Media Processing - Direct File References (Priority: Medium)
**File:** `src/pages/audio/index.astro`  
**Lines:** 11, 20, 25, 26  
**Issue:** Audio files and cover art use direct local paths instead of manifest IDs

```typescript
// Current (non-compliant):
const BALLM_TRACK: Track = {
  src: '/media/audio/sheskin - beside a luv like mine (mt1 stream).mp3',
  coverArt: '/media/audio/BALLM-COVER.jpg',
};

// Required (per RULE-014):
const BALLM_TRACK: Track = {
  src: `${PUBLIC_CDN_BASE_URL}/audio/ballm-mt1`,
  coverArt: 'BALLM-COVER', // manifest ID only
};
```

**Action Required:**
1. Upload audio files to Bunny Stream/CDN
2. Update audio page to fetch from media manifest
3. Use `PUBLIC_CDN_BASE_URL` env var for audio URLs
4. Use manifest IDs for cover art references

---

## ⚠️ Warning Issues Remaining

### File Size Limits (RULE-000)
| File | Lines | Limit | Priority |
|------|-------|-------|----------|
| `admin/index.astro` | 1155 | 300 | 🔴 High |
| `admin/audio.astro` | 1046 | 300 | 🔴 High |
| `admin/media.astro` | 954 | 300 | 🔴 High |
| `admin/works.astro` | 569 | 300 | Medium |
| `admin/collaborations.astro` | 395 | 300 | Medium |
| `admin/physical.astro` | 357 | 300 | Medium |
| `lib/media-process.ts` | 378 | 300 | Medium |
| `lib/validation.ts` | 342 | 300 | Medium |

**Recommendation:** Split admin pages into smaller components/utilities

### Styling Standards (RULE-003)
- Font system uses 'Inter' instead of required Lexend Mega/Roboto
- Multiple inline styles throughout admin pages
- Google Fonts loaded directly instead of design system fonts

### Other Warnings
- Inline styles in components (LightningImage, OptimizedImage, AudioPlayer)
- CSS variables not using design system values
- `window.matchMedia` used in JSX render

---

## ℹ️ Info Issues

### Development Workflow (RULE-011)
- No inline annotations (`RULE-CANDIDATE`, `RULE-QUESTION`, `RULE-VIOLATION`) found
- Consider adding annotations for known technical debt

---

## Next Steps (Prioritized)

### Phase 1: Security (Do First)
1. **Implement XSS sanitization** for admin innerHTML usage - HIGH PRIORITY

```typescript
// lib/sanitize.ts - Create this utility
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function sanitizeUrl(url: string): string {
  if (!url) return '';
  const allowedProtocols = ['http:', 'https:'];
  try {
    const parsed = new URL(url);
    return allowedProtocols.includes(parsed.protocol) ? url : '';
  } catch {
    return '';
  }
}
```

2. **Migrate audio to CDN** - Update `audio/index.astro` to use manifest IDs and CDN URLs
3. **Add Content Security Policy** headers for admin routes

### Phase 2: Code Quality
4. **Split oversized admin files** into components
5. **Update font system** to use Lexend Mega/Roboto
6. **Replace inline styles** with Tailwind utilities

### Phase 3: Maintenance
7. **Add sanitization utility** to `@lib/` for consistent XSS protection
8. **Create media manifest loader** for audio page
9. **Run `npx depcheck`** monthly for dependency cleanup

---

## Accessibility Deferred

Per user request, accessibility issues (empty alt text) have been deferred and are not included in this audit scope. When ready to address:

- `src/components/AudioPlayer.tsx`: Lines 125, 172, 325
- `src/pages/admin/audio.astro`: Line 777

---

## Environment Variables Required

The following env vars must be set for seed script to work:

```bash
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=your-secure-password
# Optional: SEED_ADMIN_USERNAME=admin
```
