#!/usr/bin/env node
/**
 * Fix Media URLs Directly
 * Updates the 21 digital work media records with CDN URLs
 */

import { config } from 'dotenv';
config();

import { db } from '../src/lib/db/index.js';
import { media } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';

// Mapping of media IDs to their CDN URLs
const MEDIA_UPDATES = [
  { id: '-i9mbFBt3WHzC2ffRKBxr', filename: 'digital-18692-d.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/18692.jpg' },
  { id: '0n7qbJmYk8PZojc6jmTXC', filename: 'digital-17736-d-roanoke.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/d-roanoke.jpg' },
  { id: 'ae9ATkk9isae2ixQWhV6w', filename: 'digital-20186-letter-x-rust-scott-x-she-skin-bts-like-um-show-letter-store.png', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/letter-x-rust-scott-x-she_skin-bts-like-um-show-letter-store-richmond-va.png' },
  { id: 'kxATXgLFOYjOjXgerAtDC', filename: 'digital-19980-0725-nyc-sb.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/19980.jpg' },
  { id: 'p0GPjqUTfVMUgNXNJ34Tl', filename: 'digital-15660-p-l-artifact-precious-luv.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/p-l-artifact-precious-luv.jpg' },
  { id: 'MymVGW7EQ029OoJQ6BfQI', filename: 'digital-15525-let-my-dna-talk-paintings.png', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/let-my-dna-talk-paintings.png' },
  { id: 'CRu0iH4RpTUzp_fQhA-ks', filename: 'digital-15381-d-bg-sammy-n-bro-new-york-2022.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/d-bg-sammy-n-bro-new-york-2022.jpg' },
  { id: 'owDtp3nguaJbeyrLbYQjF', filename: 'digital-14248-and-i-wait.png', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/and-i-wait.png' },
  { id: '4j2NTTd7YmhotpHoCQfDy', filename: 'digital-13371-koncept-jack-on.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/koncept-jackon.jpg' },
  { id: 'LuSL3dstwWrQQZUxoHxmW', filename: 'digital-17728-d.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/d.jpg' },
  { id: 'FB-Dqr6zo9c8b9i2oL6Ro', filename: 'digital-17734-d-ny-2022.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/ny-2022.jpg' },
  { id: 'njfOTvx0EiPoVqSThqfuf', filename: 'digital-974-kray-shyne.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/kray-shyne.jpg' },
  { id: '4Cgy4e1vJETOS2Y5w1F8J', filename: 'digital-972-rusty.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/rusty.jpg' },
  { id: 'L6W50OsKmS3btufuLw8Ah', filename: 'digital-18927-trey-jackson.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/trey-jackson.jpg' },
  { id: 'ttbUzm9Wq9sQScGWVazFC', filename: 'digital-894-digital-expression-reel-2018.png', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/digital-expression-reel-2018.png' },
  { id: 'OlGDKEwOH_3hgn0D_uD3h', filename: 'digital-842-econoline-trust-and-reminders.png', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/econoline-trust-reminders.png' },
  { id: '2CgthJUtAlnuWLtOrcZcz', filename: 'digital-844-sickboyrari.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/sickboyrari.jpg' },
  { id: 'E_9UyUBJRO9pxmeSuWvW2', filename: 'digital-731-dre-623.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/dre.jpg' },
  { id: 'GBvsls619U03O0GCDPHpl', filename: 'digital-706-a-little-time-00.jpg', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/little-time-00.jpg' },
  { id: 'Oa1hFVRBmoCJAo_lEFq1V', filename: 'digital-156-digital-set-2.png', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/digital-set-2.png' },
  { id: 'GqKlFrkSHyH_fGRjgSgm0', filename: 'digital-152-digital-set-1.png', cdnUrl: 'https://she-skin.b-cdn.net/works/digital/h.png' },
];

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('🔧 Fixing Media URLs\n');
  console.log('=' .repeat(60));

  let updated = 0;
  let failed = 0;

  for (const item of MEDIA_UPDATES) {
    console.log(`${item.filename}`);
    console.log(`  → ${item.cdnUrl}`);

    if (DRY_RUN) {
      console.log('  [DRY RUN] Would update\n');
      updated++;
      continue;
    }

    try {
      await db.update(media)
        .set({
          cdnUrl: item.cdnUrl,
          originalUrl: item.cdnUrl,
          status: 'ready',
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
    console.log('\n🎉 All media records updated successfully!');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
