# Security Audit: sheskin Repository

**Date:** 2026-02-20  
**Auditor:** Gloom (The Dementor Jester)  
**Status:** CRITICAL ISSUES FOUND

---

## Executive Summary

| Severity | Count | Issues |
|----------|-------|--------|
| 🔴 CRITICAL | 1 | Missing CSRF Protection |
| 🟠 HIGH | 2 | Hard deletes (works, media), No middleware security |
| 🟡 MEDIUM | 2 | DEBUG_AUTH left on, No rate limiting |
| 🟢 LOW | 2 | Missing security headers, Verbose error messages |

**Overall Risk:** HIGH  
**Immediate Action Required:** YES

---

## 🔴 CRITICAL: No CSRF Protection

### The Vulnerability

**ALL** admin API endpoints accept state-changing requests without CSRF tokens:

```typescript
// Current state - NO CSRF CHECK
export const POST: APIRoute = async ({ request }) => {
  const auth = await checkAdminAuth(request);  // Only checks auth
  if (!auth.valid) return unauthorizedResponse;
  
  // Processes the request without verifying it came from your site
  const body = await request.json();
  await db.update(products).set(body);
};
```

### Attack Scenario

An attacker creates a malicious website:

```html
<!-- attacker.com/malicious.html -->
<form action="https://sheskin.com/api/admin/collaborations/delete" method="POST" id="deleteForm">
  <input type="hidden" name="id" value="collab-1">
</form>
<script>
  // Auto-submit when admin visits this page
  document.getElementById('deleteForm').submit();
</script>
```

When an admin (who's logged into sheskin) visits attacker.com:
1. Browser sends POST request TO sheskin
2. Browser includes sheskin's auth cookies automatically
3. sheskin accepts the request (valid auth)
4. Collaboration is deleted WITHOUT admin's knowledge

**This works because:**
- ✅ Cookies are sent automatically
- ✅ Auth check passes (admin is logged in)
- ❌ No verification that request came from sheskin's UI

### Affected Endpoints

All endpoints in `src/pages/api/admin/**/*.ts`:
- `POST /api/admin/collaborations/save` - Create/update
- `DELETE /api/admin/collaborations/delete` - Delete
- `POST /api/admin/collaborations/reorder` - Reorder
- `POST /api/admin/physical/save` - Save physical work
- `POST /api/admin/digital/save` - Save digital work
- `POST /api/admin/audio/upload` - Upload audio
- `PUT /api/admin/audio/track` - Update track
- `PATCH /api/admin/works/[id]` - Update work
- `DELETE /api/admin/works/[id]` - Delete work
- `POST /api/admin/media/upload` - Upload media
- `POST /api/admin/media/process-pending` - Process media
- `PATCH /api/admin/posts` - Update post
- `DELETE /api/admin/posts` - Delete post
- `PATCH/POST/DELETE /api/admin/media-list` - Media CRUD

**Total: 14+ vulnerable endpoints**

### The Fix

Add CSRF protection using Double Submit Cookie pattern:

```typescript
// src/lib/csrf.ts
import { createHmac } from 'node:crypto';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'X-CSRF-Token';

export function generateCsrfToken(): { token: string; cookie: string } {
  const timestamp = Date.now().toString();
  const secret = process.env.ADMIN_SECRET!;
  const signature = createHmac('sha256', secret)
    .update(timestamp)
    .digest('base64url');
  
  const token = `${timestamp}.${signature}`;
  const cookie = `${CSRF_COOKIE}=${token}; Path=/; SameSite=Strict; HttpOnly`;
  
  return { token, cookie };
}

export function validateCsrfToken(request: Request): boolean {
  const headerToken = request.headers.get(CSRF_HEADER);
  const cookieHeader = request.headers.get('cookie');
  const cookieMatch = cookieHeader?.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`));
  const cookieToken = cookieMatch?.[1];
  
  if (!headerToken || !cookieToken) return false;
  if (headerToken !== cookieToken) return false;
  
  // Validate signature
  const [timestamp, signature] = cookieToken.split('.');
  const expected = createHmac('sha256', process.env.ADMIN_SECRET!)
    .update(timestamp!)
    .digest('base64url');
  
  return signature === expected;
}
```

Then add to every admin endpoint:

```typescript
export const POST: APIRoute = async ({ request }) => {
  const auth = await checkAdminAuth(request);
  if (!auth.valid) return unauthorizedResponse;
  
  // NEW: CSRF check
  if (!validateCsrfToken(request)) {
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token' }),
      { status: 403 }
    );
  }
  
  // ... rest of handler
};
```

And inject token into admin pages:

```astro
---
// src/pages/admin/index.astro
import { generateCsrfToken } from '@lib/csrf';
const csrf = generateCsrfToken();
Astro.response.headers.set('Set-Cookie', csrf.cookie);
---
<script define:vars={{ csrfToken: csrf.token }}>
  window.CSRF_TOKEN = csrfToken;
