export const prerender = false;

/**
 * POST /api/admin/physical/save — Create or update a physical work (database)
 */

import type { APIRoute } from 'astro';
import { checkAdminAuth } from '@lib/admin-auth';
import { createWork, updateWork, getWorkBySlug, addWorkMedia, updateWorkMedia } from '@lib/db/queries';

type PhysicalItem = { id?: string; slug: string; title: string; year: number; forSale: boolean; image: string };

export const POST: APIRoute = async ({ request }) => {
  const auth = await checkAdminAuth(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { item, isNew } = body as { item: PhysicalItem; isNew: boolean };
    if (!item || !item.title || item.image === undefined) {
      return new Response(JSON.stringify({ error: 'Missing title or image' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const slug = (item.slug || item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/-+/g, '-').replace(/^-|-$/g, '') || 'untitled';
    const year = parseInt(String(item.year), 10) || new Date().getFullYear();

    if (isNew) {
      const workId = await createWork({
        slug,
        title: item.title,
        category: 'physical',
        year,
        forSale: !!item.forSale,
        published: true,
      });
      await addWorkMedia(workId, {
        type: 'image',
        url: item.image,
        isPrimary: true,
      });
      return new Response(JSON.stringify({ success: true, id: workId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await getWorkBySlug(item.slug);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Work not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await updateWork(existing.id, {
      title: item.title,
      slug,
      year,
      forSale: !!item.forSale,
    });

    const primaryMedia = existing.media.find(m => m.isPrimary || m.type === 'image') || existing.media[0];
    if (primaryMedia) {
      await updateWorkMedia(primaryMedia.id, { url: item.image });
    } else if (item.image) {
      await addWorkMedia(existing.id, { type: 'image', url: item.image, isPrimary: true });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Physical save error:', err);
    return new Response(
      JSON.stringify({ error: 'Save failed', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
