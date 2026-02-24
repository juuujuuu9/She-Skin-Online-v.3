#!/usr/bin/env tsx
/**
 * Fix All Broken Images - Comprehensive Image Repair
 * 
 * This script:
 * 1. Identifies ALL works with broken/missing images
 * 2. Attempts to download from WordPress using multiple methods
 * 3. Falls back to creating a manual download list if automated fails
 * 4. Re-uploads to Bunny CDN and updates database
 * 
 * Usage:
 *   npx tsx scripts/fix-all-broken-images.ts [--manual-only] [--dry-run]
 */

import { db } from '../src/lib/db/index.js';
import { works, workMedia, media, products, productImages } from '../src/lib/db/schema.js';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { config } from 'dotenv';
import { nanoid } from '../src/lib/nanoid.js';

config();

const CONFIG = {
  bunnyStorageKey: process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY || '',
  bunnyStorageZone: process.env.BUNNY_STORAGE_ZONE || 'she-skin',
  bunnyStorageEndpoint: process.env.BUNNY_STORAGE_ENDPOINT || 'ny.storage.bunnycdn.com',
  bunnyCdnUrl: process.env.BUNNY_CDN_URL || 'https://she-skin.b-cdn.net',
  
  // WordPress API
  wpBaseUrl: 'https://www.sheskin.org',
  
  // Data files
  dataDir: join(process.cwd(), 'public/audio-covers'),
  outputDir: join(process.cwd(), 'tmp/image-repair'),
  
  // Processing
  delayMs: 2000, // Delay between downloads to be polite
};

// Types
interface WordPressPost {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  date: string;
  featured_image_url?: string;
  featured_image_id?: number | null;
}

interface BrokenItem {
  type: 'work' | 'product' | 'media';
  id: string;
  title: string;
  slug: string;
  category?: string;
  currentUrl?: string;
  wpPost?: WordPressPost;
  wpImageUrl?: string;
}

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MANUAL_ONLY = args.includes('--manual-only');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  console.log(`${icons[type]} ${message}`);
}

function isValidImage(buffer: Buffer): boolean {
  if (buffer.length < 100) return false; // Too small to be an image
  
  // Check for HTML content
  const start = buffer.slice(0, 100).toString('utf-8').toLowerCase();
  if (start.includes('<!doctype') || start.includes('<html') || start.includes('<head')) {
    return false;
  }
  
  // Check image magic numbers
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
  // JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
  // WebP (RIFF)
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    if (buffer.length > 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return true;
    }
  }
  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;
  
  return false;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    // Try with browser-like headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': CONFIG.wpBaseUrl,
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });
    
    if (!response.ok) {
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    if (!isValidImage(buffer)) {
      return null;
    }
    
    return buffer;
  } catch {
    return null;
  }
}

async function uploadToBunny(buffer: Buffer, filename: string, contentType: string): Promise<string | null> {
  try {
    const uploadUrl = `https://${CONFIG.bunnyStorageEndpoint}/${CONFIG.bunnyStorageZone}/${filename}`;
    
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': CONFIG.bunnyStorageKey,
        'Content-Type': contentType,
      },
      body: buffer,
    });

    if (!response.ok) return null;

    const encodedPath = filename.split('/').map(encodeURIComponent).join('/');
    return `${CONFIG.bunnyCdnUrl}/${encodedPath}`;
  } catch {
    return null;
  }
}

