/**
 * Audio Posts API - ICT★SNU SOUND management
 *
 * CRUD operations for audio posts stored in the database.
 */

export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@lib/db';
import { audioPosts } from '@lib/db/schema';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import { requireAdminAuth } from '@lib/admin-auth';
import { nanoid } from '@lib/nanoid';

// GET: List or single audio post
export const GET: APIRoute = async ({ request, url }) => {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  const id = url.searchParams.get('id');

  try {
    // Single post by ID
    if (id) {
      const post = await db.query.audioPosts.findFirst({
        where: eq(audioPosts.id, id),
      });

      if (!post || post.deletedAt) {
        return new Response(JSON.stringify({ error: 'Audio post not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(post), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // List all posts (not soft deleted)
    const posts = await db.query.audioPosts.findMany({
      where: isNull(audioPosts.deletedAt),
      orderBy: [desc(audioPosts.createdAt)],
    });

    return new Response(JSON.stringify(posts), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error fetching audio posts:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch audio posts' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// POST: Create new audio post
export const POST: APIRoute = async ({ request }) => {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { title, audioFile, artwork, youtubeLink, soundcloudLink } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
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
      return new Response(JSON.stringify({ error: 'An audio post with this title already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const id = nanoid();
    const now = new Date();

    await db.insert(audioPosts).values({
      id,
      slug,
      title: title.trim(),
      audioFile: audioFile || null,
      artwork: artwork || null,
      youtubeLink: youtubeLink || null,
      soundcloudLink: soundcloudLink || null,
      status: 'published',
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const newPost = await db.query.audioPosts.findFirst({
      where: eq(audioPosts.id, id),
    });

    return new Response(JSON.stringify(newPost), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error creating audio post:', error);
    return new Response(JSON.stringify({ error: 'Failed to create audio post' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// PUT: Update audio post
export const PUT: APIRoute = async ({ request }) => {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id, title, audioFile, artwork, youtubeLink, soundcloudLink } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: 'ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await db.query.audioPosts.findFirst({
      where: eq(audioPosts.id, id),
    });

    if (!existing || existing.deletedAt) {
      return new Response(JSON.stringify({ error: 'Audio post not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const updateData: Partial<typeof audioPosts.$inferInsert> = {
      updatedAt: now,
    };

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return new Response(JSON.stringify({ error: 'Title cannot be empty' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      updateData.title = title.trim();

      // Generate new slug if title changed
      const newSlug = title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Only update slug if it's different and not already taken by another post
      if (newSlug !== existing.slug) {
        const slugTaken = await db.query.audioPosts.findFirst({
          where: and(
            eq(audioPosts.slug, newSlug),
            sql`${audioPosts.id} != ${id}`
          ),
        });

        if (slugTaken) {
          return new Response(JSON.stringify({ error: 'An audio post with this title already exists' }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        updateData.slug = newSlug;
      }
    }

    if (audioFile !== undefined) updateData.audioFile = audioFile || null;
    if (artwork !== undefined) updateData.artwork = artwork || null;
    if (youtubeLink !== undefined) updateData.youtubeLink = youtubeLink || null;
    if (soundcloudLink !== undefined) updateData.soundcloudLink = soundcloudLink || null;

    await db.update(audioPosts)
      .set(updateData)
      .where(eq(audioPosts.id, id));

    const updatedPost = await db.query.audioPosts.findFirst({
      where: eq(audioPosts.id, id),
    });

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
export const DELETE: APIRoute = async ({ request, url }) => {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  const id = url.searchParams.get('id');

  if (!id) {
    return new Response(JSON.stringify({ error: 'ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const post = await db.query.audioPosts.findFirst({
      where: eq(audioPosts.id, id),
    });

    if (!post || post.deletedAt) {
      return new Response(JSON.stringify({ error: 'Audio post not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();

    await db.update(audioPosts)
      .set({
        deletedAt: now,
        updatedAt: now,
        status: 'archived',
      })
      .where(eq(audioPosts.id, id));

    return new Response(JSON.stringify({ success: true }), {
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
