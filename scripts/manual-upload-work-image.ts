#!/usr/bin/env tsx
/**
 * Manual Upload Work Image
 * 
 * Usage:
 *   npx tsx scripts/manual-upload-work-image.ts --work-slug=SLUG --image-path=/path/to/image.jpg
 * 
 * This uploads a local image file to Bunny CDN and links it to a work.
 */

import { db } from '../src/lib/db/index.js';
import { works, workMedia, media } from '../src/lib/db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { readFileSync } from 'fs';
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
};

function parseArgs() {
  const args = process.argv.slice(2);
  const slugArg = args.find(a => a.startsWith('--work-slug='));
  const imageArg = args.find(a => a.startsWith('--image-path='));
  
  return {
    slug: slugArg ? slugArg.split('=')[1] : null,
    imagePath: imageArg ? imageArg.split('=')[1] : null,
  };
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
      console.error(`   ❌ Upload failed: HTTP ${response.status}`);
      return null;
    }

    const encodedPath = filename.split('/').map(encodeURIComponent).join('/');
    return `${CONFIG.bunnyCdnUrl}/${encodedPath}`;
  } catch (error) {
    console.error(`   ❌ Upload error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return null;
  }
}

async function processAndUpload(
  buffer: Buffer,
  category: string,
  workSlug: string
) {
  // Get original metadata
  const metadata = await sharp(buffer).metadata();
  const originalWidth = metadata.width || 1200;
  const originalHeight = metadata.height || 800;
  
  console.log(`   📐 Original: ${originalWidth}x${originalHeight}`);
  
  // Create variants
  const variants: any = {};
  const sizes = [
    { name: 'sm', width: 400 },
    { name: 'md', width: 800 },
    { name: 'lg', width: 1200 },
  ];
  
  for (const size of sizes) {
    if (originalWidth < size.width) continue;
    
    const resized = await sharp(buffer)
      .resize(size.width, undefined, { withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    
    const filename = `works/${category}/${workSlug}-${size.name}.webp`;
    const url = await uploadToBunny(resized, filename, 'image/webp');
    
    if (url) {
      variants[size.name] = {
        url,
        width: size.width,
        height: Math.round(size.width * (originalHeight / originalWidth)),
        size: resized.length,
      };
      console.log(`   ✅ ${size.name}: ${(resized.length / 1024).toFixed(1)}KB`);
    }
  }
  
  // Upload main image
  const webpBuffer = await sharp(buffer)
    .webp({ quality: 90 })
    .toBuffer();
  
  const mainFilename = `works/${category}/${workSlug}.webp`;
  const mainUrl = await uploadToBunny(webpBuffer, mainFilename, 'image/webp');
  
  if (!mainUrl) return null;
  
  console.log(`   ✅ main: ${(webpBuffer.length / 1024).toFixed(1)}KB`);
  
  const finalMeta = await sharp(webpBuffer).metadata();
  
  return {
    url: mainUrl,
    width: finalMeta.width || originalWidth,
    height: finalMeta.height || originalHeight,
    size: webpBuffer.length,
    variants,
  };
}

async function main() {
  const { slug, imagePath } = parseArgs();
  
  if (!slug || !imagePath) {
    console.log('Usage: npx tsx scripts/manual-upload-work-image.ts --work-slug=SLUG --image-path=/path/to/image.jpg');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx scripts/manual-upload-work-image.ts --work-slug=new-york-dance-music-cover --image-path=/tmp/image.jpg');
    process.exit(1);
  }
  
  console.log('='.repeat(70));
  console.log('  MANUAL UPLOAD WORK IMAGE');
  console.log('='.repeat(70));
  
  if (!CONFIG.bunnyStorageKey) {
    console.error('❌ BUNNY_STORAGE_PASSWORD or BUNNY_API_KEY not set');
    process.exit(1);
  }
  
  // Find the work
  console.log(`\n🔍 Finding work: ${slug}`);
  const work = await db.query.works.findFirst({
    where: and(eq(works.slug, slug), isNull(works.deletedAt)),
    with: { media: true },
  });
  
  if (!work) {
    console.error(`❌ Work not found: ${slug}`);
    process.exit(1);
  }
  
  console.log(`   ✅ Found: ${work.title} (${work.category})`);
  
  // Read the image file
  console.log(`\n📖 Reading image: ${imagePath}`);
  let buffer: Buffer;
  try {
    buffer = readFileSync(imagePath);
    console.log(`   ✅ Loaded: ${(buffer.length / 1024).toFixed(1)}KB`);
  } catch (error) {
    console.error(`❌ Cannot read file: ${error instanceof Error ? error.message : 'Unknown'}`);
    process.exit(1);
  }
  
  // Delete old media links
  if (work.media && work.media.length > 0) {
    console.log(`\n🗑️  Removing ${work.media.length} old media link(s)`);
    for (const old of work.media) {
      await db.delete(workMedia).where(eq(workMedia.id, old.id));
    }
  }
  
  // Process and upload
  console.log(`\n🔄 Processing & uploading...`);
  const result = await processAndUpload(buffer, work.category, work.slug);
  
  if (!result) {
    console.error('\n❌ Upload failed');
    process.exit(1);
  }
  
  console.log(`\n   ✅ CDN URL: ${result.url}`);
  
  // Create media entry
  const mediaId = nanoid();
  await db.insert(media).values({
    id: mediaId,
    filename: `${work.slug}.webp`,
    originalName: imagePath.split('/').pop() || 'image.jpg',
    mimeType: 'image/webp',
    fileSize: result.size,
    url: result.url,
    path: `works/${work.category}/${work.slug}.webp`,
    width: result.width,
    height: result.height,
    variants: result.variants,
    mediaType: 'image',
    refCount: 1,
    altText: work.title,
  });
  console.log(`   ✅ Created media entry`);
  
  // Create work-media link
  await db.insert(workMedia).values({
    id: nanoid(),
    workId: work.id,
    mediaId,
    type: 'image',
    url: result.url,
    variants: result.variants,
    width: result.width,
    height: result.height,
    isPrimary: true,
    sortOrder: 0,
  });
  console.log(`   ✅ Created work-media link`);
  
  console.log('\n' + '='.repeat(70));
  console.log('  SUCCESS!');
  console.log('='.repeat(70));
  console.log(`\nImage uploaded for: ${work.title}`);
  console.log(`CDN URL: ${result.url}`);
  console.log(`\nThe image should now appear on the public page.`);
}

main().catch(console.error);
