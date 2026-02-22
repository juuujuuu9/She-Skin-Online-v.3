/**
 * Admin API — Save collaboration (create or update)
 *
 * POST /api/admin/collaborations/save
 * Body: { item: Collaboration, isNew: boolean }
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { checkAdminAuth } from '@lib/admin-auth';
import { validateCsrfToken } from '@lib/csrf';
import { createWork, updateWork, getWorkBySlug, addWorkMedia, updateWorkMedia } from '@lib/db/queries';
import { validateRequest, saveCollaborationSchema } from '@lib/validation';

export const POST: APIRoute = async ({ request }) => {
  // Check auth
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

  // Validate request body
  const bodyValidation = await validateRequest(request, saveCollaborationSchema);
  if (!bodyValidation.success) {
    return bodyValidation.response;
  }

  const { item, isNew } = bodyValidation.data;

    if (isNew) {
      // Create new work
      const workId = await createWork({
        slug: item.slug,
        title: item.title,
        category: 'collaborations',
        forSale: item.forSale || false,
        externalUrl: item.externalUrl || item.href || null,
        published: true,
      });

      // Add media if provided
      if (item.image?.src) {
        await addWorkMedia(workId, {
          type: 'image',
          url: item.image.src,
          variants: item.image.variants || null,
          blurhash: item.image.blurhash || null,
          dominantColor: item.image.dominantColor || null,
          width: item.image.width || null,
          height: item.image.height || null,
          isPrimary: true,
        });
      }

      return new Response(JSON.stringify({ success: true, id: workId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      // Update existing work (look up by slug)
      const existing = await getWorkBySlug(item.slug);
      if (!existing || existing.category !== 'collaborations') {
        return new Response(JSON.stringify({ error: 'Collaboration not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      await updateWork(existing.id, {
        title: item.title,
        externalUrl: item.externalUrl ?? item.href ?? null,
      });
      const primaryMedia = existing.media.find((m) => m.isPrimary || m.type === 'image') || existing.media[0];
      if (item.image?.src) {
        if (primaryMedia) {
          await updateWorkMedia(primaryMedia.id, { url: item.image.src });
        } else {
          await addWorkMedia(existing.id, {
            type: 'image',
            url: item.image.src,
            isPrimary: true,
          });
        }
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Save error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to save', details: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
