#!/usr/bin/env tsx
/**
 * Seed physical artwork works in correct HTML order with media references
 */

import { nanoid } from 'nanoid';
import { db } from '../src/lib/db/index';
import { works, workMedia } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

// Media ID mapping based on the HTML order (1-50)
// Matches the original filename from the HTML to the media library ID
const PHYSICAL_WORKS = [
  { order: 1, slug: 'airbrushed-goyard-1-1', title: 'Airbrushed Goyard 1:1', mediaId: 'JPjzcqVtDL9EqdpNcL089', url: 'https://she-skin.b-cdn.net/2026/02/goyard-she-Nba4cs-lg.webp', originalName: 'goyard_she' },
  { order: 2, slug: 'like-it-up-2-u-airbrushed-hood', title: 'Like It Up 2 U Airbrushed Hood', mediaId: 'xGOJPHYDN9QqTqC93KF6M', url: 'https://she-skin.b-cdn.net/2026/02/h3-copy-N8zgff-lg.webp', originalName: 'H3-copy' },
  { order: 3, slug: 'american-darling-service-painting', title: 'American Darling Service Painting', mediaId: 'GgbxzyeL3aGrWffXAMguo', url: 'https://she-skin.b-cdn.net/2026/02/sp2-min-1-A1HvPX-lg.webp', originalName: 'sp2-min-1' },
  { order: 4, slug: 'air-brushed-deck', title: 'Air Brushed Deck', mediaId: 'zKCa4o6B7XMrpSpL9RFX9', url: 'https://she-skin.b-cdn.net/2026/02/1350-template-recovered-qDS5uQ-lg.webp', originalName: '1350-Template-Recovered' },
  { order: 5, slug: '1-1-ictsnu-airbrush-telfar-bag', title: '1:1 ICTSNU Airbrush Telfar Bag', mediaId: '2z3R7yAZ8G4pt0HtskPnt', url: 'https://she-skin.b-cdn.net/2026/02/bag1-7LxjYu-lg.webp', originalName: 'bag1' },
  { order: 6, slug: 'horsepower-3001', title: 'Horsepower 3001', mediaId: 'nI6jyfwB02t9L9OEcHwE9', url: 'https://she-skin.b-cdn.net/2026/02/screen-shot-2024-03-18-at-7-40-43-pm-jbiOrH-lg.webp', originalName: 'Screen-Shot-2024-03-18' },
  { order: 7, slug: 'example-of-angels-4-display-of-embrace', title: 'Example of Angels 4: Display of Embrace', mediaId: 'MQ0vfY2Y45A40ZAAqTO5x', url: 'https://she-skin.b-cdn.net/2026/02/feb-sculpt-UV54sH-lg.webp', originalName: 'feb-sculpt' },
  { order: 8, slug: 'example-of-angels-stone-carving', title: 'Example of Angels: Stone Carving', mediaId: '2oE3GKz2mQeHqWUqpGGRr', url: 'https://she-skin.b-cdn.net/2026/02/ston2-mkwWxp-lg.webp', originalName: 'ston2' },
  { order: 9, slug: 'example-of-angels-2-since-the-beginning-of-time-stone-sculpture', title: 'Example of Angels 2: Since the Beginning of Time Stone Sculpture', mediaId: 'Bkqf33YL77Y56t11YLGIQ', url: 'https://she-skin.b-cdn.net/2026/02/sc4-JlnkYA-lg.webp', originalName: 'sc4' },
  { order: 10, slug: 'weight-of-stone-painting', title: 'Weight of Stone Painting', mediaId: '2JkScQQST4aqYAkL1p9cu', url: 'https://she-skin.b-cdn.net/2026/02/np1-W2kXaV-lg.webp', originalName: 'NP1' },
  { order: 11, slug: 'belief-in-believing-painting', title: 'Belief in Believing Painting', mediaId: 'zofgJcjpGvDfbEnwG8Pnk', url: 'https://she-skin.b-cdn.net/2026/02/r6-oyuXOg-lg.webp', originalName: 'r6' },
  { order: 12, slug: 'sunset-100-painting', title: 'Sunset 100 Painting', mediaId: '5gKhJ0ASlmrBFDHnOULxd', url: 'https://she-skin.b-cdn.net/2026/02/ab-painting-oct-24-UP3gDL-lg.webp', originalName: 'ab-painting-oct-24' },
  { order: 13, slug: 'sick-inna-heat-of-it-painting', title: 'Sick Inna Heat of It Painting', mediaId: 'L7CvpjtmT3PUgcShw2pOv', url: 'https://she-skin.b-cdn.net/2026/02/summer-be2lz9-lg.webp', originalName: 'summer' },
  { order: 14, slug: 'like-once-winter-original-painting', title: 'Like Once Winter Original Painting', mediaId: 'mfo2pOWqN3Ayy1EIY63yY', url: 'https://she-skin.b-cdn.net/2026/02/aa-xpHqfA-lg.webp', originalName: 'aa' },
  { order: 15, slug: 'ictsnu-wig-prints', title: 'ICTSNU Wig Prints', mediaId: 'S1NFd622aKnsUv4keWP0m', url: 'https://she-skin.b-cdn.net/2026/02/p1050476-aXV06F-lg.webp', originalName: 'P1050476' },
  { order: 16, slug: 'w-every-fiber', title: 'W/ Every Fiber', mediaId: 'rLqvu8guFFYtuYKJoLd1W', url: 'https://she-skin.b-cdn.net/2026/02/mm2-DSuEvj-lg.webp', originalName: 'mm2' },
  { order: 17, slug: 'ictsnu-yb-4', title: 'ICTSNU YB 4', mediaId: 'RiFdQJuE13s9xA85IjoYe', url: 'https://she-skin.b-cdn.net/2026/02/p1040795-oU8jah-lg.webp', originalName: 'P1040795' },
  { order: 18, slug: 'mili-t-bear', title: 'Mili T Bear', mediaId: 'aQSk7AQCWb3E1l8aM3KIM', url: 'https://she-skin.b-cdn.net/2026/02/bear1-LSmIUb-lg.webp', originalName: 'bear1' },
  { order: 19, slug: 'set-of-u', title: 'Set of U', mediaId: 'FG9gzQeP7dWYBeL9Rml22', url: 'https://she-skin.b-cdn.net/2026/02/august-2022-painting-1-pqmq0A-lg.webp', originalName: 'august-2022-painting-1' },
  { order: 20, slug: 'free-from-my-iniquity', title: 'Free From My Iniquity', mediaId: 'I0T7gO6VQXADHjpY0mSD2', url: 'https://she-skin.b-cdn.net/2026/02/art-2022-xTIlVB-lg.webp', originalName: 'art-2022' },
  { order: 21, slug: 's-v-strawberry-vase', title: 'S.V. Strawberry Vase', mediaId: '5CKErYCif8a2QRaufxSHu', url: 'https://she-skin.b-cdn.net/2026/02/febpainting-3Yeeq2-lg.webp', originalName: 'febpainting' },
  { order: 22, slug: 'philo', title: 'Philo', mediaId: 'WC3RnHtyiItcoRsQsiZk0', url: 'https://she-skin.b-cdn.net/2026/02/philo-1-vGWRj3-lg.webp', originalName: 'philo-1' },
  { order: 23, slug: 'n-2', title: 'N 2', mediaId: '451kDwjERPcQXtRHufFhE', url: 'https://she-skin.b-cdn.net/2026/02/painting-1-IimrHg-lg.webp', originalName: 'painting-1' },
  { order: 24, slug: 'n-1', title: 'N 1', mediaId: 'ay2xUDRbykcxXaPoXIQtC', url: 'https://she-skin.b-cdn.net/2026/02/painting2-QR46Jp-lg.webp', originalName: 'painting2' },
  { order: 25, slug: 'not-n-u-painting', title: 'Not N U Painting', mediaId: 'jwdgwKEeuOWTROlyxDMpO', url: 'https://she-skin.b-cdn.net/2026/02/painting-E8eATg-lg.webp', originalName: 'painting' },
  { order: 26, slug: 's-002', title: 'S 002', mediaId: '5VifEWZwgt8wZwuVxuUfN', url: 'https://she-skin.b-cdn.net/2026/02/statue-7LhOnI-lg.webp', originalName: 'statue' },
  { order: 27, slug: 'intent-fr', title: 'Intent FR', mediaId: 'psS6Lwzh3kSWrfLCgYkL2', url: 'https://she-skin.b-cdn.net/2026/02/illustration-h2-vSnudu-lg.webp', originalName: 'illustration-h2' },
  // Note: Items 28-32 (F.jpg, g.jpg, c1, scan, dsdds) need to be verified
  { order: 28, slug: 'spiritually-speaking', title: 'Spiritually Speaking', mediaId: null, url: null, originalName: 'F' },
  { order: 29, slug: 'indefinitely-yours', title: 'Indefinitely Yours', mediaId: null, url: null, originalName: 'g' },
  { order: 30, slug: 'beneficial-end', title: 'Beneficial End', mediaId: '8JhTnpxLTkjTjWQSz3u4c', url: 'https://she-skin.b-cdn.net/2026/02/c1-BPMATA-lg.webp', originalName: 'c1' },
  { order: 31, slug: 'supervision-like-day-to-day', title: 'Supervision Like Day to Day', mediaId: 'K4yAb0DMTWik12esFmzL1', url: 'https://she-skin.b-cdn.net/2026/02/scan-GnGFS1-lg.webp', originalName: 'scan' },
  { order: 32, slug: 'lesson-learned', title: 'Lesson Learned', mediaId: 'NjZaJ7qn9F71X6YW062lJ', url: 'https://she-skin.b-cdn.net/2026/02/dsdds-jRXjaW-lg.webp', originalName: 'dsdds' },
  { order: 33, slug: 'untitled-2', title: 'Untitled 2', mediaId: 'ugRst5Kqyy65Ijp0npxUK', url: 'https://she-skin.b-cdn.net/2026/02/she1-CPSCFU-lg.webp', originalName: 'she1' },
  { order: 34, slug: 'pain-when-i', title: 'Pain When I', mediaId: '32xY8a4znj7R1L4NfwaKE', url: 'https://she-skin.b-cdn.net/2026/02/it-ONUPOP-lg.webp', originalName: 'it' },
  { order: 35, slug: 'horse', title: 'Horse', mediaId: 'x70Nc0hs003QF2s90qsiD', url: 'https://she-skin.b-cdn.net/2026/02/horse-waCEfD-lg.webp', originalName: 'horse' },
  { order: 36, slug: 'pressure-as-i-remember', title: 'Pressure As I Remember', mediaId: '0A01XILY7qk2yNEeCzf3T', url: 'https://she-skin.b-cdn.net/2026/02/ccc-vKA43H-lg.webp', originalName: 'ccc' },
  { order: 37, slug: 'sister-kristy', title: 'Sister Kristy', mediaId: 'ih7NHfhsG0AZ5MYD4KWkF', url: 'https://she-skin.b-cdn.net/2026/02/fullsizerender-MXZRa0-lg.webp', originalName: 'FullSizeRender' },
  { order: 38, slug: 'reflection-protection-life-lessons', title: 'Reflection Protection Life Lessons', mediaId: 'uaUzyVRCL2RndVILXEp05', url: 'https://she-skin.b-cdn.net/2026/02/fullsizerender-3-9YKd5a-lg.webp', originalName: 'FullSizeRender-3' },
  { order: 39, slug: 'structure', title: 'Structure', mediaId: 'a9HnHuycvpT3TTD2YH6hJ', url: 'https://she-skin.b-cdn.net/2026/02/fullsizerender-4-LeNHhU-lg.webp', originalName: 'FullSizeRender-4' },
  { order: 40, slug: 'crevices-opportunity', title: 'Crevices Opportunity', mediaId: 'oYn8NgDuQEEYX5xoZG9so', url: 'https://she-skin.b-cdn.net/2026/02/rats-and-bitches-Naeo9V-lg.webp', originalName: 'rats-and-bitches' },
  { order: 41, slug: 'small-plate', title: 'Small Plate', mediaId: 'rhK7WfkIqzFU62qFC4mZX', url: 'https://she-skin.b-cdn.net/2026/02/peda-baOXWc-lg.webp', originalName: 'peda' },
  { order: 42, slug: 'untitled', title: 'Untitled', mediaId: 'rCTCXMFGZKa7KuG5PenfV', url: 'https://she-skin.b-cdn.net/2026/02/dd-1-ljhKwD-lg.webp', originalName: 'dd-1' },
  { order: 43, slug: 'presentations', title: 'Presentations', mediaId: 'hKJUuRWp33NS6MLgHGJVh', url: 'https://she-skin.b-cdn.net/2026/02/present-0nU3CA-lg.webp', originalName: 'present' },
  { order: 44, slug: 'trust-systems-revival', title: 'Trust Systems Revival', mediaId: 'wk9T7wEevTSXBKX1GN0Rg', url: 'https://she-skin.b-cdn.net/2026/02/trustsystems-hVD3UM-lg.webp', originalName: 'trustsystems' },
  { order: 45, slug: 'conjoined-earthbound', title: 'Conjoined Earthbound', mediaId: '5AB7VyteuirLrKmbk7Ja3', url: 'https://she-skin.b-cdn.net/2026/02/scan0001-Xinpux-lg.webp', originalName: 'scan0001' },
  { order: 46, slug: 'venom-chapters', title: 'Venom Chapters', mediaId: 'AXF6D4aay81qvMx4Lrb6e', url: 'https://she-skin.b-cdn.net/2026/02/mood-1-Fqtpcj-lg.webp', originalName: 'mood-1' },
  { order: 47, slug: 'club-looney', title: 'Club Looney', mediaId: 'kV6NqWAgWj6loYOTIfu1c', url: 'https://she-skin.b-cdn.net/2026/02/shit6999-e0ROsj-lg.webp', originalName: 'shit6999' },
  { order: 48, slug: 'direction', title: 'Direction', mediaId: 'UkQuuumc6WTfCCQ8Yuims', url: 'https://she-skin.b-cdn.net/2026/02/1aa-IgS4hF-lg.webp', originalName: '1aa' },
  { order: 49, slug: 'embodied-3', title: 'Embodied 3', mediaId: 'pSriRpG4w8LjZ7aItH0tx', url: 'https://she-skin.b-cdn.net/2026/02/scanc2018-xfL6gh-lg.webp', originalName: 'scanc2018' },
  { order: 50, slug: 'm-f-m-e-my-faith-my-everything', title: 'M.F.M.E (My Faith My Everything)', mediaId: 'LYXOR9jOFZAkNVZSntks6', url: 'https://she-skin.b-cdn.net/2026/02/mfme-obL7V5-lg.webp', originalName: 'mfme' },
];

