#!/usr/bin/env tsx
/**
 * Fix Broken Works Images
 * 
 * Downloads images from WordPress and uploads to Bunny CDN
 * Uses wp-attachments.json to find the correct source URLs
 * 
 * Usage: npx tsx scripts/fix-works-images.ts [--dry-run] [--category=digital|collaborations]
 */

import { db } from '../src/lib/db/index.js';
import { workMedia, media } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename, extname } from 'path';

const CONFIG = {
  attachmentsPath: './public/audio-covers/wp-attachments.json',
  tempDir: './tmp/fix-works-images',
  bunnyStorageZone: process.env.BUNNY_STORAGE_ZONE || 'she-skin',
  bunnyCdnUrl: process.env.BUNNY_CDN_URL || 'https://she-skin.b-cdn.net',
  bunnyStorageEndpoint: process.env.BUNNY_STORAGE_ENDPOINT || 'ny.storage.bunnycdn.com',
  bunnyApiKey: process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY,
  reportFile: './tmp/fix-works-images-report.json',
};

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

function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  console.log(`${icons[type]} ${message}`);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadImage(url: string, outputPath: string): Promise<{ success: boolean; size?: number; error?: string }> {
  try {
    // Ensure directory exists
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
    
    // Reject HTML responses
    if (contentType.includes('text/html')) {
      // Try to get the actual image URL from the metadata if available
      return { success: false, error: 'Received HTML (captcha)' };
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
  console.log('🔧 Fixing Broken Works Images\n');
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
  
  // Create attachment lookup by parent_id
  const attachmentByParentId = new Map<number, Attachment>();
  for (const att of attachmentsData.items) {
    if (att.parent_id) {
      attachmentByParentId.set(att.parent_id, att);
    }
  }
  
  // Get works with media
  log('Fetching works from database...', 'info');
  const allWorks = await db.query.works.findMany({
    with: {
      media: true,
    },
  });
  
  // Filter to works with broken images
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
  
  for (let i = 0; i < worksToProcess.length; i++) {
    const work = worksToProcess[i];
    const primaryMedia = work.media.find(m => m.isPrimary) || work.media[0];
    
    console.log(`\n[${i + 1}/${worksToProcess.length}] ${work.title} (${work.category})`);
    
    // Extract WordPress post ID from slug
    // Slug format: "digital-20186-letter-x-rust-scott..."
    const slugMatch = work.slug.match(/^(digital|collaborations|physical)-(\d+)-/);
    
    if (!slugMatch) {
      log(`  Could not extract WordPress ID from slug: ${work.slug}`, 'error');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        status: 'failed',
        error: 'Could not extract WordPress ID from slug',
      });
      failed++;
      continue;
    }
    
    const wpPostId = parseInt(slugMatch[2]);
    const category = slugMatch[1];
    
    // Find attachment
    const attachment = attachmentByParentId.get(wpPostId);
    
    if (!attachment) {
      log(`  No attachment found for post ID: ${wpPostId}`, 'error');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        wpPostId,
        status: 'failed',
        error: 'No attachment found',
      });
      failed++;
      continue;
    }
    
    log(`  Found attachment: ${basename(attachment.file)}`, 'success');
    
    if (isDryRun) {
      log(`  DRY RUN: Would download and upload`, 'info');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        wpPostId,
        attachmentUrl: attachment.url,
        status: 'dry_run',
      });
      continue;
    }
    
    // Download image
    const ext = extname(attachment.file) || '.jpg';
    const tempPath = join(CONFIG.tempDir, `${work.slug}${ext}`);
    
    log(`  Downloading from WordPress...`, 'info');
    const downloadResult = await downloadImage(attachment.url, tempPath);
    
    if (!downloadResult.success) {
      log(`  Download failed: ${downloadResult.error}`, 'error');
      
      // Try fallback: construct direct URL from file path
      const fallbackUrl = `https://www.sheskin.org/wp-content/uploads/${attachment.file}`;
      log(`  Trying fallback URL...`, 'info');
      
      const fallbackResult = await downloadImage(fallbackUrl, tempPath);
      if (!fallbackResult.success) {
        log(`  Fallback also failed: ${fallbackResult.error}`, 'error');
        results.push({
          workId: work.id,
          slug: work.slug,
          title: work.title,
          wpPostId,
          attachmentUrl: attachment.url,
          status: 'failed',
          error: `Download failed: ${downloadResult.error}, Fallback: ${fallbackResult.error}`,
        });
        failed++;
        continue;
      }
      
      log(`  Fallback succeeded: ${fallbackResult.size} bytes`, 'success');
    } else {
      log(`  Downloaded: ${downloadResult.size} bytes`, 'success');
    }
    
    // Upload to Bunny CDN
    const fileBuffer = readFileSync(tempPath);
    const filename = basename(tempPath);
    const cdnPath = `works/${category}/${filename}`;
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
    
    log(`  Uploading to Bunny CDN...`, 'info');
    const uploadResult = await uploadToBunny(fileBuffer, cdnPath, contentType);
    
    if (!uploadResult.success) {
      log(`  Upload failed: ${uploadResult.error}`, 'error');
      results.push({
        workId: work.id,
        slug: work.slug,
        title: work.title,
        wpPostId,
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
        wpPostId,
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
        wpPostId,
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
    summary: { total: worksToProcess.length, fixed, failed, skipped },
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
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`\nReport: ${CONFIG.reportFile}`);
}

main().catch(error => {
  log(`Fatal error: ${error}`, 'error');
  process.exit(1);
});
