/**
 * Admin API — Upload audio files and cover art (saved to database)
 *
 * POST /api/admin/audio/upload
 * Body: FormData with: audio, cover (optional), coverMediaId (optional), title, artist, album, year
 */

import type { APIRoute } from 'astro';
import { checkAdminAuth } from '@lib/admin-auth';
import { uploadToBunny } from '@lib/bunny';
import { createWork, addWorkMedia, insertAudioTrack } from '@lib/db/queries';
import { loadManifest } from '@lib/media-process';

export const POST: APIRoute = async ({ request }) => {
  const auth = await checkAdminAuth(request);
  if (!auth.valid) {
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
      // Look up the media from manifest
      const manifest = await loadManifest();
      const mediaEntry = manifest.images[coverMediaId];
      if (mediaEntry) {
        // Use the large variant or any available variant
        const variant = mediaEntry.variants.lg || mediaEntry.variants.md || mediaEntry.variants.sm || Object.values(mediaEntry.variants)[0];
        if (variant) {
          coverUrl = variant.url.startsWith('http') ? variant.url : `${request.headers.get('origin') || ''}${variant.url}`;
        }
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
