#!/usr/bin/env tsx
/**
 * WordPress XML Parser for SheSkin Migration
 * 
 * Parses the WordPress WXR export file and extracts:
 * - Digital works (post_type = 'digital')
 * - Collaborations (post_type = 'collabs') 
 * - Physical works (post_type = 'product' - WooCommerce products)
 * - All attachments with direct URLs
 * 
 * Note: Audio posts (184 mentioned) are NOT in this XML export.
 *       They may be in a separate export file.
 */

import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';

// Configuration
const INPUT_FILE = '/Users/user/Development/sheskin/repo/public/audio-covers/she_skin.WordPress.2026-02-23.xml';
const OUTPUT_DIR = '/Users/user/Development/sheskin/repo/public/audio-covers';

// Type definitions
interface WordPressMeta {
  meta_key: string;
  meta_value: string;
}

interface WordPressPost {
  title: string;
  link: string;
  pubDate: string;
  'dc:creator': string;
  guid: { '@_isPermaLink': string; '#text': string } | string;
  description: string;
  'content:encoded': string;
  'excerpt:encoded': string;
  'wp:post_id': string;
  'wp:post_date': string;
  'wp:post_date_gmt': string;
  'wp:post_modified': string;
  'wp:post_modified_gmt': string;
  'wp:comment_status': string;
  'wp:ping_status': string;
  'wp:post_name': string;
  'wp:status': string;
  'wp:post_parent': string;
  'wp:menu_order': string;
  'wp:post_type': string;
  'wp:post_password': string;
  'wp:is_sticky': string;
  'wp:attachment_url'?: string;
  'wp:postmeta'?: WordPressMeta | WordPressMeta[];
  category?: any;
}

interface ExtractedPost {
  id: number;
  title: string;
  content: string;
  excerpt: string;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  link: string;
  guid: string;
  author: string;
  featured_image_id: number | null;
  metadata: Record<string, any>;
}

interface AttachmentData {
  id: number;
  title: string;
  url: string;
  file: string;
  date: string;
  parent_id: number | null;
  metadata: Record<string, any>;
}

// Helper to safely extract text from CDATA
function extractText(value: any): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    // Handle fast-xml-parser CDATA format
    if (value['__cdata']) return value['__cdata'];
    if (value['#text']) return value['#text'];
  }
  return '';
}

