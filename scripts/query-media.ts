#!/usr/bin/env tsx
/**
 * Query media table to see existing physical artwork images
 */

import { db } from '../src/lib/db/index';
import { media } from '../src/lib/db/schema';
import { like, or, and, eq } from 'drizzle-orm';

async function queryMedia() {
  console.log('Querying media table for physical artwork...\n');

  // Search for physical artwork images based on the slugs from HTML
  const searchTerms = [
    'goyard', 'H3-copy', 'sp2-min', '1350-Template', 'bag1',
    'Screen-Shot-2024-03-18', 'feb-sculpt', 'ston2', 'sc4', 'NP1',
    'r6', 'ab-painting', 'summer', 'aa', 'P1050476',
    'mm2', 'P1040795', 'bear1', 'august-2022', 'art-2022',
    'febpainting', 'philo', 'painting', 'statue', 'illustration',
    'trustsystems', 'scan', 'she1', 'horse', 'FullSizeRender',
    'rats-and-bitches', 'peda', 'present', 'scan0001', 'mood',
    'shit6999', 'scanc2018', 'mfme', 'c1', 'dsdds', 'it',
    'ccc', 'dd-1', '1aa', 'F.jpg', 'g.jpg'
  ];

  const results = await db.select().from(media);

  console.log(`Total media entries: ${results.length}\n`);

  // Filter for physical artwork images
  const physicalImages = results.filter(m => {
    const filename = m.filename.toLowerCase();
    return searchTerms.some(term =>
      filename.includes(term.toLowerCase()) ||
      m.originalName.toLowerCase().includes(term.toLowerCase())
    );
  });

  console.log(`Found ${physicalImages.length} potential physical artwork images:\n`);

  for (const img of physicalImages) {
    console.log(`- ID: ${img.id}`);
    console.log(`  Filename: ${img.filename}`);
    console.log(`  Original: ${img.originalName}`);
    console.log(`  URL: ${img.url}`);
    console.log(`  Type: ${img.mediaType}`);
    console.log('');
  }

  // Also show all media to understand what's available
  console.log('\n--- All Media Entries (first 30) ---\n');
  for (const m of results.slice(0, 30)) {
    console.log(`${m.id}: ${m.filename} (${m.mediaType})`);
  }
}

queryMedia().catch(console.error);
