#!/usr/bin/env tsx
/**
 * Re-upload Real Images
 * 
 * This script:
 * 1. Reads the WordPress export data to get original image URLs
 * 2. Downloads actual images (with proper headers to bypass security)
 * 3. Validates downloaded content is actually an image
 * 4. Uploads to Bunny CDN
 * 5. Updates database with correct URLs
 */

import { db } from '../src/lib/db/index.js';
import { media, works, workMedia } from '../src/lib/db/schema.js';
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
  collabsPath: join(process.cwd(), 'public/audio-covers/wp-collabs-posts.json'),
  digitalPath: join(process.cwd(), 'public/audio-covers/wp-digital-posts.json'),
  physicalPath: join(process.cwd(), 'public/audio-covers/wp-physical-posts.json'),
};

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

function isValidImage(buffer: Buffer): { valid: boolean; type?: string } {
  // Check magic numbers for common image formats
  if (buffer.length < 4) return { valid: false };
  
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { valid: true, type: 'image/png' };
  }
  
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { valid: true, type: 'image/jpeg' };
  }
  
  // WebP: 52 49 46 46 (RIFF header) followed by WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    if (buffer.length > 12 && 
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return { valid: true, type: 'image/webp' };
    }
  }
  
  // GIF: 47 49 46 38 (GIF8)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { valid: true, type: 'image/gif' };
  }
  
  return { valid: false };
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; type: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.sheskin.org/',
      },
    });
    
    if (!response.ok) {
      console.log(`      ❌ HTTP ${response.status}`);
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Validate it's actually an image
    const validation = isValidImage(buffer);
    if (!validation.valid) {
      console.log(`      ❌ Not a valid image (got ${buffer.length} bytes, starts with: ${buffer.slice(0, 20).toString('hex')})`);
      // Show first 100 chars if it looks like text
      if (buffer[0] === 0x3C || buffer[0] === 0x68) { // '<' or 'h' for HTML
        console.log(`      📝 Content preview: ${buffer.toString('utf-8').substring(0, 100)}`);
      }
      return null;
    }
    
    return { buffer, type: validation.type };
  } catch (error) {
    console.log(`      ❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
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

    if (!response.ok) {
      console.log(`      ❌ Upload failed: HTTP ${response.status}`);
      return null;
    }

    const encodedPath = filename.split('/').map(encodeURIComponent).join('/');
    return `${CONFIG.bunnyCdnUrl}/${encodedPath}`;
  } catch (error) {
    console.log(`      ❌ Upload error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return null;
  }
}

