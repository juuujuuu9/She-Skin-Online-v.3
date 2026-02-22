export const prerender = false;

/**
 * Public Audio Posts API
 *
 * Public endpoints for retrieving published audio posts.
 * No authentication required.
 */

import type { APIRoute } from 'astro';
import { db } from '@lib/db';
import { audioPosts } from '@lib/db/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';

// GET: List all published audio posts or get single post by slug
export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug');

  try {
    // If slug is provided, return single post
    if (slug) {
      const post = await db.query.audioPosts.findFirst({
        where: and(
          eq(audioPosts.slug, slug),
          eq(audioPosts.status, 'published'),
          isNull(audioPosts.deletedAt)
        ),
      });

      if (!post) {
        return new Response(JSON.stringify({ error: 'Post not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(post), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Otherwise, list all published posts
    const posts = await db.query.audioPosts.findMany({
      where: and(
        eq(audioPosts.status, 'published'),
        isNull(audioPosts.deletedAt)
      ),
      orderBy: [desc(audioPosts.publishedAt)],
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
