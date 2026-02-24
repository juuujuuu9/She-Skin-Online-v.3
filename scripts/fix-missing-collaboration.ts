#!/usr/bin/env tsx
/**
 * Fix Missing Collaboration Image
 * 
 * Finds collaborations without images and imports them from WordPress data.
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
  collabsPath: join(process.cwd(), 'public/audio-covers/wp-collabs-posts.json'),
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (image-importer)' },
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
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

    if (!response.ok) return null;

    const encodedPath = filename.split('/').map(encodeURIComponent).join('/');
    return `${CONFIG.bunnyCdnUrl}/${encodedPath}`;
  } catch {
    return null;
  }
}

async function processAndUploadImage(buffer: Buffer, workSlug: string): Promise<{
  url: string;
  width: number;
  height: number;
  variants: any;
} | null> {
  try {
    // Get original dimensions
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width || 1200;
    const originalHeight = metadata.height || 800;
    
    // Generate variants
    const variants: any = {};
    const variantConfigs = [
      { name: 'sm', width: 400 },
      { name: 'md', width: 800 },
      { name: 'lg', width: 1200 },
    ];
    
    for (const v of variantConfigs) {
      if (originalWidth >= v.width) {
        const resized = await sharp(buffer)
          .resize(v.width, undefined, { withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
        
        const filename = `works/collaborations/${workSlug}-${v.name}.webp`;
        const url = await uploadToBunny(resized, filename);
        
        if (url) {
          variants[v.name] = { url, width: v.width, size: resized.length };
        }
      }
    }
    
    // Upload main image
    const mainFilename = `works/collaborations/${workSlug}-main.webp`;
    const processed = await sharp(buffer)
      .resize(1600, undefined, { withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
    
    const mainUrl = await uploadToBunny(processed, mainFilename);
    if (!mainUrl) return null;
    
    // Get final dimensions
    const finalMeta = await sharp(processed).metadata();
    
    return {
      url: mainUrl,
      width: finalMeta.width || originalWidth,
      height: finalMeta.height || originalHeight,
      variants,
    };
  } catch (error) {
    console.error(`   ❌ Image processing failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    return null;
  }
}

async function fixMissingCollaboration(work: typeof works.$inferSelect, wpPost: WordPressPost) {
  console.log(`\n🔧 Fixing: ${work.title}`);
  console.log(`   Slug: ${work.slug}`);
  
  // Extract image URL from WordPress data
  let imageUrl = wpPost.featured_image_url;
  
  if (!imageUrl && wpPost.content) {
    const imgMatch = wpPost.content.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
    if (imgMatch) {
      imageUrl = imgMatch[1];
    }
  }
  
  if (!imageUrl) {
    console.log(`   ❌ No image URL found in WordPress data`);
    return false;
  }
  
  console.log(`   📥 Downloading: ${imageUrl.substring(0, 80)}...`);
  
  const buffer = await downloadImage(imageUrl);
  if (!buffer) {
    console.log(`   ❌ Download failed`);
    return false;
  }
  console.log(`   📊 Downloaded: ${(buffer.length / 1024).toFixed(1)}KB`);
  
  // Process and upload
  console.log(`   🔄 Processing & uploading...`);
  const result = await processAndUploadImage(buffer, work.slug);
  if (!result) {
    console.log(`   ❌ Upload failed`);
    return false;
  }
  
  console.log(`   ✅ Uploaded to: ${result.url.substring(0, 80)}...`);
  
  // Create media entry
  const mediaId = nanoid();
  await db.insert(media).values({
    id: mediaId,
    filename: `${work.slug}.webp`,
    originalName: imageUrl.split('/').pop() || 'unknown.jpg',
    mimeType: 'image/webp',
    fileSize: buffer.length,
    url: result.url,
    path: `works/collaborations/${work.slug}-main.webp`,
    width: result.width,
    height: result.height,
    variants: result.variants,
    mediaType: 'image',
    refCount: 1,
    altText: work.title,
  });
  console.log(`   ✅ Created media entry: ${mediaId.slice(0, 8)}...`);
  
  // Create workMedia link
  const workMediaId = nanoid();
  await db.insert(workMedia).values({
    id: workMediaId,
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
  console.log(`   ✅ Created work-media link: ${workMediaId.slice(0, 8)}...`);
  
  return true;
}

async function main() {
  console.log('='.repeat(70));
  console.log('  FIX MISSING COLLABORATION IMAGES');
  console.log('='.repeat(70));
  
  if (!CONFIG.bunnyStorageKey) {
    console.error('❌ BUNNY_STORAGE_PASSWORD or BUNNY_API_KEY not set');
    process.exit(1);
  }
  
  // Load WordPress data
  console.log('\n📖 Loading WordPress collaborations...');
  const wpCollabs: WordPressPost[] = JSON.parse(readFileSync(CONFIG.collabsPath, 'utf-8'));
  const wpMap = new Map(wpCollabs.map(p => [p.slug, p]));
  console.log(`   Loaded ${wpCollabs.length} collaborations from WordPress`);
  
  // Find collaborations without images
  console.log('\n🔍 Finding collaborations without images...');
  const collabWorks = await db.query.works.findMany({
    where: and(
      eq(works.category, 'collaborations'),
      eq(works.published, true),
      isNull(works.deletedAt)
    ),
    with: {
      media: true,
    },
  });
  
  const missingImages = collabWorks.filter(w => !w.media || w.media.length === 0);
  console.log(`   Found ${missingImages.length} collaborations without images`);
  
  if (missingImages.length === 0) {
    console.log('\n✅ All collaborations already have images!');
    return;
  }
  
  // Try to fix each one
  let success = 0;
  let failed = 0;
  let notFound = 0;
  
  for (const work of missingImages) {
    const wpPost = wpMap.get(work.slug);
    
    if (!wpPost) {
      console.log(`\n⚠️  No WordPress data found for: ${work.title} (slug: ${work.slug})`);
      notFound++;
      continue;
    }
    
    const result = await fixMissingCollaboration(work, wpPost);
    if (result) {
      success++;
    } else {
      failed++;
    }
    
    // Delay between items
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  ✅ Fixed: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  ⚠️  No WP data: ${notFound}`);
  console.log(`\n🎉 Collaboration images should now display on the public page!`);
}

main().catch(console.error);