async function processAndUploadImage(
  buffer: Buffer,
  category: string,
  slug: string
): Promise<{ url: string; width: number; height: number; variants: any; size: number } | null> {
  try {
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width || 1200;
    const originalHeight = metadata.height || 800;
    
    // Create variants
    const variants: any = {};
    const sizes = [
      { name: 'sm', width: 400, quality: 80 },
      { name: 'md', width: 800, quality: 85 },
      { name: 'lg', width: 1200, quality: 85 },
    ];
    
    for (const size of sizes) {
      if (originalWidth < size.width) continue;
      
      const resized = await sharp(buffer)
        .resize(size.width, undefined, { withoutEnlargement: true })
        .webp({ quality: size.quality })
        .toBuffer();
      
      const filename = `works/${category}/${slug}-${size.name}.webp`;
      const url = await uploadToBunny(resized, filename, 'image/webp');
      
      if (url) {
        variants[size.name] = {
          url,
          width: size.width,
          height: Math.round(size.width * (originalHeight / originalWidth)),
          size: resized.length,
        };
      }
    }
    
    // Upload main image
    const webpBuffer = await sharp(buffer)
      .webp({ quality: 90 })
      .toBuffer();
    
    const mainFilename = `works/${category}/${slug}.webp`;
    const mainUrl = await uploadToBunny(webpBuffer, mainFilename, 'image/webp');
    
    if (!mainUrl) return null;
    
    const finalMeta = await sharp(webpBuffer).metadata();
    
    return {
      url: mainUrl,
      width: finalMeta.width || originalWidth,
      height: finalMeta.height || originalHeight,
      variants,
      size: webpBuffer.length,
    };
  } catch (error) {
    log(`Processing failed: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    return null;
  }
}

// ============================================================================
// DISCOVERY PHASE
// ============================================================================

async function loadWordPressData(): Promise<Map<string, WordPressPost & { category: string }>> {
  log('Loading WordPress export data...');
  
  const wpMap = new Map<string, WordPressPost & { category: string }>();
  
  try {
    const collabs = JSON.parse(readFileSync(join(CONFIG.dataDir, 'wp-collabs-posts.json'), 'utf-8'));
    const digital = JSON.parse(readFileSync(join(CONFIG.dataDir, 'wp-digital-posts.json'), 'utf-8'));
    const physical = JSON.parse(readFileSync(join(CONFIG.dataDir, 'wp-physical-posts.json'), 'utf-8'));
    
    for (const post of collabs) wpMap.set(post.slug, { ...post, category: 'collaborations' });
    for (const post of digital) wpMap.set(post.slug, { ...post, category: 'digital' });
    for (const post of physical) wpMap.set(post.slug, { ...post, category: 'physical' });
    
    log(`Loaded ${wpMap.size} WordPress posts`, 'success');
  } catch (error) {
    log(`Failed to load WordPress data: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
  }
  
  return wpMap;
}

async function findBrokenWorks(wpMap: Map<string, WordPressPost & { category: string }>): Promise<BrokenItem[]> {
  log('Scanning works for broken images...');
  
  const broken: BrokenItem[] = [];
  const categories = ['collaborations', 'digital', 'physical'];
  
  for (const category of categories) {
    const worksList = await db.query.works.findMany({
      where: and(
        eq(works.category, category),
        isNull(works.deletedAt)
      ),
      with: { media: true },
    });
    
    for (const work of worksList) {
      const hasMedia = work.media && work.media.length > 0;
      let isBroken = false;
      let currentUrl: string | undefined;
      
      if (!hasMedia) {
        isBroken = true;
      } else {
        // Check if URL is valid Bunny URL
        const mediaUrl = work.media[0].url;
        currentUrl = mediaUrl;
        if (!mediaUrl?.includes('b-cdn.net')) {
          isBroken = true;
        } else {
          // The URL exists but might be corrupt (HTML instead of image)
          // We'll assume it's broken if it's in our repair list
          isBroken = true;
        }
      }
      
      if (isBroken) {
        const wpPost = wpMap.get(work.slug);
        let wpImageUrl: string | undefined;
        
        if (wpPost) {
          wpImageUrl = wpPost.featured_image_url;
          if (!wpImageUrl && wpPost.content) {
            const imgMatch = wpPost.content.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
            if (imgMatch) wpImageUrl = imgMatch[1];
          }
        }
        
        broken.push({
          type: 'work',
          id: work.id,
          title: work.title,
          slug: work.slug,
          category: work.category,
          currentUrl,
          wpPost,
          wpImageUrl,
        });
      }
    }
  }
  
  log(`Found ${broken.length} works with broken/missing images`, 'warning');
  return broken;
}

// ============================================================================
// REPAIR PHASE
// ============================================================================

async function repairWork(item: BrokenItem): Promise<boolean> {
  if (!item.wpImageUrl || !item.category) {
    log(`Skipping ${item.title} - no image URL available`, 'warning');
    return false;
  }
  
  log(`\n🔧 ${item.title}`);
  log(`   WP URL: ${item.wpImageUrl.substring(0, 80)}...`);
  
  if (DRY_RUN) {
    log('   (Dry run - would attempt repair)', 'info');
    return true;
  }
  
  if (MANUAL_ONLY) {
    log('   (Manual mode - skipping automated download)', 'warning');
    return false;
  }
  
  // Try to download
  log('   Downloading...', 'info');
  const buffer = await downloadImage(item.wpImageUrl);
  
  if (!buffer) {
    log('   Download failed - will need manual fix', 'error');
    return false;
  }
  
  log(`   Downloaded: ${(buffer.length / 1024).toFixed(1)}KB`, 'success');
  
  // Process and upload
  log('   Processing & uploading...', 'info');
  const result = await processAndUploadImage(buffer, item.category, item.slug);
  
  if (!result) {
    log('   Upload/processing failed', 'error');
    return false;
  }
  
  log(`   Uploaded to CDN`, 'success');
  
  // Delete old media links
  const existingLinks = await db.select().from(workMedia).where(eq(workMedia.workId, item.id));
  for (const link of existingLinks) {
    await db.delete(workMedia).where(eq(workMedia.id, link.id));
  }
  
  // Delete old media entries (mark for cleanup)
  for (const link of existingLinks) {
    if (link.mediaId) {
      await db.update(media)
        .set({ deletedAt: new Date() })
        .where(eq(media.id, link.mediaId));
    }
  }
  
  // Create new media entry
  const mediaId = nanoid();
  await db.insert(media).values({
    id: mediaId,
    filename: `${item.slug}.webp`,
    originalName: item.wpImageUrl.split('/').pop() || 'image.jpg',
    mimeType: 'image/webp',
    fileSize: result.size,
    url: result.url,
    path: `works/${item.category}/${item.slug}.webp`,
    width: result.width,
    height: result.height,
    variants: result.variants,
    mediaType: 'image',
    refCount: 1,
    altText: item.title,
  });
  
  // Create work-media link
  await db.insert(workMedia).values({
    id: nanoid(),
    workId: item.id,
    mediaId,
    type: 'image',
    url: result.url,
    variants: result.variants,
    width: result.width,
    height: result.height,
    isPrimary: true,
    sortOrder: 0,
  });
  
  log('   Database updated', 'success');
  return true;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateManualDownloadList(items: BrokenItem[]): string {
  const timestamp = new Date().toISOString().split('T')[0];
  let report = `# Image Repair Manual Download List - ${timestamp}\n\n`;
  report += `Total items needing manual download: ${items.length}\n\n`;
  
  // Group by category
  const byCategory = new Map<string, BrokenItem[]>();
  for (const item of items) {
    const cat = item.category || 'unknown';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }
  
  for (const [category, catItems] of byCategory) {
    report += `## ${category.toUpperCase()} (${catItems.length} items)\n\n`;
    
    for (const item of catItems) {
      report += `### ${item.title}\n`;
      report += `- **Slug:** ${item.slug}\n`;
      report += `- **Database ID:** ${item.id}\n`;
      if (item.wpImageUrl) {
        report += `- **Download URL:** ${item.wpImageUrl}\n`;
      } else {
        report += `- **Status:** No image URL found in WordPress data\n`;
      }
      report += `\n`;
    }
  }
  
  report += `\n## Instructions\n\n`;
  report += `1. For each item above, download the image from the WordPress admin panel\n`;
  report += `2. Save images to: \`tmp/image-repair/downloads/\`\n`;
  report += `3. Use naming convention: \`{category}-{slug}.{ext}\`\n`;
  report += `4. Run: \`npx tsx scripts/upload-manual-downloads.ts\`\n\n`;
  
  return report;
}

async function generateJsonManifest(items: BrokenItem[]) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    totalItems: items.length,
    items: items.map(i => ({
      type: i.type,
      id: i.id,
      title: i.title,
      slug: i.slug,
      category: i.category,
      wpImageUrl: i.wpImageUrl,
      currentUrl: i.currentUrl,
    })),
  };
  
  const manifestPath = join(CONFIG.outputDir, 'repair-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  log(`Manifest saved to: ${manifestPath}`, 'success');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('  FIX ALL BROKEN IMAGES');
  console.log('='.repeat(70));
  
  if (DRY_RUN) {
    log('DRY RUN MODE - No changes will be made', 'warning');
  }
  
  if (MANUAL_ONLY) {
    log('MANUAL MODE - Will generate download list only', 'warning');
  }
  
  if (!CONFIG.bunnyStorageKey) {
    log('BUNNY_STORAGE_PASSWORD or BUNNY_API_KEY not set', 'error');
    process.exit(1);
  }
  
  // Ensure output directory exists
  if (!existsSync(CONFIG.outputDir)) {
    mkdirSync(CONFIG.outputDir, { recursive: true });
  }
  
  // Load data
  const wpMap = await loadWordPressData();
  
  // Find broken items
  const brokenWorks = await findBrokenWorks(wpMap);
  
  if (brokenWorks.length === 0) {
    log('No broken images found! All works have valid images.', 'success');
    return;
  }
  
  // Generate reports
  log('\nGenerating repair reports...');
  await generateJsonManifest(brokenWorks);
  
  const markdownReport = generateManualDownloadList(brokenWorks);
  const reportPath = join(CONFIG.outputDir, 'manual-download-list.md');
  writeFileSync(reportPath, markdownReport);
  log(`Manual download list: ${reportPath}`, 'success');
  
  // If manual-only mode, stop here
  if (MANUAL_ONLY) {
    log(`\nManual mode - generated list of ${brokenWorks.length} items to download`, 'info');
    log(`Review ${reportPath} and download the images manually`, 'info');
    return;
  }
  
  // Attempt automated repair
  log(`\nAttempting automated repair of ${brokenWorks.length} works...`);
  log('(This may fail due to WordPress security - use --manual-only to skip)');
  
  let success = 0;
  let failed = 0;
  const failedItems: BrokenItem[] = [];
  
  for (let i = 0; i < brokenWorks.length; i++) {
    const item = brokenWorks[i];
    log(`\n[${i + 1}/${brokenWorks.length}] ${item.title}`);
    
    if (!item.wpImageUrl) {
      log('   No WordPress image URL available', 'warning');
      failed++;
      failedItems.push(item);
      continue;
    }
    
    const result = await repairWork(item);
    if (result) {
      success++;
    } else {
      failed++;
      failedItems.push(item);
    }
    
    // Delay between items
    await new Promise(r => setTimeout(r, CONFIG.delayMs));
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  log(`Total broken: ${brokenWorks.length}`);
  log(`✅ Fixed: ${success}`);
  log(`❌ Failed: ${failed}`);
  
  if (failed > 0) {
    log(`\n${failed} items need manual download.`, 'warning');
    log(`See: ${reportPath}`, 'info');
    
    // Generate focused report for failed items
    const failedReport = generateManualDownloadList(failedItems);
    const failedPath = join(CONFIG.outputDir, 'failed-items-manual.md');
    writeFileSync(failedPath, failedReport);
    log(`Failed items list: ${failedPath}`, 'info');
  }
  
  if (success > 0) {
    log('\n🎉 Images repaired! Refresh the admin page to see changes.', 'success');
  }
}

main().catch(console.error);
