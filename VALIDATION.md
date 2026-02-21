# Input Validation Documentation

Comprehensive input validation using Zod for type safety and security.

---

## Overview

All API endpoints validate input using Zod schemas defined in `src/lib/validation.ts`. This ensures:

- **Type Safety**: Runtime type checking
- **Security**: Length limits, format validation
- **Developer Experience**: Clear error messages
- **Maintainability**: Centralized validation logic

---

## Quick Reference

### Validate Request Body

```typescript
import { validateRequest, createPostSchema } from '@lib/validation';

export const POST: APIRoute = async ({ request }) => {
  const validation = await validateRequest(request, createPostSchema);
  if (!validation.success) {
    return validation.response; // Returns 400 with error details
  }

  // validation.data is fully typed
  const { title, slug, content } = validation.data;
  // ...
};
```

### Validate Query Parameters

```typescript
import { validateQuery, getPostSchema } from '@lib/validation';

export const GET: APIRoute = async ({ url }) => {
  const validation = validateQuery(url, getPostSchema);
  if (!validation.success) {
    return validation.response;
  }

  const { limit, offset, status } = validation.data;
  // ...
};
```

### Validate URL Parameter

```typescript
import { validateParam, idSchema } from '@lib/validation';

export const DELETE: APIRoute = async ({ params }) => {
  const validation = validateParam(params.id, idSchema);
  if (!validation.success) {
    return validation.response;
  }

  const id = validation.data;
  // ...
};
```

---

## Available Schemas

### Posts API

| Schema | Purpose | Usage |
|--------|---------|-------|
| `createPostSchema` | POST /api/admin/posts | Create new post |
| `updatePostSchema` | PUT /api/admin/posts | Update existing post |
| `deletePostSchema` | DELETE /api/admin/posts | Delete post |
| `getPostSchema` | GET /api/admin/posts | List/filter posts |

**createPostSchema fields:**
- `title` (required, 1-200 chars)
- `slug` (optional, auto-generated from title)
- `content` (optional, max 50,000 chars)
- `excerpt` (optional, max 1,000 chars)
- `postType` (enum: 'page', 'post', 'product')
- `status` (enum: 'draft', 'published', 'archived')
- `metaTitle` (optional, max 200 chars)
- `metaDescription` (optional, max 500 chars)
- `ogImage` (optional, valid URL, max 500 chars)
- `parentId` (optional, valid ID format)
- `meta` (record of strings, max 50 entries)
- `mediaIds` (array of IDs, max 50 items)

### Works/Collaborations API

| Schema | Purpose | Usage |
|--------|---------|-------|
| `saveCollaborationSchema` | POST /api/admin/collaborations/save | Save collaboration |
| `createWorkSchema` | Future use | Create work |
| `updateWorkSchema` | Future use | Update work |
| `deleteWorkSchema` | DELETE /api/admin/works/[id] | Delete work |
| `restoreWorkSchema` | POST /api/admin/works/[id] | Restore work |

### Auth API

| Schema | Purpose | Usage |
|--------|---------|-------|
| `loginSchema` | POST /admin/login | Admin login |
| `forgotPasswordSchema` | POST /api/admin/forgot-password | Request reset |
| `resetPasswordSchema` | POST /api/admin/reset-password | Reset password |

### Shop/Cart API

| Schema | Purpose | Usage |
|--------|---------|-------|
| `cartItemSchema` | Cart operations | Cart item validation |
| `updateCartSchema` | POST /api/cart | Update cart |
| `shopPasswordSchema` | POST /api/shop/password | Shop password |

### Common Schemas

| Schema | Description |
|--------|-------------|
| `idSchema` | Generic ID (1-64 chars, alphanumeric + _-) |
| `slugSchema` | URL slug (lowercase, hyphens only) |
| `uuidSchema` | UUID v4 format |

---

## Validation Rules

### String Fields

