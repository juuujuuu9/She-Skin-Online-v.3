#!/usr/bin/env tsx
/**
 * Comprehensive Import Script for SheSkin Works
 * 
 * Imports physical, digital, and collaboration works from WordPress export:
 * - Creates entries in `works` table with proper categories
 * - Downloads cover images from WordPress
 * - Uploads images to Bunny CDN
 * - Creates entries in `media` table (for gallery visibility)
 * - Creates entries in `workMedia` table (links works to their media)
 * 
 * Usage: npx tsx scripts/import-all-works.ts [--batch-size=50] [--start-from=physical|digital|collaborations]
 * 
 * Input files:
 * - wp-physical-posts.json (298 posts)
 * - wp-digital-posts.json (35 posts)  
 * - wp-collabs-posts.json (109 posts)
 * - wp-attachments.json (568 attachments)
 */

import { db } from '../src/lib/db/index.js';
import { works, media, workMedia } from '../src/lib/db/schema.js';
import { nanoid } from 'nanoid';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Input files
  physicalPostsPath: join(ROOT_DIR, 'public/audio-covers/wp-physical-posts.json'),
  digitalPostsPath: join(ROOT_DIR, 'public/audio-covers/wp-digital-posts.json'),
  collabsPostsPath: join(ROOT_DIR, 'public/audio-covers/wp-collabs-posts.json'),
  attachmentsPath: join(ROOT_DIR, 'public/audio-covers/wp-attachments.json'),
  
  // Temporary download directory
  tempDir: join(ROOT_DIR, 'tmp/wp-import'),
  
  // Bunny CDN settings
  bunnyStorageZone: process.env.BUNNY_STORAGE_ZONE || 'she-skin',
  bunnyCdnUrl: process.env.BUNNY_CDN_URL || 'https://she-skin.b-cdn.net',
  bunnyStorageEndpoint: process.env.BUNNY_STORAGE_ENDPOINT || 'ny.storage.bunnycdn.com',
  bunnyApiKey: process.env.BUNNY_API_KEY,
  
  // Processing settings
  defaultBatchSize: 25,
  requestDelayMs: 500, // Delay between requests to avoid rate limiting
  
  // Logging
  logFile: join(ROOT_DIR, 'tmp/import-works-log.json'),
};

// ============================================================================
// TYPES
// ============================================================================

interface WordPressPost {
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
  featured_image_url?: string;
}

interface Attachment {
  id: number;
  title: string;
  url: string;
  file: string;
  date: string;
  parent_id: number | null;
  metadata: Record<string, any>;
}

interface ImportResult {
  success: boolean;
  workId?: string;
  mediaId?: string;
  workMediaId?: string;
  error?: string;
  bunnyUrl?: string;
}

interface ImportStats {
  category: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{ postId: number; title: string; error: string }>;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const timestamp = new Date().toISOString();
  const icons = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
  };
  console.log(`${icons[type]} [${timestamp}] ${message}`);
}

