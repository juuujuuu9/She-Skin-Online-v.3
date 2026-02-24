#!/usr/bin/env tsx
/**
 * Fetch digital art images from sheskin.org, compress to WebP, and store in public/media/digital
 */

import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const IMAGE_URLS = [
  'https://www.sheskin.org/wp-content/uploads/2026/02/Screenshot-2026-02-19-at-3.36.13-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2025/10/Screenshot-2025-10-03-at-5.11.09-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2025/07/n-min.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/09/trey.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/06/dm1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/06/dm2.jpg',
  'https://www.sheskin.org/wp-content/uploads/2022/10/darrick-2022.jpg',
  'https://www.sheskin.org/wp-content/uploads/2022/10/d-ny-2022-scaled.jpg',
  'https://www.sheskin.org/wp-content/uploads/2022/07/P1200744_1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2022/06/Screen-Shot-2022-06-23-at-7.02.29-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2022/05/basetball-scaled-1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2022/10/theart.jpg',
  'https://www.sheskin.org/wp-content/uploads/2021/07/Screen-Shot-2021-07-25-at-1.06.54-AM.png',
  'https://www.sheskin.org/wp-content/uploads/2021/02/KONCEPT-official.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/04/kray-shyne-2018.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/04/RUSTY.jpg',
  'https://www.sheskin.org/wp-content/uploads/2018/12/Screen-Shot-2018-12-19-at-1.30.20-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2018/11/Screen-Shot-2018-11-02-at-5.28.40-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2018/11/krya1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2018/06/ddemonblood.jpg',
  'https://www.sheskin.org/wp-content/uploads/2018/05/B-ST-k-shecore-scaled.jpg',
  'https://www.sheskin.org/wp-content/uploads/2017/06/Screen-Shot-2017-06-21-at-1.08.05-PM-e1498065618323.png',
  'https://www.sheskin.org/wp-content/uploads/2017/06/Screen-Shot-2017-06-21-at-1.08.48-PM-e1498065147788.png',
];

const OUTPUT_DIR = join(process.cwd(), 'public', 'media', 'digital');
const MAX_WIDTH = 1024;
const WEBP_QUALITY = 80;

function urlToFilename(url: string, index: number, usedNames: Set<string>): string {
  const pathname = new URL(url).pathname;
  const basename = pathname.split('/').pop() || `digital-${index}`;
  const nameWithoutExt = basename.replace(/\.[^.]+$/, '');
  const cleanName = nameWithoutExt.replace(/-\d+x\d+(-min)?$/i, '').replace(/-min$/i, '').replace(/-scaled$/i, '').replace(/-e\d+$/, '');
  let sanitized = cleanName.replace(/[^a-zA-Z0-9\-_.]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `digital-${index}`;
  if (usedNames.has(sanitized)) sanitized = `${sanitized}-${index}`;
  usedNames.add(sanitized);
  return `${sanitized}.webp`;
}

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function processImage(url: string, index: number, usedNames: Set<string>): Promise<void> {
  const filename = urlToFilename(url, index + 1, usedNames);
  const outputPath = join(OUTPUT_DIR, filename);

  console.log(`[${index + 1}/${IMAGE_URLS.length}] Fetching ${url.split('/').pop()}...`);

  const buffer = await fetchImage(url);

  const webpBuffer = await sharp(buffer)
    .resize(MAX_WIDTH, undefined, { withoutEnlargement: true })
    .webp({
      quality: WEBP_QUALITY,
      effort: 6,
      smartSubsample: true,
    })
    .toBuffer();

  await writeFile(outputPath, webpBuffer);

  const originalKB = (buffer.length / 1024).toFixed(1);
  const webpKB = (webpBuffer.length / 1024).toFixed(1);
  const saved = ((1 - webpBuffer.length / buffer.length) * 100).toFixed(0);
  console.log(`   ✓ ${filename} — ${originalKB}KB → ${webpKB}KB (${saved}% smaller)`);
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
  }

  console.log('Fetching and compressing digital images to WebP...\n');

  const usedNames = new Set<string>();
  for (let i = 0; i < IMAGE_URLS.length; i++) {
    try {
      await processImage(IMAGE_URLS[i], i, usedNames);
    } catch (err) {
      console.error(`   ✗ Failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('\n✅ Done! Images saved to public/media/digital/');
}

main();
