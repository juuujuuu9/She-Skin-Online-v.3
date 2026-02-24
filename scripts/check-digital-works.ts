#!/usr/bin/env node
import { config } from 'dotenv';
config();

import { db } from '../src/lib/db/index.js';
import { works } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const digitalWorks = await db.query.works.findMany({
    where: eq(works.category, 'digital'),
  });

  console.log('Digital works sample (first 10):\n');
  digitalWorks.slice(0, 10).forEach(w => {
    console.log('---');
    console.log(`ID: ${w.id}`);
    console.log(`Title: ${w.title}`);
    console.log(`Slug: ${w.slug}`);
    if (w.metadata && typeof w.metadata === 'object') {
      console.log(`Metadata:`, JSON.stringify(w.metadata, null, 2));
    }
    console.log();
  });

  console.log('\nTotal digital works:', digitalWorks.length);

  // Check for works with images
  const withImages = digitalWorks.filter(w => {
    if (w.metadata && typeof w.metadata === 'object') {
      const m = w.metadata as any;
      return m.featuredImage || m.images?.length > 0;
    }
    return false;
  });

  console.log('Digital works with images:', withImages.length);

  // Search for specific work by title
  const searchTerm = process.argv[2];
  if (searchTerm) {
    const matches = digitalWorks.filter(w =>
      w.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
    console.log(`\nSearch for "${searchTerm}":`, matches.length, 'matches');
    matches.forEach(w => {
      console.log(`  - ${w.title} (slug: ${w.slug})`);
    });
  }
}

main().catch(console.error).finally(() => process.exit(0));
