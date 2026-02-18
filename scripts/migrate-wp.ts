#!/usr/bin/env tsx
/**
 * WordPress WXR → Nucleus Commerce Migration
 * 
 * Usage:
 *   npm run migrate:wp -- --source /path/to/export.xml --output ./content
 */

import { parseStringPromise } from 'xml2js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, basename } from 'path';
import { createHash } from 'crypto';

interface WPMedia {
  id: string;
  url: string;
  title: string;
  type: string;
}

interface WPProduct {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  date: string;
  status: string;
  price?: string;
  regularPrice?: string;
  salePrice?: string;
  sku?: string;
  stockStatus?: string;
  stockQuantity?: string;
  categories: string[];
  tags: string[];
  images: string[]; // attachment IDs
  meta: Record<string, string>;
}

interface WPWork {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  date: string;
  status: string;
  type: 'audio' | 'physical' | 'digital' | 'collaborations';
  categories: string[];
  tags: string[];
  featuredImage?: string;
  audioUrl?: string; // For audio posts
  meta: Record<string, string>;
}

interface WPPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  date: string;
  status: string;
  template?: string;
}

interface ParsedContent {
  products: WPProduct[];
  works: WPWork[];
  pages: WPPage[];
  media: Map<string, WPMedia>;
}

// Map WordPress post types to our content types
const WORK_TYPE_MAP: Record<string, WPWork['type']> = {
  'post': 'physical', // Default posts go to physical works
  'audio': 'audio',
  'physical_works': 'physical',
  'digital_works': 'digital',
  'collaborations': 'collaborations',
};

// Clean HTML content for Markdown
function htmlToMarkdown(html: string): string {
  // Basic cleanup - replace common HTML patterns
  return html
    .replace(/<p>/gi, '\n\n')
    .replace(/<\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]+>/g, '') // Remove remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

// Parse WooCommerce price meta
function getProductMeta(meta: any[], key: string): string | undefined {
  const item = meta?.find((m: any) => m['wp:meta_key']?.[0] === key);
  return item?.['wp:meta_value']?.[0];
}

// Extract categories from item
function getCategories(item: any): string[] {
  const cats = item.category || [];
  return cats
    .filter((c: any) => c['$']?.domain !== 'product_type' && c['$']?.domain !== 'product_visibility')
    .map((c: any) => c['_'])
    .filter(Boolean);
}

// Extract tags from item
function getTags(item: any): string[] {
  const tags = item.tag || [];
  return tags.map((t: any) => t['_']).filter(Boolean);
}

