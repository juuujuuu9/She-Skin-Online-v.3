/**
 * Migrate collaborations JSON to database
 * Usage: npx tsx scripts/migrate-collaborations-to-db.ts
 */

import { db } from '../src/lib/db';
import { works, workMedia } from '../src/lib/db/schema';
import collaborations from '../src/data/collaborations.json' assert { type: 'json' };
import crypto from 'node:crypto';

interface CollaborationItem {
  slug: string;
  title: string;
  forSale?: boolean;
  image?: {
    src: string;
    alt?: string;
    variants?: {
      sm?: { url: string; width: number };
      md?: { url: string; width: number };
      lg?: { url: string; width: number };
    };
    blurhash?: string;
    dominantColor?: string;
    width?: number;
    height?: number;
  };
  href?: string;
}

function generateId(): string {
  return crypto.randomUUID();
}

async function migrateCollaborations() {
  console.log(`Migrating ${collaborations.length} collaborations...`);

  for (const item of collaborations as CollaborationItem[]) {
    const workId = generateId();
    
    // Insert work
    await db.insert(works).values({
      id: workId,
      slug: item.slug,
      title: item.title,
      category: 'collaborations',
      forSale: item.forSale ?? false,
      externalUrl: item.href || null,
      published: true,
      sortOrder: 0,
    });

    // Insert media if exists
    if (item.image?.src) {
      const variants = item.image.variants ? {
        sm: item.image.variants.sm?.url || item.image.src,
        md: item.image.variants.md?.url || item.image.src,
        lg: item.image.variants.lg?.url || item.image.src,
      } : null;

      await db.insert(workMedia).values({
        id: generateId(),
        workId: workId,
        type: 'image',
        url: item.image.src,
        variants: variants,
        blurhash: item.image.blurhash || null,
        dominantColor: item.image.dominantColor || null,
        width: item.image.width || null,
        height: item.image.height || null,
        isPrimary: true,
        sortOrder: 0,
      });
    }

    console.log(`  ✓ Migrated: ${item.title}`);
  }

  console.log('\nMigration complete!');
}

migrateCollaborations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