| Field | Min | Max | Format |
|-------|-----|-----|--------|
| Title | 1 | 200 | Any string |
| Slug | 1 | 200 | `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| Content | 0 | 50,000 | Any string |
| Excerpt | 0 | 1,000 | Any string |
| Meta Title | 0 | 200 | Any string |
| Meta Description | 0 | 500 | Any string |
| URL | 1 | 500 | Valid URL |
| ID | 1 | 64 | `^[a-zA-Z0-9_-]+$` |

### Array Fields

| Field | Max Items | Item Limits |
|-------|-----------|-------------|
| mediaIds | 50 | Valid ID format |
| tags | 20 | Max 50 chars each |
| media | 20 | See workMediaSchema |

### Numeric Fields

| Field | Min | Max | Type |
|-------|-----|-----|------|
| year | 1900 | 2100 | integer |
| quantity | 1 | 99 | integer |
| price | 0 | unlimited | integer (cents) |
| limit | 1 | 100 | integer |
| offset | 0 | unlimited | integer |

---

## Error Messages

Validation errors return a 400 response with detailed messages:

```json
{
  "error": "Validation failed",
  "details": [
    "title: Required",
    "slug: Slug must be lowercase letters, numbers, and hyphens only",
    "content: String must contain at most 50000 character(s)"
  ]
}
```

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Required` | Missing required field | Provide the field |
| `String must contain at most X character(s)` | Too long | Shorten the input |
| `Invalid url` | Invalid URL format | Use valid URL |
| `Slug must be lowercase...` | Invalid slug format | Use lowercase, hyphens only |
| `Expected array, received object` | Wrong type | Send array |

---

## Adding New Schemas

### 1. Define the Schema

```typescript
// src/lib/validation.ts

export const myFeatureSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(200),
  count: z.number().int().min(0).max(1000),
  tags: z.array(z.string().max(50)).max(10),
});
```

### 2. Use in API Route

```typescript
// src/pages/api/my-feature.ts

import { validateRequest, myFeatureSchema } from '@lib/validation';

export const POST: APIRoute = async ({ request }) => {
  const validation = await validateRequest(request, myFeatureSchema);
  if (!validation.success) {
    return validation.response;
  }

  const { name, email, count, tags } = validation.data;
  // ... handle request
};
```

### 3. Export Type (Optional)

```typescript
// For use in other files
export type MyFeatureInput = z.infer<typeof myFeatureSchema>;
```

---

## Helper Functions

### `validate<T>(schema, data)`

Low-level validation for any data.

```typescript
import { validate, slugSchema } from '@lib/validation';

const result = validate(slugSchema, "my-slug");
if (result.success) {
  console.log(result.data); // "my-slug"
} else {
  console.log(result.errors); // ["..."]
}
```

### `validateRequest<T>(request, schema)`

Validates JSON request body.

```typescript
const result = await validateRequest(request, mySchema);
// Returns: { success: true, data: T } | { success: false, errors: string[], response: Response }
```

### `validateQuery<T>(url, schema)`

Validates URL query parameters.

```typescript
const result = validateQuery(url, myQuerySchema);
// Automatically converts strings to numbers/booleans
```

### `validateParam<T>(param, schema)`

Validates a single parameter (e.g., from Astro params).

```typescript
const result = validateParam(params.id, idSchema);
```

---

## Best Practices

1. **Always validate inputs** - Never trust client data
2. **Use specific schemas** - Don't reuse schemas for different purposes
3. **Set reasonable limits** - Prevent abuse with max lengths
4. **Handle validation errors** - Return 400 with clear messages
5. **Type inference** - Use `z.infer<typeof schema>` for TypeScript types

---

## Testing Validation

```bash
# Test valid input
curl -X POST http://localhost:4321/api/admin/posts \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ..." \
  -d '{"title": "Test Post", "slug": "test-post"}'

# Test invalid slug
curl -X POST http://localhost:4321/api/admin/posts \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ..." \
  -d '{"title": "Test", "slug": "Invalid_Slug"}'
# → 400: slug: Slug must be lowercase...

# Test missing required
curl -X POST http://localhost:4321/api/admin/posts \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ..." \
  -d '{"slug": "test"}'
# → 400: title: Required
```

---

*Validate everything, trust nothing* ✅
