/**
 * Admin API — Create, update, get, or delete works
 * GET /api/admin/works?id={id} - Get a single work
 * POST /api/admin/works - Create new work
 * PUT /api/admin/works - Update existing work
 * DELETE /api/admin/works?id={id} - Delete a work
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { checkAdminAuth } from '@lib/admin-auth';
import { validateCsrfToken } from '@lib/csrf';
import { createWork, updateWork, getWorkById, addWorkMedia, updateWorkMedia, deleteWorkMedia, deleteWork } from '@lib/db/queries';
import { z } from 'zod';

// Validation schema
const workSchema = z.object({
  id: z.string().optional(),
  category: z.enum(['physical', 'digital', 'collaborations']),
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  forSale: z.boolean().default(false),
  price: z.string().optional(),
  externalUrl: z.string().url().max(500).optional(),
  mediaIds: z.array(z.string()).optional(),
});

// GET - Fetch a single work by ID
export const GET: APIRoute = async ({ request }) => {
  // Check auth
  const auth = await checkAdminAuth(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get work ID from query params
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return new Response(
      JSON.stringify({ error: 'Work ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const work = await getWorkById(id);
    if (!work) {
      return new Response(
        JSON.stringify({ error: 'Work not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(work),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Get work error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch work', details: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// DELETE - Delete a work
export const DELETE: APIRoute = async ({ request }) => {
  // Check auth
  const auth = await checkAdminAuth(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check CSRF
  if (!validateCsrfToken(request)) {
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get work ID from query params
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return new Response(
      JSON.stringify({ error: 'Work ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Check if work exists
    const existing = await getWorkById(id);
    if (!existing) {
      return new Response(
        JSON.stringify({ error: 'Work not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Delete the work (soft delete)
    await deleteWork(id);

    return new Response(
      JSON.stringify({ success: true, message: 'Work deleted' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Delete work error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to delete work', details: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  // Check auth
  const auth = await checkAdminAuth(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check CSRF
  if (!validateCsrfToken(request)) {
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Parse and validate request body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const validation = workSchema.safeParse(body);
  if (!validation.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: validation.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const data = validation.data;

  try {
    // Create new work
    const workId = await createWork({
      slug: data.slug,
      title: data.title,
      category: data.category,
      description: data.description || null,
      year: data.year || null,
      forSale: data.forSale,
      price: data.price || null,
      externalUrl: data.externalUrl || null,
      published: true,
    });

    // Add media if provided (lookup media by ID from manifest)
    if (data.mediaIds && data.mediaIds.length > 0) {
      // Fetch media manifest to get URLs
      const manifestRes = await fetch(new URL('/data/media-manifest.json', request.url));
      const manifest = await manifestRes.json();
      
      for (let i = 0; i < data.mediaIds.length; i++) {
        const mediaId = data.mediaIds[i];
        const mediaItem = manifest.images?.[mediaId];
        
        if (mediaItem) {
          const imageUrl = mediaItem.variants?.lg?.url || mediaItem.variants?.md?.url || mediaItem.variants?.sm?.url || Object.values(mediaItem.variants || {})[0]?.url;
          if (imageUrl) {
            await addWorkMedia(workId, {
              type: 'image',
              url: imageUrl,
              variants: mediaItem.variants || null,
              blurhash: mediaItem.blurhash || null,
              dominantColor: mediaItem.dominantColor || null,
              width: mediaItem.metadata?.width || null,
              height: mediaItem.metadata?.height || null,
              isPrimary: i === 0, // First image is primary
              sortOrder: i,
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, id: workId, message: 'Work created' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Create work error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create work', details: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const PUT: APIRoute = async ({ request }) => {
  // Check auth
  const auth = await checkAdminAuth(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check CSRF
  if (!validateCsrfToken(request)) {
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Parse and validate request body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const validation = workSchema.safeParse(body);
  if (!validation.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: validation.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const data = validation.data;

  if (!data.id) {
    return new Response(
      JSON.stringify({ error: 'Work ID is required for updates' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Check if work exists
    const existing = await getWorkById(data.id);
    if (!existing) {
      return new Response(
        JSON.stringify({ error: 'Work not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Update work
    await updateWork(data.id, {
      title: data.title,
      description: data.description || null,
      year: data.year || null,
      forSale: data.forSale,
      price: data.price || null,
      externalUrl: data.externalUrl || null,
    });

    // Handle media updates - only if mediaIds is provided and non-empty
    if (data.mediaIds && data.mediaIds.length > 0) {
      // Delete existing media only if we're replacing with new media
      for (const media of existing.media) {
        await deleteWorkMedia(media.id);
      }

      // Add new media from manifest
      const manifestRes = await fetch(new URL('/data/media-manifest.json', request.url));
      const manifest = await manifestRes.json();
      
      for (let i = 0; i < data.mediaIds.length; i++) {
        const mediaId = data.mediaIds[i];
        const mediaItem = manifest.images?.[mediaId];
        
        if (mediaItem) {
          const imageUrl = mediaItem.variants?.lg?.url || mediaItem.variants?.md?.url || mediaItem.variants?.sm?.url || Object.values(mediaItem.variants || {})[0]?.url;
          if (imageUrl) {
            await addWorkMedia(data.id, {
              type: 'image',
              url: imageUrl,
              variants: mediaItem.variants || null,
              blurhash: mediaItem.blurhash || null,
              dominantColor: mediaItem.dominantColor || null,
              width: mediaItem.metadata?.width || null,
              height: mediaItem.metadata?.height || null,
              isPrimary: i === 0,
              sortOrder: i,
            });
          }
        }
      }
    }
    // If mediaIds is undefined or empty, preserve existing media (don't delete)

    return new Response(
      JSON.stringify({ success: true, id: data.id, message: 'Work updated' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Update work error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to update work', details: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
