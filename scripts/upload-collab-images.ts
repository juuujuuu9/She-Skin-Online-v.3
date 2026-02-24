#!/usr/bin/env tsx
/**
 * Upload Collaboration Images to Bunny CDN & Update Database
 * 
 * This script:
 * 1. Reads the collab-image-mapping.json
 * 2. Processes images from tmp/image-repair/downloads/
 * 3. Uploads to Bunny CDN with WebP variants
 * 4. Updates database with new media entries
 * 
 * Usage:
 *   npx tsx scripts/upload-collab-images.ts [--dry-run] [--limit N] [--slug specific-slug]
 */

import { readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { db } from '../src/lib/db/index.js';
import { works, workMedia, media } from '../src/lib/db/schema.js';
import { eq, and } from 'drizzle-orm';
import sharp from 'sharp';
import { config } from 'dotenv';
import { nanoid } from '../src/lib/nanoid.js';

config();

const CONFIG = {
  bunnyStorageKey: process.env.BUNNY_STORAGE_PASSWORD || '',
  bunnyStorageZone: process.env.BUNNY_STORAGE_ZONE || 'she-skin',
  bunnyStorageEndpoint: process.env.BUNNY_STORAGE_ENDPOINT || 'ny.storage.bunnycdn.com',
  bunnyCdnUrl: process.env.BUNNY_CDN_URL || 'https://she-skin.b-cdn.net',
  downloadDir: join(process.cwd(), 'tmp/image-repair/downloads'),
  mappingPath: join(process.cwd(), 'tmp/image-repair/collab-image-mapping.json'),
};

interface ImageMapping {
  slug: string;
  title: string;
  wpPostId: number;
  imageUrl: string;
  allImageUrls: string[];
  hasFeaturedImage: boolean;
}

interface UploadResult {
  url: string;
  width: number;
  height: number;
  variants: any;
  size: number;
  path: string;
}

// Parse args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const slugIndex = args.indexOf('--slug');
const SPECIFIC_SLUG = slugIndex >= 0 ? args[slugIndex + 1] : null;
const limitIndex = args.indexOf('--limit');
const LIMIT = limitIndex >= 0 ? parseInt(args[limitIndex + 1]) || Infinity : Infinity;

function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  console.log(`${icons[type]} ${message}`);
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

    if (!response.ok) {
      log(`Upload failed: HTTP ${response.status}`, 'error');
      return null;
    }

    const encodedPath = filename.split('/').map(encodeURIComponent).join('/');
    return `${CONFIG.bunnyCdnUrl}/${encodedPath}`;
  } catch (error) {
    log(`Upload error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    return null;
  }
}

async function processAndUploadImage(
  filePath: string,
  slug: string,
  title: string
): Promise<UploadResult | null> {
  try {
    const fileBuffer = readFileSync(filePath);
    
    // Get image metadata
    const metadata = await sharp(fileBuffer).metadata();
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
      
      const resized = await sharp(fileBuffer)
        .resize(size.width, undefined, { withoutEnlargement: true })
        .webp({ quality: size.quality })
        .toBuffer();
      
      const filename = `works/collaborations/${slug}-${size.name}.webp`;
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
    
    // Upload main image (WebP)
    const webpBuffer = await sharp(fileBuffer)
      .webp({ quality: 90 })
      .toBuffer();
    
    const mainFilename = `works/collaborations/${slug}.webp`;
    const mainUrl = await uploadToBunny(webpBuffer, mainFilename, 'image/webp');
    
    if (!mainUrl) {
      log('Main image upload failed', 'error');
      return null;
    }
    
    const finalMeta = await sharp(webpBuffer).metadata();
    
    return {
      url: mainUrl,
      width: finalMeta.width || originalWidth,
      height: finalMeta.height || originalHeight,
      variants,
      size: webpBuffer.length,
      path: mainFilename,
    };
  } catch (error) {
    log(`Processing failed: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    return null;
  }
}

