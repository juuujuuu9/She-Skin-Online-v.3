# Security Improvements - 2026-02-21

## Summary

Implemented the remaining security checklist items from SECURITY_FIXES.md:
- [x] Input Validation Schema (Zod)
- [x] Content Security Policy (CSP) headers

---

## 1. Input Validation with Zod

### Files Created
- `src/lib/validation.ts` - Comprehensive Zod validation schemas and helpers

### Validation Schemas Implemented

| Schema | Purpose |
|--------|---------|
| `createPostSchema` | Validates POST /api/admin/posts body |
| `updatePostSchema` | Validates PUT /api/admin/posts body |
| `deletePostSchema` | Validates DELETE /api/admin/posts?id= |
| `getPostSchema` | Validates GET /api/admin/posts query params |
| `saveCollaborationSchema` | Validates POST /api/admin/collaborations/save |
| `createWorkSchema` | Ready for works API |
| `updateWorkSchema` | Ready for works API |
| `deleteWorkSchema` | Validates work deletion |
| `restoreWorkSchema` | Validates work restoration |
| `loginSchema` | Validates login credentials |
| `forgotPasswordSchema` | Validates password reset request |
| `resetPasswordSchema` | Validates password reset |
| `cartItemSchema` | Validates cart operations |
| `updateCartSchema` | Validates cart updates |
| `shopPasswordSchema` | Validates shop password |

### Validation Helpers

```typescript
// Validate request body
const bodyValidation = await validateRequest(request, createPostSchema);
if (!bodyValidation.success) return bodyValidation.response;

// Validate query parameters
const queryValidation = validateQuery(url, getPostSchema);
if (!queryValidation.success) return queryValidation.response;

// Validate URL param
const paramValidation = validateParam(params.id, idSchema);
if (!paramValidation.success) return paramValidation.response;
```

### Validation Features
- **Type coercion**: Query params automatically converted to numbers/booleans
- **Error messages**: Human-readable validation errors
- **Security limits**:
  - String lengths capped (e.g., title max 200 chars, content max 50,000)
  - Array lengths limited (e.g., mediaIds max 50 items)
  - Numeric ranges enforced (e.g., year 1900-2100)
  - Slug format enforced (lowercase, hyphens only)
  - URL validation with max length

### API Routes Updated

| Route | Validation Applied |
|-------|-------------------|
| `POST /api/admin/posts` | `createPostSchema` |
| `PUT /api/admin/posts` | `updatePostSchema` |
| `DELETE /api/admin/posts` | `deletePostSchema` (query params) |
| `GET /api/admin/posts` | `getPostSchema` (query params) |
| `POST /api/admin/collaborations/save` | `saveCollaborationSchema` |
| `DELETE /api/admin/works/[id]` | `idSchema` (URL param) |
| `POST /api/admin/works/[id]` | `idSchema` (URL param) |

---

## 2. Content Security Policy (CSP)

### Updated File
- `src/middleware.ts` - Added CSP headers and additional security headers

### CSP Directives

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://*.b-cdn.net https://*.bunnycdn.com;
media-src 'self' https://*.b-cdn.net https://*.bunnycdn.com;
connect-src 'self' https://*.stripe.com https://*.neon.tech;
font-src 'self' data:;
frame-src 'self' https://*.stripe.com;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

### Rationale for Directives

| Directive | Reason |
|-----------|--------|
| `'unsafe-inline'` (script) | Required for Astro's island hydration |
| `'unsafe-eval'` | Required for some React patterns |
| `https://*.b-cdn.net` | Bunny.net CDN for images/audio |
| `https://*.stripe.com` | Stripe payment processing |
| `frame-ancestors 'none'` | Prevents clickjacking |
| `upgrade-insecure-requests` | Forces HTTPS upgrade |

### Additional Security Headers Added

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | (See above) |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=(), payment=(self)...` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

---

## Testing

### Build Test
```bash
npm run build
# ✓ Completed successfully
```

### CSP Header Test
```bash
curl -I http://localhost:4321/admin
# Should see:
# Content-Security-Policy: default-src 'self'; ...
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
```

### Validation Test
```bash
# Invalid request (missing title)
curl -X POST http://localhost:4321/api/admin/posts \
  -H "Content-Type: application/json" \
  -d '{"slug": "test"}'
# → 400 Validation failed: title: Required

# Invalid slug format
curl -X POST http://localhost:4321/api/admin/posts \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "slug": "Invalid_Slug"}'
# → 400 Validation failed: slug: Slug must be lowercase letters...
```

---

## Security Feature Checklist - COMPLETE

- [x] CSRF Protection
- [x] Soft Deletes
- [x] Security Headers (X-Frame, X-XSS, etc.)
- [x] Debug Cleanup
- [x] Rate Limiting
- [x] Audit Logging
- [x] **Input Validation Schema** (Zod)
- [x] **Content Security Policy**

---

## Next Recommendations

1. **Add validation to remaining APIs**:
   - Physical works API
   - Digital works API
   - Audio API
   - Media upload API

2. **CSP Reporting** (optional):
   - Add `report-uri` directive
   - Set up reporting endpoint
   - Monitor for CSP violations

3. **Nonce-based CSP** (future):
   - Replace `'unsafe-inline'` with nonces
   - Requires server-side nonce injection

---

*Security improvements by Gloom, The Dementor Jester* 💀
