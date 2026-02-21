# Audit: Admin Login Authentication & Bunny Storage

**Date:** 2025-02-20  
**Scope:** Admin authentication, admin panel ↔ Bunny storage connection, and how Bunny-backed content is displayed on public pages.

---

## 1. Admin login authentication

### 1.1 Implementation summary

| Component | Location | Purpose |
|-----------|----------|---------|
| Auth library | `src/lib/admin-auth.ts` | Password verification, session cookie creation/verification, Basic Auth parsing |
| Login page | `src/pages/admin/login.astro` | Form POST → verify password → set session cookie → redirect to `/admin` |
| Logout | `src/pages/api/admin/logout.ts` | GET → clear `admin_session` cookie → redirect to `/admin/login` |
| Page guards | All `src/pages/admin/*.astro` | `checkAdminAuth(Astro.request)`; redirect to `/admin/login` if not valid |
| API guards | All `src/pages/api/admin/*` | `checkAdminAuth(request)` or `isAdminAuthenticated(request)`; 401 if not valid |

### 1.2 Authentication mechanisms

- **Session cookie (primary):**  
  - Name: `admin_session`.  
  - Value: `timestamp.signature` (signature = HMAC-SHA256 of timestamp with `ADMIN_SECRET`).  
  - Options: HttpOnly, Path=/, Max-Age=86400 (24h), SameSite=Strict; Secure in production.  
  - Verified in `verifySessionCookie()` with timing-safe comparison and age check.

- **Basic Auth (fallback):**  
  - `Authorization: Basic <base64(user:password)>`.  
  - Password compared to `ADMIN_PASSWORD` with timing-safe compare.  
  - Used by `isAdminAuthenticated()` and `checkAdminAuth()` so API calls from browser or tools can use Basic Auth.

### 1.3 Security strengths

- **Timing-safe comparison** for password and signature (prevents timing leaks).
- **Signed cookie** so clients cannot forge a valid session without `ADMIN_SECRET`.
- **Session expiry** (24h) and rejection of future timestamps.
- **Env loading** from `.env` with fallback to `process.env`; `ADMIN_SECRET` required and must be ≥ 16 characters.
- **Login form** uses POST and sets cookie with secure options; no password in URL.

### 1.4 Findings and recommendations

| # | Finding | Severity | Recommendation |
|---|--------|----------|----------------|
| 1 | **APIs never set session cookie when Basic Auth succeeds.** `checkAdminAuth` / `isAdminAuthenticated` return `setCookie: true` but no API handler attaches a `Set-Cookie` header. | Low (UX) | Optional: In API routes that use `checkAdminAuth`, when `auth.setCookie === true`, add `Set-Cookie` with `createSessionCookie()` so the next request can use the cookie instead of Basic Auth. |
| 2 | **Logout does not validate auth.** GET `/api/admin/logout` clears the cookie without checking if the user was logged in. | Info | Acceptable as-is (idempotent, no sensitive action). Optionally restrict to POST if you want to avoid CSRF/logout-link quirks. |
| 3 | **README vs code mismatch.** README mentions `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` (bcrypt); actual code uses `ADMIN_PASSWORD` (plain) and `ADMIN_SECRET`. | Low | Update README (and `.env.example` if present) to document `ADMIN_PASSWORD` and `ADMIN_SECRET` so deployers configure the right variables. |
| 4 | **No rate limiting on login.** Repeated failed attempts are not throttled. | Medium | Add rate limiting (e.g. by IP or by cookie) on `/admin/login` POST and optionally on API 401s to reduce brute-force risk. |

### 1.5 Required environment variables

- **`ADMIN_PASSWORD`** – Plain password; must be set or admin auth denies access.
- **`ADMIN_SECRET`** – HMAC secret for signing the session cookie; must be set and at least 16 characters.

---

## 2. Admin panel ↔ Bunny storage connection

### 2.1 Configuration and library

