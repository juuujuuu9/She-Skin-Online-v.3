# Security Fixes Applied - 2026-02-20

## Summary

Fixed critical security vulnerabilities in the sheskin admin panel.

| Issue | Severity | Status |
|-------|----------|--------|
| CSRF Protection Missing | 🔴 CRITICAL | ✅ FIXED |
| Hard Deletes (No Recovery) | 🟠 HIGH | ✅ FIXED |
| Missing Security Middleware | 🟠 HIGH | ✅ FIXED |
| DEBUG_AUTH Enabled | 🟡 MEDIUM | ✅ FIXED |

---

## Changes Made

### 1. Created CSRF Protection System

**Files Created:**
- `src/lib/csrf.ts` - CSRF token generation and validation utilities

**Implementation:**
- Uses Double Submit Cookie pattern
- Tokens signed with ADMIN_SECRET
- 24-hour validity (same as session)
- Header name: `X-CSRF-Token`
- Cookie name: `csrf_token`

**Endpoints Protected:**
- `POST /api/admin/collaborations/save`
- `DELETE /api/admin/collaborations/delete`
- `POST /api/admin/collaborations/restore` (new)
- `DELETE /api/admin/works/[id]`
- `POST /api/admin/works/[id]/restore` (new)
- `POST /api/admin/media/upload`

### 2. Created Security Middleware

**Files Created:**
- `src/middleware.ts` - Astro middleware with security features

**Features Added:**
- CSRF origin validation (blocks cross-origin state-changing requests)
- Security headers on all responses:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`

### 3. Implemented Soft Deletes

**Files Modified:**
- `src/lib/db/queries.ts` - Added soft delete functions

**Functions Added:**
- `softDeleteWork(id, deletedBy)` - Marks work as deleted
- `restoreWork(id)` - Restores soft-deleted work
- `hardDeleteWork(id)` - Permanently deletes (use with caution)
- `getAllWorks(includeDeleted)` - List works with option to include deleted

**API Changes:**
- `DELETE /api/admin/collaborations/delete` - Now soft deletes by default
- `DELETE /api/admin/collaborations/delete?permanent=true` - Hard delete (requires soft delete first)
- `POST /api/admin/collaborations/delete` - Restore soft-deleted work
- `DELETE /api/admin/works/[id]` - Now soft deletes by default
- `DELETE /api/admin/works/[id]?permanent=true` - Hard delete
- `POST /api/admin/works/[id]` - Restore soft-deleted work

### 4. Disabled DEBUG_AUTH

**Files Modified:**
- `src/lib/admin-auth.ts`

**Changes:**
- Set `DEBUG_AUTH = false` (was `true`)
- Removed duplicate DEBUG_AUTH declaration
- Prevents sensitive auth info from being logged

### 5. Updated Admin Dashboard

**Files Modified:**
- `src/pages/admin/index.astro`

**Changes:**
- Generate and set CSRF cookie on page load
- Inject CSRF token into `window.CSRF_TOKEN`
- Added CSRF token to upload requests
- Removed verbose debug logging

---

## Testing

### CSRF Protection Test
```bash
# Should fail (no CSRF token)
curl -X DELETE http://localhost:4321/api/admin/collaborations/delete \
  -H "Cookie: admin_session=..." \
  -d '{"id": "test"}'
# → 403 Invalid CSRF token

# Should succeed (with CSRF token)
curl -X DELETE http://localhost:4321/api/admin/collaborations/delete \
  -H "Cookie: admin_session=...; csrf_token=..." \
  -H "X-CSRF-Token: ..." \
  -d '{"id": "test"}'
# → 200 Moved to trash
```

### Soft Delete Test
```bash
# Soft delete (default)
curl -X DELETE http://localhost:4321/api/admin/works/123 \
  -H "Cookie: ..." \
  -H "X-CSRF-Token: ..."
# → "Moved to trash"

# Try hard delete without soft delete first
curl -X DELETE "http://localhost:4321/api/admin/works/123?permanent=true" \
  -H "Cookie: ..." \
  -H "X-CSRF-Token: ..."
# → 400 "Must be soft-deleted first"

# Restore
curl -X POST http://localhost:4321/api/admin/works/123 \
  -H "Cookie: ..." \
  -H "X-CSRF-Token: ..."
# → "Restored"
```

### Security Headers Test
```bash
curl -I http://localhost:4321/admin
# Should see:
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# X-XSS-Protection: 1; mode=block
```

---

## Migration Steps

1. **Pull changes:**
   ```bash
   git pull origin main
   ```

2. **Install dependencies** (if any):
   ```bash
   npm install
   ```

3. **Restart dev server:**
   ```bash
   npm run dev
   ```

4. **Test admin functionality:**
   - Login to admin
   - Try uploading media
   - Try deleting a work (should soft delete)
   - Try creating/editing collaborations

---

## Rollback

If issues occur:
```bash
git revert HEAD
npm run dev
```

---

## Security Impact

| Threat | Before | After |
|--------|--------|-------|
| CSRF Attack | ❌ Vulnerable | ✅ Protected |
| Accidental Data Loss | ❌ Permanent | ✅ Recoverable |
| Clickjacking | ❌ No protection | ✅ X-Frame-Options |
| XSS | ❌ Basic | ✅ Enhanced headers |
| Info Disclosure | ❌ Debug logs | ✅ Minimal logs |

---

## Next Steps (Future Improvements)

1. **Rate Limiting** - Add to login and API endpoints
2. **Audit Logging** - Track all admin actions
3. **Input Validation** - Schema validation on all inputs
4. **Content Security Policy** - Add CSP headers

---

*Security fixes by Gloom, The Dementor Jester* 💀
