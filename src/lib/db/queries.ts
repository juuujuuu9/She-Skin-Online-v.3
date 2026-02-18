/**
 * Database Query Utilities
 * 
 * Helper functions for querying products and categories
 */

import { eq, and, desc, asc, inArray, isNull } from 'drizzle-orm';
import { db } from './index';
import { products, categories, productImages, productCategories, productAttributes, productSizeInventory, carts, cartItems } from './schema';
import type { Product, ProductCategory, Cart as AppCart, CartItem as AppCartItem } from '../types';
import type { Product as DBProduct, ProductImage, ProductAttribute, ProductSizeInventory } from './schema';
import type { Category } from './schema';

interface ProductQueryResult {
  product: DBProduct;
  image: ProductImage | null;
  category: Category | null;
  productCategory: { id: string; productId: string; categoryId: string } | null;
  attribute: ProductAttribute | null;
  sizeInventory: ProductSizeInventory | null;
}

interface CategoryInfo {
  categoryId: string;
  name: string;
  slug: string;
}

/** Letter size order (smallest to largest) for apparel sizing */
const LETTER_SIZE_ORDER: Record<string, number> = {
  'XXS': 0, 'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5,
  'XXL': 6, '2XL': 6, '3XL': 7, '4XL': 8,
};

/** Sort size strings smallest to largest (numeric, letter, then One Size) */
function sortSizesByOrder(
  list: { size: string; quantity: number }[]
): { size: string; quantity: number }[] {
  return [...list].sort((a, b) => {
    const sa = a.size.trim();
    const sb = b.size.trim();
    if (sa.toLowerCase() === 'one size' && sb.toLowerCase() !== 'one size') return 1;
    if (sb.toLowerCase() === 'one size' && sa.toLowerCase() !== 'one size') return -1;
    if (sa.toLowerCase() === 'one size' && sb.toLowerCase() === 'one size') return 0;

    const numA = parseFloat(sa.replace(/[^\d.]/g, ''));
    const numB = parseFloat(sb.replace(/[^\d.]/g, ''));
    const aIsNum = !Number.isNaN(numA) && sa.match(/\d/);
    const bIsNum = !Number.isNaN(numB) && sb.match(/\d/);

    if (aIsNum && bIsNum) return numA - numB;
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;

    const orderA = LETTER_SIZE_ORDER[sa.toUpperCase()] ?? 999;
    const orderB = LETTER_SIZE_ORDER[sb.toUpperCase()] ?? 999;
    return orderA - orderB;
  });
}

/**
 * Format database product to application Product type
 */
function formatProduct(
  dbProduct: DBProduct,
  images: ProductImage[],
  categories: CategoryInfo[],
  attributes: ProductAttribute[],
  sizeInventoryList: ProductSizeInventory[]
): Product {
  // Deterministic order: primary first, then by sortOrder, then by id
  const sortedImages = [...images].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id.localeCompare(b.id);
  });
  const primaryImage = sortedImages.find(img => img.isPrimary) || sortedImages[0];
  
  return {
    id: dbProduct.id,
    databaseId: parseInt(dbProduct.id) || 0,
    name: dbProduct.name,
    slug: dbProduct.slug,
    description: dbProduct.description || undefined,
    shortDescription: dbProduct.shortDescription || undefined,
    price: dbProduct.price ? `$${dbProduct.price}` : undefined,
    regularPrice: dbProduct.regularPrice ? `$${dbProduct.regularPrice}` : undefined,
    salePrice: dbProduct.salePrice ? `$${dbProduct.salePrice}` : undefined,
    onSale: dbProduct.onSale || false,
    stockStatus: dbProduct.stockStatus || 'IN_STOCK',
    stockQuantity: dbProduct.stockQuantity || undefined,
    measurements: dbProduct.measurements || undefined,
    materials: dbProduct.materials || undefined,
    features: dbProduct.features || undefined,
    details: dbProduct.details || undefined,
    stripeCheckoutUrl: dbProduct.stripeCheckoutUrl || null,
    image: primaryImage ? {
      sourceUrl: primaryImage.imageUrl,
      altText: primaryImage.altText || undefined,
    } : undefined,
    galleryImages: sortedImages.length > 0 ? {
      nodes: sortedImages.map(img => ({
        sourceUrl: img.imageUrl,
        altText: img.altText || undefined,
      })),
    } : undefined,
    productCategories: categories.length > 0 ? {
      nodes: categories.map(cat => ({
        id: cat.categoryId,
        name: cat.name,
        slug: cat.slug,
      })),
    } : undefined,
    attributes: attributes.length > 0 ? {
      nodes: attributes.map(attr => ({
        id: attr.id,
        name: attr.name,
        options: JSON.parse(attr.options || '[]'),
      })),
    } : undefined,
    sizes: sizeInventoryList.length > 0
      ? sortSizesByOrder(sizeInventoryList.map(si => ({ size: si.size, quantity: si.quantity })))
      : undefined,
  };
}

/**
 * Get all products with optional category filter
 */