| Item | Location | Notes |
|------|----------|--------|
| Bunny lib | `src/lib/bunny.ts` | `isBunnyConfigured()`, `uploadToBunny()`, `uploadImageToBunny()`, `deleteFromBunny()` |
| Env vars | `.env` / `.env.example` | `BUNNY_API_KEY`, `BUNNY_STORAGE_ZONE`, `BUNNY_CDN_URL`; optional `BUNNY_STORAGE_ENDPOINT` |
| Upload API | `src/pages/api/admin/media/upload.ts` | Auth via `checkAdminAuth` → FormData `file` + optional `folder` → `uploadToBunny()` (direct mode) or queued for processing → returns CDN URL or queued status |
| Upload API (audio) | `src/pages/api/admin/audio/upload.ts` | Auth via `checkAdminAuth` → FormData `audio`, `cover`, metadata → `uploadToBunny()` for audio + cover |
| Media pipeline | `src/lib/media-process.ts`, `scripts/media-processor.ts` | When Bunny configured, processed assets can be uploaded to Bunny; admin media upload goes to local `media/originals` then processing (which may push to Bunny) |

### 2.2 Flow: admin → Bunny

1. **Image upload (collaborations / physical / etc.):**  
   Admin page sends multipart to `POST /api/admin/media/upload` with `file` and optional `folder`.  
   API checks admin auth → validates image type → when `folder` provided, builds path `{folder}/{timestamp}-{safeName}` → `uploadToBunny(buffer, filename)` → returns JSON with `url` (CDN URL) immediately. Without `folder`, queues for background processing.

2. **Audio upload:**  
   Admin sends to `POST /api/admin/audio/upload` with `audio`, optional `cover`, and metadata.  
   API checks admin auth → validates audio type → uploads audio and cover to Bunny under `audio/` and `audio/covers/` → returns track object with `audioSrc` and `coverArt` CDN URLs.

3. **Bunny lib behavior:**  
   - Uses `BUNNY_STORAGE_ENDPOINT` or `storage.bunnycdn.com`.  
   - PUT to `https://{endpoint}/{storageZone}/{path}` with `AccessKey` and `Content-Type`.  
   - Returns CDN URL using `BUNNY_CDN_URL` + encoded path; throws if `BUNNY_CDN_URL` is missing after upload.

### 2.3 Findings and recommendations (Bunny connection)

| # | Finding | Severity | Recommendation |
|---|--------|----------|----------------|
| 1 | **All Bunny-capable admin APIs are behind admin auth.** Upload and audio upload both use `checkAdminAuth`; no unauthenticated write to Bunny. | OK | — |
| 2 | **Credentials only in env.** No Bunny secrets in client; server-side only. | OK | Keep API keys and storage zone in server env only. |
| 3 | **Upload path controlled by client.** `folder` in image upload is client-provided (default `uploads`). A compromised admin could write under arbitrary paths in the zone. | Low | Optional: restrict `folder` to an allowlist (e.g. `uploads`, `collaborations`, `audio`, `audio/covers`) to limit blast radius. |
| 4 | **No explicit CORS policy** for admin APIs. Relies on same-origin when admin is on same host. | Info | If admin is ever on a different subdomain, configure CORS for `/api/admin/*` and keep credentials (cookies) in mind. |
| 5 | **Error messages** from Bunny (e.g. status + body) are logged/thrown; ensure they are not echoed to client in a way that leaks internal details. | Info | Current API returns generic “Upload failed” + `error.message`; consider sanitizing in production. |

---

## 3. How Bunny-backed content is displayed on pages

### 3.1 Data sources

| Source | Content | Bunny usage |
|--------|---------|-------------|
| **Collaborations** | `src/data/collaborations.json` | Entries contain `image.src` and `image.variants.sm/md/lg.url`; many are `https://sheskin.b-cdn.net/collaborations/...`. |
| **Collaborations data layer** | `src/data/collaborations.ts` | Reads JSON; rewrites image URLs to `BUNNY_CDN_URL` when set and not equal to legacy host `https://sheskin.b-cdn.net`. Exports `collaborationsGridItems`. |
| **Works category page** | `src/pages/works/[category].astro` | For `category === 'collaborations'` uses `collaborationsGridItems`; other categories use local `public/media/*` or content collections. |
| **Admin collaborations** | `src/pages/admin/collaborations.astro` and `edit/[slug].astro` | List and edit forms show `item.image.src`; edit form uploads via `/api/admin/upload` and sets `form.image.src = data.url` (Bunny URL). |

### 3.2 URL rewriting (collaborations)