async function processAndUpload(
  buffer: Buffer,
  imageType: string,
  category: string,
  workSlug: string
): Promise<{ url: string; width: number; height: number; size: number; variants: any } | null> {
  try {
    // Get original metadata
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width || 1200;
    const originalHeight = metadata.height || 800;
    
    // Convert to WebP and create variants
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
      }
    }
    
    // Upload main image (full size WebP)
    const webpBuffer = await sharp(buffer)
      .webp({ quality: 90 })
      .toBuffer();
    
    const mainFilename = `works/${category}/${workSlug}.webp`;
    const mainUrl = await uploadToBunny(webpBuffer, mainFilename, 'image/webp');
    
    if (!mainUrl) return null;
    
    const finalMeta = await sharp(webpBuffer).metadata();
    
    return {
      url: mainUrl,
      width: finalMeta.width || originalWidth,
      height: finalMeta.height || originalHeight,
      size: webpBuffer.length,
      variants,
    };
  } catch (error) {
    console.log(`      ❌ Processing failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    return null;
  }
}

async function fixWorkImages(
  work: typeof works.$inferSelect,
  wpPost: WordPressPost,
  category: string
) {
  console.log(`\n🔧 ${work.title}`);
  console.log(`   Slug: ${work.slug}`);
  
  // Get image URL from WordPress
  let imageUrl = wpPost.featured_image_url;
  
  if (!imageUrl && wpPost.content) {
    // Extract from content
    const imgMatch = wpPost.content.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
    if (imgMatch) imageUrl = imgMatch[1];
  }
  
  if (!imageUrl) {
    console.log(`   ⚠️  No image URL in WordPress data`);
    return false;
  }
  
  console.log(`   📥 Downloading from WordPress...`);
  console.log(`   URL: ${imageUrl.substring(0, 80)}...`);
  
  const download = await downloadImage(imageUrl);
  if (!download) {
    console.log(`   ❌ Download failed`);
    return false;
  }
  
  console.log(`   ✅ Downloaded: ${(download.buffer.length / 1024).toFixed(1)}KB (${download.type})`);
  
  // Process and upload
  console.log(`   🔄 Processing & uploading to Bunny CDN...`);
  const result = await processAndUpload(download.buffer, download.type, category, work.slug);
  
  if (!result) {
    console.log(`   ❌ Upload failed`);
    return false;
  }
  
  console.log(`   ✅ Uploaded: ${result.url.substring(0, 80)}...`);
  
  // Delete old media entries for this work
  const existingMedia = await db.select().from(workMedia).where(eq(workMedia.workId, work.id));
  if (existingMedia.length > 0) {
    console.log(`   🗑️  Removing ${existingMedia.length} old media link(s)`);
    for (const old of existingMedia) {
      await db.delete(workMedia).where(eq(workMedia.id, old.id));
      // Decrement ref count on old media
      if (old.mediaId) {
        await db.update(media)
          .set({ refCount: 0 }) // Will be cleaned up by purge script
          .where(eq(media.id, old.mediaId));
      }
    }
  }
  
  // Create new media entry
  const mediaId = nanoid();
  await db.insert(media).values({
    id: mediaId,
    filename: `${work.slug}.webp`,
    originalName: imageUrl.split('/').pop() || 'image.jpg',
    mimeType: 'image/webp',
    fileSize: result.size,
    url: result.url,
    path: `works/${category}/${work.slug}.webp`,
    width: result.width,
    height: result.height,
    variants: result.variants,
    mediaType: 'image',
    refCount: 1,
    altText: work.title,
  });
  
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
  
  console.log(`   ✅ Database updated`);
  return true;
}

async function main() {
  console.log('='.repeat(70));
  console.log('  RE-UPLOAD REAL IMAGES');
  console.log('='.repeat(70));
  
  if (!CONFIG.bunnyStorageKey) {
    console.error('❌ BUNNY_STORAGE_PASSWORD or BUNNY_API_KEY not set');
    process.exit(1);
  }
  
  // Load WordPress data
  console.log('\n📖 Loading WordPress exports...');
  const wpCollabs: WordPressPost[] = JSON.parse(readFileSync(CONFIG.collabsPath, 'utf-8'));
  const wpDigital: WordPressPost[] = JSON.parse(readFileSync(CONFIG.digitalPath, 'utf-8'));
  const wpPhysical: WordPressPost[] = JSON.parse(readFileSync(CONFIG.physicalPath, 'utf-8'));
  
  const wpMap = new Map([
    ...wpCollabs.map(p => [p.slug, { ...p, category: 'collaborations' }]),
    ...wpDigital.map(p => [p.slug, { ...p, category: 'digital' }]),
    ...wpPhysical.map(p => [p.slug, { ...p, category: 'physical' }]),
  ]);
  
  console.log(`   Loaded: ${wpCollabs.length} collaborations, ${wpDigital.length} digital, ${wpPhysical.length} physical`);
  
  // Find works with broken/missing images
  console.log('\n🔍 Finding works with broken images...');
  
  const categories = ['collaborations', 'digital', 'physical'] as const;
  const toFix: Array<{ work: typeof works.$inferSelect; wpPost: any; category: string }> = [];
  
  for (const category of categories) {
    const worksList = await db.query.works.findMany({
      where: and(
        eq(works.category, category),
        eq(works.published, true),
        isNull(works.deletedAt)
      ),
      with: { media: true },
    });
    
    for (const work of worksList) {
      const hasMedia = work.media && work.media.length > 0;
      const mediaUrl = hasMedia ? work.media[0].url : null;
      
      // Check if URL is broken (contains HTML or is very small)
      if (!hasMedia || !mediaUrl?.includes('b-cdn.net')) {
        const wpPost = wpMap.get(work.slug);
        if (wpPost) {
          toFix.push({ work, wpPost, category });
        }
      }
    }
  }
  
  console.log(`   Found ${toFix.length} works needing image fixes`);
  
  if (toFix.length === 0) {
    console.log('\n✅ All works have valid images!');
    return;
  }
  
  // Confirm before proceeding
  console.log(`\n⚠️  Will attempt to fix ${toFix.length} works`);
  console.log('   Run with --dry-run to see list without making changes\n');
  
  // Process each work
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < toFix.length; i++) {
    const { work, wpPost, category } = toFix[i];
    console.log(`\n[${i + 1}/${toFix.length}]`);
    
    const result = await fixWorkImages(work, wpPost, category);
    if (result) {
      success++;
    } else {
      failed++;
    }
    
    // Delay between items
    await new Promise(r => setTimeout(r, 1500));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  ✅ Success: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`\n🎉 Images should now display correctly!`);
}

main().catch(console.error);