export async function getAllProducts(categorySlug?: string): Promise<Product[]> {
  let productIdsInCategory: string[] | undefined;
  
  if (categorySlug) {
    const categoryResult = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, categorySlug))
      .limit(1);
    
    if (categoryResult.length === 0) return [];
    
    const categoryId = categoryResult[0].id;
    
    const productCategoryResults = await db
      .select({ productId: productCategories.productId })
      .from(productCategories)
      .where(eq(productCategories.categoryId, categoryId));
    
    productIdsInCategory = productCategoryResults.map(r => r.productId);
    if (productIdsInCategory.length === 0) return [];
  }

  const baseQuery = db
    .select({
      product: products,
      image: productImages,
      category: categories,
      productCategory: productCategories,
      attribute: productAttributes,
      sizeInventory: productSizeInventory,
    })
    .from(products)
    .leftJoin(productImages, eq(products.id, productImages.productId))
    .leftJoin(productCategories, eq(products.id, productCategories.productId))
    .leftJoin(categories, eq(productCategories.categoryId, categories.id))
    .leftJoin(productAttributes, eq(products.id, productAttributes.productId))
    .leftJoin(productSizeInventory, eq(products.id, productSizeInventory.productId));

  const results: ProductQueryResult[] = categorySlug && productIdsInCategory
    ? await baseQuery.where(inArray(products.id, productIdsInCategory)).orderBy(desc(products.createdAt))
    : await baseQuery.orderBy(desc(products.createdAt));

  // Group results by product
  const productMap = new Map<string, {
    product: DBProduct;
    images: ProductImage[];
    categories: CategoryInfo[];
    attributes: ProductAttribute[];
    sizeInventory: ProductSizeInventory[];
  }>();

  for (const row of results) {
    const productId = row.product.id;
    
    if (!productMap.has(productId)) {
      productMap.set(productId, {
        product: row.product,
        images: [],
        categories: [],
        attributes: [],
        sizeInventory: [],
      });
    }

    const entry = productMap.get(productId)!;

    if (row.image && !entry.images.find(img => img.id === row.image!.id)) {
      entry.images.push(row.image);
    }

    if (row.category && !entry.categories.find(cat => cat.categoryId === row.category!.id)) {
      entry.categories.push({
        categoryId: row.category.id,
        name: row.category.name,
        slug: row.category.slug,
      });
    }

    if (row.attribute && !entry.attributes.find(attr => attr.id === row.attribute!.id)) {
      entry.attributes.push(row.attribute);
    }

    if (row.sizeInventory && !entry.sizeInventory.find(si => si.id === row.sizeInventory!.id)) {
      entry.sizeInventory.push(row.sizeInventory);
    }
  }

  return Array.from(productMap.values()).map(({ product, images, categories, attributes, sizeInventory }) =>
    formatProduct(product, images, categories, attributes, sizeInventory)
  );
}

/**
 * Get product by slug
 */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const results = await db
    .select({
      product: products,
      image: productImages,
      category: categories,
      productCategory: productCategories,
      attribute: productAttributes,
      sizeInventory: productSizeInventory,
    })
    .from(products)
    .where(eq(products.slug, slug))
    .leftJoin(productImages, eq(products.id, productImages.productId))
    .leftJoin(productCategories, eq(products.id, productCategories.productId))
    .leftJoin(categories, eq(productCategories.categoryId, categories.id))
    .leftJoin(productAttributes, eq(products.id, productAttributes.productId))
    .leftJoin(productSizeInventory, eq(products.id, productSizeInventory.productId));

  if (results.length === 0) return null;

  const product = results[0].product;
  const imageList: ProductImage[] = [];
  const categoryInfos: CategoryInfo[] = [];
  const attributeList: ProductAttribute[] = [];
  const sizeInventoryList: ProductSizeInventory[] = [];

  for (const row of results) {
    if (row.image && !imageList.find(img => img.id === row.image!.id)) imageList.push(row.image);
    if (row.category && !categoryInfos.find(cat => cat.categoryId === row.category!.id)) {
      categoryInfos.push({ categoryId: row.category.id, name: row.category.name, slug: row.category.slug });
    }
    if (row.attribute && !attributeList.find(attr => attr.id === row.attribute!.id)) attributeList.push(row.attribute);
    if (row.sizeInventory && !sizeInventoryList.find(si => si.id === row.sizeInventory!.id)) sizeInventoryList.push(row.sizeInventory);
  }

  return formatProduct(product, imageList, categoryInfos, attributeList, sizeInventoryList);
}

/**
 * Get product by id
 */
