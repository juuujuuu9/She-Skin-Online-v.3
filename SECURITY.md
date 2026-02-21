# Security Overview

Nucleus Commerce implements defense-in-depth security with multiple layers of protection.

---

## Security Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 7: Input Validation (Zod)                              │
│  └─ Type safety, length limits, format validation             │
├─────────────────────────────────────────────────────────────┤
│  Layer 6: CSRF Protection                                     │
│  └─ Double Submit Cookie pattern                              │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: Rate Limiting                                       │
│  └─ 5 login attempts per 15 minutes                           │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Authentication                                      │
│  └─ Session-based auth with bcrypt                            │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Authorization                                       │
│  └─ Admin-only routes with requireAdminAuth                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Content Security Policy                             │
│  └─ CSP headers prevent XSS                                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Security Headers                                    │
│  └─ X-Frame-Options, X-XSS-Protection, etc.                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Feature Reference

| Feature | File | Description |
|---------|------|-------------|
| **Input Validation** | `src/lib/validation.ts` | Zod schemas for all API inputs |
| **CSRF Protection** | `src/lib/csrf.ts` | Token generation and validation |
| **Rate Limiting** | `src/lib/rate-limit.ts` | In-memory rate limiting |
| **Auth Checks** | `src/lib/admin-auth.ts` | Session validation |
| **Audit Logging** | `src/lib/audit.ts` | All actions logged to DB |
| **Middleware** | `src/middleware.ts` | CSP, CSRF origin check, headers |
| **Soft Deletes** | `src/lib/db/queries.ts` | Recoverable deletion |

---

## Input Validation

All API endpoints validate input using Zod schemas.

### Usage

```typescript
import { validateRequest, createPostSchema } from '@lib/validation';

export const POST: APIRoute = async ({ request }) => {
  const validation = await validateRequest(request, createPostSchema);
  if (!validation.success) {
    return validation.response; // 400 with error details
  }
  const { title, slug, content } = validation.data; // Type-safe!
  // ...
};
```

### Validation Limits

| Field | Limit | Reason |
|-------|-------|--------|
| Title | 200 chars | Prevent abuse |
| Slug | 200 chars, lowercase/hyphens only | URL safety |
| Content | 50,000 chars | Prevent memory issues |
| Media IDs | 50 items | Array length limit |
| Tags | 20 items × 50 chars each | Prevent abuse |
| Year | 1900-2100 | Realistic date range |

---

## CSRF Protection

### How It Works

1. **Token Generation**: Server generates signed CSRF token
2. **Cookie Set**: Token sent as `csrf_token` cookie
3. **Header Required**: State-changing requests must include `X-CSRF-Token` header matching the cookie
4. **Validation**: Server validates signature and match

### Protected Endpoints

All `POST`, `PUT`, `PATCH`, `DELETE` endpoints on `/api/admin/*`

### For Local Development

CSRF origin check validates `Origin` header matches `Host`. For local dev, both should be `localhost:4321`.

---

## Content Security Policy

### CSP Directives

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://*.b-cdn.net;
media-src 'self' https://*.b-cdn.net;
connect-src 'self' https://*.stripe.com;
frame-src 'self' https://*.stripe.com;
frame-ancestors 'none';
```

### Why These Settings?

- `'unsafe-inline'` scripts: Required for Astro island hydration
- `'unsafe-eval'`: Required for React patterns
- `https://*.b-cdn.net`: Bunny.net CDN for media
- `frame-ancestors 'none'`: Prevents clickjacking

---

## Rate Limiting

### Current Limits

| Endpoint | Limit |
|----------|-------|
| Login | 5 per 15 minutes |
| Password Reset | 3 per hour |
| API Mutations | 100 per minute |
| Uploads | 20 per minute |

### Implementation

In-memory with automatic cleanup. For production with multiple servers, use Redis.

---

## Audit Logging

All admin actions are logged to the `audit_logs` table:

- Login/logout attempts
- Content creation/update/deletion
- Media uploads
- Failed auth attempts

### Logged Fields

- User ID and username
- Action type
- Resource type and ID
- IP address
- User agent
- Timestamp
- Success/failure status

---

## Soft Deletes

All content deletions are soft by default:

- Records marked with `deletedAt` timestamp
- Can be restored via API
- Permanent deletion requires explicit flag
- UI shows "Trash" section for deleted items

### API Usage

```bash
# Soft delete (default)
DELETE /api/admin/works/123

# Permanent delete
DELETE /api/admin/works/123?permanent=true

# Restore
POST /api/admin/works/123
```

---

## Security Headers

All responses include:

| Header | Value |
|--------|-------|
| Content-Security-Policy | (See CSP section) |
| X-Content-Type-Options | nosniff |
| X-Frame-Options | DENY |
| X-XSS-Protection | 1; mode=block |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | (Restricts sensitive APIs) |

---

## Security Checklist for Production

- [ ] Change default admin password
- [ ] Set `DEBUG_ADMIN_LOGIN=0` in `.env`
- [ ] Use strong `ADMIN_SECRET` (32+ random chars)
- [ ] Enable HTTPS (automatic on Vercel)
- [ ] Review CSP violations in browser console
- [ ] Monitor audit logs regularly
- [ ] Consider Redis for rate limiting (multi-server)
- [ ] Set up CSP reporting endpoint
- [ ] Regular dependency updates: `npm audit fix`

---

## Documentation

- `SECURITY_FIXES.md` - Initial security audit and fixes
- `SECURITY_IMPROVEMENTS.md` - Zod validation and CSP
- `src/lib/validation.ts` - Validation schemas
- `src/middleware.ts` - Security middleware
- `src/lib/audit.ts` - Audit logging

---

## Reporting Security Issues

If you discover a security vulnerability, please:
1. Do not open a public issue
2. Contact the maintainer directly
3. Allow time for a fix before disclosure

---

*Stay safe out there* 🔒
