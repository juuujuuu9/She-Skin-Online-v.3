/**
 * Media list API - List, upload, delete, update media (DB + CDN)
 * Route: /api/admin/media-list (avoids conflict with /api/admin/media/upload etc.)
 */

import type { APIRoute } from 'astro';
import { db } from '@lib/db';
import { media } from '@lib/db/schema';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import { requireAdminAuth } from '@lib/admin-auth';
import { nanoid } from '@lib/nanoid';
import { uploadToBunny, deleteFromBunny } from '@lib/bunny';
import { processImageBuffer, loadManifest, saveManifest } from '@lib/media-process';

// GET: List media or single item
export const GET: APIRoute = async ({ request, url }) => {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  const id = url.searchParams.get('id');
  const type = url.searchParams.get('type');
  const unused = url.searchParams.get('unused') === 'true';
  const search = url.searchParams.get('search');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  try {
    if (id) {
      const item = await db.query.media.findFirst({
        where: eq(media.id, id),
      });
      if (!item) {
        return new Response(JSON.stringify({ error: 'Media not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ media: item }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let whereClause = isNull(media.deletedAt);
    if (type) whereClause = and(whereClause, eq(media.mediaType, type));
    if (unused) whereClause = and(whereClause, eq(media.refCount, 0));
    if (search) {
      whereClause = and(
        whereClause,
        sql`${media.filename} ILIKE ${`%${search}%`} OR ${media.originalName} ILIKE ${`%${search}%`}`
      );
    }

    const mediaList = await db.query.media.findMany({
      where: whereClause,
      orderBy: [desc(media.createdAt)],
      limit,
      offset,
    });
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(media).where(whereClause);
    const total = countResult[0]?.count || 0;

    return new Response(JSON.stringify({
      media: mediaList,
      pagination: { total, limit, offset, hasMore: offset + mediaList.length < total },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching media:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch media' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// POST: Upload new media
export const POST: APIRoute = async ({ request }) => {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const altText = (formData.get('altText') as string) || '';
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: 'File too large (max 50MB)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const id = nanoid();
    const now = new Date();
    const originalName = file.name;
    const mimeType = file.type;
    const mediaType = mimeType.startsWith('image/') ? 'image'
      : mimeType.startsWith('audio/') ? 'audio'
      : mimeType.startsWith('video/') ? 'video'
      : 'document';
    const datePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const filenameBase = `${id}`;

    let mainUrl: string;
    let variants: Record<string, any> = {};
    let width: number | undefined;
    let height: number | undefined;
    let blurhash: string | undefined;
    let dominantColor: string | undefined;

    if (mediaType === 'image') {
      const imageBuffer = Buffer.from(await file.arrayBuffer());
      const manifest = await loadManifest();
      const filenameForManifest = `${datePath}/${filenameBase}.webp`;
      const { result } = await processImageBuffer(imageBuffer, filenameForManifest, manifest);
      manifest.images[result.id] = result;
      await saveManifest(manifest);
      mainUrl = result.variants.xl?.url ?? result.variants.lg?.url ?? result.variants.md?.url ?? result.variants.sm?.url ?? Object.values(result.variants)[0]?.url ?? '';
      variants = result.variants;
      width = result.metadata.width;
      height = result.metadata.height;
      blurhash = result.blurhash;
      dominantColor = result.dominantColor;
    } else {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = originalName.split('.').pop() || 'bin';
      mainUrl = await uploadToBunny(buffer, `${datePath}/${filenameBase}.${ext}`, mimeType);
    }

    const [newMedia] = await db.insert(media).values({
      id,
      filename: mediaType === 'image' ? `${filenameBase}.webp` : originalName,
      originalName,
      mimeType: mediaType === 'image' ? 'image/webp' : mimeType,
      fileSize: file.size,
      url: mainUrl,
      path: `${datePath}/${filenameBase}`,
      variants,
      width,
      height,
      blurhash,
      dominantColor,
      refCount: 0,
      mediaType,
      altText,
      uploadedBy: 'admin',
      createdAt: now,
      updatedAt: now,
    }).returning();

    return new Response(JSON.stringify({ success: true, media: newMedia }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error uploading media:', error);
    return new Response(JSON.stringify({
      error: 'Failed to upload media',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

// DELETE: Soft delete or permanently delete media
export const DELETE: APIRoute = async ({ request, url }) => {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;
  const id = url.searchParams.get('id');
  const permanent = url.searchParams.get('permanent') === 'true';
  if (!id) {
    return new Response(JSON.stringify({ error: 'Media ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const mediaItem = await db.query.media.findFirst({ where: eq(media.id, id) });
    if (!mediaItem) {
      return new Response(JSON.stringify({ error: 'Media not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (mediaItem.refCount > 0 && permanent) {
      return new Response(JSON.stringify({ error: 'Cannot delete media that is still in use', refCount: mediaItem.refCount }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (permanent) {
      try {
        await deleteFromBunny(mediaItem.path);
        if (mediaItem.variants && typeof mediaItem.variants === 'object') {
          const v = mediaItem.variants as Record<string, { url?: string }>;
          for (const key of Object.keys(v)) {
            if (v[key]?.url) await deleteFromBunny(`${mediaItem.path}/${key}.webp`);
          }
        }
      } catch (e) {
        console.error('Error deleting from CDN:', e);
      }
      await db.delete(media).where(eq(media.id, id));
      return new Response(JSON.stringify({ success: true, message: 'Media permanently deleted' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    await db.update(media).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(media.id, id));
    return new Response(JSON.stringify({ success: true, message: 'Media moved to trash' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error deleting media:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete media' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// PATCH: Update media metadata
export const PATCH: APIRoute = async ({ request }) => {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    const { id, altText } = body;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Media ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const updateData: Partial<typeof media.$inferInsert> = { updatedAt: new Date() };
    if (altText !== undefined) updateData.altText = altText;
    await db.update(media).set(updateData).where(eq(media.id, id));
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating media:', error);
    return new Response(JSON.stringify({ error: 'Failed to update media' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
