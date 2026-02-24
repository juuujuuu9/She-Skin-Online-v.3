#!/usr/bin/env node
import { config } from 'dotenv';
config();

import { db } from '../src/lib/db/index.js';
import { works, workMedia, media } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const digitalWorks = await db.query.works.findMany({
    where: eq(works.category, 'digital'),
  });

  console.log('Digital works with their media:\n');

  for (const work of digitalWorks.slice(0, 20)) {
    console.log('---');
    console.log(`ID: ${work.id}`);
    console.log(`Title: ${work.title}`);
    console.log(`Slug: ${work.slug}`);

    const mediaLinks = await db.query.workMedia.findMany({
      where: eq(workMedia.workId, work.id),
    });

    if (mediaLinks.length > 0) {
      for (const link of mediaLinks) {
        const mediaRecord = await db.query.media.findFirst({
          where: eq(media.id, link.mediaId),
        });

        if (mediaRecord) {
          console.log(`  Media: ${mediaRecord.originalUrl || 'NO URL'}`);
          console.log(`  CDN: ${mediaRecord.cdnUrl || 'NO CDN URL'}`);
          console.log(`  Status: ${mediaRecord.status}`);
          console.log(`  Filename: ${mediaRecord.filename}`);
        }
      }
    } else {
      console.log('  No media linked');
    }
    console.log();
  }

  console.log('\nTotal digital works:', digitalWorks.length);
}

main().catch(console.error).finally(() => process.exit(0));