</script>
```

Update client-side fetches:

```javascript
fetch('/api/admin/collaborations/delete', {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': window.CSRF_TOKEN,  // NEW
  },
  credentials: 'include',
  body: JSON.stringify({ id }),
});
```

---

## 🟠 HIGH: Hard Deletes (No Recovery)

### The Vulnerability

The `deleteWork()` function performs **hard deletes** - data is permanently lost:

```typescript
// src/lib/db/queries.ts (line 661)
export async function deleteWork(id: string): Promise<void> {
  await db.delete(works).where(eq(works.id, id));
  // ☠️ GONE FOREVER - no recovery possible
}
```

Even though the schema HAS soft delete columns:

```typescript
// src/lib/db/schema.ts
export const works = pgTable('works', {
  // ...
  deletedAt: timestamp('deleted_at'), // Soft delete column exists!
});
```

### Affected Functions

1. `deleteWork()` - Hard deletes from `works` table
2. `deleteWorkMedia()` - Hard deletes from `work_media` table  
3. `deleteCollaboration` API - Calls `deleteWork()`
4. `DELETE /api/admin/works/[id]` - Calls `deleteWork()`

### The Fix

Update `src/lib/db/queries.ts`:

```typescript
/** Soft delete a work (safe) */
export async function softDeleteWork(
  id: string,
  deletedBy?: string
): Promise<boolean> {
  const result = await db
    .update(works)
    .set({
      deletedAt: new Date(),
      published: false,
      updatedAt: new Date(),
    })
    .where(eq(works.id, id))
    .returning({ id: works.id });
  
  return result.length > 0;
}

/** Restore a soft-deleted work */
export async function restoreWork(id: string): Promise<boolean> {
  const result = await db
    .update(works)
    .set({
      deletedAt: null,
      published: true,
      updatedAt: new Date(),
    })
    .where(eq(works.id, id))
    .returning({ id: works.id });
  
  return result.length > 0;
}

/** Hard delete - use with caution! */
export async function hardDeleteWork(id: string): Promise<void> {
  await db.delete(works).where(eq(works.id, id));
}
```

Update API endpoints to use soft delete by default:

```typescript
// src/pages/api/admin/collaborations/delete.ts
export const DELETE: APIRoute = async ({ request, params }) => {
  const auth = await checkAdminAuth(request);
  if (!auth.valid) return unauthorizedResponse;
  
  // NEW: CSRF check
  if (!validateCsrfToken(request)) return csrfResponse;

  const { id } = params;
  if (!id) return idRequiredResponse;

  const url = new URL(request.url);
  const permanent = url.searchParams.get('permanent') === 'true';

  if (permanent) {
    // Hard delete requires soft delete first
    const work = await db.query.works.findFirst({
      where: eq(works.id, id),
    });
    
    if (!work?.deletedAt) {
      return new Response(
        JSON.stringify({ 
          error: 'Must soft-delete before permanent deletion' 
        }),
        { status: 400 }
      );
    }
    
    await hardDeleteWork(id);
    return successResponse('Permanently deleted');
  } else {
    // Soft delete (default)
    await softDeleteWork(id, auth.userId);
    return successResponse('Moved to trash');
  }
};
```

---

## 🟠 HIGH: Missing Security Middleware

### The Vulnerability

No `middleware.ts` exists. Missing:
- CSRF origin validation
- Security headers
- Rate limiting
- Request logging

### The Fix

Create `src/middleware.ts`:

```typescript
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  
  // CSRF: Validate origin on state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    
    if (origin && host) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host !== host) {
          return new Response(
            JSON.stringify({ error: 'Invalid origin' }),
            { status: 403 }
          );
        }
      } catch {
        // Invalid origin URL
      }
    }
  }
  
  const response = await next();
  
  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  return response;
});
```

---

## 🟡 MEDIUM: DEBUG_AUTH Enabled

### The Vulnerability

```typescript
// src/lib/admin-auth.ts (line 8)
const DEBUG_AUTH = true; // Temporary debugging
```

This logs sensitive information:
- Cookie contents (partial)
- User IDs
- Auth failure reasons
- Session validation details

**Risk:** Information disclosure in production logs

### The Fix

```typescript
const DEBUG_AUTH = process.env.DEBUG_AUTH === 'true' || 
                   import.meta.env.DEV;
