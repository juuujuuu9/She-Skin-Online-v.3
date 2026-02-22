export const prerender = false;

import type { APIRoute } from 'astro';
import { checkAdminAuth } from '@lib/admin-auth';
import { validateCsrfToken } from '@lib/csrf';
import { uploadMedia } from '@lib/upload-service';

export const POST: APIRoute = async ({ request }) => {
  // Check CSRF first
  if (!validateCsrfToken(request)) {
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check auth
  const auth = await checkAdminAuth(request);
  if (!auth.valid) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', reason: auth.debug || 'unknown' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
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

    // Use the unified upload service that saves to database
    const result = await uploadMedia(file, {
      altText,
      processImage: true, // Always process images
      uploadedBy: auth.userId,
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
        id: result.media?.id,
        type: result.media?.mediaType,
        status: 'completed',
        url: result.media?.url,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[upload] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Upload failed', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
