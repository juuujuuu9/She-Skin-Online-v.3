/**
 * Admin API — Upload audio files and cover art (saved to database)
 *
 * POST /api/admin/audio/upload
 * Body: FormData with: audio, cover (optional), coverMediaId (optional), title, artist, album, year
 */

import type { APIRoute } from 'astro';
import { uploadToBunny } from '@lib/bunny';
import { createWork, addWorkMedia, insertAudioTrack } from '@lib/db/queries';
import { db } from '@lib/db';
import { media } from '@lib/db/schema';
import { eq } from 'drizzle-orm';
import { incrementRefCount } from '@lib/upload-service';

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
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const coverFile = formData.get('cover') as File | null;
    const coverMediaId = (formData.get('coverMediaId') as string)?.trim();
    const title = (formData.get('title') as string)?.trim();
    const artist = (formData.get('artist') as string)?.trim();
    const album = (formData.get('album') as string)?.trim() || '';
    const year = parseInt(String(formData.get('year')), 10) || new Date().getFullYear();

    if (!audioFile || !title || !artist) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!audioFile.type.startsWith('audio/')) {
      return new Response(JSON.stringify({ error: 'File must be an audio file' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const timestamp = Date.now();
    const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const audioFilename = `audio/${timestamp}-${safeTitle}.mp3`;
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const audioUrl = await uploadToBunny(audioBuffer, audioFilename, {
      contentType: audioFile.type,
    });

    let coverUrl = '';
    if (coverMediaId) {
      // Look up the media from database
      const mediaEntry = await db.query.media.findFirst({
        where: eq(media.id, coverMediaId),
      });
      if (mediaEntry && mediaEntry.mediaType === 'image') {
        // Use the large variant or any available variant
        const variant = mediaEntry.variants?.lg || mediaEntry.variants?.md || mediaEntry.variants?.sm || { url: mediaEntry.url };
        if (variant) {
          coverUrl = variant.url;
        }
        // Increment ref count for the media
        await incrementRefCount(coverMediaId);
      }
    } else if (coverFile) {
      const coverFilename = `audio/covers/${timestamp}-${safeTitle}.jpg`;
      const coverBuffer = Buffer.from(await coverFile.arrayBuffer());
      coverUrl = await uploadToBunny(coverBuffer, coverFilename, {
        contentType: coverFile.type,
      });
    }

    const slug = `${timestamp}-${safeTitle}`;
    const description = JSON.stringify({ artist, album, audioSrc: audioUrl });
    const workId = await createWork({
      slug,
      title,
      category: 'audio',
      year,
      description,
      published: true,
    });

    if (coverUrl) {
      await addWorkMedia(workId, { type: 'image', url: coverUrl, isPrimary: true });
    }
    await addWorkMedia(workId, { type: 'audio', url: audioUrl });
    await insertAudioTrack(workId, { duration: 0 });

    return new Response(
      JSON.stringify({
        success: true,
        track: {
          id: workId,
          title,
          artist,
          album,
          year,
          audioSrc: audioUrl,
          coverArt: coverUrl,
          duration: 0,
          hasAudio: true,
          hasCover: !!coverUrl,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Audio upload error:', error);
    return new Response(
      JSON.stringify({ error: 'Upload failed', details: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
