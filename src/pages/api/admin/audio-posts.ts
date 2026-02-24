export const prerender = false;

/**
 * Audio Posts API - ICT★SNU SOUND management
 *
 * CRUD operations for audio posts stored in the database.
 */

import type { APIRoute } from 'astro';
import { db } from '@lib/db';
import { audioPosts } from '@lib/db/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { nanoid } from '@lib/nanoid';

// GET: List all audio posts
export const GET: APIRoute = async ({ locals }) => {
  // Auth is handled by Clerk middleware
  const auth = locals.auth();
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const posts = await db.query.audioPosts.findMany({
      where: isNull(audioPosts.deletedAt),
      orderBy: [desc(audioPosts.createdAt)],
    });

    return new Response(JSON.stringify(posts), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[audio-posts API] Error fetching audio posts:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch audio posts',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// POST: Create new audio post
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
    const body = await request.json();
    console.log('[audio-posts] POST body:', body);
    const { title, artist, audioFile, artwork, youtubeLink, soundcloudLink } = body;

    if (!title) {
      return new Response(JSON.stringify({ error: 'Title is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Generate slug from title
    const slug = title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check for duplicate slug
    const existing = await db.query.audioPosts.findFirst({
      where: eq(audioPosts.slug, slug),
    });

    if (existing) {
      return new Response(JSON.stringify({ error: 'A post with this title already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const id = nanoid();
    const now = new Date();

    const newPost = {
      id,
      title,
      artist: artist || 'she_skin',
      slug,
      audioFile: audioFile || null,
      artwork: artwork || null,
      youtubeLink: youtubeLink || null,
      soundcloudLink: soundcloudLink || null,
      status: 'published',
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    console.log('[audio-posts] Inserting new post:', newPost);
    await db.insert(audioPosts).values(newPost);
    console.log('[audio-posts] Post created successfully:', id);

    return new Response(JSON.stringify(newPost), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[audio-posts] Error creating audio post:', error);
    return new Response(JSON.stringify({ error: 'Failed to create audio post', details: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// PUT: Update existing audio post
export const PUT: APIRoute = async ({ request, locals }) => {
  // Auth is handled by Clerk middleware
  const auth = locals.auth();
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { id, title, artist, audioFile, artwork, youtubeLink, soundcloudLink } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: 'ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get existing post
    const existingPost = await db.query.audioPosts.findFirst({
      where: and(
        eq(audioPosts.id, id),
        isNull(audioPosts.deletedAt)
      ),
    });

    if (!existingPost) {
      return new Response(JSON.stringify({ error: 'Post not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();

    // Build update data
    const updateData: Partial<typeof audioPosts.$inferInsert> = {
      updatedAt: now,
    };

    if (title !== undefined) {
      updateData.title = title;
      // Regenerate slug if title changed
      const newSlug = title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      updateData.slug = newSlug;
    }
    if (artist !== undefined) updateData.artist = artist || 'she_skin';
    if (audioFile !== undefined) updateData.audioFile = audioFile || null;
    if (artwork !== undefined) updateData.artwork = artwork || null;
    if (youtubeLink !== undefined) updateData.youtubeLink = youtubeLink || null;
    if (soundcloudLink !== undefined) updateData.soundcloudLink = soundcloudLink || null;

    await db.update(audioPosts)
      .set(updateData)
      .where(eq(audioPosts.id, id));

    // Return updated post
    const updatedPost = {
      ...existingPost,
      ...updateData,
    };

    return new Response(JSON.stringify(updatedPost), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating audio post:', error);
    return new Response(JSON.stringify({ error: 'Failed to update audio post' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// DELETE: Soft delete audio post
export const DELETE: APIRoute = async ({ request, url, locals }) => {
  // Auth is handled by Clerk middleware
  const auth = locals.auth();
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = url.searchParams.get('id');

  if (!id) {
    return new Response(JSON.stringify({ error: 'ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const post = await db.query.audioPosts.findFirst({
      where: and(
        eq(audioPosts.id, id),
        isNull(audioPosts.deletedAt)
      ),
    });

    if (!post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();

    // Soft delete
    await db.update(audioPosts)
      .set({
        deletedAt: now,
        updatedAt: now,
        status: 'archived',
      })
      .where(eq(audioPosts.id, id));

    return new Response(JSON.stringify({
      success: true,
      message: 'Post deleted',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error deleting audio post:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete audio post' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
