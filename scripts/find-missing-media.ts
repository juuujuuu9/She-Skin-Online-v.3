#!/usr/bin/env tsx
/**
 * Find missing media for items 28 and 29
 */

import { db } from '../src/lib/db/index';
import { media } from '../src/lib/db/schema';
import { like, or } from 'drizzle-orm';

async function findMissing() {
  // Search for potential matches
  const results = await db.select().from(media)
    .where(or(
      like(media.originalName, '%2020/01/F%'),
      like(media.originalName, '%2020/01/g%'),
      like(media.filename, '%f-%'),
      like(media.filename, '%-g-%'),
      like(media.originalName, '%spiritually%'),
      like(media.originalName, '%indefinitely%')
    ));

  console.log('Potential matches for missing items:\n');

  for (const m of results) {
    console.log(`Filename: ${m.filename}`);
    console.log(`Original: ${m.originalName}`);
    console.log(`URL: ${m.url}`);
    console.log('');
  }

  // Also show all media that doesn't have a work associated
  const allMedia = await db.select().from(media);
  const unreferenced = allMedia.filter(m =>
    m.originalName === 'F.webp' ||
    m.originalName === 'g.webp' ||
    m.originalName === 'F.jpg' ||
    m.originalName === 'g.jpg'
  );

  if (unreferenced.length > 0) {
    console.log('\n✅ Found exact matches:\n');
    for (const m of unreferenced) {
      console.log(`ID: ${m.id}`);
      console.log(`Original: ${m.originalName}`);
      console.log(`URL: ${m.url}`);
    }
  } else {
    console.log('\n❌ No exact matches found for F.jpg or g.jpg');
    console.log('These may need to be uploaded to the media library.');
  }
}

findMissing().catch(console.error);
