#!/usr/bin/env node
/**
 * Manual Image Upload Helper
 *
 * Usage:
 * 1. Manually download images from WordPress admin or browser
 * 2. Place them in tmp/image-downloads/ with the suggested filenames
 * 3. Run: npx tsx scripts/manual-image-upload.ts
 *
 * This will upload all downloaded images to Bunny CDN and update the database.
 */

import { config } from 'dotenv';
config();

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../src/lib/db/index.js';
import { media } from '../src/lib/db/schema.js';
import { eq, like } from 'drizzle-orm';
import { uploadToBunny } from '../src/lib/bunny.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TMP_DIR = path.join(__dirname, '..', 'tmp', 'image-downloads');
const DRY_RUN = process.argv.includes('--dry-run');

// Mapping of filenames to their corresponding media records
const IMAGE_MAPPING = [
  { filename: "18692.jpg", mediaFilename: "digital-18692-d.jpg", title: "D", postId: 18692 },
  { filename: "d-roanoke.jpg", mediaFilename: "digital-17736-d-roanoke.jpg", title: "D. Roanoke", postId: 17736 },
  { filename: "letter-x-rust-scott-x-she_skin-bts-like-um-show-letter-store-richmond-va.png", mediaFilename: "digital-20186-letter-x-rust-scott-x-she-skin-bts-like-um-show-letter-store.png", title: "Letter x Rust Scott x she_skin BTS \"Like... Um...\" Show", postId: 20186 },
  { filename: "19980.jpg", mediaFilename: "digital-19980-0725-nyc-sb.jpg", title: "0725 NYC SB", postId: 19980 },
  { filename: "p-l-artifact-precious-luv.jpg", mediaFilename: "digital-15660-p-l-artifact-precious-luv.jpg", title: "P L Artifact (Precious Luv)", postId: 15660 },
  { filename: "let-my-dna-talk-paintings.png", mediaFilename: "digital-15525-let-my-dna-talk-paintings.png", title: "Let My-DNA Talk Paintings", postId: 15525 },
  { filename: "d-bg-sammy-n-bro-new-york-2022.jpg", mediaFilename: "digital-15381-d-bg-sammy-n-bro-new-york-2022.jpg", title: "D BG SAMMY N BRO (NEW YORK 2022)", postId: 15381 },
  { filename: "and-i-wait.png", mediaFilename: "digital-14248-and-i-wait.png", title: "And I Wait", postId: 14248 },
  { filename: "koncept-jackon.jpg", mediaFilename: "digital-13371-koncept-jack-on.jpg", title: "Koncept Jack$on", postId: 13371 },
  { filename: "d.jpg", mediaFilename: "digital-17728-d.jpg", title: "D", postId: 17728 },
  { filename: "ny-2022.jpg", mediaFilename: "digital-17734-d-ny-2022.jpg", title: "D NY 2022", postId: 17734 },
  { filename: "kray-shyne.jpg", mediaFilename: "digital-974-kray-shyne.jpg", title: "Kray + Shyne", postId: 974 },
  { filename: "rusty.jpg", mediaFilename: "digital-972-rusty.jpg", title: "Rusty", postId: 972 },
  { filename: "trey-jackson.jpg", mediaFilename: "digital-18927-trey-jackson.jpg", title: "Trey Jackson", postId: 18927 },
  { filename: "digital-expression-reel-2018.png", mediaFilename: "digital-894-digital-expression-reel-2018.png", title: "DIGITAL EXPRESSION REEL 2018", postId: 894 },
  { filename: "econoline-trust-reminders.png", mediaFilename: "digital-842-econoline-trust-and-reminders.png", title: "Econoline- trust and reminders", postId: 842 },
  { filename: "sickboyrari.jpg", mediaFilename: "digital-844-sickboyrari.jpg", title: "Sickboyrari", postId: 844 },
  { filename: "dre.jpg", mediaFilename: "digital-731-dre-623.jpg", title: "Dre 623", postId: 731 },
  { filename: "little-time-00.jpg", mediaFilename: "digital-706-a-little-time-00.jpg", title: "A Little Time :00", postId: 706 },
  { filename: "digital-set-2.png", mediaFilename: "digital-156-digital-set-2.png", title: "Digital Set 2", postId: 156 },
  { filename: "h.png", mediaFilename: "digital-152-digital-set-1.png", title: "Digital Set 1", postId: 152 },
];

interface UploadResult {
  success: boolean;
  title: string;
  filename: string;
  mediaId?: string;
  cdnUrl?: string;
  error?: string;
}

async function findMediaByFilename(filename: string): Promise<{ id: string; filename: string } | null> {
  const mediaRecord = await db.query.media.findFirst({
    where: like(media.filename, `%${filename}%`),
  });
  return mediaRecord ? { id: mediaRecord.id, filename: mediaRecord.filename } : null;
}

