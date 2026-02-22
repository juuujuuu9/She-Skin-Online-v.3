/**
 * Single Media Item API - Operations on individual media files
 * 
 * DELETE /api/admin/media/[id] - Delete media (checks ref count)
 * PATCH  /api/admin/media/[id] - Update media metadata
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdminAuth } from '@lib/admin-auth';
import { validateCsrfToken } from '@lib/csrf';
import { deleteMedia, updateMedia, getMedia } from '@lib/upload-service';

// DELETE: Delete media item
export const DELETE: APIRoute = async ({ request, params }) => {
  // Check auth
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  // Check CSRF
  if (!validateCsrfToken(request)) {
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { id } = params;
  if (!id) {
    return new Response(
      JSON.stringify({ error: 'Media ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Check for force delete param
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === 'true';

    const result = await deleteMedia(id, force);

    if (!result.success) {
      // If media is in use, return 409 Conflict
      if (result.error?.includes('in use')) {
        const mediaItem = await getMedia(id);
        return new Response(
          JSON.stringify({
            error: result.error,
            refCount: mediaItem?.refCount || 0,
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Media deleted' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[media/[id] API] DELETE error:', error);
    return new Response(
      JSON.stringify({ error: 'Delete failed', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// PATCH: Update media metadata
export const PATCH: APIRoute = async ({ request, params }) => {
  // Check auth
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  const { id } = params;
  if (!id) {
    return new Response(
      JSON.stringify({ error: 'Media ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { altText } = body;

    const result = await updateMedia(id, { altText });

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[media/[id] API] PATCH error:', error);
    return new Response(
      JSON.stringify({ error: 'Update failed', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
