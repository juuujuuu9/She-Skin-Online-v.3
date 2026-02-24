#!/usr/bin/env tsx
/**
 * Fix Broken Images from WordPress
 *
 * This script:
 * 1. Reads the broken-media-report.json
 * 2. Matches broken filenames to WordPress attachment URLs
 * 3. Downloads originals from WordPress
 * 4. Converts to WebP with variants
 * 5. Uploads to Bunny CDN
 * 6. Updates database with new URLs and variants
 */

import { db } from '../src/lib/db/index.js';
import { media } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { createHash } from 'crypto';
import { config } from 'dotenv';

config();

const CONFIG = {
  bunnyStorageKey: process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY || '',
  bunnyStorageZone: process.env.BUNNY_STORAGE_ZONE || 'she-skin',
  bunnyStorageEndpoint: process.env.BUNNY_STORAGE_ENDPOINT || 'ny.storage.bunnycdn.com',
  bunnyCdnUrl: process.env.BUNNY_CDN_URL || 'https://she-skin.b-cdn.net',
  wpBaseUrl: 'https://www.sheskin.org/wp-content/uploads',
  variants: [
    { name: 'sm', width: 400, quality: 80 },
    { name: 'md', width: 800, quality: 85 },
    { name: 'lg', width: 1200, quality: 85 },
  ],
};

// Load WordPress attachments
import { readFileSync } from 'fs';
import { join } from 'path';

const wpAttachments = JSON.parse(
  readFileSync(join(process.cwd(), '.vercel/output/static/audio-covers/wp-attachments.json'), 'utf-8')
);

interface BrokenMedia {
  id: string;
  filename: string;
  originalName: string | null;
  url: string;
  mediaType: string;
  httpStatus: number;
}

interface VariantResult {
  name: string;
  url: string;
  width: number;
  height: number;
  size: number;
}

function findWpUrl(brokenItem: BrokenMedia): string | null {
  const searchName = (brokenItem.originalName || brokenItem.filename).toLowerCase();

  // Try exact match first
  for (const item of wpAttachments.items) {
    const wpFilename = item.url.split('/').pop()?.toLowerCase();
    if (wpFilename === searchName) {
      return item.url;
    }
  }

  // Try matching without extension
  const nameWithoutExt = searchName.replace(/\.[^/.]+$/, '');
  for (const item of wpAttachments.items) {
    const wpFilename = item.url.split('/').pop()?.toLowerCase().replace(/\.[^/.]+$/, '');
    if (wpFilename === nameWithoutExt) {
      return item.url;
    }
  }

  // Try fuzzy match (contains)
  for (const item of wpAttachments.items) {
    const wpFilename = item.url.split('/').pop()?.toLowerCase();
    if (wpFilename?.includes(nameWithoutExt) || nameWithoutExt.includes(wpFilename?.replace(/-/g, '').replace(/_/g, '') || '')) {
      return item.url;
    }
  }

  return null;
}

async function downloadFromWp(url: string): Promise<Buffer | null> {
  try {
    console.log(`   📥 Downloading from WordPress...`);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (media-recovery)' },
    });

    if (!response.ok) {
      console.log(`   ❌ WP download failed: HTTP ${response.status}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Validate it's an image
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      console.log(`   ⚠️  Invalid content-type: ${contentType}`);
      return null;
    }

    if (buffer.length < 1024) {
      console.log(`   ⚠️  File too small (${buffer.length} bytes)`);
      return null;
    }

    console.log(`   ✅ Downloaded ${(buffer.length / 1024).toFixed(1)}KB`);
    return buffer;
  } catch (error) {
    console.log(`   ❌ Download error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return null;
  }
}

