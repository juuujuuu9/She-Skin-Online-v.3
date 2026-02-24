#!/usr/bin/env tsx
/**
 * Audit Media URLs - Check which media files actually exist on Bunny CDN
 *
 * This script:
 * 1. Fetches all media items from the database
 * 2. Checks each URL with a HEAD request
 * 3. Reports working vs broken URLs
 * 4. Optionally marks broken items in the database
 */

import { db } from '../src/lib/db/index.js';
import { media } from '../src/lib/db/schema.js';
import { isNull, eq } from 'drizzle-orm';

interface MediaCheck {
  id: string;
  filename: string;
  originalName: string | null;
  url: string;
  mediaType: string;
  status: 'working' | 'broken' | 'error';
  httpStatus: number;
  contentType: string | null;
  size: number;
}

async function checkUrl(url: string): Promise<{ status: number; contentType: string | null; size: number }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      size: parseInt(response.headers.get('content-length') || '0'),
    };
  } catch (error) {
    return {
      status: 0,
      contentType: null,
      size: 0,
    };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  AUDIT MEDIA URLs');
  console.log('='.repeat(70));

  // Get all media items
  const allMedia = await db.select().from(media).where(isNull(media.deletedAt));

  console.log(`\nFound ${allMedia.length} media items in database\n`);

  const working: MediaCheck[] = [];
  const broken: MediaCheck[] = [];
  const errors: MediaCheck[] = [];

  // Check each URL
  for (let i = 0; i < allMedia.length; i++) {
    const item = allMedia[i];
    process.stdout.write(`[${i + 1}/${allMedia.length}] Checking ${item.filename.substring(0, 40)}... `);

    const result = await checkUrl(item.url);

    const check: MediaCheck = {
      id: item.id,
      filename: item.filename,
      originalName: item.originalName,
      url: item.url,
      mediaType: item.mediaType,
      status: result.status === 200 ? 'working' : result.status >= 400 ? 'broken' : 'error',
      httpStatus: result.status,
      contentType: result.contentType,
      size: result.size,
    };

    // Check if it's a real image or an error page
    const isValidImage = result.status === 200 &&
                        result.contentType?.startsWith('image/') &&
                        result.size > 1024; // At least 1KB

    if (isValidImage) {
      working.push(check);
      console.log(`✅ ${(result.size / 1024).toFixed(1)}KB ${result.contentType}`);
    } else if (result.status >= 400) {
      broken.push(check);
      console.log(`❌ HTTP ${result.status}`);
    } else if (result.status === 200 && !result.contentType?.startsWith('image/')) {
      // HTTP 200 but wrong content type - likely an error page
      broken.push(check);
      console.log(`❌ Error page (${result.contentType}, ${result.size} bytes)`);
    } else if (result.status === 200 && result.size < 1024) {
      // HTTP 200 but too small - likely an error page
      broken.push(check);
      console.log(`❌ Too small (${result.size} bytes)`);
    } else {
      errors.push(check);
      console.log(`⚠️  Error (status: ${result.status}, type: ${result.contentType})`);
    }

    // Small delay to be nice to the CDN
    await new Promise(r => setTimeout(r, 100));
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  ✅ Working: ${working.length}`);
  console.log(`  ❌ Broken (404/403): ${broken.length}`);
  console.log(`  ⚠️  Other errors: ${errors.length}`);
  console.log(`  📊 Total: ${allMedia.length}`);

  // Show broken items by type
  if (broken.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('  BROKEN IMAGES');
    console.log('='.repeat(70));

    const images = broken.filter(b => b.mediaType === 'image');
    const audio = broken.filter(b => b.mediaType === 'audio');
    const video = broken.filter(b => b.mediaType === 'video');

    if (images.length > 0) {
      console.log(`\n🖼️  Images (${images.length}):`);
      images.forEach(img => {
        console.log(`   - ${img.originalName || img.filename}`);
        console.log(`     URL: ${img.url.substring(0, 70)}...`);
      });
    }

    if (audio.length > 0) {
      console.log(`\n🎵 Audio (${audio.length}):`);
      audio.forEach(a => {
        console.log(`   - ${a.originalName || a.filename}`);
      });
    }

    if (video.length > 0) {
      console.log(`\n🎬 Video (${video.length}):`);
      video.forEach(v => {
        console.log(`   - ${v.originalName || v.filename}`);
      });
    }
  }

  // Show working stats
  if (working.length > 0) {
    const totalSize = working.reduce((sum, w) => sum + w.size, 0);
    console.log('\n' + '='.repeat(70));
    console.log('  WORKING FILES STATS');
    console.log('='.repeat(70));
    console.log(`  Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    const byType: Record<string, number> = {};
    working.forEach(w => {
      byType[w.mediaType] = (byType[w.mediaType] || 0) + 1;
    });

    console.log('  By type:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`    - ${type}: ${count}`);
    });
  }

  // Export broken list to JSON for further processing
  if (broken.length > 0) {
    const fs = await import('fs');
    const brokenData = broken.map(b => ({
      id: b.id,
      filename: b.filename,
      originalName: b.originalName,
      url: b.url,
      mediaType: b.mediaType,
      httpStatus: b.httpStatus,
    }));

    const outputPath = './broken-media-report.json';
    fs.writeFileSync(outputPath, JSON.stringify(brokenData, null, 2));
    console.log(`\n📄 Broken media report saved to: ${outputPath}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('  NEXT STEPS');
  console.log('='.repeat(70));

  if (broken.length === 0) {
    console.log('✅ All media URLs are working!');
  } else {
    console.log(`\nYou have ${broken.length} broken media items. Options:\n`);
    console.log('1. Re-upload from originals:');
    console.log('   - If you have the original files somewhere (exports, backups)');
    console.log('   - Create a script to re-upload them to Bunny CDN\n');
    console.log('2. Clean up the database:');
    console.log('   - Mark broken items as deleted');
    console.log('   - Or update the works to not reference them\n');
    console.log('3. Fix manually:');
    console.log('   - Check the broken-media-report.json file');
    console.log('   - Find and upload missing files individually\n');
  }
}

main().catch(console.error);