// Helper to parse meta values
function parseMetaValue(value: string): any {
  // Try to parse as serialized PHP array
  if (value.startsWith('a:') || value.startsWith('s:') || value.startsWith('i:') || value.startsWith('b:')) {
    // This is a serialized PHP value - we'll store it as-is for now
    // Full PHP unserialization would require a dedicated library
    return value;
  }
  // Try to parse as JSON
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// Helper to extract metadata from post
function extractMetadata(post: WordPressPost): Record<string, any> {
  const metadata: Record<string, any> = {};
  
  if (post['wp:postmeta']) {
    const metas = Array.isArray(post['wp:postmeta']) 
      ? post['wp:postmeta'] 
      : [post['wp:postmeta']];
    
    for (const meta of metas) {
      const key = extractText(meta['wp:meta_key']);
      const value = extractText(meta['wp:meta_value']);
      if (key) {
        metadata[key] = parseMetaValue(value);
      }
    }
  }
  
  return metadata;
}

// Helper to get featured image ID from metadata
function getFeaturedImageId(metadata: Record<string, any>): number | null {
  // Check common featured image meta keys
  const keys = ['_thumbnail_id', 'featured_image', '_featured_image'];
  for (const key of keys) {
    if (metadata[key]) {
      const id = parseInt(metadata[key], 10);
      if (!isNaN(id)) return id;
    }
  }
  return null;
}

// Main parsing function
async function parseWordPressXML() {
  console.log('🔍 Parsing WordPress XML export...');
  console.log(`📁 Input: ${INPUT_FILE}`);
  
  // Read and parse XML
  const xmlContent = fs.readFileSync(INPUT_FILE, 'utf-8');
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
    cdataPropName: '__cdata',
  });
  
  const parsed = parser.parse(xmlContent);
  
  if (!parsed.rss || !parsed.rss.channel || !parsed.rss.channel.item) {
    throw new Error('Invalid WordPress XML format');
  }
  
  const items: WordPressPost[] = Array.isArray(parsed.rss.channel.item) 
    ? parsed.rss.channel.item 
    : [parsed.rss.channel.item];
  
  console.log(`📊 Total items found: ${items.length}`);
  
  // Storage for extracted data
  const digitalPosts: ExtractedPost[] = [];
  const collabsPosts: ExtractedPost[] = [];
  const physicalPosts: ExtractedPost[] = [];
  const attachments: AttachmentData[] = [];
  
  // Categorize items
  for (const item of items) {
    const postType = extractText(item['wp:post_type']);
    
    if (postType === 'attachment') {
      const metadata = extractMetadata(item);
      attachments.push({
        id: parseInt(extractText(item['wp:post_id']), 10) || 0,
        title: extractText(item.title),
        url: extractText(item['wp:attachment_url'] || ''),
        file: extractText(metadata['_wp_attached_file'] || ''),
        date: extractText(item['wp:post_date_gmt']),
        parent_id: parseInt(extractText(item['wp:post_parent']), 10) || null,
        metadata: metadata,
      });
    } else if (postType === 'digital') {
      const metadata = extractMetadata(item);
      digitalPosts.push({
        id: parseInt(extractText(item['wp:post_id']), 10) || 0,
        title: extractText(item.title),
        content: extractText(item['content:encoded']),
        excerpt: extractText(item['excerpt:encoded']),
        date: extractText(item['wp:post_date_gmt']),
        date_gmt: extractText(item['wp:post_date_gmt']),
        modified: extractText(item['wp:post_modified']),
        modified_gmt: extractText(item['wp:post_modified_gmt']),
        slug: extractText(item['wp:post_name']),
        status: extractText(item['wp:status']),
        link: extractText(item.link),
        guid: typeof item.guid === 'object' ? extractText(item.guid['#text']) : extractText(item.guid),
        author: extractText(item['dc:creator']),
        featured_image_id: getFeaturedImageId(metadata),
        metadata: metadata,
      });
    } else if (postType === 'collabs') {
      const metadata = extractMetadata(item);
      collabsPosts.push({
        id: parseInt(extractText(item['wp:post_id']), 10) || 0,
        title: extractText(item.title),
        content: extractText(item['content:encoded']),
        excerpt: extractText(item['excerpt:encoded']),
        date: extractText(item['wp:post_date_gmt']),
        date_gmt: extractText(item['wp:post_date_gmt']),
        modified: extractText(item['wp:post_modified']),
        modified_gmt: extractText(item['wp:post_modified_gmt']),
        slug: extractText(item['wp:post_name']),
        status: extractText(item['wp:status']),
        link: extractText(item.link),
        guid: typeof item.guid === 'object' ? extractText(item.guid['#text']) : extractText(item.guid),
        author: extractText(item['dc:creator']),
        featured_image_id: getFeaturedImageId(metadata),
        metadata: metadata,
      });
    } else if (postType === 'product') {
      // Physical works are stored as WooCommerce products
      const metadata = extractMetadata(item);
      physicalPosts.push({
        id: parseInt(extractText(item['wp:post_id']), 10) || 0,
        title: extractText(item.title),
        content: extractText(item['content:encoded']),
        excerpt: extractText(item['excerpt:encoded']),
        date: extractText(item['wp:post_date_gmt']),
        date_gmt: extractText(item['wp:post_date_gmt']),
        modified: extractText(item['wp:post_modified']),
        modified_gmt: extractText(item['wp:post_modified_gmt']),
        slug: extractText(item['wp:post_name']),
        status: extractText(item['wp:status']),
        link: extractText(item.link),
        guid: typeof item.guid === 'object' ? extractText(item.guid['#text']) : extractText(item.guid),
        author: extractText(item['dc:creator']),
        featured_image_id: getFeaturedImageId(metadata),
        metadata: metadata,
      });
    }
  }
  
  // Sort by date (newest first)
  const sortByDate = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
  
  digitalPosts.sort(sortByDate);
  collabsPosts.sort(sortByDate);
  physicalPosts.sort(sortByDate);
  attachments.sort(sortByDate);
  
  // Create attachments mapping (id -> url)
  const attachmentMapping: Record<number, string> = {};
  for (const att of attachments) {
    attachmentMapping[att.id] = att.url;
  }
  
  // Add image URLs to posts
  const addImageUrls = (posts: ExtractedPost[]) => {
    for (const post of posts) {
      if (post.featured_image_id && attachmentMapping[post.featured_image_id]) {
        (post as any).featured_image_url = attachmentMapping[post.featured_image_id];
      }
    }
  };
  
  addImageUrls(digitalPosts);
  addImageUrls(collabsPosts);
  addImageUrls(physicalPosts);
  
  // Prepare output data
  const outputs = [
    { name: 'wp-digital-posts', data: digitalPosts },
    { name: 'wp-collabs-posts', data: collabsPosts },
    { name: 'wp-physical-posts', data: physicalPosts },
    { name: 'wp-attachments', data: { count: attachments.length, items: attachments, mapping: attachmentMapping } },
  ];
  
  // Write JSON files
  for (const output of outputs) {
    const filePath = path.join(OUTPUT_DIR, `${output.name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(output.data, null, 2));
    console.log(`✅ ${output.name}.json (${Array.isArray(output.data) ? output.data.length : output.data.count || Object.keys(output.data).length} items)`);
  }
  
  // Print summary
  console.log('\n📋 Summary:');
  console.log(`  - Digital works: ${digitalPosts.length}`);
  console.log(`  - Collaborations: ${collabsPosts.length}`);
  console.log(`  - Physical works (products): ${physicalPosts.length}`);
  console.log(`  - Attachments: ${attachments.length}`);
  console.log(`  - Audio posts: NOT FOUND in this export (expected 184)`);
  console.log('\n⚠️  Note: Audio posts may be in a separate XML export file.');
  console.log(`\n💾 All JSON files saved to: ${OUTPUT_DIR}`);
}

// Run the parser
parseWordPressXML().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
