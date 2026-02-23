/**
 * API: Reorder collaborations
 * POST /api/admin/collaborations/reorder
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@lib/db';
import { works } from '@lib/db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  // Auth is handled by Clerk middleware
  const auth = locals.auth();
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update sort order for each item
    for (const item of items) {
      await db.update(works)
        .set({ sortOrder: item.sortOrder })
        .where(eq(works.id, item.id));
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Reorder error:', error);
    return new Response(JSON.stringify({ error: 'Failed to reorder' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
