#!/usr/bin/env tsx
/**
 * Link the missing media to works #28 and #29
 */

import { nanoid } from 'nanoid';
import { db } from '../src/lib/db/index';
import { works, workMedia } from '../src/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const MISSING_LINKS = [
  {
    workSlug: 'spiritually-speaking',
    mediaId: 'UwmzCmm92UhajXte6A2Yq',
    url: 'https://she-skin.b-cdn.net/2026/02/f-QmlaUF-lg.webp',
    originalName: 'F.webp'
  },
  {
    workSlug: 'indefinitely-yours',
    mediaId: '3rXiE0w3ynRYJZO6LxSzJ',
    url: 'https://she-skin.b-cdn.net/2026/02/g-dl09Nv-lg.webp',
    originalName: 'g.webp'
  }
];

async function linkMissingMedia() {
  for (const link of MISSING_LINKS) {
    // Find the work
    const work = await db.query.works.findFirst({
      where: eq(works.slug, link.workSlug)
    });

    if (!work) {
      console.log(`⚠ Work not found: ${link.workSlug}`);
      continue;
    }

    // Check if media already linked
    const existing = await db.query.workMedia.findFirst({
      where: and(
        eq(workMedia.workId, work.id),
        eq(workMedia.mediaId, link.mediaId)
      )
    });

    if (existing) {
      console.log(`⚠ Media already linked for: ${link.workSlug}`);
      continue;
    }

    // Create workMedia entry
    await db.insert(workMedia).values({
      id: nanoid(),
      workId: work.id,
      mediaId: link.mediaId,
      type: 'image',
      url: link.url,
      sortOrder: 0,
      isPrimary: true,
    });

    console.log(`✓ Linked ${link.originalName} to work: ${work.title}`);
  }

  console.log('\n✅ Done!');
}

linkMissingMedia().catch(console.error);
