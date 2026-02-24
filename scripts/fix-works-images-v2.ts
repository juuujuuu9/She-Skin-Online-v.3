#!/usr/bin/env tsx
/**
 * Fix Broken Works Images - Proper Mapping
 * 
 * Maps works to WordPress posts by slug, downloads featured images,
 * uploads to Bunny CDN, and updates database.
 * 
 * Usage: npx tsx scripts/fix-works-images-v2.ts [--dry-run] [--category=digital|collaborations|physical]
 */

import { db } from '../src/lib/db/index.js';
import { workMedia, media } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename, extname } from 'path';

const CONFIG = {
  wpPostsPaths: {
    digital: './public/audio-covers/wp-digital-posts.json',
    collaborations: './public/audio-covers/wp-collabs-posts.json',
    physical: './public/audio-covers/wp-physical-posts.json',
  },
  tempDir: './tmp/fix-works-images-v2',
  bunnyStorageZone: process.env.BUNNY_STORAGE_ZONE || 'she-skin',
  bunnyCdnUrl: process.env.BUNNY_CDN_URL || 'https://she-skin.b-cdn.net',
  bunnyStorageEndpoint: process.env.BUNNY_STORAGE_ENDPOINT || 'ny.storage.bunnycdn.com',
  bunnyApiKey: process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY,
  reportFile: './tmp/fix-works-images-v2-report.json',
};

interface WpPost {
  id: number;
  title: string;
  slug: string;
  featured_image_id: number | null;
  featured_image_url?: string;
}

