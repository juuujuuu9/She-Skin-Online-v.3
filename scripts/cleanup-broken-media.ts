#!/usr/bin/env tsx
/**
 * Cleanup Broken Media - Mark broken images as deleted in database
 *
 * This script:
 * 1. Reads the broken-media-report.json
 * 2. Soft-deletes broken media items (sets deletedAt timestamp)
 * 3. Optionally removes references from works
 */

import { db } from '../src/lib/db/index.js';
import { media, works } from '../src/lib/db/schema.js';
import { eq, isNull, sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

config();

interface BrokenMedia {
  id: string;
  filename: string;
  originalName: string | null;
  url: string;
  mediaType: string;
  httpStatus: number;
}

async function main() {
  console.log('='.repeat(70));
  console.log('  CLEANUP BROKEN MEDIA');
  console.log('='.repeat(70));

  // Load broken media report
  const brokenReport = JSON.parse(
    readFileSync(join(process.cwd(), 'broken-media-report.json'), 'utf-8')
  ) as BrokenMedia[];

  console.log(`\nFound ${brokenReport.length} broken media items to cleanup\n`);

  if (brokenReport.length === 0) {
    console.log('✅ No broken media to cleanup!');
    return;
  }

  // Show what will be affected
  console.log('The following media will be marked as deleted:');
  brokenReport.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.originalName || item.filename}`);
  });

  // Check which works reference these images
  console.log('\n🔍 Checking works that reference these images...');

  const allWorks = await db.select().from(works).where(isNull(works.deletedAt));
  const affectedWorks: { work: typeof works.$inferSelect; mediaIds: string[] }[] = [];

  for (const work of allWorks) {
    const mediaIds: string[] = [];

    // Check main image
    if (work.imageId && brokenReport.some(b => b.id === work.imageId)) {
      mediaIds.push(work.imageId);
    }

    // Check additional images
    if (work.additionalImageIds) {
      const additionalIds = JSON.parse(work.additionalImageIds as string) as string[];
      for (const id of additionalIds) {
        if (brokenReport.some(b => b.id === id)) {
          mediaIds.push(id);
        }
      }
    }

    if (mediaIds.length > 0) {
      affectedWorks.push({ work, mediaIds });
    }
  }

  if (affectedWorks.length > 0) {
    console.log(`\n⚠️  ${affectedWorks.length} works reference broken images:`);
    affectedWorks.forEach(({ work }, i) => {
      console.log(`   ${i + 1}. ${work.title} (${work.type})`);
    });
    console.log('\n⚠️  These works will have broken image references after cleanup.');
  }

  // Confirm before proceeding
  console.log('\n' + '='.repeat(70));
  console.log('  This will SOFT-DELETE the broken media items.');
  console.log('  The media records will remain in the database but be marked as deleted.');
  console.log('='.repeat(70));

  // In non-interactive mode, auto-proceed or require flag
  const autoConfirm = process.argv.includes('--yes');

  if (!autoConfirm) {
    console.log('\nTo proceed, run with --yes flag:');
    console.log('  npx tsx scripts/cleanup-broken-media.ts --yes\n');
    return;
  }

  console.log('\n🗑️  Proceeding with cleanup...\n');

  let success = 0;
  let failed = 0;

  for (const item of brokenReport) {
    try {
      await db.update(media)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(media.id, item.id));

      console.log(`  ✅ Soft-deleted: ${item.originalName || item.filename}`);
      success++;
    } catch (error) {
      console.log(`  ❌ Failed to delete: ${item.originalName || item.filename}`);
      console.log(`     Error: ${error instanceof Error ? error.message : 'Unknown'}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  ✅ Successfully deleted: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📊 Total: ${brokenReport.length}`);

  if (affectedWorks.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('  AFFECTED WORKS');
    console.log('='.repeat(70));
    console.log(`  ${affectedWorks.length} works reference deleted images.`);
    console.log('  You may want to update these works with new images.');
    console.log('\n  Affected works:');
    affectedWorks.forEach(({ work }, i) => {
      console.log(`    ${i + 1}. ${work.title} (ID: ${work.id})`);
    });
  }

  console.log('\n✅ Cleanup complete!');
  console.log('   Broken media items are now marked as deleted.');
  console.log('   They will no longer appear in the admin media library.');
}

main().catch(console.error);