async function seedPhysicalWorks() {
  console.log('Seeding physical artwork works...\n');

  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const work of PHYSICAL_WORKS) {
    // Check if work already exists
    const existing = await db.select({ id: works.id }).from(works).where(eq(works.slug, work.slug));

    if (existing.length > 0) {
      console.log(`  ⚠ Skipping existing: ${work.title}`);
      skipped++;
      continue;
    }

    // Create work entry
    const workId = nanoid();
    await db.insert(works).values({
      id: workId,
      slug: work.slug,
      title: work.title,
      category: 'physical',
      description: '',
      sortOrder: work.order,
      published: true,
      forSale: false,
    });

    console.log(`  ✓ Created work #${work.order}: ${work.title}`);
    created++;

    // Create workMedia entry if media exists
    if (work.mediaId) {
      await db.insert(workMedia).values({
        id: nanoid(),
        workId: workId,
        mediaId: work.mediaId,
        type: 'image',
        url: work.url!,
        sortOrder: 0,
        isPrimary: true,
      });
      console.log(`    ✓ Linked media: ${work.originalName}`);
      linked++;
    } else {
      console.log(`    ⚠ No media found for: ${work.originalName}`);
    }
  }

  console.log(`\n✅ Done! Created ${created} works, linked ${linked} media, skipped ${skipped} existing.`);
}

seedPhysicalWorks().catch(console.error);
