/**
 * Input Validation Schemas
 *
 * Zod schemas for API input validation.
 * Used to sanitize and validate all admin API requests.
 */

import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

export const idSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);

export const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens only');

export const uuidSchema = z.string().uuid();

// Media variant schema
const mediaVariantSchema = z.object({
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const mediaVariantsSchema = z.record(z.record(mediaVariantSchema)).optional();

// Image metadata schema
const imageSchema = z.object({
  src: z.string().url().max(500),
  alt: z.string().max(500).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  blurhash: z.string().max(100).optional(),
  dominantColor: z.string().max(50).optional(),
  variants: mediaVariantsSchema,
});

// ============================================================================
// Posts API Schemas
// ============================================================================

export const postStatusSchema = z.enum(['draft', 'published', 'archived']);
export const postTypeSchema = z.enum(['page', 'post', 'product']);

export const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  content: z.string().max(50000).default(''),
  excerpt: z.string().max(1000).default(''),
  postType: postTypeSchema.default('page'),
  status: postStatusSchema.default('draft'),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
  ogImage: z.string().url().max(500).optional(),
  parentId: idSchema.optional(),
  meta: z.record(z.string()).default({}),
  mediaIds: z.array(idSchema).max(50).default([]),
});

export const updatePostSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(200).optional(),
  slug: slugSchema.optional(),
  content: z.string().max(50000).optional(),
  excerpt: z.string().max(1000).optional(),
  status: postStatusSchema.optional(),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
  ogImage: z.string().url().max(500).optional(),
  parentId: idSchema.optional(),
  meta: z.record(z.string()).optional(),
  mediaIds: z.array(idSchema).max(50).optional(),
  changeMessage: z.string().max(500).optional(),
});

export const getPostSchema = z.object({
  id: idSchema.optional(),
  slug: slugSchema.optional(),
  type: postTypeSchema.optional(),
  status: postStatusSchema.optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const deletePostSchema = z.object({
  id: idSchema,
});

// ============================================================================
// Works/Collaborations API Schemas
// ============================================================================

export const workCategorySchema = z.enum(['physical', 'digital', 'audio', 'collaborations']);

const workMediaSchema = z.object({
  type: z.enum(['image', 'audio', 'video']),
  url: z.string().url().max(500),
  variants: mediaVariantsSchema,
  blurhash: z.string().max(100).optional(),
  dominantColor: z.string().max(50).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  isPrimary: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
});

export const createWorkSchema = z.object({
  item: z.object({
    slug: slugSchema,
    title: z.string().min(1).max(200),
    category: workCategorySchema,
    forSale: z.boolean().default(false),
    price: z.number().int().min(0).optional(),
    externalUrl: z.string().url().max(500).optional(),
    href: z.string().url().max(500).optional(),
    description: z.string().max(5000).optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    tags: z.array(z.string().max(50)).max(20).default([]),
    image: imageSchema.optional(),
    media: z.array(workMediaSchema).max(20).optional(),
  }),
  isNew: z.boolean().default(true),
});

export const updateWorkSchema = z.object({
  item: z.object({
    slug: slugSchema,
    title: z.string().min(1).max(200).optional(),
    forSale: z.boolean().optional(),
    price: z.number().int().min(0).optional(),
    externalUrl: z.string().url().max(500).optional(),
    href: z.string().url().max(500).optional(),
    description: z.string().max(5000).optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    image: imageSchema.optional(),
  }),
  isNew: z.literal(false),
});

export const saveCollaborationSchema = z.object({
  item: z.object({
    slug: slugSchema,
    title: z.string().min(1).max(200),
    forSale: z.boolean().default(false),
    externalUrl: z.string().url().max(500).optional(),
    href: z.string().url().max(500).optional(),
    image: imageSchema.optional(),
  }),
  isNew: z.boolean(),
});

export const deleteWorkSchema = z.object({
  id: idSchema,
  permanent: z.boolean().default(false),
});

export const restoreWorkSchema = z.object({
  id: idSchema,
});

// ============================================================================
// Auth API Schemas
// ============================================================================

export const loginSchema = z.object({
  username: z.string().min(1).max(100).optional(),
  password: z.string().min(1).max(100),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(200).optional(),
  username: z.string().max(100).optional(),
});

export const resetPasswordSchema = z.object({
  token: idSchema,
  newPassword: z.string().min(8).max(100),
});

// ============================================================================
// Media API Schemas
// ============================================================================

export const uploadMediaSchema = z.object({
  file: z.instanceof(File),
});

export const listMediaSchema = z.object({
  type: z.enum(['image', 'audio', 'video', 'all']).default('all'),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  search: z.string().max(200).optional(),
});

// ============================================================================
// Cart API Schemas
// ============================================================================

export const cartItemSchema = z.object({
  productId: idSchema,
  variantId: idSchema.optional(),
  quantity: z.number().int().min(1).max(99),
});

export const updateCartSchema = z.object({
  items: z.array(cartItemSchema).max(50),
});

// ============================================================================
// Shop Password API Schemas
// ============================================================================

export const shopPasswordSchema = z.object({
  password: z.string().min(1).max(100),
});

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate data against a Zod schema
 * Returns { success: true, data: T } or { success: false, errors: string[] }
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
  return { success: false, errors };
}

/**
 * Validate request body from JSON
 */
export async function validateRequest<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; errors: string[]; response: Response }> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      errors: ['Invalid JSON body'],
      response: new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  const result = validate(schema, body);

  if (!result.success) {
    return {
      success: false,
      errors: result.errors,
      response: new Response(
        JSON.stringify({ error: 'Validation failed', details: result.errors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  return result;
}

/**
 * Validate query parameters
 */
export function validateQuery<T>(
  url: URL,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; errors: string[]; response: Response } {
  // Convert URLSearchParams to plain object
  const params: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams) {
    // Handle array values
    const existing = params[key];
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        params[key] = [existing, value];
      }
    } else {
      params[key] = value;
    }
  }

  const result = validate(schema, params);

  if (!result.success) {
    return {
      success: false,
      errors: result.errors,
      response: new Response(
        JSON.stringify({ error: 'Invalid query parameters', details: result.errors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  return result;
}

/**
 * Validate URL parameter (from Astro params)
 */
export function validateParam<T>(
  param: unknown,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; errors: string[]; response: Response } {
  const result = validate(schema, param);

  if (!result.success) {
    return {
      success: false,
      errors: result.errors,
      response: new Response(
        JSON.stringify({ error: 'Invalid URL parameter', details: result.errors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  return result;
}