async function updateDatabase(slug: string, uploadResult: UploadResult, mapping: ImageMapping): Promise<boolean> {
  if (DRY_RUN) {
    log('Dry run - would update database', 'info');
    return true;
  }
  
  try {
    // Find the work
    const work = await db.query.works.findFirst({
      where: and(
        eq(works.slug, slug),
        eq(works.category, 'collaborations')
      ),
    });
    
    if (!work) {
      log(`Work not found for slug: ${slug}`, 'error');
      return false;
    }
    
    // Delete old media links
    const existingLinks = await db.select().from(workMedia).where(eq(workMedia.workId, work.id));
    for (const link of existingLinks) {
      await db.delete(workMedia).where(eq(workMedia.id, link.id));
      
      // Delete old media
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
      filename: `${slug}.webp`,
      originalName: mapping.imageUrl.split('/').pop() || 'image.jpg',
      mimeType: 'image/webp',
      fileSize: uploadResult.size,
      url: uploadResult.url,
      path: uploadResult.path,
      width: uploadResult.width,
      height: uploadResult.height,
      variants: uploadResult.variants,
      mediaType: 'image',
      refCount: 1,
      altText: mapping.title,
    });
    
    // Create work-media link
    await db.insert(workMedia).values({
      id: nanoid(),
      workId: work.id,
      mediaId,
      type: 'image',
      url: uploadResult.url,
      variants: uploadResult.variants,
      width: uploadResult.width,
      height: uploadResult.height,
      isPrimary: true,
      sortOrder: 0,
    });
    
    return true;
  } catch (error) {
    log(`Database update failed: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    return false;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  UPLOAD COLLABORATION IMAGES');
  console.log('='.repeat(70));
  
  if (DRY_RUN) {
    log('DRY RUN MODE - No changes will be made', 'warning');
  }
  
  if (!CONFIG.bunnyStorageKey) {
    log('BUNNY_STORAGE_PASSWORD not set', 'error');
    process.exit(1);
  }
  
  // Load mapping
  if (!existsSync(CONFIG.mappingPath)) {
    log('collab-image-mapping.json not found. Run extract-collab-images.ts first.', 'error');
    process.exit(1);
  }
  
  const mappings: ImageMapping[] = JSON.parse(readFileSync(CONFIG.mappingPath, 'utf-8'));
  const withImages = mappings.filter(m => m.imageUrl);
  
  log(`Loaded ${mappings.length} mappings, ${withImages.length} have images`);
  
  // Filter by slug if specified
  let toProcess = SPECIFIC_SLUG 
    ? withImages.filter(m => m.slug === SPECIFIC_SLUG)
    : withImages.slice(0, LIMIT);
  
  if (SPECIFIC_SLUG && toProcess.length === 0) {
    log(`Slug "${SPECIFIC_SLUG}" not found`, 'error');
    process.exit(1);
  }
  
  log(`Will process ${toProcess.length} items`);
  
  // Check download directory
  if (!existsSync(CONFIG.downloadDir)) {
    log(`Download directory not found: ${CONFIG.downloadDir}`, 'error');
    log('Please download images first or run with --dry-run to test', 'info');
    process.exit(1);
  }
  
  const downloadedFiles = readdirSync(CONFIG.downloadDir);
  log(`Found ${downloadedFiles.length} files in downloads directory`);
  
  // Process each
  let success = 0;
  let failed = 0;
  let skipped = 0;
  
  for (let i = 0; i < toProcess.length; i++) {
    const mapping = toProcess[i];
    console.log(`\n[${i + 1}/${toProcess.length}] ${mapping.title}`);
    log(`Slug: ${mapping.slug}`);
    
    // Find the downloaded file
    const possibleNames = [
      `collaborations-${mapping.slug}.jpg`,
      `collaborations-${mapping.slug}.jpeg`,
      `collaborations-${mapping.slug}.png`,
      `collaborations-${mapping.slug}.webp`,
      `${mapping.slug}.jpg`,
      `${mapping.slug}.jpeg`,
      `${mapping.slug}.png`,
      `${mapping.slug}.webp`,
    ];
    
    const foundFile = possibleNames.find(name => 
      downloadedFiles.includes(name)
    );
    
    if (!foundFile) {
      log(`Downloaded file not found for ${mapping.slug}`, 'error');
      log(`Tried: ${possibleNames.slice(0, 4).join(', ')}...`, 'info');
      failed++;
      continue;
    }
    
    const filePath = join(CONFIG.downloadDir, foundFile);
    log(`Found: ${foundFile}`);
    
    if (DRY_RUN) {
      log('Dry run - skipping upload', 'info');
      skipped++;
      continue;
    }
    
    // Process and upload
    log('Processing & uploading...');
    const result = await processAndUploadImage(filePath, mapping.slug, mapping.title);
    
    if (!result) {
      log('Upload failed', 'error');
      failed++;
      continue;
    }
    
    log(`Uploaded: ${result.url.substring(0, 60)}...`, 'success');
    log(`Size: ${(result.size / 1024).toFixed(1)}KB, ${result.width}x${result.height}`);
    
    // Update database
    log('Updating database...');
    const dbSuccess = await updateDatabase(mapping.slug, result, mapping);
    
    if (dbSuccess) {
      log('Database updated', 'success');
      success++;
    } else {
      log('Database update failed', 'error');
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Processed: ${toProcess.length}`);
  console.log(`  ✅ Success: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);
  if (DRY_RUN) console.log(`  ⏭️  Skipped (dry run): ${skipped}`);
  
  if (success > 0) {
    console.log('\n  🎉 Images uploaded! Refresh the admin to see changes.');
  }
}

main().catch(console.error);
