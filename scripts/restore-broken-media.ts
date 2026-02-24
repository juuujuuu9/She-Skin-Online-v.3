#!/usr/bin/env tsx
/**
 * Restore Broken Media - Un-delete soft-deleted media items
 */

import { db } from '../src/lib/db/index.js';
import { media } from '../src/lib/db/schema.js';
import { eq, isNotNull } from 'drizzle-orm';
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
}

async function main() {
  console.log('='.repeat(70));
  console.log('  RESTORE BROKEN MEDIA');
  console.log('='.repeat(70));

  // Load broken media report to get the IDs
  let brokenReport: BrokenMedia[];
  try {
    brokenReport = JSON.parse(
      readFileSync(join(process.cwd(), 'broken-media-report.json'), 'utf-8')
    );
  } catch {
    console.log('❌ Could not read broken-media-report.json');
    return;
  }

  console.log(`\nFound ${brokenReport.length} media items to restore\n`);

  let restored = 0;
  let failed = 0;

  for (const item of brokenReport) {
    try {
      // Clear the deletedAt timestamp
      await db.update(media)
        .set({
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(media.id, item.id));

      console.log(`  ✅ Restored: ${item.originalName || item.filename}`);
      restored++;
    } catch (error) {
      console.log(`  ❌ Failed: ${item.originalName || item.filename}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  ✅ Restored: ${restored}`);
  console.log(`  ❌ Failed: ${failed}`);

  console.log('\n🎉 Media items restored!');
  console.log('   They will now appear in the admin with broken image placeholders.');
}

main().catch(console.error);
