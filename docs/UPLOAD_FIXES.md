# Upload System Fixes & Documentation

## Overview

This document summarizes the authentication and upload fixes applied to resolve 401/403 errors in the media upload system. Use this as a reference when building future upload features or debugging auth issues.

---

## Root Causes of Upload Failures

### 1. Missing CSRF Token Cookie
**Problem:** The `/admin/media` page was not setting the `csrf_token` cookie required for protected API endpoints.

**Impact:** All POST/DELETE requests from the Media Manager failed with 403 "Invalid CSRF token".

**Fix:** Add CSRF token generation to all admin pages that use state-changing APIs:

```astro
---
import { generateCsrfToken } from '@lib/csrf';

// Generate and set CSRF token for upload protection
const csrf = generateCsrfToken();
Astro.response.headers.set('Set-Cookie', csrf.cookie);
---
```

### 2. Missing `credentials: 'include'` in Fetch Calls
**Problem:** React components (MediaManager, MediaSelector) were not sending cookies with fetch requests.

**Impact:** API endpoints received no authentication cookies, causing 401 errors.

**Fix:** Always include credentials in admin fetch calls:

```typescript
const response = await fetch('/api/admin/media', {
  method: 'POST',
  credentials: 'include',  // Required for cookies!
  headers: {
    'X-CSRF-Token': getCsrfToken(),
  },
  body: formData,
});
```

### 3. Missing `prerender = false` in API Endpoints
**Problem:** The `/api/admin/media/process-pending` endpoint was being treated as a static page.

**Impact:** Astro couldn't access request headers/cookies in prerendered endpoints.

**Error messages:**
```
[router] /api/admin/media/process-pending POST requests are not available in static endpoints
[verifySessionCookie] No cookie header
```

**Fix:** Always add `export const prerender = false;` to API routes:

```typescript
export const prerender = false;

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  // Now request headers are accessible
};
```

### 4. Missing CSRF Validation in API Endpoints
**Problem:** Some API endpoints checked auth but not CSRF tokens.

**Impact:** Security vulnerability - endpoints accepted requests without CSRF protection.

**Fix:** Add CSRF validation to all state-changing endpoints:

```typescript
import { validateCsrfToken } from '@lib/csrf';

export const POST: APIRoute = async ({ request }) => {
  // Check CSRF first
  if (!validateCsrfToken(request)) {
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Then check auth
  const authError = await requireAdminAuth(request);
  if (authError) return authError;
  
  // ... handle request
};
```

---

## Complete Auth Pattern for API Endpoints

When creating new admin API endpoints, use this template:

```typescript
// src/pages/api/admin/example.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdminAuth } from '@lib/admin-auth';
import { validateCsrfToken } from '@lib/csrf';

// GET: Read operations (no CSRF needed)
export const GET: APIRoute = async ({ request }) => {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;
  
  // ... handle GET request
};

// POST: Create operations (CSRF required)
export const POST: APIRoute = async ({ request }) => {
  // 1. Check CSRF first
  if (!validateCsrfToken(request)) {
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // 2. Check auth
  const authError = await requireAdminAuth(request);
  if (authError) return authError;
  
  // 3. Handle request
  // ...
};

// DELETE/PUT/PATCH: Modify operations (CSRF required)
export const DELETE: APIRoute = async ({ request }) => {
  if (!validateCsrfToken(request)) {
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  const authError = await requireAdminAuth(request);
  if (authError) return authError;
  
  // ... handle DELETE
};
```

---

## Complete Frontend Pattern for Admin Pages

When creating new admin pages with file uploads or state-changing operations:

### Astro Page Setup

```astro
---
// src/pages/admin/example.astro
export const prerender = false;

import { checkAdminAuth } from '@lib/admin-auth';
import { generateCsrfToken } from '@lib/csrf';

// Check auth server-side
const auth = await checkAdminAuth(Astro.request);
if (!auth.valid) {
  return Astro.redirect('/admin/login?session=expired');
}

// Generate CSRF token for client-side operations
const csrf = generateCsrfToken();
Astro.response.headers.set('Set-Cookie', csrf.cookie);
---
```

### Client-Side Fetch Pattern

```typescript
// Get CSRF token helper
const getCsrfToken = () => {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : '';
};

// Upload function
async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  
  const res = await fetch('/api/admin/media', {
    method: 'POST',
    credentials: 'include',        // Required!
    headers: {
      'X-CSRF-Token': getCsrfToken(), // Required!
    },
    body: formData,
  });
  
  if (res.status === 401) {
    // Session expired - redirect to login
    const err = await res.json().catch(() => ({}));
    window.location.href = `/admin/login?session=expired&reason=${encodeURIComponent(err.reason || 'unknown')}`;
    throw new Error('Session expired');
  }
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Upload failed');
  }
  
  return res.json();
}
```

---

## Files Modified

### Backend
1. `src/pages/admin/media.astro` - Added CSRF cookie generation
2. `src/pages/api/admin/media.ts` - Added CSRF validation
3. `src/pages/api/admin/media/[id].ts` - Added CSRF validation  
4. `src/pages/api/admin/media/upload.ts` - Fixed bunny upload (type mismatch)
5. `src/pages/api/admin/media/process-pending.ts` - Added `prerender = false` and CSRF validation

### Frontend
1. `src/components/admin/MediaManager.tsx` - Added credentials and CSRF headers
2. `src/components/admin/MediaSelector.tsx` - Added credentials and CSRF headers

---

## Debugging Auth Issues

If uploads fail with 401/403:

1. **Enable debug logging** in `src/lib/admin-auth.ts`:
   ```typescript
   const DEBUG_AUTH = true;
   ```

2. **Check browser console** for:
   - CSRF token from cookie
   - Response status codes
   - Error messages from server

3. **Check server logs** for:
   - `[verifySessionCookie]` messages
   - `[checkAdminAuth]` messages
   - Cookie header presence
   - Auth failure reasons

4. **Common issues**:
   - Missing `prerender = false` - "No cookie header" errors
   - Missing `credentials: 'include'` - Cookies not sent with request
   - Missing CSRF cookie - 403 errors after successful auth
   - Missing CSRF header - 403 errors

---

## Quick Checklist for New Upload Features

- [ ] API endpoint has `export const prerender = false;`
- [ ] API endpoint validates CSRF token for POST/DELETE/PUT/PATCH
- [ ] API endpoint checks admin auth
- [ ] Admin page generates CSRF token cookie
- [ ] Frontend fetch includes `credentials: 'include'`
- [ ] Frontend fetch includes `X-CSRF-Token` header
- [ ] Frontend handles 401 by redirecting to login

---

## Related Files

- `src/lib/admin-auth.ts` - Session cookie creation/verification
- `src/lib/csrf.ts` - CSRF token generation/validation
- `src/lib/upload-service.ts` - Unified upload service
- `src/lib/bunny.ts` - Bunny.net CDN upload utilities