- **File:** `src/data/collaborations.ts`  
- **Logic:** If `BUNNY_CDN_URL` is set and not the legacy host, any image URL (and variant URLs) starting with `https://sheskin.b-cdn.net` are rewritten to `BUNNY_CDN_URL`.  
- **Purpose:** Allow switching CDN (e.g. different zone) via env without editing JSON.

### 3.3 Display components

| Component | File | Bunny-related behavior |
|-----------|------|------------------------|
| **LightningImage.astro** | `src/components/ui/LightningImage.astro` | Detects Bunny via `src.includes('b-cdn.net') \|\| src.includes('bunnycdn')`; for Bunny images with width, appends `?width=…&quality=85&format=webp`. Builds srcset from variants or single URL. |
| **LightningImg.tsx** | `src/components/ui/LightningImg.tsx` | Same Bunny check; for Bunny URLs without pre-built variants builds srcset with `?width=…&quality=85&format=webp`. Uses variant URLs when provided (e.g. collaborations). |

### 3.4 End-to-end flow (collaborations)

1. **Build/server:**  
   `collaborations.ts` loads `collaborations.json` and rewrites legacy CDN host to `BUNNY_CDN_URL` when set.  
   Resulting `collaborationsGridItems` have `image.src` and `image.variants` as Bunny CDN URLs (or unchanged if no rewrite).

2. **Works page:**  
   `/works/collaborations` passes these items to `WorksGrid`; each item’s image is rendered with `LightningImage` or `LightningImg` (depending on usage).

3. **Browser:**  
   For Bunny URLs, components add query params for width/quality/format where applicable; images load from Bunny CDN.

### 3.5 Findings and recommendations (display)

| # | Finding | Severity | Recommendation |
|---|--------|----------|----------------|
| 1 | **Collaborations JSON is the source of truth.** Admin “save” writes to `src/data/collaborations.json`. Deployments need to persist or sync this file. | Info | Document that edits are file-based; consider DB or Git-backed workflow if you need history or multi-instance consistency. |
| 2 | **BUNNY_CDN_URL must match storage.** Rewriting in `collaborations.ts` only affects display; actual files must exist at that CDN. Admin uploads use the same `BUNNY_CDN_URL` for returned URLs. | OK | Keep a single Bunny pull zone (or consistent URL pattern) so admin uploads and JSON point to the same base. |
| 3 | **Bunny detection is heuristic.** Components treat URLs containing `b-cdn.net` or `bunnycdn` as Bunny; no broken behavior if a non-Bunny URL contains that string. | Low | Optional: centralize “is Bunny URL” (e.g. same helper) and use a strict check (e.g. base URL) if you add more CDNs later. |
| 4 | **Static paths.** `getStaticPaths()` in `[category].astro` means collaborations are built at build time; new or changed items from admin require a rebuild/redeploy unless you move to server/SSR. | Info | Document that new collaborations (from admin) need a rebuild or switch to server-rendered works page if you want instant visibility. |

---

## 4. Summary table

| Area | Status | Critical issues |
|------|--------|------------------|
| Admin login auth | OK | None. Optional: rate limiting, README/env docs, optional API set-cookie on Basic Auth. |
| Admin ↔ Bunny | OK | All writes behind admin auth; credentials server-side. Optional: folder allowlist, error sanitization. |
| Display of Bunny content | OK | Collaborations and Lightning* components use Bunny URLs and params correctly; rewriting and variant handling are consistent. |

---

## 5. Checklist for deploy

- [ ] Set `ADMIN_PASSWORD` and `ADMIN_SECRET` (≥ 16 chars); do not rely on README’s old `ADMIN_PASSWORD_HASH` / `ADMIN_USERNAME`.
- [ ] Set `BUNNY_API_KEY`, `BUNNY_STORAGE_ZONE`, `BUNNY_CDN_URL` (and optionally `BUNNY_STORAGE_ENDPOINT`) for production.
- [ ] Ensure admin and API routes are served over HTTPS in production so cookies can use `Secure`.
- [ ] Confirm `src/data/collaborations.json` is deployed with the site (or replaced by build/deploy pipeline) so collaborations display correctly.
- [ ] Run `node scripts/test-bunny.js` (or equivalent) to verify Bunny connectivity before going live.
