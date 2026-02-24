#!/usr/bin/env tsx
/**
 * Fetch audio cover images from sheskin.org, compress to WebP, and store in public/media/audio
 */

import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const IMAGE_URLS = [
  'https://www.sheskin.org/wp-content/uploads/2026/02/BALLM-COVER-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2025/12/Screenshot-2025-12-17-at-12.47.33-AM.png',
  'https://www.sheskin.org/wp-content/uploads/2025/11/Screenshot-2025-11-30-at-3.21.11-PM-min-1024x573.png',
  'https://www.sheskin.org/wp-content/uploads/2025/11/Screenshot-2025-11-15-at-12.04.29-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2025/09/cover-sept-copy-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2025/09/Screenshot-2025-09-07-at-5.33.49-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2025/07/COVE-copy-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2025/06/Screen-Shot-2025-06-08-at-11.36.36-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2025/05/W1-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2025/04/n1-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2025/03/L-A-A-COVER.jpg',
  'https://www.sheskin.org/wp-content/uploads/2025/03/Screen-Shot-2025-03-10-at-8.25.01-PM-min-1024x573.png',
  'https://www.sheskin.org/wp-content/uploads/2025/02/Screen-Shot-2025-02-16-at-9.41.28-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2025/02/cova-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2025/02/exoxo-copy-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2025/01/D-FINAL-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/12/sas1-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/11/Layer-1-copy.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/11/Untitled-2-min-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/10/HBLIBC-SQUARE-COVER-min-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/09/c1-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/09/Screen-Shot-2024-09-03-at-1.00.31-PM-1024x574.png',
  'https://www.sheskin.org/wp-content/uploads/2024/08/Screen-Shot-2024-08-09-at-12.45.33-PM-1024x577.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/08/NEWE-copy-min-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/06/Screen-Shot-2024-06-29-at-10.45.43-AM-1024x574.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/06/Screen-Shot-2024-06-16-at-3.03.28-PM-1024x576.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/06/Screen-Shot-2024-06-04-at-9.27.47-PM-1024x570.png',
  'https://www.sheskin.org/wp-content/uploads/2024/05/COVA-copy-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/03/Untitled-2-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/03/Screen-Shot-2024-03-13-at-8.09.01-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2024/02/Screen-Shot-2024-02-23-at-2.54.23-PM-1024x569.png',
  'https://www.sheskin.org/wp-content/uploads/2024/02/s-coverr-copy-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/02/Screen-Shot-2024-02-15-at-11.17.22-PM-1024x575.png',
  'https://www.sheskin.org/wp-content/uploads/2024/01/006-cover-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2024/01/Screen-Shot-2024-01-01-at-8.10.22-PM-1024x773.png',
  'https://www.sheskin.org/wp-content/uploads/2024/01/Screen-Shot-2024-01-01-at-8.08.07-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2023/12/Screen-Shot-2023-12-14-at-3.21.55-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2023/12/Screen-Shot-2023-12-06-at-7.23.25-PM-1024x538.png',
  'https://www.sheskin.org/wp-content/uploads/2023/11/mj-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/11/new-logo-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/11/Screen-Shot-2023-11-14-at-4.58.43-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2023/11/Screen-Shot-2023-11-14-at-5.00.22-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2023/10/never-2-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/10/9CAE3838-683D-4657-AA18-19BDC12AF2A4.png',
  'https://www.sheskin.org/wp-content/uploads/2023/09/SCENT-AH-WHO-COVER-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/07/Screen-Shot-2023-07-28-at-1.01.46-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2023/07/Screen-Shot-2023-07-28-at-1.03.24-PM.png',
  'https://www.sheskin.org/wp-content/uploads/2023/07/004-COVER-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/06/Untitled-4-1-1024x1024.jpg',
  'https://www.sheskin.org/wp-content/uploads/2023/05/cover-1024x1024.jpg',
];

const OUTPUT_DIR = join(process.cwd(), 'public', 'media', 'audio');
const MAX_WIDTH = 1024;
const WEBP_QUALITY = 80;

function urlToFilename(url: string, index: number, usedNames: Set<string>): string {
  const pathname = new URL(url).pathname;
  const basename = pathname.split('/').pop() || `cover-${index}`;
  const nameWithoutExt = basename.replace(/\.[^.]+$/, '');
  // Strip dimension suffixes like -1024x1024 for cleaner names
  const cleanName = nameWithoutExt.replace(/-\d+x\d+(-min)?$/i, '').replace(/-min$/i, '');
  // Sanitize: allow alphanumeric, dash, underscore
  let sanitized = cleanName.replace(/[^a-zA-Z0-9\-_.]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `cover-${index}`;
  // Avoid duplicates
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

  console.log('Fetching and compressing audio covers to WebP...\n');

  const usedNames = new Set<string>();
  for (let i = 0; i < IMAGE_URLS.length; i++) {
    try {
      await processImage(IMAGE_URLS[i], i, usedNames);
    } catch (err) {
      console.error(`   ✗ Failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('\n✅ Done! Images saved to public/media/audio/');
}

main();
