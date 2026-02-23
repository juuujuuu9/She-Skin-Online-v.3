export const prerender = false;

import type { APIRoute } from 'astro';
import { validateCsrfToken } from '@lib/csrf';
import { setHomepageVideo, clearHomepageVideo, getHomepageVideo } from '@lib/db/queries';

export const GET: APIRoute = async () => {
  const video = await getHomepageVideo();
  return new Response(JSON.stringify({ video }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  // 1. CSRF first
  if (!validateCsrfToken(request)) {
    return new Response(JSON.stringify({ error: 'Invalid CSRF token' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Auth is handled by Clerk middleware
  const auth = locals.auth();
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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

export const DELETE: APIRoute = async ({ request, locals }) => {
  // 1. CSRF first
  if (!validateCsrfToken(request)) {
    return new Response(JSON.stringify({ error: 'Invalid CSRF token' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Auth is handled by Clerk middleware
  const auth = locals.auth();
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Clear video
  await clearHomepageVideo();
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