function slugify(text: string): string {
  if (!text || text.trim() === '') {
    return 'untitled';
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

function extractYear(dateStr: string): number | null {
  if (!dateStr || dateStr === '0000-00-00 00:00:00') return null;
  const match = dateStr.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// IMAGE DOWNLOAD
// ============================================================================

async function downloadImage(url: string, outputPath: string): Promise<{ success: boolean; size?: number; mimeType?: string; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    
    // Ensure directory exists
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(outputPath, buffer);
    
    return { success: true, size: buffer.length, mimeType };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number } | null> {
  try {
    const metadata = await sharp(imagePath).metadata();
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height };
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// BUNNY CDN UPLOAD
// ============================================================================

async function uploadToBunny(
  fileBuffer: Buffer, 
  filename: string, 
  contentType: string = 'image/jpeg'
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!CONFIG.bunnyApiKey) {
    return { success: false, error: 'Bunny API key not configured' };
  }

  try {
    const cleanFilename = filename.startsWith('/') ? filename.slice(1) : filename;
    const uploadUrl = `https://${CONFIG.bunnyStorageEndpoint}/${CONFIG.bunnyStorageZone}/${cleanFilename}`;
    
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': CONFIG.bunnyApiKey,
        'Content-Type': contentType,
      },
      body: fileBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Upload failed: ${response.status} ${errorText}` };
    }

    const encodedPath = cleanFilename.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const cleanCdnUrl = CONFIG.bunnyCdnUrl.endsWith('/') ? CONFIG.bunnyCdnUrl.slice(0, -1) : CONFIG.bunnyCdnUrl;
    const url = `${cleanCdnUrl}/${encodedPath}`;
    
    return { success: true, url };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function createWork(
  post: WordPressPost, 
  category: 'physical' | 'digital' | 'collaborations'
): Promise<{ success: boolean; workId?: string; error?: string }> {
  try {
    const workId = nanoid();
    const slug = post.slug || slugify(post.title) || `work-${post.id}`;
    const year = extractYear(post.date);
    
    // Check if work with this slug already exists
    const existing = await db.select().from(works).where(eq(works.slug, slug)).limit(1);
    if (existing.length > 0) {
      return { success: false, error: `Work with slug '${slug}' already exists` };
    }

    await db.insert(works).values({
      id: workId,
      slug,
      title: post.title || 'Untitled',
      category,
      description: post.excerpt || post.content || '',
      year,
      forSale: category === 'physical' && post.status === 'publish',
      externalUrl: category === 'collaborations' ? extractExternalUrl(post.content) : null,
      published: post.status === 'publish',
      createdAt: new Date(post.date),
      updatedAt: new Date(post.modified),
    });

    return { success: true, workId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function createMediaEntry(
  filename: string,
  originalUrl: string,
  bunnyUrl: string,
  fileSize: number,
  mimeType: string,
  width?: number,
  height?: number
): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  try {
    const mediaId = nanoid();
    
    await db.insert(media).values({
      id: mediaId,
      filename: basename(filename),
      originalName: basename(originalUrl),
      mimeType,
      fileSize,
      url: bunnyUrl,
      path: filename,
      width: width || null,
      height: height || null,
      mediaType: 'image',
      refCount: 1,
      altText: '',
    });

    return { success: true, mediaId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function createWorkMediaLink(
  workId: string,
  mediaId: string,
  bunnyUrl: string,
  width?: number,
  height?: number
): Promise<{ success: boolean; workMediaId?: string; error?: string }> {
  try {
    const workMediaId = nanoid();
    
    await db.insert(workMedia).values({
      id: workMediaId,
      workId,
      mediaId,
      type: 'image',
      url: bunnyUrl,
      width: width || null,
      height: height || null,
      isPrimary: true,
      sortOrder: 0,
    });

    return { success: true, workMediaId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function extractExternalUrl(content: string): string | null {
  if (!content) return null;
  
  // YouTube URL patterns
  const youtubeMatch = content.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]+/);
  if (youtubeMatch) return youtubeMatch[0];
  
  return null;
}

// ============================================================================
// MAIN IMPORT LOGIC
// ============================================================================

async function importWork(
  post: WordPressPost,
  category: 'physical' | 'digital' | 'collaborations',
  attachmentsMap: Map<number, Attachment>
): Promise<ImportResult> {
  const result: ImportResult = { success: false };
  
  try {
    // Skip empty titles for some digital posts
    if (!post.title || post.title.trim() === '') {
      if (category === 'digital') {
        return { success: false, error: 'Empty title - skipping' };
      }
    }

    // Step 1: Create work entry
    log(`Creating work: ${post.title || 'Untitled'} (${category})`);
    const workResult = await createWork(post, category);
    
    if (!workResult.success) {
      return { success: false, error: `Failed to create work: ${workResult.error}` };
    }
    
    result.workId = workResult.workId;
    
    // Step 2: Get featured image URL
    let imageUrl: string | null = post.featured_image_url || null;
    
    if (!imageUrl && post.featured_image_id) {
      const attachment = attachmentsMap.get(post.featured_image_id);
      if (attachment) {
        imageUrl = attachment.url;
      }
    }
    
    // For collaborations, try to extract image from content
    if (!imageUrl && category === 'collaborations' && post.content) {
      const imgMatch = post.content.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
      if (imgMatch) {
        imageUrl = imgMatch[1];
      }
    }
    
    if (!imageUrl) {
      log(`No image found for work: ${post.title}`, 'warning');
      result.success = true; // Work created but no image
      return result;
    }
    
    // Step 3: Download image
    const ext = extname(imageUrl.split('?')[0]) || '.jpg';
    const safeFilename = `${category}-${post.id}-${slugify(post.title || 'untitled')}${ext}`;
    const tempPath = join(CONFIG.tempDir, safeFilename);
    
    log(`Downloading image: ${imageUrl.substring(0, 80)}...`);
    const downloadResult = await downloadImage(imageUrl, tempPath);
    
    if (!downloadResult.success) {
      return { success: false, error: `Download failed: ${downloadResult.error}` };
    }
    
    // Step 4: Get image dimensions
    const dimensions = await getImageDimensions(tempPath);
    
    // Step 5: Upload to Bunny CDN
    const bunnyFilename = `works/${category}/${safeFilename}`;
    const fileBuffer = readFileSync(tempPath);
    
    log(`Uploading to Bunny CDN: ${bunnyFilename}`);
    const uploadResult = await uploadToBunny(fileBuffer, bunnyFilename, downloadResult.mimeType);
    
    if (!uploadResult.success) {
      return { success: false, error: `Upload failed: ${uploadResult.error}` };
    }
    
    result.bunnyUrl = uploadResult.url;
    
    // Step 6: Create media entry
    log(`Creating media entry`);
    const mediaResult = await createMediaEntry(
      bunnyFilename,
      imageUrl,
      uploadResult.url!,
      downloadResult.size!,
      downloadResult.mimeType!,
      dimensions?.width,
      dimensions?.height
    );
    
    if (!mediaResult.success) {
      return { success: false, error: `Failed to create media: ${mediaResult.error}` };
    }
    
    result.mediaId = mediaResult.mediaId;
    
    // Step 7: Create workMedia link
    log(`Creating work-media link`);
    const linkResult = await createWorkMediaLink(
      result.workId!,
      result.mediaId!,
      uploadResult.url!,
      dimensions?.width,
      dimensions?.height
    );
    
    if (!linkResult.success) {
      return { success: false, error: `Failed to create workMedia: ${linkResult.error}` };
    }
    
    result.workMediaId = linkResult.workMediaId;
    result.success = true;
    
    log(`Successfully imported: ${post.title}`, 'success');
    
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }
  
  return result;
}

async function processCategory(
  posts: WordPressPost[],
  category: 'physical' | 'digital' | 'collaborations',
  attachmentsMap: Map<number, Attachment>,
  batchSize: number,
  stats: ImportStats
): Promise<void> {
  log(`\n${'='.repeat(60)}`);
  log(`Processing ${posts.length} ${category} works`);
  log(`${'='.repeat(60)}\n`);
  
  stats.category = category;
  stats.total = posts.length;
  
  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(posts.length / batchSize);
    
    log(`\n--- Batch ${batchNum}/${totalBatches} (${batch.length} works) ---`);
    
    for (const post of batch) {
      stats.processed++;
      
      const result = await importWork(post, category, attachmentsMap);
      
      if (result.success) {
        stats.succeeded++;
      } else if (result.error?.includes('already exists') || result.error?.includes('Empty title')) {
        stats.skipped++;
        log(`Skipped: ${post.title} - ${result.error}`, 'warning');
      } else {
        stats.failed++;
        stats.errors.push({
          postId: post.id,
          title: post.title || 'Untitled',
          error: result.error || 'Unknown error',
        });
        log(`Failed: ${post.title} - ${result.error}`, 'error');
      }
      
      // Small delay to avoid overwhelming services
      await delay(CONFIG.requestDelayMs);
    }
    
    // Progress update after each batch
    log(`\nProgress: ${stats.processed}/${stats.total} processed`);
    log(`  ✅ Success: ${stats.succeeded} | ⏭️ Skipped: ${stats.skipped} | ❌ Failed: ${stats.failed}`);
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  SheSkin Works Import Tool');
  console.log('  Importing physical, digital, and collaboration works');
  console.log('='.repeat(70) + '\n');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : CONFIG.defaultBatchSize;
  
  const startFromArg = args.find(arg => arg.startsWith('--start-from='));
  const startFrom = startFromArg ? startFromArg.split('=')[1] : null;
  
  const dryRun = args.includes('--dry-run');
  
  if (dryRun) {
    log('DRY RUN MODE - No changes will be made', 'warning');
  }
  
  // Ensure temp directory exists
  if (!existsSync(CONFIG.tempDir)) {
    mkdirSync(CONFIG.tempDir, { recursive: true });
  }
  
  // Check for required files
  const requiredFiles = [
    CONFIG.physicalPostsPath,
    CONFIG.digitalPostsPath,
    CONFIG.collabsPostsPath,
    CONFIG.attachmentsPath,
  ];
  
  for (const file of requiredFiles) {
    if (!existsSync(file)) {
      log(`Required file not found: ${file}`, 'error');
      process.exit(1);
    }
  }
  
  // Load data
  log('Loading WordPress export files...');
  
  const physicalPosts: WordPressPost[] = JSON.parse(readFileSync(CONFIG.physicalPostsPath, 'utf-8'));
  const digitalPosts: WordPressPost[] = JSON.parse(readFileSync(CONFIG.digitalPostsPath, 'utf-8'));
  const collabsPosts: WordPressPost[] = JSON.parse(readFileSync(CONFIG.collabsPostsPath, 'utf-8'));
  const attachmentsData = JSON.parse(readFileSync(CONFIG.attachmentsPath, 'utf-8'));
  const attachments: Attachment[] = attachmentsData.items || [];
  
  log(`Loaded ${physicalPosts.length} physical posts`);
  log(`Loaded ${digitalPosts.length} digital posts`);
  log(`Loaded ${collabsPosts.length} collaboration posts`);
  log(`Loaded ${attachments.length} attachments`);
  
  // Build attachments lookup map
  const attachmentsMap = new Map<number, Attachment>();
  for (const att of attachments) {
    attachmentsMap.set(att.id, att);
  }
  
  // Statistics
  const allStats: ImportStats[] = [];
  
  try {
    // Process each category
    const categories: Array<{ name: 'physical' | 'digital' | 'collaborations'; posts: WordPressPost[] }> = [
      { name: 'physical', posts: physicalPosts },
      { name: 'digital', posts: digitalPosts },
      { name: 'collaborations', posts: collabsPosts },
    ];
    
    for (const cat of categories) {
      // Skip if starting from a specific category
      if (startFrom) {
        const order = ['physical', 'digital', 'collaborations'];
        const startIdx = order.indexOf(startFrom);
        const currentIdx = order.indexOf(cat.name);
        if (currentIdx < startIdx) {
          log(`Skipping ${cat.name} (starting from ${startFrom})`, 'warning');
          continue;
        }
      }
      
      const stats: ImportStats = {
        category: cat.name,
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        errors: [],
      };
      
      await processCategory(cat.posts, cat.name, attachmentsMap, batchSize, stats);
      allStats.push(stats);
    }
    
    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('  IMPORT SUMMARY');
    console.log('='.repeat(70));
    
    let grandTotal = 0;
    let grandSuccess = 0;
    let grandFailed = 0;
    let grandSkipped = 0;
    
    for (const stats of allStats) {
      console.log(`\n📁 ${stats.category.toUpperCase()}`);
      console.log(`   Total: ${stats.total} | ✅ Success: ${stats.succeeded} | ⏭️ Skipped: ${stats.skipped} | ❌ Failed: ${stats.failed}`);
      
      if (stats.errors.length > 0) {
        console.log(`   Errors (${stats.errors.length}):`);
        stats.errors.slice(0, 5).forEach(e => {
          console.log(`     - ${e.title}: ${e.error}`);
        });
        if (stats.errors.length > 5) {
          console.log(`     ... and ${stats.errors.length - 5} more`);
        }
      }
      
      grandTotal += stats.total;
      grandSuccess += stats.succeeded;
      grandFailed += stats.failed;
      grandSkipped += stats.skipped;
    }
    
    console.log('\n' + '-'.repeat(70));
    console.log(`📊 GRAND TOTAL: ${grandTotal} works`);
    console.log(`   ✅ Successfully imported: ${grandSuccess}`);
    console.log(`   ⏭️ Skipped: ${grandSkipped}`);
    console.log(`   ❌ Failed: ${grandFailed}`);
    console.log('='.repeat(70) + '\n');
    
    // Save detailed log
    const logData = {
      timestamp: new Date().toISOString(),
      stats: allStats,
    };
    writeFileSync(CONFIG.logFile, JSON.stringify(logData, null, 2));
    log(`Detailed log saved to: ${CONFIG.logFile}`);
    
  } catch (error) {
    log(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    process.exit(1);
  }
}

// Import eq from drizzle-orm for the where clause
import { eq } from 'drizzle-orm';

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
