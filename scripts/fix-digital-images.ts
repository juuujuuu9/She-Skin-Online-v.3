#!/usr/bin/env node
/**
 * Fix Digital Works Images
 *
 * This script:
 * 1. Downloads 21 fixable digital work images from WordPress
 * 2. Uploads them to Bunny CDN
 * 3. Updates the database with correct URLs
 */

import { config } from 'dotenv';
config();

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../src/lib/db/index.js';
import { media, workMedia } from '../src/lib/db/schema.js';
import { eq, like } from 'drizzle-orm';
import { uploadToBunny } from '../src/lib/bunny.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The 21 fixable images from fixable-images.json
const fixableImages = [
  { category: "digital", title: "D", slug: "18692", wpPostId: 18692, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2023/06/dm2.jpg", suggestedFilename: "18692.jpg", mediaFilename: "digital-18692-d.jpg" },
  { category: "digital", title: "D. Roanoke", slug: "d-roanoke", wpPostId: 17736, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2022/10/d22022.jpg", suggestedFilename: "d-roanoke.jpg", mediaFilename: "digital-17736-d-roanoke.jpg" },
  { category: "digital", title: "Letter x Rust Scott x she_skin BTS \"Like... Um...\" Show @ Letter Store Richmond, VA", slug: "letter-x-rust-scott-x-she_skin-bts-like-um-show-letter-store-richmond-va", wpPostId: 20186, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2026/02/Screenshot-2026-02-19-at-3.36.13-PM.png", suggestedFilename: "letter-x-rust-scott-x-she_skin-bts-like-um-show-letter-store-richmond-va.png", mediaFilename: "digital-20186-letter-x-rust-scott-x-she-skin-bts-like-um-show-letter-store.png" },
  { category: "digital", title: "0725 NYC SB", slug: "19980", wpPostId: 19980, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2025/07/n-min.jpg", suggestedFilename: "19980.jpg", mediaFilename: "digital-19980-0725-nyc-sb.jpg" },
  { category: "digital", title: "P L Artifact (Precious Luv)", slug: "p-l-artifact-precious-luv", wpPostId: 15660, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2022/07/P1200744_1.jpg", suggestedFilename: "p-l-artifact-precious-luv.jpg", mediaFilename: "digital-15660-p-l-artifact-precious-luv.jpg" },
  { category: "digital", title: "Let My-DNA Talk Paintings", slug: "let-my-dna-talk-paintings", wpPostId: 15525, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2022/06/Screen-Shot-2022-06-23-at-7.02.29-PM.png", suggestedFilename: "let-my-dna-talk-paintings.png", mediaFilename: "digital-15525-let-my-dna-talk-paintings.png" },
  { category: "digital", title: "D BG SAMMY N BRO (NEW YORK 2022)", slug: "d-bg-sammy-n-bro-new-york-2022", wpPostId: 15381, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2022/05/basetball-scaled-1.jpg", suggestedFilename: "d-bg-sammy-n-bro-new-york-2022.jpg", mediaFilename: "digital-15381-d-bg-sammy-n-bro-new-york-2022.jpg" },
  { category: "digital", title: "And I Wait", slug: "and-i-wait", wpPostId: 14248, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2021/07/Screen-Shot-2021-07-25-at-1.06.54-AM.png", suggestedFilename: "and-i-wait.png", mediaFilename: "digital-14248-and-i-wait.png" },
  { category: "digital", title: "Koncept Jack$on", slug: "koncept-jackon", wpPostId: 13371, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2021/02/KONCEPT-official.jpg", suggestedFilename: "koncept-jackon.jpg", mediaFilename: "digital-13371-koncept-jack-on.jpg" },
  { category: "digital", title: "D", slug: "d", wpPostId: 17728, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2022/10/darrick-2022.jpg", suggestedFilename: "d.jpg", mediaFilename: "digital-17728-d.jpg" },
  { category: "digital", title: "D NY 2022", slug: "ny-2022", wpPostId: 17734, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2022/10/d-ny-2022-scaled.jpg", suggestedFilename: "ny-2022.jpg", mediaFilename: "digital-17734-d-ny-2022.jpg" },
  { category: "digital", title: "Kray + Shyne", slug: "kray-shyne", wpPostId: 974, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2019/04/kray-shyne-2018.jpg", suggestedFilename: "kray-shyne.jpg", mediaFilename: "digital-974-kray-shyne.jpg" },
  { category: "digital", title: "Rusty", slug: "rusty", wpPostId: 972, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2019/04/RUSTY.jpg", suggestedFilename: "rusty.jpg", mediaFilename: "digital-972-rusty.jpg" },
  { category: "digital", title: "Trey Jackson", slug: "trey-jackson", wpPostId: 18927, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2023/09/trey.jpg", suggestedFilename: "trey-jackson.jpg", mediaFilename: "digital-18927-trey-jackson.jpg" },
  { category: "digital", title: "DIGITAL EXPRESSION REEL 2018", slug: "digital-expression-reel-2018", wpPostId: 894, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2018/12/Screen-Shot-2018-12-19-at-1.30.20-PM.png", suggestedFilename: "digital-expression-reel-2018.png", mediaFilename: "digital-894-digital-expression-reel-2018.png" },
  { category: "digital", title: "Econoline- trust and reminders", slug: "econoline-trust-reminders", wpPostId: 842, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2018/11/Screen-Shot-2018-11-02-at-5.28.40-PM.png", suggestedFilename: "econoline-trust-reminders.png", mediaFilename: "digital-842-econoline-trust-and-reminders.png" },
  { category: "digital", title: "Sickboyrari", slug: "sickboyrari", wpPostId: 844, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2018/11/krya1.jpg", suggestedFilename: "sickboyrari.jpg", mediaFilename: "digital-844-sickboyrari.jpg" },
  { category: "digital", title: "Dre 623", slug: "dre", wpPostId: 731, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2018/06/ddemonblood.jpg", suggestedFilename: "dre.jpg", mediaFilename: "digital-731-dre-623.jpg" },
  { category: "digital", title: "A Little Time :00", slug: "little-time-00", wpPostId: 706, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2018/05/B-ST-k-shecore-scaled.jpg", suggestedFilename: "little-time-00.jpg", mediaFilename: "digital-706-a-little-time-00.jpg" },
  { category: "digital", title: "Digital Set 2", slug: "digital-set-2", wpPostId: 156, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2017/06/Screen-Shot-2017-06-21-at-1.08.05-PM-e1498065618323.png", suggestedFilename: "digital-set-2.png", mediaFilename: "digital-156-digital-set-2.png" },
  { category: "digital", title: "Digital Set 1", slug: "h", wpPostId: 152, wordpressUrl: "https://www.sheskin.org/wp-content/uploads/2017/06/Screen-Shot-2017-06-21-at-1.08.48-PM-e1498065147788.png", suggestedFilename: "h.png", mediaFilename: "digital-152-digital-set-1.png" },
];

const TMP_DIR = path.join(__dirname, '..', 'tmp', 'image-downloads');
const DRY_RUN = process.argv.includes('--dry-run');
const MANUAL_MODE = process.argv.includes('--manual');

interface FixResult {
  success: boolean;
  mediaId?: string;
  title: string;
  oldUrl?: string;
  newUrl?: string;
  error?: string;
  skipped?: boolean;
}

async function downloadWithCurl(url: string, outputPath: string): Promise<boolean> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    // Use curl with browser-like headers
    const curlCmd = `curl -L -s -o "${outputPath}" \
      -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36" \
      -H "Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" \
      -H "Accept-Language: en-US,en;q=0.9" \
      -H "Referer: https://www.sheskin.org/" \
      -H "Connection: keep-alive" \
      "${url}"`;

    await execAsync(curlCmd);

    // Check if file was downloaded and is valid
    const stats = await fs.stat(outputPath).catch(() => null);
    if (!stats || stats.size < 1000) {
      // Clean up small file
      if (stats) await fs.unlink(outputPath).catch(() => {});
      return false;
    }

    // Read first 200 bytes to check for HTML signature
    const fd = await fs.open(outputPath, 'r');
    const buffer = Buffer.alloc(200);
    await fd.read(buffer, 0, 200, 0);
    await fd.close();

    const header = buffer.toString('utf-8').toLowerCase();
    if (header.includes('<!doctype') || header.includes('<html') || header.includes('<head')) {
      // It's HTML, not an image
      await fs.unlink(outputPath).catch(() => {});
      return false;
    }

    console.log(`  ✓ Downloaded ${(stats.size / 1024).toFixed(1)}KB`);
    return true;
  } catch (err) {
    console.log(`  ✗ Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return false;
  }
}

async function findMediaByFilename(filename: string): Promise<{ id: string; filename: string; originalUrl: string | null; cdnUrl: string | null } | null> {
  try {
    const mediaRecord = await db.query.media.findFirst({
      where: like(media.filename, `%${filename}%`),
    });

    if (!mediaRecord) return null;

    return {
      id: mediaRecord.id,
      filename: mediaRecord.filename,
      originalUrl: mediaRecord.originalUrl,
      cdnUrl: mediaRecord.cdnUrl,
    };
  } catch (err) {
    console.error('Database query error:', err);
    return null;
  }
}

async function fixImage(item: typeof fixableImages[0]): Promise<FixResult> {
  console.log(`\n📷 ${item.title}`);
  console.log(`   WordPress: ${item.wordpressUrl}`);

  const result: FixResult = { title: item.title, success: false };

  // Find the media by filename
  const mediaRecord = await findMediaByFilename(item.mediaFilename);
  if (!mediaRecord) {
    result.error = 'Media record not found in database';
    console.log(`   ⚠️ Media not found (filename: ${item.mediaFilename})`);
    return result;
  }

  result.mediaId = mediaRecord.id;
  result.oldUrl = mediaRecord.originalUrl || mediaRecord.cdnUrl || 'None';
  console.log(`   Media ID: ${mediaRecord.id}`);
  console.log(`   Current URL: ${result.oldUrl}`);

  if (MANUAL_MODE) {
    // In manual mode, just show instructions
    console.log(`\n   📋 MANUAL FIX INSTRUCTIONS:`);
    console.log(`   1. Download: ${item.wordpressUrl}`);
    console.log(`   2. Upload to Bunny CDN at: works/digital/${item.suggestedFilename}`);
    console.log(`   3. Update media ID ${mediaRecord.id} with new URL`);
    result.skipped = true;
    return result;
  }

  // Download the image
  const localPath = path.join(TMP_DIR, item.suggestedFilename);
  console.log(`   Downloading...`);

  const downloaded = await downloadWithCurl(item.wordpressUrl, localPath);
  if (!downloaded) {
    result.error = 'Failed to download from WordPress (bot protection)';
    result.skipped = true;
    return result;
  }

  if (DRY_RUN) {
    console.log(`   [DRY RUN] Would upload to Bunny CDN`);
    console.log(`   [DRY RUN] Would update database`);
    result.success = true;
    result.newUrl = `https://she-skin.b-cdn.net/works/digital/${item.suggestedFilename}`;
    result.skipped = true;
    return result;
  }

  // Upload to Bunny CDN
  try {
    console.log(`   Uploading to Bunny CDN...`);
    const fileBuffer = await fs.readFile(localPath);
    const bunnyPath = `works/digital/${item.suggestedFilename}`;
    const cdnUrl = await uploadToBunny(fileBuffer, bunnyPath);
    result.newUrl = cdnUrl;
    console.log(`   ✓ Uploaded: ${cdnUrl}`);

    // Update media record
    await db.update(media)
      .set({
        originalUrl: cdnUrl,
        cdnUrl: cdnUrl,
        status: 'ready',
        updatedAt: new Date(),
      })
      .where(eq(media.id, mediaRecord.id));
    console.log(`   ✓ Updated media record`);

    result.success = true;

    // Clean up local file
    await fs.unlink(localPath);
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Upload failed';
    console.log(`   ✗ ${result.error}`);
  }

  return result;
}

async function main() {
  console.log('🔧 Digital Works Image Fix');
  console.log('=' .repeat(50));

  if (DRY_RUN) {
    console.log('\n📋 DRY RUN MODE - No changes will be made\n');
  }

  if (MANUAL_MODE) {
    console.log('\n📋 MANUAL MODE - Instructions only\n');
  }

  // Ensure tmp directory exists
  await fs.mkdir(TMP_DIR, { recursive: true });

  const results: FixResult[] = [];

  for (const item of fixableImages) {
    const result = await fixImage(item);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));

  const succeeded = results.filter(r => r.success && !r.skipped);
  const skipped = results.filter(r => r.skipped);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Fixed: ${succeeded.length}`);
  console.log(`⏭️  Skipped/Need Manual: ${skipped.length}`);
  console.log(`❌ Failed: ${failed.length}`);

  if (succeeded.length > 0) {
    console.log(`\n✅ Successfully fixed:`);
    succeeded.forEach(r => {
      console.log(`   • ${r.title}`);
      console.log(`     ${r.oldUrl || 'none'} → ${r.newUrl}`);
    });
  }

  if (skipped.length > 0) {
    console.log(`\n⏭️  Requires manual download:`);
    skipped.forEach(r => {
      console.log(`   • ${r.title}`);
      if (r.error) console.log(`     Reason: ${r.error}`);
    });

    // Save manual download list
    const manualList = skipped.map(s => {
      const item = fixableImages.find(i => i.title === s.title)!;
      return {
        title: s.title,
        mediaId: s.mediaId,
        reason: s.error,
        wordpressUrl: item.wordpressUrl,
        suggestedFilename: item.suggestedFilename,
        bunnyPath: `works/digital/${item.suggestedFilename}`,
        uploadCommand: `curl -H "AccessKey: $BUNNY_API_KEY" -T "${item.suggestedFilename}" "https://storage.bunnycdn.com/$BUNNY_STORAGE_ZONE/works/digital/${item.suggestedFilename}"`,
        updateCommand: `npx tsx scripts/update-media-url.ts ${s.mediaId} "https://she-skin.b-cdn.net/works/digital/${item.suggestedFilename}"`,
      };
    });

    const manualPath = path.join(__dirname, '..', 'tmp', 'manual-downloads-needed.json');
    await fs.writeFile(manualPath, JSON.stringify(manualList, null, 2));
    console.log(`\n💾 Saved manual download instructions to: ${manualPath}`);
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed:`);
    failed.forEach(r => {
      console.log(`   • ${r.title}: ${r.error}`);
    });
  }

  console.log('\n' + '='.repeat(50));

  if (!DRY_RUN && succeeded.length > 0) {
    console.log('\n⚠️  IMPORTANT: The CDN URLs may take a few minutes to propagate.');
    console.log('   Check the works gallery after 5-10 minutes.');
  }

  // Exit with error code if anything failed
  process.exit(failed.length > 0 || (skipped.length > 0 && !MANUAL_MODE) ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
