/**
 * PUT /api/admin/audio/track — Update track metadata (database)
 */

import type { APIRoute } from 'astro';
import { checkAdminAuth } from '@lib/admin-auth';
import { getWorkById, updateWork } from '@lib/db/queries';

export const PUT: APIRoute = async ({ request }) => {
  const auth = checkAdminAuth(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { id, title, artist, album, year } = body as { id: string; title: string; artist: string; album: string; year: number };
    if (!id || !title || !artist) {
      return new Response(JSON.stringify({ error: 'Missing id, title, or artist' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const work = await getWorkById(id);
    if (!work || work.category !== 'audio') {
      return new Response(JSON.stringify({ error: 'Track not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let meta: { artist: string; album: string; audioSrc?: string } = { artist: '', album: '' };
    try {
      if (work.description) meta = { ...meta, ...JSON.parse(work.description) };
    } catch {
      // ignore
    }
    meta.artist = artist;
    meta.album = album ?? meta.album;
    const description = JSON.stringify(meta);
    await updateWork(id, { title, year: year ?? work.year, description });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Audio track update error:', err);
    return new Response(
      JSON.stringify({ error: 'Update failed', details: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
