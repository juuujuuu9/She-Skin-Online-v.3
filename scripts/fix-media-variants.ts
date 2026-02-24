#!/usr/bin/env tsx
/**
 * Fix Media Variants - Generate WebP variants for existing media
 * 
 * This script:
 * 1. Finds media items missing variants
 * 2. Downloads the original image from Bunny CDN
 * 3. Generates sm, md, lg WebP variants
 * 4. Uploads variants back to Bunny CDN
 * 5. Updates database with variant URLs
 */

import { db } from '../src/lib/db/index.js';
import { media } from '../src/lib/db/schema.js';
import { eq, isNull } from 'drizzle-orm';
import sharp from 'sharp';
import { config } from 'dotenv';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';

config();

const CONFIG = {
  bunnyStorageKey: process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY || '',
  bunnyStorageZone: process.env.BUNNY_STORAGE_ZONE || 'she-skin',
  bunnyStorageEndpoint: process.env.BUNNY_STORAGE_ENDPOINT || 'ny.storage.bunnycdn.com',
  bunnyCdnUrl: process.env.BUNNY_CDN_URL || 'https://she-skin.b-cdn.net',
  tempDir: join(process.cwd(), 'tmp', 'media-variants'),
  variants: [
    { name: 'sm', width: 400, quality: 80 },
    { name: 'md', width: 800, quality: 85 },
    { name: 'lg', width: 1200, quality: 85 },
  ],
};

interface VariantResult {
  name: string;
  url: string;
  width: number;
  height: number;
  size: number;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (media-processor)' },
    });
    if (!response.ok) {
      console.log(`    ❌ Download failed: HTTP ${response.status}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Check if content is actually an image (min 1KB, proper content-type)
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      console.log(`    ⚠️  Invalid content-type: ${contentType}`);
      return null;
    }

    // Images should be at least 1KB
    if (buffer.length < 1024) {
      console.log(`    ⚠️  File too small (${buffer.length} bytes), likely not a valid image`);
      return null;
    }

    return buffer;
  } catch (error) {
    console.log(`    ❌ Download error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return null;
  }
}

async function uploadToBunny(
  buffer: Buffer,
  filename: string,
  contentType: string = 'image/webp'
): Promise<string | null> {
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
      console.log(`    ❌ Upload failed: HTTP ${response.status}`);
      return null;
    }

    const encodedPath = filename.split('/').map(encodeURIComponent).join('/');
    return `${CONFIG.bunnyCdnUrl}/${encodedPath}`;
  } catch (error) {
    console.log(`    ❌ Upload error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return null;
  }
}

async function processImage(
  buffer: Buffer,
  mediaItem: typeof media.$inferSelect
): Promise<VariantResult[] | null> {
  const variants: VariantResult[] = [];

  // Get original metadata
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (error) {
    console.log(`    ❌ Invalid image format: ${error instanceof Error ? error.message : 'Unknown'}`);
    return null;
  }

  const originalWidth = metadata.width || 2000;
  const originalHeight = metadata.height || 2000;
  const aspectRatio = originalWidth / originalHeight;
  
  // Extract base path from existing URL
  const urlParts = mediaItem.url.split('/');
  const filename = urlParts[urlParts.length - 1];
  const baseName = filename.replace(/\.[^/.]+$/, '');
  const basePath = urlParts.slice(0, -1).join('/').replace(CONFIG.bunnyCdnUrl + '/', '');
  
  for (const variant of CONFIG.variants) {
    // Skip if original is smaller than target
    if (originalWidth < variant.width) {
      console.log(`    ℹ️  Original smaller than ${variant.name}, using original size`);
      continue;
    }
    
    const targetHeight = Math.round(variant.width / aspectRatio);
    
    try {
      // Process image
      const processed = await sharp(buffer)
        .resize(variant.width, targetHeight, { 
          withoutEnlargement: true,
          fit: 'inside',
        })
        .webp({ 
          quality: variant.quality,
          effort: 4,
        })
        .toBuffer();
      
      // Upload variant
      const variantFilename = `${basePath}/${baseName}-${variant.name}.webp`;
      const url = await uploadToBunny(processed, variantFilename);
      
      if (url) {
        variants.push({
          name: variant.name,
          url,
          width: variant.width,
          height: targetHeight,
          size: processed.length,
        });
        console.log(`    ✅ ${variant.name}: ${(processed.length / 1024).toFixed(1)}KB`);
      }
    } catch (error) {
      console.log(`    ❌ Failed to create ${variant.name}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }
  
  return variants;
}

async function fixMediaItem(mediaItem: typeof media.$inferSelect): Promise<boolean> {
  console.log(`\n🖼️  ${mediaItem.originalName || mediaItem.filename}`);
  console.log(`   Current URL: ${mediaItem.url.substring(0, 70)}...`);
  
  // Skip non-images
  if (mediaItem.mediaType !== 'image') {
    console.log(`   ⏭️  Skipping (not an image: ${mediaItem.mediaType})`);
    return true;
  }
  
  // Download original
  console.log(`   📥 Downloading...`);
  const buffer = await downloadImage(mediaItem.url);
  if (!buffer) {
    return false;
  }
  console.log(`   📊 Size: ${(buffer.length / 1024).toFixed(1)}KB`);
  
  // Generate variants
  console.log(`   🔄 Generating variants...`);
  const variants = await processImage(buffer, mediaItem);

  if (variants === null) {
    console.log(`   ❌ Cannot process image - skipping`);
    return false;
  }

  if (variants.length === 0) {
    console.log(`   ❌ No variants generated (image may be too small)`);
    return false;
  }
  
  // Build variants object
  const variantsObject: any = {};
  for (const v of variants) {
    variantsObject[v.name] = {
      url: v.url,
      width: v.width,
      height: v.height,
      size: v.size,
    };
  }
  
  // Update database
  try {
    await db.update(media)
      .set({ 
        variants: variantsObject,
        updatedAt: new Date(),
      })
      .where(eq(media.id, mediaItem.id));
    
    console.log(`   ✅ Database updated`);
    return true;
  } catch (error) {
    console.log(`   ❌ Database update failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  FIX MEDIA VARIANTS');
  console.log('='.repeat(70));
  
  if (!CONFIG.bunnyStorageKey) {
    console.error('❌ BUNNY_STORAGE_PASSWORD or BUNNY_API_KEY not set');
    process.exit(1);
  }
  
  // Get media items missing variants
  const allMedia = await db.select().from(media).where(isNull(media.deletedAt));
  const needsVariants = allMedia.filter(m => {
    if (m.mediaType !== 'image') return false;
    if (!m.variants || typeof m.variants !== 'object') return true;
    const v = m.variants as Record<string, any>;
    return !v.sm && !v.md && !v.lg;
  });
  
  console.log(`\nFound ${needsVariants.length} images needing variants\n`);
  
  if (needsVariants.length === 0) {
    console.log('✅ All images already have variants!');
    return;
  }
  
  // Process each item
  let success = 0;
  let failed = 0;
  let skipped = 0;
  
  for (let i = 0; i < needsVariants.length; i++) {
    const item = needsVariants[i];
    console.log(`\n[${i + 1}/${needsVariants.length}]`);
    
    const result = await fixMediaItem(item);
    if (result) {
      success++;
    } else {
      failed++;
    }
    
    // Small delay between items
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  ✅ Success: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log('\n🎉 Media gallery thumbnails should now work!');
}

main().catch(console.error);