function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  console.log(`${icons[type]} ${message}`);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadImage(url: string, outputPath: string): Promise<{ success: boolean; size?: number; error?: string }> {
  try {
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'https://www.sheskin.org/',
      },
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('text/html')) {
      return { success: false, error: 'Received HTML (captcha/redirect)' };
    }

    writeFileSync(outputPath, buffer);
    return { success: true, size: buffer.length };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function uploadToBunny(fileBuffer: Buffer, cdnPath: string, contentType: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!CONFIG.bunnyApiKey) {
      return { success: false, error: 'Bunny API key not configured' };
    }

    const uploadUrl = `https://${CONFIG.bunnyStorageEndpoint}/${CONFIG.bunnyStorageZone}/${cdnPath}`;
    
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
      return { success: false, error: `Upload failed: ${response.status} ${errorText}` };
    }

    const cleanCdnUrl = CONFIG.bunnyCdnUrl.endsWith('/') ? CONFIG.bunnyCdnUrl.slice(0, -1) : CONFIG.bunnyCdnUrl;
    return { success: true, url: `${cleanCdnUrl}/${cdnPath}` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function main() {
  console.log('🔧 Fixing Broken Works Images (v2)\n');
  console.log('='.repeat(60));
  
  const isDryRun = process.argv.includes('--dry-run');
  const categoryFilter = process.argv.find(arg => arg.startsWith('--category='))?.split('=')[1];
  
  if (isDryRun) {
    log('DRY RUN MODE - No changes will be made', 'warning');
  }
  
  // Load WordPress posts
  log('Loading WordPress posts...', 'info');
  const wpPostsByCategory: Record<string, WpPost[]> = {};
  const wpPostsBySlug: Record<string, WpPost> = {};
  
  for (const [category, path] of Object.entries(CONFIG.wpPostsPaths)) {
    try {
      const content = readFileSync(path, 'utf-8');
      const posts: WpPost[] = JSON.parse(content);
      wpPostsByCategory[category] = posts;
      
      // Index by slug for quick lookup
      for (const post of posts) {
        if (post.slug) {
          wpPostsBySlug[post.slug] = post;
        }
      }
      
      log(`Loaded ${posts.length} ${category} posts`, 'success');
    } catch (error) {
      log(`Failed to load ${category} posts: ${error}`, 'error');
    }
  }
  
  // Get works with media from database
  log('Fetching works from database...', 'info');
  const allWorks = await db.query.works.findMany({
    with: {
      media: true,
    },
  });
  
  const worksWithMedia = allWorks.filter(w => w.media && w.media.length > 0);
  log(`Found ${worksWithMedia.length} works with media`, 'info');
  
  let worksToProcess = worksWithMedia;
  if (categoryFilter) {
    worksToProcess = worksWithMedia.filter(w => w.category === categoryFilter);
    log(`Filtered to ${worksToProcess.length} works in category: ${categoryFilter}`, 'info');
  }
  
  const results: any[] = [];
  let fixed = 0;
  let failed = 0;
  let skipped = 0;
  let noImageUrl = 0;
  
  for (let i = 0; i < worksToProcess.length; i++) {
    const work = worksToProcess[i];
    const primaryMedia = work.media.find(m => m.isPrimary) || work.media[0];
    
    console.log(`\n[${i + 1}/${worksToProcess.length}] ${work.title} (${work.category})`);
    
    // Find WordPress post by slug
    const wpPost = wpPostsBySlug[work.slug];
    
    if (!wpPost) {
      log(`  No WordPress post found for slug: ${work.slug}`, 'error');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        status: 'failed',
        error: 'No WordPress post found for slug',
      });
      failed++;
      continue;
    }
    
    if (!wpPost.featured_image_url) {
      log(`  No featured image in WordPress post`, 'warning');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        wpPostId: wpPost.id,
        status: 'failed',
        error: 'No featured_image_url in WordPress post',
      });
      noImageUrl++;
      continue;
    }
    
    log(`  Found WP post ID: ${wpPost.id}`, 'success');
    log(`  Featured image: ${wpPost.featured_image_url.substring(0, 60)}...`, 'info');
    
    if (isDryRun) {
      log(`  DRY RUN: Would download and upload`, 'info');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        wpPostId: wpPost.id,
        featuredImageUrl: wpPost.featured_image_url,
        status: 'dry_run',
      });
      continue;
    }
    
    // Download image
    const urlObj = new URL(wpPost.featured_image_url);
    const pathname = urlObj.pathname;
    const ext = extname(pathname) || '.jpg';
    const tempPath = join(CONFIG.tempDir, `${work.slug}${ext}`);
    
    log(`  Downloading...`, 'info');
    const downloadResult = await downloadImage(wpPost.featured_image_url, tempPath);
    
    if (!downloadResult.success) {
      log(`  Download failed: ${downloadResult.error}`, 'error');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        wpPostId: wpPost.id,
        featuredImageUrl: wpPost.featured_image_url,
        status: 'failed',
        error: `Download failed: ${downloadResult.error}`,
      });
      failed++;
      continue;
    }
    
    log(`  Downloaded: ${downloadResult.size} bytes`, 'success');
    
    // Upload to Bunny CDN
    const fileBuffer = readFileSync(tempPath);
    const filename = basename(tempPath);
    const cdnPath = `works/${work.category}/${filename}`;
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
    
    log(`  Uploading to Bunny CDN...`, 'info');
    const uploadResult = await uploadToBunny(fileBuffer, cdnPath, contentType);
    
    if (!uploadResult.success) {
      log(`  Upload failed: ${uploadResult.error}`, 'error');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        wpPostId: wpPost.id,
        status: 'failed',
        error: `Upload failed: ${uploadResult.error}`,
      });
      failed++;
      continue;
    }
    
    log(`  Uploaded: ${uploadResult.url}`, 'success');
    
    // Update database
    try {
      await db.update(workMedia)
        .set({ url: uploadResult.url })
        .where(eq(workMedia.id, primaryMedia.id));
      
      // Update media table too
      const mediaEntry = await db.query.media.findFirst({
        where: eq(media.url, primaryMedia.url),
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
        wpPostId: wpPost.id,
        oldUrl: primaryMedia.url,
        newUrl: uploadResult.url,
        status: 'fixed',
      });
      fixed++;
      
    } catch (error) {
      log(`  Database update failed: ${error}`, 'error');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        wpPostId: wpPost.id,
        newUrl: uploadResult.url,
        status: 'failed',
        error: `Database update failed: ${error}`,
      });
      failed++;
    }
    
    // Delay to avoid rate limiting
    await delay(500);
  }
  
  // Save report
  const report = {
    generatedAt: new Date().toISOString(),
    summary: { total: worksToProcess.length, fixed, failed, skipped, noImageUrl },
    results,
  };
  
  writeFileSync(CONFIG.reportFile, JSON.stringify(report, null, 2));
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 FIX SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total: ${worksToProcess.length}`);
  console.log(`✅ Fixed: ${fixed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`🚫 No image URL: ${noImageUrl}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`\nReport: ${CONFIG.reportFile}`);
}

main().catch(error => {
  log(`Fatal error: ${error}`, 'error');
  process.exit(1);
});
