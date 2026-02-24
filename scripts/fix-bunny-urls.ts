#!/usr/bin/env tsx
/**
 * Fix Bunny URLs - Match broken DB entries to existing Bunny files
 */

import { db } from '../src/lib/db/index.js';
import { media } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

config();

const CONFIG = {
  bunnyCdnUrl: process.env.BUNNY_CDN_URL || 'https://she-skin.b-cdn.net',
};

interface BrokenMedia {
  id: string;
  filename: string;
  originalName: string | null;
  url: string;
  mediaType: string;
}

// Files we found in Bunny storage
const bunnyFiles = {
  collaborations: [
    'collaborations-19881-she-skin-x-snack-skateboards.jpg',
    'collaborations-19987-haunted-mound-virginia-8-3-2k99.png',
    'collaborations-20077-harto-falion-best-ofthe-worst-official-mv.png',
  ],
  digital: [
    '18692.jpg',
    '19980.jpg',
    'and-i-wait.png',
    'd-bg-sammy-n-bro-new-york-2022.jpg',
    'd-roanoke.jpg',
    'd.jpg',
    'digital-13371-koncept-jack-on.jpg',
    'digital-14248-and-i-wait.png',
    'digital-152-digital-set-1.png',
    'digital-15381-d-bg-sammy-n-bro-new-york-2022.jpg',
    'digital-15525-let-my-dna-talk-paintings.png',
    'digital-156-digital-set-2.png',
    'digital-15660-p-l-artifact-precious-luv.jpg',
    'digital-17728-d.jpg',
    'digital-17734-d-ny-2022.jpg',
    'digital-17735-tommy.jpg',
    'digital-17736-d-roanoke.jpg',
    'digital-18692-d.jpg',
    'digital-18927-trey-jackson.jpg',
    'digital-19980-0725-nyc-sb.jpg',
    'digital-20061-as-for-the-love-presented-by-thank-you-gallery-virginia-moca.png',
    'digital-20186-letter-x-rust-scott-x-she-skin-bts-like-um-show-letter-store.png',
    'digital-706-a-little-time-00.jpg',
    'digital-731-dre-623.jpg',
    'digital-842-econoline-trust-and-reminders.png',
    'digital-844-sickboyrari.jpg',
    'digital-894-digital-expression-reel-2018.png',
    'digital-972-rusty.jpg',
    'digital-974-kray-shyne.jpg',
    'digital-expression-reel-2018.png',
    'digital-set-2.png',
    'dre.jpg',
    'econoline-trust-reminders.png',
    'h.png',
    'koncept-jackon.jpg',
    'kray-shyne.jpg',
    'let-my-dna-talk-paintings.png',
    'letter-x-rust-scott-x-she_skin-bts-like-um-show-letter-store-richmond-va.png',
    'little-time-00.jpg',
    'ny-2022.jpg',
    'p-l-artifact-precious-luv.jpg',
    'rusty.jpg',
    'sickboyrari.jpg',
    'trey-jackson.jpg',
  ],
};

function findMatchingFile(brokenItem: BrokenMedia): string | null {
  const searchName = (brokenItem.originalName || brokenItem.filename).toLowerCase();
  const category = brokenItem.url.includes('/collaborations/') ? 'collaborations' : 'digital';
  const files = bunnyFiles[category as keyof typeof bunnyFiles] || [];

  // Try to find best match
  for (const file of files) {
    const fileLower = file.toLowerCase();

    // Extract ID from broken item URL if possible
    const idMatch = brokenItem.url.match(/(digital|collaborations)-(\d+)-/);
    if (idMatch) {
      const id = idMatch[2];
      // Check if file contains this ID
      if (fileLower.includes(id)) {
        return file;
      }
    }

    // Check if filename contains search terms
    const searchTerms = searchName
      .replace(/\.[^/.]+$/, '') // Remove extension
      .replace(/[^a-zA-Z0-9]/g, '') // Remove special chars
      .toLowerCase();

    const fileTerms = file
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();

    if (fileTerms.includes(searchTerms) || searchTerms.includes(fileTerms)) {
      return file;
    }
  }

  // Try partial word matching
  const searchWords = searchName
    .replace(/\.[^/.]+$/, '')
    .split(/[-_\s\.]+/)
    .filter(w => w.length > 3);

  for (const file of files) {
    const fileWords = file
      .replace(/\.[^/.]+$/, '')
      .split(/[-_\s\.]+/)
      .filter(w => w.length > 3);

    // Check for common words
    const commonWords = searchWords.filter(w =>
      fileWords.some(fw => fw.toLowerCase().includes(w.toLowerCase()) || w.toLowerCase().includes(fw.toLowerCase()))
    );

    if (commonWords.length >= 2) {
      return file;
    }
  }

  return null;
}

async function main() {
  console.log('='.repeat(70));
  console.log('  FIX BUNNY URLs');
  console.log('='.repeat(70));

  // Load broken media report
  const brokenReport = JSON.parse(
    readFileSync(join(process.cwd(), 'broken-media-report.json'), 'utf-8')
  ) as BrokenMedia[];

  console.log(`\nFound ${brokenReport.length} broken items to match\n`);

  let matched = 0;
  let notMatched = 0;
  const matches: { item: BrokenMedia; file: string; newUrl: string }[] = [];

  // Find matches
  for (const item of brokenReport) {
    const file = findMatchingFile(item);

    if (file) {
      const category = item.url.includes('/collaborations/') ? 'collaborations' : 'digital';
      const newUrl = `${CONFIG.bunnyCdnUrl}/works/${category}/${file}`;

      matches.push({ item, file, newUrl });
      console.log(`✅ ${item.originalName || item.filename}`);
      console.log(`   → ${file}`);
      matched++;
    } else {
      console.log(`❌ ${item.originalName || item.filename}`);
      console.log(`   (no match found)`);
      notMatched++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  ✅ Matched: ${matched}`);
  console.log(`  ❌ Not matched: ${notMatched}`);
  console.log(`  📊 Total: ${brokenReport.length}`);

  if (matched === 0) {
    console.log('\nNo matches found. Cannot proceed.');
    return;
  }

  // Ask to proceed
  console.log('\n' + '='.repeat(70));
  console.log('  This will UPDATE the database URLs');
  console.log('='.repeat(70));
  console.log('Run with --yes to apply changes:');
  console.log('  npx tsx scripts/fix-bunny-urls.ts --yes\n');

  const autoConfirm = process.argv.includes('--yes');
  if (!autoConfirm) {
    return;
  }

  console.log('\n📝 Updating database...\n');

  let updated = 0;
  let failed = 0;

  for (const { item, newUrl } of matches) {
    try {
      await db.update(media)
        .set({
          url: newUrl,
          updatedAt: new Date(),
        })
        .where(eq(media.id, item.id));

      console.log(`  ✅ Updated: ${item.originalName || item.filename}`);
      updated++;
    } catch (error) {
      console.log(`  ❌ Failed: ${item.originalName || item.filename}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  UPDATE SUMMARY');
  console.log('='.repeat(70));
  console.log(`  ✅ Updated: ${updated}`);
  console.log(`  ❌ Failed: ${failed}`);

  if (updated > 0) {
    console.log('\n🎉 URLs updated!');
    console.log('   Now run: npx tsx scripts/fix-media-variants.ts');
    console.log('   to generate thumbnails for the restored images.');
  }
}

main().catch(console.error);
