#!/usr/bin/env node
/**
 * Sync Work Media URLs
 * 
 * The gallery displays images from work_media table, not media table.
 * This script updates work_media.url to match the media CDN URLs.
 */

import { config } from 'dotenv';
config();

import { db } from '../src/lib/db/index.js';
import { media, workMedia, works } from '../src/lib/db/schema.js';
import { eq, like, and, isNull } from 'drizzle-orm';

// The 21 media records we fixed with their new CDN URLs
const MEDIA_ID_TO_CDN_URL: Record<string, string> = {
  '-i9mbFBt3WHzC2ffRKBxr': 'https://she-skin.b-cdn.net/works/digital/18692.jpg',
  '0n7qbJmYk8PZojc6jmTXC': 'https://she-skin.b-cdn.net/works/digital/d-roanoke.jpg',
  'ae9ATkk9isae2ixQWhV6w': 'https://she-skin.b-cdn.net/works/digital/letter-x-rust-scott-x-she_skin-bts-like-um-show-letter-store-richmond-va.png',
  'kxATXgLFOYjOjXgerAtDC': 'https://she-skin.b-cdn.net/works/digital/19980.jpg',
  'p0GPjqUTfVMUgNXNJ34Tl': 'https://she-skin.b-cdn.net/works/digital/p-l-artifact-precious-luv.jpg',
  'MymVGW7EQ029OoJQ6BfQI': 'https://she-skin.b-cdn.net/works/digital/let-my-dna-talk-paintings.png',
  'CRu0iH4RpTUzp_fQhA-ks': 'https://she-skin.b-cdn.net/works/digital/d-bg-sammy-n-bro-new-york-2022.jpg',
  'owDtp3nguaJbeyrLbYQjF': 'https://she-skin.b-cdn.net/works/digital/and-i-wait.png',
  '4j2NTTd7YmhotpHoCQfDy': 'https://she-skin.b-cdn.net/works/digital/koncept-jackon.jpg',
  'LuSL3dstwWrQQZUxoHxmW': 'https://she-skin.b-cdn.net/works/digital/d.jpg',
  'FB-Dqr6zo9c8b9i2oL6Ro': 'https://she-skin.b-cdn.net/works/digital/ny-2022.jpg',
  'njfOTvx0EiPoVqSThqfuf': 'https://she-skin.b-cdn.net/works/digital/kray-shyne.jpg',
  '4Cgy4e1vJETOS2Y5w1F8J': 'https://she-skin.b-cdn.net/works/digital/rusty.jpg',
  'L6W50OsKmS3btufuLw8Ah': 'https://she-skin.b-cdn.net/works/digital/trey-jackson.jpg',
  'ttbUzm9Wq9sQScGWVazFC': 'https://she-skin.b-cdn.net/works/digital/digital-expression-reel-2018.png',
  'OlGDKEwOH_3hgn0D_uD3h': 'https://she-skin.b-cdn.net/works/digital/econoline-trust-reminders.png',
  '2CgthJUtAlnuWLtOrcZcz': 'https://she-skin.b-cdn.net/works/digital/sickboyrari.jpg',
  'E_9UyUBJRO9pxmeSuWvW2': 'https://she-skin.b-cdn.net/works/digital/dre.jpg',
  'GBvsls619U03O0GCDPHpl': 'https://she-skin.b-cdn.net/works/digital/little-time-00.jpg',
  'Oa1hFVRBmoCJAo_lEFq1V': 'https://she-skin.b-cdn.net/works/digital/digital-set-2.png',
  'GqKlFrkSHyH_fGRjgSgm0': 'https://she-skin.b-cdn.net/works/digital/h.png',
};

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('🔗 Syncing Work Media URLs with Media CDN URLs\n');
  console.log('=' .repeat(70));

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  // Find all workMedia records linked to the media we fixed
  for (const [mediaId, cdnUrl] of Object.entries(MEDIA_ID_TO_CDN_URL)) {
    // Find workMedia records linked to this media
    const workMediaRecords = await db.query.workMedia.findMany({
      where: eq(workMedia.mediaId, mediaId),
    });

    if (workMediaRecords.length === 0) {
      console.log(`⚠️ No workMedia found for media ${mediaId}`);
      skipped++;
      continue;
    }

    for (const wm of workMediaRecords) {
      // Check if URL needs updating
      if (wm.url === cdnUrl) {
        console.log(`⏭️  workMedia ${wm.id} already has correct URL`);
        skipped++;
        continue;
      }

      console.log(`\n📷 workMedia: ${wm.id}`);
      console.log(`   Old URL: ${wm.url}`);
      console.log(`   New URL: ${cdnUrl}`);

      if (DRY_RUN) {
        console.log('   [DRY RUN] Would update');
        updated++;
        continue;
      }

      try {
        await db.update(workMedia)
          .set({
            url: cdnUrl,
            updatedAt: new Date(),
          })
          .where(eq(workMedia.id, wm.id));

        console.log('   ✓ Updated');
        updated++;
      } catch (err) {
        console.log(`   ✗ Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        failed++;
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  Skipped (already correct): ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);

  if (failed === 0 && updated > 0) {
    console.log('\n🎉 Work media URLs synced successfully!');
    console.log('   The gallery should now display the fixed images.');
  }

  // Also verify by checking how many digital works have images
  console.log('\n' + '='.repeat(70));
  console.log('🔍 Digital Works Gallery Status:\n');

  const digitalWorks = await db.query.works.findMany({
    where: and(
      eq(works.category, 'digital'),
      eq(works.published, true),
      isNull(works.deletedAt)
    ),
    with: {
      media: true,
    },
  });

  let withImages = 0;
  let withoutImages = 0;

  for (const work of digitalWorks) {
    const hasMedia = work.media && work.media.length > 0;
    const mediaUrl = hasMedia ? work.media[0].url : null;
    const isNewUrl = mediaUrl?.includes('b-cdn.net');

    if (hasMedia && isNewUrl) {
      withImages++;
    } else {
      withoutImages++;
      console.log(`   ${work.title}: ${hasMedia ? '❌ old URL' : '❌ no media'}`);
    }
  }

  console.log(`\n   ✅ Digital works with new CDN images: ${withImages}/${digitalWorks.length}`);
  console.log(`   ⏭️ Digital works still need images: ${withoutImages}/${digitalWorks.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
