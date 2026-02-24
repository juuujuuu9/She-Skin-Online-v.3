#!/usr/bin/env node
/**
 * Fix Media File Sizes
 * Updates the 21 digital work media records with correct file sizes
 */

import { config } from 'dotenv';
config();

import { db } from '../src/lib/db/index.js';
import { media } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';

// Mapping of media IDs to their correct file sizes (bytes)
const MEDIA_UPDATES = [
  { id: '-i9mbFBt3WHzC2ffRKBxr', fileSize: 223362 },    // 18692.jpg
  { id: '0n7qbJmYk8PZojc6jmTXC', fileSize: 186255 },    // d-roanoke.jpg
  { id: 'ae9ATkk9isae2ixQWhV6w', fileSize: 3072850 },   // letter-x-rust-scott...
  { id: 'kxATXgLFOYjOjXgerAtDC', fileSize: 193191 },    // 19980.jpg
  { id: 'p0GPjqUTfVMUgNXNJ34Tl', fileSize: 628423 },     // p-l-artifact...
  { id: 'MymVGW7EQ029OoJQ6BfQI', fileSize: 1225060 },   // let-my-dna...
  { id: 'CRu0iH4RpTUzp_fQhA-ks', fileSize: 314716 },     // d-bg-sammy...
  { id: 'owDtp3nguaJbeyrLbYQjF', fileSize: 1135163 },   // and-i-wait.png
  { id: '4j2NTTd7YmhotpHoCQfDy', fileSize: 204127 },    // koncept-jackon.jpg
  { id: 'LuSL3dstwWrQQZUxoHxmW', fileSize: 213323 },     // d.jpg
  { id: 'FB-Dqr6zo9c8b9i2oL6Ro', fileSize: 451102 },     // ny-2022.jpg
  { id: 'njfOTvx0EiPoVqSThqfuf', fileSize: 148550 },     // kray-shyne.jpg
  { id: '4Cgy4e1vJETOS2Y5w1F8J', fileSize: 185563 },     // rusty.jpg
  { id: 'L6W50OsKmS3btufuLw8Ah', fileSize: 203171 },     // trey-jackson.jpg
  { id: 'ttbUzm9Wq9sQScGWVazFC', fileSize: 1600988 },   // digital-expression...
  { id: 'OlGDKEwOH_3hgn0D_uD3h', fileSize: 1708308 },   // econoline...
  { id: '2CgthJUtAlnuWLtOrcZcz', fileSize: 293922 },     // sickboyrari.jpg
  { id: 'E_9UyUBJRO9pxmeSuWvW2', fileSize: 233804 },     // dre.jpg
  { id: 'GBvsls619U03O0GCDPHpl', fileSize: 433100 },      // little-time-00.jpg
  { id: 'Oa1hFVRBmoCJAo_lEFq1V', fileSize: 801358 },     // digital-set-2.png
  { id: 'GqKlFrkSHyH_fGRjgSgm0', fileSize: 955927 },     // h.png
];

async function main() {
  console.log('🔧 Fixing Media File Sizes\n');
  console.log('=' .repeat(60));

  let updated = 0;
  let failed = 0;

  for (const item of MEDIA_UPDATES) {
    const sizeKb = (item.fileSize / 1024).toFixed(1);
    console.log(`Updating ${item.id} -> ${sizeKb}KB`);

    try {
      await db.update(media)
        .set({
          fileSize: item.fileSize,
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
    console.log('\n🎉 All media file sizes fixed!');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
