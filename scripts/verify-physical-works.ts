#!/usr/bin/env tsx
/**
 * Verify physical works were created correctly
 */

import { db } from '../src/lib/db/index';
import { works, workMedia, media } from '../src/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

async function verify() {
  const results = await db.query.works.findMany({
    where: eq(works.category, 'physical'),
    orderBy: [asc(works.sortOrder)],
    with: { media: { with: { mediaLibrary: true } } }
  });

  console.log('Physical works in database (first 15):\n');
  for (const w of results.slice(0, 15)) {
    const hasMedia = w.media && w.media.length > 0;
    const mediaUrl = hasMedia ? w.media[0].url.substring(0, 50) + '...' : 'NO MEDIA';
    console.log(`${hasMedia ? '✓' : '✗'} #${w.sortOrder}: ${w.title}`);
    console.log(`   Slug: ${w.slug}`);
    console.log(`   URL:  ${mediaUrl}`);
  }

  const withMedia = results.filter(r => r.media && r.media.length > 0).length;
  const withoutMedia = results.length - withMedia;

  console.log(`\n📊 Summary:`);
  console.log(`   Total physical works: ${results.length}`);
  console.log(`   With media: ${withMedia}`);
  console.log(`   Without media: ${withoutMedia}`);

  if (withoutMedia > 0) {
    console.log(`\n⚠️ Works missing media:`);
    for (const w of results.filter(r => !r.media || r.media.length === 0)) {
      console.log(`   - #${w.sortOrder}: ${w.title} (${w.slug})`);
    }
  }
}

verify().catch(console.error);