async function uploadAndUpdate(item: typeof IMAGE_MAPPING[0]): Promise<UploadResult> {
  const result: UploadResult = { success: false, title: item.title, filename: item.filename };
  const localPath = path.join(TMP_DIR, item.filename);

  // Check if file exists
  const stats = await fs.stat(localPath).catch(() => null);
  if (!stats) {
    result.error = 'File not found - download manually first';
    return result;
  }

  // Find media record
  const mediaRecord = await findMediaByFilename(item.mediaFilename);
  if (!mediaRecord) {
    result.error = 'Media record not found in database';
    return result;
  }
  result.mediaId = mediaRecord.id;

  console.log(`\n📷 ${item.title}`);
  console.log(`   File: ${item.filename} (${(stats.size / 1024).toFixed(1)}KB)`);
  console.log(`   Media ID: ${mediaRecord.id}`);

  if (DRY_RUN) {
    console.log(`   [DRY RUN] Would upload to works/digital/${item.filename}`);
    console.log(`   [DRY RUN] Would update media record`);
    result.success = true;
    result.cdnUrl = `https://she-skin.b-cdn.net/works/digital/${item.filename}`;
    return result;
  }

  try {
    // Upload to Bunny CDN
    console.log(`   Uploading to Bunny CDN...`);
    const fileBuffer = await fs.readFile(localPath);
    const bunnyPath = `works/digital/${item.filename}`;
    const cdnUrl = await uploadToBunny(fileBuffer, bunnyPath);
    result.cdnUrl = cdnUrl;
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
    console.log(`   ✓ Updated database record`);

    result.success = true;

    // Optionally delete local file after successful upload
    // await fs.unlink(localPath);
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Upload failed';
    console.log(`   ✗ ${result.error}`);
  }

  return result;
}

async function main() {
  console.log('🖼️  Manual Image Upload Helper');
  console.log('=' .repeat(50));

  if (DRY_RUN) {
    console.log('\n📋 DRY RUN MODE - No changes will be made\n');
  }

  // Check for downloaded files
  const availableFiles: string[] = [];
  for (const item of IMAGE_MAPPING) {
    const localPath = path.join(TMP_DIR, item.filename);
    const exists = await fs.stat(localPath).catch(() => null);
    if (exists) {
      availableFiles.push(item.filename);
    }
  }

  console.log(`\n📁 Looking for images in: ${TMP_DIR}`);
  console.log(`   Found: ${availableFiles.length}/${IMAGE_MAPPING.length} images`);

  if (availableFiles.length === 0) {
    console.log('\n⚠️  No images found!');
    console.log('\n📋 Manual Download Instructions:');
    console.log('   1. Log into WordPress admin: https://www.sheskin.org/wp-admin');
    console.log('   2. Go to Media → Library');
    console.log('   3. Find and download each of the 21 images');
    console.log('   4. Place them in: tmp/image-downloads/');
    console.log('   5. Use these exact filenames:');
    IMAGE_MAPPING.forEach(item => {
      console.log(`      - ${item.filename} (${item.title})`);
    });
    console.log('\n   6. Run this script again');
    process.exit(1);
  }

  console.log('\n   Available files:');
  availableFiles.forEach(f => console.log(`      ✓ ${f}`));

  const missing = IMAGE_MAPPING.filter(item => !availableFiles.includes(item.filename));
  if (missing.length > 0) {
    console.log('\n   Still needed:');
    missing.forEach(item => console.log(`      ○ ${item.filename} (${item.title})`));
  }

  // Upload available images
  const results: UploadResult[] = [];
  for (const item of IMAGE_MAPPING) {
    const localPath = path.join(TMP_DIR, item.filename);
    const exists = await fs.stat(localPath).catch(() => null);
    if (exists) {
      const result = await uploadAndUpdate(item);
      results.push(result);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Uploaded & Updated: ${succeeded.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log(`⏳ Still Missing: ${missing.length}`);

  if (succeeded.length > 0) {
    console.log(`\n✅ Successfully processed:`);
    succeeded.forEach(r => {
      console.log(`   • ${r.title}`);
      console.log(`     → ${r.cdnUrl}`);
    });
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed:`);
    failed.forEach(r => {
      console.log(`   • ${r.title}: ${r.error}`);
    });
  }

  if (missing.length > 0) {
    console.log(`\n⏳ Still need manual download:`);
    missing.forEach(item => {
      console.log(`   • ${item.title}`);
      console.log(`     WordPress: ${IMAGE_MAPPING.find(i => i.title === item.title)?.wordpressUrl || 'N/A'}`);
    });
  }

  console.log('\n' + '='.repeat(50));
  console.log('\n⚠️  IMPORTANT: CDN URLs may take 5-10 minutes to propagate.');

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
