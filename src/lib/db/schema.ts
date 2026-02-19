/**
 * Database Schema
 * 
 * Drizzle ORM schema for SheSkin/Nucleus Commerce
 */

import { pgTable, text, timestamp, boolean, integer, json, real, decimal, varchar } from 'drizzle-orm/pg-core';

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
});

// Product images table
export const productImages = pgTable('product_images', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id),
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

// Types
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type ProductAttribute = typeof productAttributes.$inferSelect;
export type ProductSizeInventory = typeof productSizeInventory.$inferSelect;
export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
