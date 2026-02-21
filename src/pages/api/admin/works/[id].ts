/**
 * Admin API — Delete any work by id (physical, audio, digital, collaborations)
 * DELETE /api/admin/works/[id]
 * Query param: ?permanent=true for hard delete
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { checkAdminAuth } from '@lib/admin-auth';
import { validateCsrfToken } from '@lib/csrf';
import { softDeleteWork, hardDeleteWork, restoreWork } from '@lib/db/queries';
import { db } from '@lib/db';
import { works } from '@lib/db/schema';
import { eq } from 'drizzle-orm';

export const DELETE: APIRoute = async ({ request, params }) => {
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

  const id = params?.id;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(request.url);
    const permanent = url.searchParams.get('permanent') === 'true';

    if (permanent) {
      // Hard delete - check if already soft deleted
      const work = await db.query.works.findFirst({
        where: eq(works.id, id),
      });

      if (!work) {
        return new Response(JSON.stringify({ error: 'Work not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!work.deletedAt) {
        return new Response(
          JSON.stringify({ 
            error: 'Work must be soft-deleted before permanent deletion',
            message: 'Delete the work first, then permanently delete from trash'
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      await hardDeleteWork(id);
      return new Response(
        JSON.stringify({ success: true, message: 'Permanently deleted' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      // Soft delete (default)
      const success = await softDeleteWork(id, auth.userId || 'unknown');
      
      if (!success) {
        return new Response(JSON.stringify({ error: 'Work not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Moved to trash' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('Delete work error:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to delete', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

/** Restore a soft-deleted work */
export const POST: APIRoute = async ({ request, params }) => {
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

  const id = params?.id;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const success = await restoreWork(id);
    
    if (!success) {
      return new Response(JSON.stringify({ error: 'Work not found or not deleted' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Restored' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Restore work error:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to restore', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
