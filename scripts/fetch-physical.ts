#!/usr/bin/env tsx
/**
 * Fetch physical work images from sheskin.org, compress to WebP, and store in public/media/physical
 */

import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const IMAGE_URLS = [
  'https://www.sheskin.org/wp-content/uploads/2025/10/goyard_she.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/10/H3-copy-min.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/10/sp2-min-1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/10/1350-Template-Recovered-min.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/08/bag1-min.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/03/Screen-Shot-2024-03-18-at-7.40.43-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2024/02/feb-sculpt.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/12/ston2.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/12/sc4.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/12/NP1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/07/r6.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/12/ab-painting-oct-24.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/06/summer.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/06/aa.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/05/P1050476-scaled.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/05/mm2.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/02/P1040795-scaled.jpg',
  'https://www.sheskin.org/wp-content/uploads/2022/12/bear1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2022/10/august-2022-painting-1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2022/05/art-2022.jpg',
  'https://www.sheskin.org/wp-content/uploads/2022/02/febpainting.jpg',
  'https://www.sheskin.org/wp-content/uploads/2021/12/philo-1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2021/11/painting-1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2021/11/painting2.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/03/painting.jpg',
  'https://www.sheskin.org/wp-content/uploads/2021/02/statue.jpg',
  'https://www.sheskin.org/wp-content/uploads/2020/05/illustration-h2.jpg',
  'https://www.sheskin.org/wp-content/uploads/2020/01/F.jpg',
  'https://www.sheskin.org/wp-content/uploads/2020/01/g.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/11/c1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/11/scan.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/11/dsdds.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/12/she1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/08/it.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/07/horse.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/06/ccc.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/06/FullSizeRender.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/06/FullSizeRender-3.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/06/FullSizeRender-4.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/05/rats-and-bitches.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/04/peda.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/04/dd-1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/02/present.jpg',
  'https://www.sheskin.org/wp-content/uploads/2019/01/trustsystems-scaled.jpg',
  'https://www.sheskin.org/wp-content/uploads/2018/12/scan0001.jpg',
  'https://www.sheskin.org/wp-content/uploads/2018/11/mood-1.jpg',
  'https://www.sheskin.org/wp-content/uploads/2018/11/shit6999.jpg',
  'https://www.sheskin.org/wp-content/uploads/2018/04/1aa.jpg',
  'https://www.sheskin.org/wp-content/uploads/2018/03/scanc2018.jpg',
  'https://www.sheskin.org/wp-content/uploads/2017/10/mfme.jpg',
  'https://www.sheskin.org/wp-content/uploads/2017/07/that-week-1-scaled.jpg',
  'https://www.sheskin.org/wp-content/uploads/2017/07/reason.jpg',
  'https://www.sheskin.org/wp-content/uploads/2017/07/ride-like-pro-scaled.jpg',
  'https://www.sheskin.org/wp-content/uploads/2017/06/Scan-10.jpg',
  'https://www.sheskin.org/wp-content/uploads/2017/06/Scan-9.jpg',
];

const OUTPUT_DIR = join(process.cwd(), 'public', 'media', 'physical');
const MAX_WIDTH = 1024;
const WEBP_QUALITY = 80;

function urlToFilename(url: string, index: number, usedNames: Set<string>): string {
  const pathname = new URL(url).pathname;
  const basename = pathname.split('/').pop() || `physical-${index}`;
  const nameWithoutExt = basename.replace(/\.[^.]+$/, '');
  const cleanName = nameWithoutExt
    .replace(/-\d+x\d+(-min)?$/i, '')
    .replace(/-min$/i, '')
    .replace(/-scaled$/i, '')
    .replace(/-e\d+$/, '');
  let sanitized =
    cleanName
      .replace(/[^a-zA-Z0-9\-_.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `physical-${index}`;
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

  console.log('Fetching and compressing physical work images to WebP...\n');

  const usedNames = new Set<string>();
  for (let i = 0; i < IMAGE_URLS.length; i++) {
    try {
      await processImage(IMAGE_URLS[i], i, usedNames);
    } catch (err) {
      console.error(`   ✗ Failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('\n✅ Done! Images saved to public/media/physical/');
}

main();
