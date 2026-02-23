/**
 * Bulk Media Delete API
 * 
 * DELETE /api/admin/media/bulk-delete - Delete multiple media items
 * Body: { ids: string[], force?: boolean }
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { validateCsrfToken } from '@lib/csrf';
import { deleteMedia, getMedia } from '@lib/upload-service';

export const DELETE: APIRoute = async ({ request, locals }) => {
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
    const body = await request.json();
    const { ids, force = false } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Array of IDs required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      deleted: [] as string[],
      failed: [] as { id: string; error: string; refCount?: number }[],
      inUse: [] as { id: string; refCount: number }[],
    };

    // Delete each item sequentially to avoid race conditions
    for (const id of ids) {
      try {
        const result = await deleteMedia(id, force);

        if (result.success) {
          results.deleted.push(id);
        } else if (result.error?.includes('in use')) {
          const mediaItem = await getMedia(id);
          const refCount = mediaItem?.refCount || 0;
          results.inUse.push({ id, refCount });
          results.failed.push({ id, error: result.error, refCount });
        } else {
          results.failed.push({ id, error: result.error || 'Delete failed' });
        }
      } catch (err) {
        results.failed.push({ 
          id, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        });
      }
    }

    // Determine response status
    const allDeleted = results.deleted.length === ids.length;
    const allFailed = results.failed.length === ids.length;
    
    let status = 200;
    if (allFailed) status = 500;
    else if (!allDeleted) status = 207; // Multi-Status (some succeeded, some failed)

    return new Response(
      JSON.stringify({
        success: allDeleted,
        partial: !allDeleted && !allFailed,
        results,
        summary: {
          total: ids.length,
          deleted: results.deleted.length,
          failed: results.failed.length,
          inUse: results.inUse.length,
        },
      }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[media/bulk-delete API] DELETE error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Bulk delete failed', 
        details: String(error) 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
