#!/usr/bin/env tsx
/**
 * Create content collection entries for digital images in public/media/digital
 * Output: src/content/works/digital/*.md
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Explicit slugs avoid YAML parsing issues (e.g. "basetball-scaled-1" parsed as arithmetic)
const DIGITAL_IMAGES: { file: string; title: string; date: string; slug: string }[] = [
  { file: 'Screenshot-2026-02-19-at-3.36.13-PM.webp', title: 'Screenshot Feb 2026', date: '2026-02-19', slug: 'screenshot-2026' },
  { file: 'Screenshot-2025-10-03-at-5.11.09-PM.webp', title: 'Screenshot Oct 2025', date: '2025-10-03', slug: 'screenshot-2025' },
  { file: 'n.webp', title: 'N', date: '2025-07-01', slug: 'n' },
  { file: 'trey.webp', title: 'Trey', date: '2023-09-01', slug: 'trey' },
  { file: 'dm1.webp', title: 'DM 1', date: '2023-06-01', slug: 'dm1' },
  { file: 'dm2.webp', title: 'DM 2', date: '2023-06-01', slug: 'dm2' },
  { file: 'darrick-2022.webp', title: 'Darrick 2022', date: '2022-10-01', slug: 'darrick-2022' },
  { file: 'd-ny-2022.webp', title: 'D NY 2022', date: '2022-10-01', slug: 'd-ny-2022' },
  { file: 'P1200744_1.webp', title: 'P1200744', date: '2022-07-01', slug: 'p1200744' },
  { file: 'Screen-Shot-2022-06-23-at-7.02.29-PM.webp', title: 'Screen Jun 2022', date: '2022-06-23', slug: 'screen-jun-2022' },
  { file: 'basetball-scaled-1.webp', title: 'Basketball', date: '2022-05-01', slug: 'basketball-2022' },
  { file: 'theart.webp', title: 'The Art', date: '2022-10-01', slug: 'theart' },
  { file: 'Screen-Shot-2021-07-25-at-1.06.54-AM.webp', title: 'Screen Jul 2021', date: '2021-07-25', slug: 'screen-jul-2021' },
  { file: 'KONCEPT-official.webp', title: 'KONCEPT Official', date: '2021-02-01', slug: 'koncept-official' },
  { file: 'kray-shyne-2018.webp', title: 'Kray Shyne 2018', date: '2019-04-01', slug: 'kray-shyne-2018' },
  { file: 'RUSTY.webp', title: 'Rusty', date: '2019-04-01', slug: 'rusty-digital' },
  { file: 'Screen-Shot-2018-12-19-at-1.30.20-PM.webp', title: 'Screen Dec 2018', date: '2018-12-19', slug: 'screen-dec-2018' },
  { file: 'Screen-Shot-2018-11-02-at-5.28.40-PM.webp', title: 'Screen Nov 2018', date: '2018-11-02', slug: 'screen-nov-2018' },
  { file: 'krya1.webp', title: 'Krya', date: '2018-11-01', slug: 'krya1' },
  { file: 'ddemonblood.webp', title: 'D Demon Blood', date: '2018-06-01', slug: 'ddemonblood' },
  { file: 'B-ST-k-shecore.webp', title: 'B ST K Shecore', date: '2018-05-01', slug: 'shecore-2018' },
  { file: 'Screen-Shot-2017-06-21-at-1.08.05-PM.webp', title: 'Screen Jun 2017', date: '2017-06-21', slug: 'screen-jun-2017' },
  { file: 'Screen-Shot-2017-06-21-at-1.08.48-PM.webp', title: 'Screen Jun 2017 (2)', date: '2017-06-21', slug: 'screen-jun-2017-2' },
];

function slugFromFile(file: string): string {
  return file.replace(/\.webp$/i, '').replace(/[^a-zA-Z0-9\-_.]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'digital';
}

function frontmatter(entry: (typeof DIGITAL_IMAGES)[0]): string {
  const slug = entry.slug;
  const src = `/media/digital/${entry.file}`;
  const dateIso = entry.date.includes('T') ? entry.date : `${entry.date}T00:00:00.000Z`;
  return `---
title: ${JSON.stringify(entry.title)}
slug: ${JSON.stringify(slug)}
category: digital
date: ${dateIso}
featured: false
coverImage: "0"
media:
  - type: image
    src: ${JSON.stringify(src)}
    width: 1024
    height: 1024
    alt: ${JSON.stringify(entry.title)}
tags: []
---
`;
}

async function main() {
  const outDir = join(process.cwd(), 'src', 'content', 'works', 'digital');
  await mkdir(outDir, { recursive: true });

  for (const entry of DIGITAL_IMAGES) {
    const slug = entry.slug;
    const path = join(outDir, `${slug}.md`);
    await writeFile(path, frontmatter(entry) + '\n');
    console.log(`  ✓ ${slug}.md`);
  }

  console.log(`\n✅ Wrote ${DIGITAL_IMAGES.length} works to src/content/works/digital/`);
}

main().catch(console.error);
