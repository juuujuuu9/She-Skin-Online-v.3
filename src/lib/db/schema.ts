/**
 * Database Schema - Anti-Bloat Content Management
 *
 * WordPress-style content architecture with:
 * - Posts stored in database (no JSON files)
 * - Media library with reference counting
 * - Automatic cleanup of orphaned content
 * - Soft deletes for recovery
 */

import { pgTable, text, timestamp, boolean, integer, json, real, decimal, varchar, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// CONTENT MANAGEMENT TABLES (WordPress-style)
// ============================================================================

// Posts table - CMS-style content entries (replaces JSON content files)
export const posts = pgTable('posts', {
  id: text('id').primaryKey(), // nanoid
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  content: text('content').notNull(), // Markdown/HTML content
  excerpt: text('excerpt'), // Short description for listings
  
  // Post type: 'page', 'work', 'product_description', 'blog', etc.
  postType: text('post_type').notNull().default('page'),
  
  // Status
  status: text('status').notNull().default('draft'), // 'draft', 'published', 'scheduled', 'archived'
  publishedAt: timestamp('published_at'),
  
  // SEO
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  ogImage: text('og_image'),
  
  // Organization
  parentId: text('parent_id'), // For hierarchical content
  sortOrder: integer('sort_order').default(0),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'), // Soft delete
}, (table) => ({
  slugIdx: index('posts_slug_idx').on(table.slug),
  typeIdx: index('posts_type_idx').on(table.postType),
  statusIdx: index('posts_status_idx').on(table.status),
  parentIdx: index('posts_parent_idx').on(table.parentId),
}));

// Post meta table - flexible key-value storage for custom fields
export const postMeta = pgTable('post_meta', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  metaKey: text('meta_key').notNull(),
  metaValue: text('meta_value'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  postKeyIdx: index('post_meta_post_key_idx').on(table.postId, table.metaKey),
  keyIdx: index('post_meta_key_idx').on(table.metaKey),
}));

// Media library - centralized media storage with reference counting
export const media = pgTable('media', {
  id: text('id').primaryKey(),
  
  // Original file info
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(), // bytes
  
  // Storage paths (Bunny CDN URLs)
  url: text('url').notNull(),
  path: text('path').notNull(), // Storage path for deletion
  
  // Variants (auto-generated sizes)
  variants: json('variants').$type<{
    sm?: { url: string; width: number; height: number; size: number };
    md?: { url: string; width: number; height: number; size: number };
    lg?: { url: string; width: number; height: number; size: number };
    xl?: { url: string; width: number; height: number; size: number };
  }>(),
  
  // Image metadata
  width: integer('width'),
  height: integer('height'),
  blurhash: text('blurhash'),
  dominantColor: text('dominant_color'),
  
  // Anti-bloat: reference counting
  // When count reaches 0, media can be safely deleted
  refCount: integer('ref_count').notNull().default(0),
  
  // Media type
  mediaType: text('media_type').notNull(), // 'image', 'audio', 'video', 'document'
  
  // Alt text for accessibility
  altText: text('alt_text'),
  
  // Upload metadata
  uploadedBy: text('uploaded_by').default('admin'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'), // Soft delete
}, (table) => ({
  typeIdx: index('media_type_idx').on(table.mediaType),
  refCountIdx: index('media_ref_count_idx').on(table.refCount),
  deletedAtIdx: index('media_deleted_at_idx').on(table.deletedAt),
}));

// Post-media junction table (tracks which media is used where)
export const postMedia = pgTable('post_media', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  mediaId: text('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
  
  // Context within the post
  context: text('context').default('content'), // 'content', 'featured', 'gallery', 'meta'
  sortOrder: integer('sort_order').default(0),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  postIdx: index('post_media_post_idx').on(table.postId),
  mediaIdx: index('post_media_media_idx').on(table.mediaId),
  uniquePostMedia: index('post_media_unique_idx').on(table.postId, table.mediaId, table.context),
}));

// Revisions table - content versioning (optional, for undo/redo)
export const revisions = pgTable('revisions', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  
  // Revision data
  title: text('title').notNull(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  
  // Change metadata
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: text('created_by').default('admin'),
  changeMessage: text('change_message'), // "Updated hero image", "Fixed typo"
}, (table) => ({
  postIdx: index('revisions_post_idx').on(table.postId),
  createdAtIdx: index('revisions_created_at_idx').on(table.createdAt),
}));

// ============================================================================
// EXISTING TABLES (Preserved with soft delete additions)
// ============================================================================

// Categories table
export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  imageUrl: text('image_url'),
  imageAlt: text('image_alt'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'), // Soft delete
});

// Products table
export const products = pgTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  shortDescription: text('short_description'),
  price: decimal('price', { precision: 10, scale: 2 }),
  regularPrice: decimal('regular_price', { precision: 10, scale: 2 }),
  salePrice: decimal('sale_price', { precision: 10, scale: 2 }),
  onSale: boolean('on_sale').default(false),
  stockStatus: text('stock_status').default('IN_STOCK'),
  stockQuantity: integer('stock_quantity'),
  measurements: text('measurements'),
  materials: text('materials'),
  features: text('features'),
  details: text('details'),
  stripeCheckoutUrl: text('stripe_checkout_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'), // Soft delete
});

