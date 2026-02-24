#!/usr/bin/env node
/**
 * Fix Media MimeTypes
 * Updates the 21 digital work media records with correct mime types
 */

import { config } from 'dotenv';
config();

import { db } from '../src/lib/db/index.js';
import { media } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';

// Mapping of media IDs to their correct mime types based on file extension
const MEDIA_UPDATES = [
  { id: '-i9mbFBt3WHzC2ffRKBxr', mimeType: 'image/jpeg' },
  { id: '0n7qbJmYk8PZojc6jmTXC', mimeType: 'image/jpeg' },
  { id: 'ae9ATkk9isae2ixQWhV6w', mimeType: 'image/png' },
  { id: 'kxATXgLFOYjOjXgerAtDC', mimeType: 'image/jpeg' },
  { id: 'p0GPjqUTfVMUgNXNJ34Tl', mimeType: 'image/jpeg' },
  { id: 'MymVGW7EQ029OoJQ6BfQI', mimeType: 'image/png' },
  { id: 'CRu0iH4RpTUzp_fQhA-ks', mimeType: 'image/jpeg' },
  { id: 'owDtp3nguaJbeyrLbYQjF', mimeType: 'image/png' },
  { id: '4j2NTTd7YmhotpHoCQfDy', mimeType: 'image/jpeg' },
  { id: 'LuSL3dstwWrQQZUxoHxmW', mimeType: 'image/jpeg' },
  { id: 'FB-Dqr6zo9c8b9i2oL6Ro', mimeType: 'image/jpeg' },
  { id: 'njfOTvx0EiPoVqSThqfuf', mimeType: 'image/jpeg' },
  { id: '4Cgy4e1vJETOS2Y5w1F8J', mimeType: 'image/jpeg' },
  { id: 'L6W50OsKmS3btufuLw8Ah', mimeType: 'image/jpeg' },
  { id: 'ttbUzm9Wq9sQScGWVazFC', mimeType: 'image/png' },
  { id: 'OlGDKEwOH_3hgn0D_uD3h', mimeType: 'image/png' },
  { id: '2CgthJUtAlnuWLtOrcZcz', mimeType: 'image/jpeg' },
  { id: 'E_9UyUBJRO9pxmeSuWvW2', mimeType: 'image/jpeg' },
  { id: 'GBvsls619U03O0GCDPHpl', mimeType: 'image/jpeg' },
  { id: 'Oa1hFVRBmoCJAo_lEFq1V', mimeType: 'image/png' },
  { id: 'GqKlFrkSHyH_fGRjgSgm0', mimeType: 'image/png' },
];

async function main() {
  console.log('🔧 Fixing Media MimeTypes\n');
  console.log('=' .repeat(60));

  let updated = 0;
  let failed = 0;

  for (const item of MEDIA_UPDATES) {
    console.log(`Updating ${item.id} -> ${item.mimeType}`);

    try {
      await db.update(media)
        .set({
          mimeType: item.mimeType,
          updatedAt: new Date(),
        })
        .where(eq(media.id, item.id));

      console.log('  ✓ Updated\n');
      updated++;
    } catch (err) {
      console.log(`  ✗ Failed: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
      failed++;
    }
  }

  console.log('=' .repeat(60));
  console.log(`\n✅ Updated: ${updated}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n🎉 All media mime types fixed!');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