async function uploadToBunny(buffer: Buffer, filename: string): Promise<string | null> {
  try {
    const uploadUrl = `https://${CONFIG.bunnyStorageEndpoint}/${CONFIG.bunnyStorageZone}/${filename}`;

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': CONFIG.bunnyStorageKey,
        'Content-Type': 'image/webp',
      },
      body: buffer,
    });

    if (!response.ok) {
      console.log(`   ❌ Upload failed: HTTP ${response.status}`);
      return null;
    }

    const encodedPath = filename.split('/').map(encodeURIComponent).join('/');
    return `${CONFIG.bunnyCdnUrl}/${encodedPath}`;
  } catch (error) {
    console.log(`   ❌ Upload error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return null;
  }
}

async function processAndUpload(
  buffer: Buffer,
  originalName: string,
  category: string
): Promise<{ url: string; variants: Record<string, any> } | null> {
  // Generate content hash for filename
  const hash = createHash('md5').update(buffer).digest('hex').substring(0, 6);
  const baseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '-');
  const cleanName = `${baseName.substring(0, 40)}-${hash}`;

  // Get image metadata
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (error) {
    console.log(`   ❌ Invalid image format`);
    return null;
  }

  const originalWidth = metadata.width || 2000;
  const originalHeight = metadata.height || 2000;
  const aspectRatio = originalWidth / originalHeight;

  // Process main image (convert to WebP)
  console.log(`   🔄 Converting to WebP...`);
  let mainWebp: Buffer;
  try {
    mainWebp = await sharp(buffer)
      .webp({ quality: 85, effort: 4 })
      .toBuffer();
  } catch (error) {
    console.log(`   ❌ WebP conversion failed`);
    return null;
  }

  // Upload main image
  const mainFilename = `works/${category}/${cleanName}.webp`;
  const mainUrl = await uploadToBunny(mainWebp, mainFilename);
  if (!mainUrl) {
    return null;
  }
  console.log(`   ✅ Uploaded main image`);

  // Generate variants
  const variants: Record<string, any> = {};

  for (const variant of CONFIG.variants) {
    if (originalWidth < variant.width * 0.5) {
      continue; // Skip if original is much smaller
    }

    const targetHeight = Math.round(variant.width / aspectRatio);

    try {
      const processed = await sharp(buffer)
        .resize(variant.width, targetHeight, {
          withoutEnlargement: true,
          fit: 'inside',
        })
        .webp({ quality: variant.quality, effort: 4 })
        .toBuffer();

      const variantFilename = `works/${category}/${cleanName}-${variant.name}.webp`;
      const variantUrl = await uploadToBunny(processed, variantFilename);

      if (variantUrl) {
        variants[variant.name] = {
          url: variantUrl,
          width: variant.width,
          height: targetHeight,
          size: processed.length,
        };
        console.log(`   ✅ ${variant.name}: ${(processed.length / 1024).toFixed(1)}KB`);
      }
    } catch (error) {
      console.log(`   ❌ Failed to create ${variant.name}`);
    }
  }

  return { url: mainUrl, variants };
}

async function fixBrokenItem(brokenItem: BrokenMedia): Promise<boolean> {
  console.log(`\n🖼️  ${brokenItem.originalName || brokenItem.filename}`);

  // Find WordPress URL
  const wpUrl = findWpUrl(brokenItem);
  if (!wpUrl) {
    console.log(`   ❌ Could not find matching WordPress attachment`);
    return false;
  }
  console.log(`   🔗 WP URL: ${wpUrl.substring(0, 70)}...`);

  // Download from WordPress
  const buffer = await downloadFromWp(wpUrl);
  if (!buffer) {
    return false;
  }

  // Determine category from URL
  let category = 'digital';
  if (brokenItem.url.includes('/collaborations/')) {
    category = 'collaborations';
  } else if (brokenItem.url.includes('/physical/')) {
    category = 'physical';
  }

  // Process and upload
  const result = await processAndUpload(
    buffer,
    brokenItem.originalName || brokenItem.filename,
    category
  );

  if (!result) {
    return false;
  }

  // Update database
  try {
    await db.update(media)
      .set({
        url: result.url,
        variants: result.variants,
        updatedAt: new Date(),
      })
      .where(eq(media.id, brokenItem.id));

    console.log(`   ✅ Database updated`);
    console.log(`   🌐 New URL: ${result.url.substring(0, 70)}...`);
    return true;
  } catch (error) {
    console.log(`   ❌ Database update failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  FIX BROKEN IMAGES FROM WORDPRESS');
  console.log('='.repeat(70));

  if (!CONFIG.bunnyStorageKey) {
    console.error('❌ BUNNY_STORAGE_PASSWORD or BUNNY_API_KEY not set');
    process.exit(1);
  }

  // Load broken media report
  const brokenReport = JSON.parse(
    readFileSync(join(process.cwd(), 'broken-media-report.json'), 'utf-8')
  ) as BrokenMedia[];

  console.log(`\nFound ${brokenReport.length} broken images to fix`);
  console.log(`WordPress attachments loaded: ${wpAttachments.items.length}`);

  let success = 0;
  let failed = 0;
  let notFound = 0;

  for (let i = 0; i < brokenReport.length; i++) {
    const item = brokenReport[i];
    console.log(`\n[${i + 1}/${brokenReport.length}]`);

    const result = await fixBrokenItem(item);
    if (result) {
      success++;
    } else {
      // Check if it was "not found" vs "failed"
      const wpUrl = findWpUrl(item);
      if (!wpUrl) {
        notFound++;
      } else {
        failed++;
      }
    }

    // Small delay between items
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  ✅ Success: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  🔍 Not found in WordPress: ${notFound}`);
  console.log(`  📊 Total: ${brokenReport.length}`);

  if (success > 0) {
    console.log('\n🎉 Fixed images should now show thumbnails in the admin!');
    console.log('   Run the audit script again to verify: npx tsx scripts/audit-media-urls.ts');
  }
}

main().catch(console.error);
