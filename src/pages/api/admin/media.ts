/**
 * Unified Media API - Single endpoint for all media operations
 * 
 * POST   /api/admin/media       - Upload new media file
 * GET    /api/admin/media       - List media (with filters)
 * GET    /api/admin/media?id=.. - Get single media item
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { validateCsrfToken } from '@lib/csrf';
import { uploadMedia, listMedia, getMedia } from '@lib/upload-service';

// POST: Upload new media
export const POST: APIRoute = async ({ request, locals }) => {
  // Auth is handled by Clerk middleware
  const auth = locals.auth();
  if (!auth.userId) {
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

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const altText = (formData.get('altText') as string) || '';

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Upload using the unified service
    const result = await uploadMedia(file, {
      altText,
      processImage: true, // Always process images to WebP variants
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error || 'Upload failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        media: result.media,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[media API] POST error:', error);
    return new Response(
      JSON.stringify({ error: 'Upload failed', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// GET: List media or get single item
export const GET: APIRoute = async ({ request, url, locals }) => {
  // Auth is handled by Clerk middleware
  const auth = locals.auth();
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = url.searchParams.get('id');

  try {
    // Get single media item
    if (id) {
      const mediaItem = await getMedia(id);
      if (!mediaItem) {
        return new Response(
          JSON.stringify({ error: 'Media not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ media: mediaItem }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // List media with filters
    const type = url.searchParams.get('type') as 'image' | 'audio' | 'video' | 'document' | undefined;
    const search = url.searchParams.get('search') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const unusedOnly = url.searchParams.get('unused') === 'true';

    const result = await listMedia({
      type,
      search,
      limit,
      offset,
      unusedOnly,
    });

    return new Response(
      JSON.stringify({
        media: result.media,
        pagination: {
          total: result.total,
          limit,
          offset,
          hasMore: result.hasMore,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[media API] GET error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch media', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