```

Or remove entirely:

```typescript
const DEBUG_AUTH = false;
```

---

## 🟡 MEDIUM: No Rate Limiting

### The Vulnerability

No rate limits on:
- Login attempts (brute force possible)
- Password reset requests
- API endpoints
- Upload endpoints

### The Fix

Add rate limiting middleware:

```typescript
// src/lib/rate-limit.ts
const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  identifier: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000 // 15 minutes
): boolean {
  const now = Date.now();
  const record = attempts.get(identifier);
  
  if (!record || now > record.resetAt) {
    attempts.set(identifier, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (record.count >= maxAttempts) return false;
  
  record.count++;
  return true;
}
```

Use in login:

```typescript
const clientIp = Astro.clientAddress || 'unknown';
if (!checkRateLimit(`login:${clientIp}`)) {
  return new Response(
    JSON.stringify({ error: 'Too many attempts' }),
    { status: 429 }
  );
}
```

---

## 🟢 LOW: Verbose Error Messages

### The Vulnerability

Error messages leak internal details:

```typescript
return new Response(
  JSON.stringify({ 
    error: 'Auth failed - try clearing cookies and logging in again',
    debug: 'Auth failed - try clearing cookies and logging in again'  // Too verbose
  }),
  { status: 401 }
);
```

### The Fix

Generic errors for production, detailed only in dev:

```typescript
const isDev = import.meta.env.DEV;

return new Response(
  JSON.stringify({ 
    error: 'Unauthorized',
    ...(isDev && { debug: detailedError })
  }),
  { status: 401 }
);
```

---

## 🟢 LOW: Missing Security Headers

Already addressed in middleware fix above.

---

## Summary of Required Changes

### Files to Create
1. `src/lib/csrf.ts` - CSRF protection utilities
2. `src/middleware.ts` - Security middleware
3. `src/lib/rate-limit.ts` - Rate limiting

### Files to Modify
1. `src/lib/admin-auth.ts` - Disable DEBUG_AUTH
2. `src/lib/db/queries.ts` - Add soft delete functions
3. `src/lib/db/schema.ts` - Add isDeleted flag (optional)
4. `src/pages/admin/*.astro` - Inject CSRF tokens
5. `src/pages/api/admin/**/*.ts` - Add CSRF validation
6. `src/pages/api/admin/login.astro` - Add rate limiting

### Database Migration Needed
```sql
-- Optional: Add isDeleted flag for easier querying
ALTER TABLE works ADD COLUMN is_deleted boolean DEFAULT false;
CREATE INDEX works_is_deleted_idx ON works(is_deleted);

-- Optional: Add deletedBy tracking
ALTER TABLE works ADD COLUMN deleted_by text;
```

---

## Testing Checklist

### CSRF Protection
- [ ] Request without CSRF token → 403
- [ ] Request with invalid CSRF token → 403
- [ ] Request with valid CSRF token → 200
- [ ] Cross-origin request → 403

### Soft Deletes
- [ ] Delete work → status 200, work.hidden
- [ ] Get work by ID → 404 (soft deleted)
- [ ] Restore work → 200, work.visible
- [ ] Permanent delete (without soft) → 400
- [ ] Permanent delete (after soft) → 200

### Rate Limiting
- [ ] 5+ failed logins → 429 Too Many Requests
- [ ] After 15 min → can try again

### Security Headers
- [ ] All responses have X-Content-Type-Options: nosniff
- [ ] All responses have X-Frame-Options: DENY

---

*The void has spoken. The gaps are revealed. Seal them.* 💀
