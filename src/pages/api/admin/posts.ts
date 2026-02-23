/**
 * Posts API - WordPress-style content management
 * 
 * CRUD operations for posts stored in the database.
 * Anti-bloat: When posts are deleted, their associated media references are cleaned up.
 */

import type { APIRoute } from 'astro';
import { db } from '@lib/db';
import { posts, postMeta, postMedia, media, revisions } from '@lib/db/schema';
import { eq, desc, and, isNull, like, sql } from 'drizzle-orm';
import { requireAdminAuth } from '@lib/admin-auth';
import { nanoid } from '@lib/nanoid';
import { validateRequest, validateQuery, createPostSchema, updatePostSchema, deletePostSchema, getPostSchema, idSchema } from '@lib/validation';

// GET: List or single post
export const GET: APIRoute = async ({ request, url }) => {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  // Validate query parameters
  const queryValidation = validateQuery(url, getPostSchema);
  if (!queryValidation.success) {
    return queryValidation.response;
  }

  const { id, slug, type: postType, status, search, limit, offset } = queryValidation.data;

  try {
    // Single post by ID
    if (id) {
      const post = await db.query.posts.findFirst({
        where: eq(posts.id, id),
        with: {
          meta: true,
          media: {
            with: {
              media: true,
            },
          },
        },
      });

      if (!post) {
        return new Response(JSON.stringify({ error: 'Post not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ post }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Single post by slug
    if (slug) {
      const post = await db.query.posts.findFirst({
        where: and(
          eq(posts.slug, slug),
          isNull(posts.deletedAt)
        ),
        with: {
          meta: true,
          media: {
            with: {
              media: true,
            },
          },
        },
      });

      if (!post) {
        return new Response(JSON.stringify({ error: 'Post not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ post }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // List posts
    let whereClause = and(
      eq(posts.postType, postType),
      isNull(posts.deletedAt)
    );

    if (status) {
      whereClause = and(whereClause, eq(posts.status, status));
    }

    if (search) {
      whereClause = and(
        whereClause,
        sql`${posts.title} ILIKE ${`%${search}%`} OR ${posts.content} ILIKE ${`%${search}%`}`
      );
    }

    const postsList = await db.query.posts.findMany({
      where: whereClause,
      orderBy: [desc(posts.updatedAt)],
      limit,
      offset,
    });

    // Get total count
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(posts)
      .where(whereClause);
    
    const total = countResult[0]?.count || 0;

    return new Response(JSON.stringify({ 
      posts: postsList,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + postsList.length < total,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error fetching posts:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch posts' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// POST: Create new post
export const POST: APIRoute = async ({ request }) => {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  // Validate request body
  const bodyValidation = await validateRequest(request, createPostSchema);
  if (!bodyValidation.success) {
    return bodyValidation.response;
  }

  const { title, slug: providedSlug, content, excerpt, postType, status, metaTitle, metaDescription, ogImage, parentId, meta, mediaIds } = bodyValidation.data;

  try {

    // Generate slug if not provided
    const slug = providedSlug || title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check for duplicate slug
    const existing = await db.query.posts.findFirst({
      where: eq(posts.slug, slug),
    });

    if (existing) {
      return new Response(JSON.stringify({ error: 'A post with this slug already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const id = nanoid();
    const now = new Date();

    // Create post
    await db.insert(posts).values({
      id,
      slug,
      title,
      content,
      excerpt,
      postType,
      status,
      metaTitle,
      metaDescription,
      ogImage,
      parentId,
      publishedAt: status === 'published' ? now : null,
      createdAt: now,
      updatedAt: now,
    });

    // Insert meta fields
    if (Object.keys(meta).length > 0) {
      const metaInserts = Object.entries(meta).map(([key, value]) => ({
        id: nanoid(),
        postId: id,
        metaKey: key,
        metaValue: String(value),
        createdAt: now,
        updatedAt: now,
      }));

      await db.insert(postMeta).values(metaInserts);
    }

    // Link media and increment ref counts
    if (mediaIds.length > 0) {
      const mediaLinks = mediaIds.map((mediaId: string, index: number) => ({
        id: nanoid(),
        postId: id,
        mediaId,
        sortOrder: index,
        createdAt: now,
      }));

      await db.insert(postMedia).values(mediaLinks);

      // Increment media ref counts
      for (const mediaId of mediaIds) {
        await db.update(media)
          .set({ 
            refCount: sql`${media.refCount} + 1`,
            updatedAt: now,
          })
          .where(eq(media.id, mediaId));
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      post: { id, slug, title },
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error creating post:', error);
    return new Response(JSON.stringify({ error: 'Failed to create post' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// PUT: Update post
export const PUT: APIRoute = async ({ request }) => {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  // Validate request body
  const bodyValidation = await validateRequest(request, updatePostSchema);
  if (!bodyValidation.success) {
    return bodyValidation.response;
  }

  const { id } = bodyValidation.data;

  try {
    const body = bodyValidation.data;

    // Get existing post
    const existingPost = await db.query.posts.findFirst({
      where: eq(posts.id, id),
      with: {
        media: true,
      },
    });

    if (!existingPost) {
      return new Response(JSON.stringify({ error: 'Post not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Save revision before updating
    await db.insert(revisions).values({
      id: nanoid(),
      postId: id,
      title: existingPost.title,
      content: existingPost.content,
      excerpt: existingPost.excerpt,
      createdAt: new Date(),
      changeMessage: body.changeMessage || 'Updated via admin',
    });

    const now = new Date();
    const updateData: Partial<typeof posts.$inferInsert> = {
      updatedAt: now,
    };

    // Build update data
    if (body.title !== undefined) updateData.title = body.title;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.content !== undefined) updateData.content = body.content;
    if (body.excerpt !== undefined) updateData.excerpt = body.excerpt;
    if (body.status !== undefined) {
      updateData.status = body.status;
      if (body.status === 'published' && !existingPost.publishedAt) {
        updateData.publishedAt = now;
      }
    }
    if (body.metaTitle !== undefined) updateData.metaTitle = body.metaTitle;
    if (body.metaDescription !== undefined) updateData.metaDescription = body.metaDescription;
    if (body.ogImage !== undefined) updateData.ogImage = body.ogImage;
    if (body.parentId !== undefined) updateData.parentId = body.parentId;

    // Update post
    await db.update(posts)
      .set(updateData)
      .where(eq(posts.id, id));

    // Update meta fields
    if (body.meta !== undefined) {
      // Delete existing meta
      await db.delete(postMeta).where(eq(postMeta.postId, id));

      // Insert new meta
      if (Object.keys(body.meta).length > 0) {
        const metaInserts = Object.entries(body.meta).map(([key, value]) => ({
          id: nanoid(),
          postId: id,
          metaKey: key,
          metaValue: String(value),
          createdAt: now,
          updatedAt: now,
        }));

        await db.insert(postMeta).values(metaInserts);
      }
    }

    // Update media links (if provided)
    if (body.mediaIds !== undefined) {
      const oldMediaIds = existingPost.media.map(m => m.mediaId);
      const newMediaIds = body.mediaIds as string[];

      // Decrement ref counts for removed media
      const removedIds = oldMediaIds.filter(mid => !newMediaIds.includes(mid));
      for (const mediaId of removedIds) {
        await db.update(media)
          .set({ 
            refCount: sql`GREATEST(${media.refCount} - 1, 0)`,
            updatedAt: now,
          })
          .where(eq(media.id, mediaId));
      }

      // Increment ref counts for added media
      const addedIds = newMediaIds.filter(mid => !oldMediaIds.includes(mid));
      for (const mediaId of addedIds) {
        await db.update(media)
          .set({ 
            refCount: sql`${media.refCount} + 1`,
            updatedAt: now,
          })
          .where(eq(media.id, mediaId));
      }

      // Delete old links and create new ones
      await db.delete(postMedia).where(eq(postMedia.postId, id));

      if (newMediaIds.length > 0) {
        const mediaLinks = newMediaIds.map((mediaId: string, index: number) => ({
          id: nanoid(),
          postId: id,
          mediaId,
          sortOrder: index,
          createdAt: now,
        }));

        await db.insert(postMedia).values(mediaLinks);
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      post: { id },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error updating post:', error);
    return new Response(JSON.stringify({ error: 'Failed to update post' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// DELETE: Soft delete post
export const DELETE: APIRoute = async ({ request, url }) => {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  const id = url.searchParams.get('id');

  if (!id) {
    return new Response(JSON.stringify({ error: 'Post ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get post with media
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, id),
      with: {
        media: true,
      },
    });

    if (!post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();

    // Soft delete the post
    await db.update(posts)
      .set({ 
        deletedAt: now,
        updatedAt: now,
        status: 'archived',
      })
      .where(eq(posts.id, id));

    // Decrement media ref counts
    for (const mediaLink of post.media) {
      await db.update(media)
        .set({ 
          refCount: sql`GREATEST(${media.refCount} - 1, 0)`,
          updatedAt: now,
        })
        .where(eq(media.id, mediaLink.mediaId));
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Post moved to trash',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error deleting post:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete post' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
