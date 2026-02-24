#!/usr/bin/env tsx
/**
 * Fix Broken Images in SheSkin Database
 * 
 * This script:
 * 1. Reads the wp-attachments.json to get real WordPress image URLs
 * 2. Checks which works have broken images (404 or HTML error pages)
 * 3. Re-downloads images from WordPress with proper headers
 * 4. Uploads them to Bunny CDN at correct paths
 * 5. Updates the database with correct URLs
 * 
 * Usage: npx tsx scripts/fix-broken-images.ts [--dry-run] [--category=digital|collaborations|physical]
 */

import { db } from '../src/lib/db/index.js';
import { works, workMedia, media } from '../src/lib/db/schema.js';
import { eq, and, isNotNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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
  attachmentsPath: join(ROOT_DIR, 'public/audio-covers/wp-attachments.json'),
  
  // Temporary download directory
  tempDir: join(ROOT_DIR, 'tmp/fix-images'),
  
  // Bunny CDN settings
  bunnyStorageZone: process.env.BUNNY_STORAGE_ZONE || 'she-skin',
  bunnyCdnUrl: process.env.BUNNY_CDN_URL || 'https://she-skin.b-cdn.net',
  bunnyStorageEndpoint: process.env.BUNNY_STORAGE_ENDPOINT || 'ny.storage.bunnycdn.com',
  bunnyApiKey: process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY,
  
  // Processing settings
  requestDelayMs: 1000, // Delay between requests
  
  // Logging
  reportFile: join(ROOT_DIR, 'tmp/fix-images-report.json'),
};

// ============================================================================
// TYPES
// ============================================================================

interface Attachment {
  id: number;
  title: string;
  url: string;
  file: string;
  date: string;
  parent_id: number | null;
  metadata: Record<string, any>;
}

interface WpAttachmentsData {
  count: number;
  items: Attachment[];
}

interface WorkWithMedia {
  id: string;
  slug: string;
  title: string;
  category: string;
  workMedia: {
    id: string;
    url: string;
    type: string;
    isPrimary: boolean;
  }[];
}

