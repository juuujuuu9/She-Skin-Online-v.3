export const prerender = false;

import type { APIRoute } from 'astro';
import { checkAdminAuth } from '@lib/admin-auth';
import { loadManifest, saveManifest } from '@lib/media-process';
import { unlink } from 'fs/promises';
import { join } from 'path';

export const POST: APIRoute = async ({ request }) => {
  const auth = await checkAdminAuth(request);
  if (!auth.valid) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check CSRF
  const { validateCsrfToken } = await import('@lib/csrf');
  if (!validateCsrfToken(request)) {
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const type = url.searchParams.get('type') || 'image';

  if (!id) {
    return new Response(
      JSON.stringify({ error: 'No ID provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const manifest = await loadManifest();

    // Find the media entry
    let mediaEntry = type === 'image' ? manifest.images[id] : 
                     type === 'video' ? (manifest.video || {})[id] : 
                     manifest.audio[id];

    if (!mediaEntry) {
      return new Response(
        JSON.stringify({ error: 'Media not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Delete the physical file(s)
    if (mediaEntry.variants) {
      for (const variant of Object.values(mediaEntry.variants)) {
        if (variant?.url) {
          try {
            // Remove leading /public if present
            const filePath = variant.url.startsWith('/media/')
              ? join(process.cwd(), 'public', variant.url)
              : join(process.cwd(), variant.url);
            await unlink(filePath);
          } catch {
            // File might not exist, continue
          }
        }
      }
    }

    // Remove from manifest
    if (type === 'image') {
      delete manifest.images[id];
    } else if (type === 'video') {
      if (manifest.video) delete manifest.video[id];
    } else {
      delete manifest.audio[id];
    }

    await saveManifest(manifest);

    return new Response(
      JSON.stringify({ success: true, message: 'Media deleted' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[delete] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Delete failed', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
