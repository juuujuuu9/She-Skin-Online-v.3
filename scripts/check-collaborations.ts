#!/usr/bin/env node
/**
 * Check Collaboration Works and Images
 */

import { config } from 'dotenv';
config();

import { db } from '../src/lib/db/index.js';
import { works, workMedia, media } from '../src/lib/db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';

async function main() {
  console.log('🔍 Checking Collaboration Works\n');
  console.log('=' .repeat(70));

  // Get all collaboration works
  const collabWorks = await db.query.works.findMany({
    where: and(
      eq(works.category, 'collaborations'),
      eq(works.published, true),
      isNull(works.deletedAt)
    ),
    with: {
      media: true,
    },
  });

  console.log(`\nTotal collaboration works: ${collabWorks.length}\n`);

  let withImages = 0;
  let withoutImages = 0;

  for (const work of collabWorks) {
    const hasMedia = work.media && work.media.length > 0;
    const mediaUrl = hasMedia ? work.media[0].url : null;
    const isNewUrl = mediaUrl?.includes('b-cdn.net');

    if (hasMedia && isNewUrl) {
      withImages++;
      console.log(`✅ ${work.title}`);
      console.log(`   URL: ${mediaUrl?.slice(0, 70)}...`);
    } else if (hasMedia) {
      withoutImages++;
      console.log(`⚠️  ${work.title} - has old/broken URL`);
      console.log(`   URL: ${mediaUrl}`);
    } else {
      withoutImages++;
      console.log(`❌ ${work.title} - NO MEDIA`);
    }
    console.log();
  }

  console.log('=' .repeat(70));
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ With images: ${withImages}/${collabWorks.length}`);
  console.log(`   ❌ Without images: ${withoutImages}/${collabWorks.length}`);

  // List works without images for reference
  if (withoutImages > 0) {
    console.log(`\n📝 Works needing images:`);
    collabWorks
      .filter(w => !w.media || w.media.length === 0 || !w.media[0].url?.includes('b-cdn.net'))
      .forEach(w => console.log(`   - ${w.title} (slug: ${w.slug})`));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