// Main parsing function
async function parseWXR(xmlPath: string): Promise<ParsedContent> {
  console.log(`📄 Parsing ${basename(xmlPath)}...`);
  
  const xml = await readFile(xmlPath, 'utf-8');
  const result = await parseStringPromise(xml, {
    explicitArray: true,
    mergeAttrs: true,
  });

  const channel = result.rss.channel[0];
  const items = channel.item || [];
  
  const media = new Map<string, WPMedia>();
  const products: WPProduct[] = [];
  const works: WPWork[] = [];
  const pages: WPPage[] = [];

  console.log(`📝 Found ${items.length} items`);

  for (const item of items) {
    const postType = item['wp:post_type']?.[0];
    const postId = item['wp:post_id']?.[0];
    const status = item['wp:status']?.[0];
    
    // Skip drafts and revisions
    if (status !== 'publish' && status !== 'private') continue;

    // Parse media attachments
    if (postType === 'attachment') {
      const attachmentUrl = item['wp:attachment_url']?.[0];
      if (attachmentUrl) {
        media.set(postId, {
          id: postId,
          url: attachmentUrl,
          title: item.title?.[0] || '',
          type: item['wp:post_mime_type']?.[0] || '',
        });
      }
      continue;
    }

    // Parse WooCommerce products
    if (postType === 'product') {
      const meta = item['wp:postmeta'] || [];
      
      products.push({
        id: postId,
        title: item.title?.[0] || '',
        slug: item['wp:post_name']?.[0] || '',
        content: item['content:encoded']?.[0] || '',
        excerpt: item['excerpt:encoded']?.[0] || '',
        date: item['wp:post_date']?.[0] || '',
        status,
        price: getProductMeta(meta, '_price'),
        regularPrice: getProductMeta(meta, '_regular_price'),
        salePrice: getProductMeta(meta, '_sale_price'),
        sku: getProductMeta(meta, '_sku'),
        stockStatus: getProductMeta(meta, '_stock_status'),
        stockQuantity: getProductMeta(meta, '_stock'),
        categories: getCategories(item),
        tags: getTags(item),
        images: (item['wp:postmeta'] || [])
          .filter((m: any) => m['wp:meta_key']?.[0] === '_thumbnail_id')
          .map((m: any) => m['wp:meta_value']?.[0]),
        meta: {},
      });
      continue;
    }

    // Parse pages
    if (postType === 'page') {
      pages.push({
        id: postId,
        title: item.title?.[0] || '',
        slug: item['wp:post_name']?.[0] || '',
        content: item['content:encoded']?.[0] || '',
        date: item['wp:post_date']?.[0] || '',
        status,
        template: getProductMeta(item['wp:postmeta'] || [], '_wp_page_template'),
      });
      continue;
    }

    // Parse works (custom post types and regular posts)
    const workType = WORK_TYPE_MAP[postType] || 'physical';
    
    // Extract audio URL from content if it's an audio post
    let audioUrl: string | undefined;
    const content = item['content:encoded']?.[0] || '';
    const audioMatch = content.match(/https?:\/\/[^\s\"]+\.(mp3|wav|ogg|m4a)/i);
    if (audioMatch) {
      audioUrl = audioMatch[0];
    }

    works.push({
      id: postId,
      title: item.title?.[0] || '',
      slug: item['wp:post_name']?.[0] || '',
      content,
      excerpt: item['excerpt:encoded']?.[0] || '',
      date: item['wp:post_date']?.[0] || '',
      status,
      type: workType,
      categories: getCategories(item),
      tags: getTags(item),
      featuredImage: getProductMeta(item['wp:postmeta'] || [], '_thumbnail_id'),
      audioUrl,
      meta: {},
    });
  }

  return { products, works, pages, media };
}

// Generate product YAML frontmatter
function generateProductYAML(product: WPProduct, media: Map<string, WPMedia>): string {
  const price = parseFloat(product.price || '0') * 100; // Convert to cents
  const imageUrl = product.images[0] ? media.get(product.images[0])?.url : null;
  
  return `---
name: ${JSON.stringify(product.title)}
slug: ${product.slug}
price: ${price || 0}
currency: USD
description: ${JSON.stringify(htmlToMarkdown(product.content).slice(0, 500))}
shortDescription: ${JSON.stringify(htmlToMarkdown(product.excerpt))}
images:
  - src: ${imageUrl || 'https://via.placeholder.com/600'}
    alt: ${JSON.stringify(product.title)}
    isPrimary: true
    sortOrder: 0
inventory:
  trackQuantity: true
  quantity: ${parseInt(product.stockQuantity || '0') || 0}
  allowBackorders: false
status: ${product.status === 'publish' ? 'active' : 'draft'}
${product.categories.length > 0 ? `categories:\n${product.categories.map(c => `  - ${c.toLowerCase().replace(/\s+/g, '-')}`).join('\n')}` : ''}
${product.tags.length > 0 ? `tags:\n${product.tags.map(t => `  - ${t.toLowerCase().replace(/\s+/g, '-')}`).join('\n')}` : ''}
---

${htmlToMarkdown(product.content)}
`;
}

// Generate work Markdown frontmatter
function generateWorkMarkdown(work: WPWork, media: Map<string, WPMedia>): string {
  const featuredImageUrl = work.featuredImage ? media.get(work.featuredImage)?.url : null;
  
  return `---
title: ${JSON.stringify(work.title)}
slug: ${work.slug}
category: ${work.type}
date: ${new Date(work.date).toISOString()}
featured: false
${featuredImageUrl ? `coverImage: ${JSON.stringify(featuredImageUrl)}` : ''}
media:
${work.audioUrl ? `  - type: audio
    src: ${JSON.stringify(work.audioUrl)}
    title: ${JSON.stringify(work.title)}` : featuredImageUrl ? `  - type: image
    src: ${JSON.stringify(featuredImageUrl)}
    alt: ${JSON.stringify(work.title)}
    width: 1200
    height: 800` : ''}
${work.tags.length > 0 ? `tags:\n${work.tags.map(t => `  - ${t.toLowerCase().replace(/\s+/g, '-')}`).join('\n')}` : ''}
${work.categories.length > 0 ? `materials:\n${work.categories.map(c => `  - ${c}`).join('\n')}` : ''}
---

${htmlToMarkdown(work.content)}
`;
}

// Generate page Markdown
function generatePageMarkdown(page: WPPage): string {
  return `---
title: ${JSON.stringify(page.title)}
slug: ${page.slug}
description: ${JSON.stringify(htmlToMarkdown(page.content).slice(0, 160))}
layout: default
${page.slug === 'home' || page.slug === '' ? 'showInNav: false' : 'showInNav: true'}
---

${htmlToMarkdown(page.content)}
`;
}

// Write files
async function writeContent(
  parsed: ParsedContent,
  outputDir: string
): Promise<void> {
  // Create directories
  await mkdir(`${outputDir}/works/audio`, { recursive: true });
  await mkdir(`${outputDir}/works/physical`, { recursive: true });
  await mkdir(`${outputDir}/works/digital`, { recursive: true });
  await mkdir(`${outputDir}/works/collaborations`, { recursive: true });
  await mkdir(`${outputDir}/products`, { recursive: true });
  await mkdir(`${outputDir}/pages`, { recursive: true });
  await mkdir(`${outputDir}/media-manifest`, { recursive: true });

  // Write products
  console.log(`\n🛒 Writing ${parsed.products.length} products...`);
  for (const product of parsed.products) {
    const filename = `${product.slug}.md`;
    const content = generateProductYAML(product, parsed.media);
    await writeFile(`${outputDir}/products/${filename}`, content);
    console.log(`   ✓ products/${filename}`);
  }

  // Write works
  console.log(`\n🎨 Writing ${parsed.works.length} works...`);
  for (const work of parsed.works) {
    const filename = `${work.slug}.md`;
    const content = generateWorkMarkdown(work, parsed.media);
    await writeFile(`${outputDir}/works/${work.type}/${filename}`, content);
    console.log(`   ✓ works/${work.type}/${filename}`);
  }

  // Write pages
  console.log(`\n📄 Writing ${parsed.pages.length} pages...`);
  for (const page of parsed.pages) {
    const filename = `${page.slug || 'home'}.md`;
    const content = generatePageMarkdown(page);
    await writeFile(`${outputDir}/pages/${filename}`, content);
    console.log(`   ✓ pages/${filename}`);
  }

  // Write media manifest
  const mediaList = Array.from(parsed.media.values());
  console.log(`\n🖼️ Writing media manifest (${mediaList.length} files)...`);
  await writeFile(
    `${outputDir}/media-manifest/files.json`,
    JSON.stringify(mediaList, null, 2)
  );

  // Generate download script
  const downloadScript = `#!/bin/bash
# Download all media files from the old site
# Run: bash download-media.sh

mkdir -p media/originals

${mediaList.map(m => `curl -L -o "media/originals/${basename(m.url)}" "${m.url}"`).join('\n')}

echo "Download complete! Run 'npm run media:process' to optimize."
`;
  await writeFile(`${outputDir}/download-media.sh`, downloadScript);
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const sourceIndex = args.indexOf('--source');
  const outputIndex = args.indexOf('--output');
  
  const sourcePath = sourceIndex >= 0 ? args[sourceIndex + 1] : null;
  const outputDir = outputIndex >= 0 ? args[outputIndex + 1] : './content-imported';
  
  if (!sourcePath) {
    console.error('Usage: npm run migrate:wp -- --source /path/to/export.xml --output ./content');
    process.exit(1);
  }

  if (!existsSync(sourcePath)) {
    console.error(`File not found: ${sourcePath}`);
    process.exit(1);
  }

  console.log('🚀 Starting WordPress migration...\n');
  
  const parsed = await parseWXR(sourcePath);
  
  console.log(`\n📊 Summary:`);
  console.log(`   Products: ${parsed.products.length}`);
  console.log(`   Works: ${parsed.works.length}`);
  console.log(`   Pages: ${parsed.pages.length}`);
  console.log(`   Media files: ${parsed.media.size}`);
  
  await writeContent(parsed, outputDir);
  
  console.log(`\n✅ Migration complete!`);
  console.log(`   Output: ${outputDir}/`);
  console.log(`\nNext steps:`);
  console.log(`   1. Review imported content in ${outputDir}/`);
  console.log(`   2. Run: bash ${outputDir}/download-media.sh`);
  console.log(`   3. Run: npm run media:process`);
  console.log(`   4. Move processed content to src/content/`);
}

main().catch(console.error);