interface FixResult {
  workId: string;
  slug: string;
  title: string;
  category: string;
  oldUrl: string;
  newUrl: string | null;
  status: 'fixed' | 'failed' | 'skipped' | 'no_image';
  error?: string;
  attachmentFound?: boolean;
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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function slugify(text: string): string {
  if (!text || text.trim() === '') return 'untitled';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

// ============================================================================
// IMAGE CHECK & DOWNLOAD
// ============================================================================

async function checkImageUrl(url: string): Promise<{ isValid: boolean; contentType?: string; size?: number }> {
  try {
    const response = await fetch(url, { 
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      return { isValid: false };
    }
    
    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');
    
    // Check if it's an HTML page (broken)
    if (contentType.includes('text/html')) {
      return { isValid: false, contentType, size: contentLength ? parseInt(contentLength) : 0 };
    }
    
    // Check if it's an image
    if (!contentType.startsWith('image/')) {
      return { isValid: false, contentType };
    }
    
    // Check file size (if too small, likely broken)
    const size = contentLength ? parseInt(contentLength) : 0;
    if (size < 1000) { // Less than 1KB is suspicious
      return { isValid: false, contentType, size };
    }
    
    return { isValid: true, contentType, size };
  } catch (error) {
    return { isValid: false };
  }
}

async function downloadImage(url: string, outputPath: string): Promise<{ success: boolean; size?: number; mimeType?: string; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'https://www.sheskin.org/',
      },
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    
    // Validate it's an image, not HTML
    if (mimeType.includes('text/html')) {
      return { success: false, error: 'Received HTML instead of image (captcha or redirect)' };
    }
    
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
  try {
    if (!CONFIG.bunnyApiKey) {
      return { success: false, error: 'Bunny API key not configured' };
    }

    const uploadUrl = `https://${CONFIG.bunnyStorageEndpoint}/${CONFIG.bunnyStorageZone}/works/{category}/${filename}`;
    
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': CONFIG.bunnyApiKey,
        'Content-Type': contentType,
      },
      body: new Uint8Array(fileBuffer),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Bunny upload failed: ${response.status} ${errorText}` };
    }

    const cleanCdnUrl = CONFIG.bunnyCdnUrl.endsWith('/') 
      ? CONFIG.bunnyCdnUrl.slice(0, -1) 
      : CONFIG.bunnyCdnUrl;
    
    return { 
      success: true, 
      url: `${cleanCdnUrl}/works/{category}/${filename}` 
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function main() {
  console.log('🔧 SheSkin Broken Images Fix\n');
  console.log('='.repeat(60));
  
  const isDryRun = process.argv.includes('--dry-run');
  const categoryFilter = process.argv.find(arg => arg.startsWith('--category='))?.split('=')[1];
  
  if (isDryRun) {
    log('DRY RUN MODE - No changes will be made', 'warning');
  }
  
  // Load attachments
  log('Loading WordPress attachments...', 'info');
  let attachmentsData: WpAttachmentsData;
  try {
    const content = readFileSync(CONFIG.attachmentsPath, 'utf-8');
    attachmentsData = JSON.parse(content);
    log(`Loaded ${attachmentsData.items.length} attachments`, 'success');
  } catch (error) {
    log(`Failed to load attachments: ${error}`, 'error');
    process.exit(1);
  }
  
  // Create attachment lookup map by ID
  const attachmentById = new Map<number, Attachment>();
  for (const att of attachmentsData.items) {
    attachmentById.set(att.id, att);
  }
  
  // Get works from database
  log('Fetching works from database...', 'info');
  
  const allWorks = await db.query.works.findMany({
    with: {
      media: true,
    },
  });
  
  log(`Found ${allWorks.length} works in database`, 'success');
  
  // Filter by category if specified
  let worksToProcess = allWorks;
  if (categoryFilter) {
    worksToProcess = allWorks.filter(w => w.category === categoryFilter);
    log(`Filtered to ${worksToProcess.length} works in category: ${categoryFilter}`, 'info');
  }
  
  // Results tracking
  const results: FixResult[] = [];
  let fixed = 0;
  let failed = 0;
  let skipped = 0;
  let noImage = 0;
  
  // Process each work
  for (let i = 0; i < worksToProcess.length; i++) {
    const work = worksToProcess[i];
    const primaryMedia = work.media?.find(m => m.isPrimary) || work.media?.[0];
    
    console.log(`\n[${i + 1}/${worksToProcess.length}] Processing: ${work.title} (${work.category})`);
    
    if (!primaryMedia) {
      log(`  No media found for work`, 'warning');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        oldUrl: '',
        newUrl: null,
        status: 'no_image',
      });
      noImage++;
      continue;
    }
    
    const oldUrl = primaryMedia.url;
    
    // Check if current image is broken
    const checkResult = await checkImageUrl(oldUrl);
    
    if (checkResult.isValid) {
      log(`  Image is valid (${checkResult.size} bytes, ${checkResult.contentType})`, 'success');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        oldUrl,
        newUrl: oldUrl,
        status: 'skipped',
      });
      skipped++;
      continue;
    }
    
    log(`  Image is broken: ${oldUrl}`, 'error');
    
    // Try to find attachment by work slug/post ID pattern
    // Work slugs are like: "digital-20186-letter-x-rust-scott..."
    // We need to extract the WordPress post ID from the slug
    const slugMatch = work.slug.match(/^(digital|collaborations|physical)-(\d+)-/);
    
    if (!slugMatch) {
      log(`  Could not extract WordPress ID from slug: ${work.slug}`, 'error');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        oldUrl,
        newUrl: null,
        status: 'failed',
        error: 'Could not extract WordPress ID from slug',
      });
      failed++;
      continue;
    }
    
    const wpPostId = parseInt(slugMatch[2]);
    const category = slugMatch[1];
    
    // Find attachment with this parent_id
    const attachment = attachmentsData.items.find(a => a.parent_id === wpPostId);
    
    if (!attachment) {
      log(`  No attachment found for WordPress post ID: ${wpPostId}`, 'error');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        oldUrl,
        newUrl: null,
        status: 'failed',
        error: `No attachment found for WordPress post ID: ${wpPostId}`,
        attachmentFound: false,
      });
      failed++;
      continue;
    }
    
    log(`  Found attachment: ${attachment.url}`, 'success');
    
    if (isDryRun) {
      log(`  DRY RUN: Would download and upload new image`, 'info');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        oldUrl,
        newUrl: attachment.url, // Would be CDN URL after upload
        status: 'fixed',
        attachmentFound: true,
      });
      fixed++;
      continue;
    }
    
    // Download the image from WordPress
    const ext = extname(attachment.file) || '.jpg';
    const tempPath = join(CONFIG.tempDir, `${work.slug}${ext}`);
    
    log(`  Downloading from WordPress...`, 'info');
    const downloadResult = await downloadImage(attachment.url, tempPath);
    
    if (!downloadResult.success) {
      log(`  Download failed: ${downloadResult.error}`, 'error');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        oldUrl,
        newUrl: null,
        status: 'failed',
        error: `Download failed: ${downloadResult.error}`,
        attachmentFound: true,
      });
      failed++;
      continue;
    }
    
    log(`  Downloaded: ${downloadResult.size} bytes`, 'success');
    
    // Upload to Bunny CDN
    const filename = basename(tempPath);
    const fileBuffer = readFileSync(tempPath);
    
    log(`  Uploading to Bunny CDN...`, 'info');
    const uploadResult = await uploadToBunny(fileBuffer, filename, downloadResult.mimeType);
    
    if (!uploadResult.success) {
      log(`  Upload failed: ${uploadResult.error}`, 'error');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        oldUrl,
        newUrl: null,
        status: 'failed',
        error: `Upload failed: ${uploadResult.error}`,
        attachmentFound: true,
      });
      failed++;
      continue;
    }
    
    log(`  Uploaded to: ${uploadResult.url}`, 'success');
    
    // Update database
    try {
      await db.update(workMedia)
        .set({ url: uploadResult.url })
        .where(eq(workMedia.id, primaryMedia.id));
      
      // Also update the media table if there's a corresponding entry
      const mediaEntry = await db.query.media.findFirst({
        where: eq(media.url, oldUrl),
      });
      
      if (mediaEntry) {
        await db.update(media)
          .set({ url: uploadResult.url })
          .where(eq(media.id, mediaEntry.id));
      }
      
      log(`  Database updated`, 'success');
      
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        oldUrl,
        newUrl: uploadResult.url,
        status: 'fixed',
        attachmentFound: true,
      });
      fixed++;
      
    } catch (error) {
      log(`  Database update failed: ${error}`, 'error');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        oldUrl,
        newUrl: uploadResult.url, // Upload succeeded even if DB update failed
        status: 'failed',
        error: `Database update failed: ${error}`,
        attachmentFound: true,
      });
      failed++;
    }
    
    // Delay to avoid rate limiting
    await delay(CONFIG.requestDelayMs);
  }
  
  // Save report
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: worksToProcess.length,
      fixed,
      failed,
      skipped,
      noImage,
    },
    results,
  };
  
  writeFileSync(CONFIG.reportFile, JSON.stringify(report, null, 2));
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 FIX SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total processed: ${worksToProcess.length}`);
  console.log(`✅ Fixed: ${fixed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped (valid): ${skipped}`);
  console.log(`🚫 No image: ${noImage}`);
  console.log(`\nReport saved to: ${CONFIG.reportFile}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed items:');
    results
      .filter(r => r.status === 'failed')
      .forEach(r => console.log(`  - ${r.slug}: ${r.error}`));
  }
}

// Run
main().catch(error => {
  log(`Fatal error: ${error}`, 'error');
  process.exit(1);
});
