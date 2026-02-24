#!/usr/bin/env node
import { config } from 'dotenv';
config();

import { db } from '../src/lib/db/index.js';
import { media } from '../src/lib/db/schema.js';
import { eq, inArray } from 'drizzle-orm';

// Media IDs that were updated during the upload
const UPDATED_MEDIA_IDS = [
  '-i9mbFBt3WHzC2ffRKBxr', // D (18692)
  '0n7qbJmYk8PZojc6jmTXC', // D. Roanoke
  'ae9ATkk9isae2ixQWhV6w', // Letter x Rust Scott
  'kxATXgLFOYjOjXgerAtDC', // 0725 NYC SB
  'p0GPjqUTfVMUgNXNJ34Tl', // P L Artifact
  'MymVGW7EQ029OoJQ6BfQI', // Let My-DNA Talk Paintings
  'CRu0iH4RpTUzp_fQhA-ks', // D BG SAMMY N BRO
  'owDtp3nguaJbeyrLbYQjF', // And I Wait
  '4j2NTTd7YmhotpHoCQfDy', // Koncept Jack$on
  'LuSL3dstwWrQQZUxoHxmW', // D (17728)
  'FB-Dqr6zo9c8b9i2oL6Ro', // D NY 2022
  'njfOTvx0EiPoVqSThqfuf', // Kray + Shyne
  '4Cgy4e1vJETOS2Y5w1F8J', // Rusty
  'L6W50OsKmS3btufuLw8Ah', // Trey Jackson
  'ttbUzm9Wq9sQScGWVazFC', // DIGITAL EXPRESSION REEL 2018
  'OlGDKEwOH_3hgn0D_uD3h', // Econoline
  '2CgthJUtAlnuWLtOrcZcz', // Sickboyrari
  'E_9UyUBJRO9pxmeSuWvW2', // Dre 623
  'GBvsls619U03O0GCDPHpl', // A Little Time
  'Oa1hFVRBmoCJAo_lEFq1V', // Digital Set 2
  'GqKlFrkSHyH_fGRjgSgm0', // Digital Set 1
];

async function main() {
  console.log('Verifying 21 Digital Image Fixes\n');
  console.log('=' .repeat(60));

  let withCdnUrl = 0;
  let withoutCdnUrl = 0;

  for (const id of UPDATED_MEDIA_IDS) {
    const record = await db.query.media.findFirst({
      where: eq(media.id, id),
    });

    if (record) {
      const hasCdn = !!record.cdnUrl;
      const hasOriginal = !!record.originalUrl;

      if (hasCdn) withCdnUrl++;
      else withoutCdnUrl++;

      console.log(`${hasCdn ? '✓' : '✗'} ${record.filename}`);
      console.log(`  CDN: ${record.cdnUrl || 'NONE'}`);
      console.log(`  Original: ${record.originalUrl || 'NONE'}`);
      console.log();
    } else {
      console.log(`✗ Media ID not found: ${id}`);
      withoutCdnUrl++;
    }
  }

  console.log('=' .repeat(60));
  console.log(`\nSummary:`);
  console.log(`  With CDN URLs: ${withCdnUrl}/21`);
  console.log(`  Missing CDN URLs: ${withoutCdnUrl}/21`);

  if (withCdnUrl === 21) {
    console.log('\n✅ All 21 images successfully updated with CDN URLs!');
  } else {
    console.log('\n⚠️  Some images missing CDN URLs');
  }
}

main().catch(console.error).finally(() => process.exit(0));
