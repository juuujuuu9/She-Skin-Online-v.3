export const prerender = false;

import type { APIRoute } from 'astro';
import { validateCsrfToken } from '@lib/csrf';
import { requireAdminAuth } from '@lib/admin-auth';
import { setHomepageVideo, clearHomepageVideo, getHomepageVideo } from '@lib/db/queries';

export const GET: APIRoute = async ({ request }) => {
  const video = await getHomepageVideo();
  return new Response(JSON.stringify({ video }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  // 1. CSRF first
  if (!validateCsrfToken(request)) {
    return new Response(JSON.stringify({ error: 'Invalid CSRF token' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Auth second
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  // 3. Handle request
  try {
    const body = await request.json() as { mediaId?: string };
    const { mediaId } = body;

    if (!mediaId) {
      return new Response(JSON.stringify({ error: 'Missing mediaId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const success = await setHomepageVideo(mediaId);
    if (!success) {
      return new Response(JSON.stringify({ error: 'Invalid video media' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const video = await getHomepageVideo();
    return new Response(JSON.stringify({ success: true, video }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to set homepage video' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  // 1. CSRF first
  if (!validateCsrfToken(request)) {
    return new Response(JSON.stringify({ error: 'Invalid CSRF token' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Auth second
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  // 3. Clear video
  await clearHomepageVideo();
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