// Product images table - updated to reference media
export const productImages = pgTable('product_images', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id),
  // Can reference media library OR be external URL
  mediaId: text('media_id').references(() => media.id, { onDelete: 'set null' }),
  imageUrl: text('image_url').notNull(),
  altText: text('alt_text'),
  isPrimary: boolean('is_primary').default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// Product categories junction table
export const productCategories = pgTable('product_categories', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id),
  categoryId: text('category_id').notNull().references(() => categories.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// Product attributes table (for size, color, etc.)
export const productAttributes = pgTable('product_attributes', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id),
  name: text('name').notNull(), // e.g., "Size", "Color"
  options: text('options').notNull(), // JSON string of options
  createdAt: timestamp('created_at').defaultNow(),
});

// Product size inventory table
export const productSizeInventory = pgTable('product_size_inventory', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id),
  size: text('size').notNull(),
  quantity: integer('quantity').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Carts table
export const carts = pgTable('carts', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Cart items table
export const cartItems = pgTable('cart_items', {
  id: text('id').primaryKey(),
  cartId: text('cart_id').notNull().references(() => carts.id),
  productId: text('product_id').notNull().references(() => products.id),
  size: text('size'),
  quantity: integer('quantity').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow(),
});

// Works table (unified for all portfolio categories)
export const works = pgTable('works', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  category: text('category').notNull(), // 'audio' | 'physical' | 'digital' | 'collaborations'
  description: text('description'),
  year: integer('year'),
  forSale: boolean('for_sale').default(false),
  price: decimal('price', { precision: 10, scale: 2 }),
  externalUrl: text('external_url'), // for collaborations (YouTube, etc.)
  sortOrder: integer('sort_order').default(0),
  published: boolean('published').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'), // Soft delete
});

// Work media table - updated to reference media library
export const workMedia = pgTable('work_media', {
  id: text('id').primaryKey(),
  workId: text('work_id').notNull().references(() => works.id, { onDelete: 'cascade' }),
  mediaId: text('media_id').references(() => media.id, { onDelete: 'set null' }),
  type: text('type').notNull(), // 'image' | 'audio' | 'cover'
  url: text('url').notNull(), // Bunny CDN URL
  variants: json('variants'), // { sm: url, md: url, lg: url }
  blurhash: text('blurhash'),
  dominantColor: text('dominant_color'),
  width: integer('width'),
  height: integer('height'),
  sortOrder: integer('sort_order').default(0),
  isPrimary: boolean('is_primary').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Audio track metadata
export const audioTracks = pgTable('audio_tracks', {
  id: text('id').primaryKey(),
  workId: text('work_id').notNull().references(() => works.id, { onDelete: 'cascade' }),
  duration: integer('duration'), // seconds
  trackNumber: integer('track_number'),
  fileSize: integer('file_size'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ============================================================================
// TYPES
// ============================================================================

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type ProductAttribute = typeof productAttributes.$inferSelect;
export type ProductSizeInventory = typeof productSizeInventory.$inferSelect;
export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type Work = typeof works.$inferSelect;
export type WorkMedia = typeof workMedia.$inferSelect;
export type AudioTrack = typeof audioTracks.$inferSelect;

// Content management types
export type Post = typeof posts.$inferSelect;
export type PostMeta = typeof postMeta.$inferSelect;
export type Media = typeof media.$inferSelect;
export type PostMedia = typeof postMedia.$inferSelect;
export type Revision = typeof revisions.$inferSelect;

// ============================================================================
// RELATIONS
// ============================================================================

export const postsRelations = relations(posts, ({ many, one }) => ({
  meta: many(postMeta),
  media: many(postMedia),
  revisions: many(revisions),
  parent: one(posts, {
    fields: [posts.parentId],
    references: [posts.id],
  }),
}));

export const postMetaRelations = relations(postMeta, ({ one }) => ({
  post: one(posts, {
    fields: [postMeta.postId],
    references: [posts.id],
  }),
}));

export const mediaRelations = relations(media, ({ many }) => ({
  posts: many(postMedia),
}));

export const postMediaRelations = relations(postMedia, ({ one }) => ({
  post: one(posts, {
    fields: [postMedia.postId],
    references: [posts.id],
  }),
  media: one(media, {
    fields: [postMedia.mediaId],
    references: [media.id],
  }),
}));

export const revisionsRelations = relations(revisions, ({ one }) => ({
  post: one(posts, {
    fields: [revisions.postId],
    references: [posts.id],
  }),
}));

export const worksRelations = relations(works, ({ many }) => ({
  media: many(workMedia),
  audioTrack: many(audioTracks),
}));

export const workMediaRelations = relations(workMedia, ({ one }) => ({
  work: one(works, {
    fields: [workMedia.workId],
    references: [works.id],
  }),
  mediaLibrary: one(media, {
    fields: [workMedia.mediaId],
    references: [media.id],
  }),
}));

export const audioTracksRelations = relations(audioTracks, ({ one }) => ({
  work: one(works, {
    fields: [audioTracks.workId],
    references: [works.id],
  }),
}));