export async function getProductById(id: string): Promise<Product | null> {
  const results = await db
    .select({
      product: products,
      image: productImages,
      category: categories,
      productCategory: productCategories,
      attribute: productAttributes,
      sizeInventory: productSizeInventory,
    })
    .from(products)
    .where(eq(products.id, id))
    .leftJoin(productImages, eq(products.id, productImages.productId))
    .leftJoin(productCategories, eq(products.id, productCategories.productId))
    .leftJoin(categories, eq(productCategories.categoryId, categories.id))
    .leftJoin(productAttributes, eq(products.id, productAttributes.productId))
    .leftJoin(productSizeInventory, eq(products.id, productSizeInventory.productId));

  if (results.length === 0) return null;

  const product = results[0].product;
  const imageList: ProductImage[] = [];
  const categoryInfos: CategoryInfo[] = [];
  const attributeList: ProductAttribute[] = [];
  const sizeInventoryList: ProductSizeInventory[] = [];

  for (const row of results) {
    if (row.image && !imageList.find((img) => img.id === row.image!.id)) imageList.push(row.image);
    if (row.category && !categoryInfos.find((c) => c.categoryId === row.category!.id)) {
      categoryInfos.push({ categoryId: row.category.id, name: row.category.name, slug: row.category.slug });
    }
    if (row.attribute && !attributeList.find((a) => a.id === row.attribute!.id)) attributeList.push(row.attribute);
    if (row.sizeInventory && !sizeInventoryList.find((s) => s.id === row.sizeInventory!.id)) sizeInventoryList.push(row.sizeInventory);
  }

  return formatProduct(product, imageList, categoryInfos, attributeList, sizeInventoryList);
}

/**
 * Get all categories
 */
export async function getAllCategories(): Promise<ProductCategory[]> {
  const results = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return results.map(cat => ({
    id: cat.id,
    databaseId: parseInt(cat.id) || 0,
    name: cat.name,
    slug: cat.slug,
    description: cat.description || undefined,
    image: cat.imageUrl ? {
      sourceUrl: cat.imageUrl,
      altText: cat.imageAlt || undefined,
    } : undefined,
  }));
}

// --- Cart (server-side) ---

const CART_COOKIE_NAME = 'cart_id';
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function parsePriceToNumber(price: string | null): number {
  if (!price) return 0;
  const stripped = price.replace(/<[^>]*>/g, '').trim();
  const match = stripped.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}

function formatLinePrice(amount: number): string {
  return `${amount.toFixed(2)} USD`;
}

export function getCartIdFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${CART_COOKIE_NAME}=([^;]+)`));
  return match ? match[1].trim() : null;
}

export { CART_COOKIE_NAME, CART_COOKIE_MAX_AGE };

export async function createCart(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(carts).values({ id });
  return id;
}

export async function getCartForApp(cartId: string): Promise<AppCart | null> {
  const rows = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cartId))
    .orderBy(cartItems.createdAt);

  if (rows.length === 0) {
    return {
      contents: { nodes: [] },
      itemCount: 0,
      subtotal: '0.00 USD',
      total: '0.00 USD',
    };
  }

  const nodes: AppCartItem[] = [];
  let subtotalNum = 0;

  for (const row of rows) {
    const product = await getProductById(row.productId);
    if (!product) continue;
    const key = row.size ? `${row.productId}::${row.size}` : row.productId;
    const unitPrice = parsePriceToNumber(product.price ?? null);
    const lineTotal = unitPrice * row.quantity;
    subtotalNum += lineTotal;
    const totalStr = formatLinePrice(lineTotal);
    nodes.push({
      key,
      product: { node: product },
      quantity: row.quantity,
      subtotal: totalStr,
      total: totalStr,
    });
  }

  return {
    contents: { nodes },
    itemCount: nodes.reduce((s, n) => s + n.quantity, 0),
    subtotal: formatLinePrice(subtotalNum),
    total: formatLinePrice(subtotalNum),
  };
}

export async function addCartItem(
  cartId: string,
  productId: string,
  quantity: number,
  size: string | null
): Promise<string> {
  const existing = await db
    .select()
    .from(cartItems)
    .where(
      and(
        eq(cartItems.cartId, cartId),
        eq(cartItems.productId, productId),
        size === null ? isNull(cartItems.size) : eq(cartItems.size, size)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const newQty = existing[0].quantity + quantity;
    await db.update(cartItems).set({ quantity: newQty }).where(eq(cartItems.id, existing[0].id));
  } else {
    await db.insert(cartItems).values({
      id: crypto.randomUUID(),
      cartId,
      productId,
      size,
      quantity,
    });
  }

  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
  return size ? `${productId}::${size}` : productId;
}

export async function updateCartItemByKey(
  cartId: string,
  key: string,
  quantity: number
): Promise<void> {
  let productId: string;
  let size: string | null;
  const sepIdx = key.indexOf('::');
  if (sepIdx >= 0) {
    productId = key.slice(0, sepIdx);
    size = key.slice(sepIdx + 2);
  } else {
    productId = key;
    size = null;
  }

  const rows = await db
    .select()
    .from(cartItems)
    .where(
      and(
        eq(cartItems.cartId, cartId),
        eq(cartItems.productId, productId),
        size === null ? isNull(cartItems.size) : eq(cartItems.size, size)
      )
    )
    .limit(1);

  if (rows.length === 0) return;
  if (quantity < 1) {
    await db.delete(cartItems).where(eq(cartItems.id, rows[0].id));
  } else {
    await db.update(cartItems).set({ quantity }).where(eq(cartItems.id, rows[0].id));
  }
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
}
