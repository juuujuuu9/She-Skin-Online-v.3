#!/usr/bin/env tsx
/**
 * Download Images Using Playwright Browser Automation
 * 
 * Uses real browser automation to bypass WordPress security.
 * Opens images in browser context and saves them.
 * 
 * Usage:
 *   npx tsx scripts/download-with-playwright.ts [--limit N] [--start N]
 */

import playwright from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

config();

const CONFIG = {
  downloadDir: join(process.cwd(), 'tmp/image-repair/downloads'),
  mappingPath: join(process.cwd(), 'tmp/image-repair/collab-image-mapping.json'),
  delayMs: 1500,
};

interface ImageMapping {
  slug: string;
  title: string;
  imageUrl: string;
}

function loadMappings(): ImageMapping[] {
  const data = JSON.parse(readFileSync(CONFIG.mappingPath, 'utf-8'));
  return data.filter((m: ImageMapping) => m.imageUrl);
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadImage(page: playwright.Page, mapping: ImageMapping, outputPath: string): Promise<boolean> {
  try {
    // Navigate to the image URL directly
    const response = await page.goto(mapping.imageUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    if (!response) {
      console.log('  No response from server');
      return false;
    }
    
    if (response.status() !== 200) {
      console.log(`  HTTP ${response.status()}`);
      return false;
    }
    
    // Check if content is an image
    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('image')) {
      const body = await response.body();
      const start = body.slice(0, 100).toString().toLowerCase();
      if (start.includes('<!doctype') || start.includes('<html')) {
        console.log('  Got HTML page instead of image');
        return false;
      }
    }
    
    // Download the image
    const buffer = await response.body();
    
    if (buffer.length < 1000) {
      console.log(`  File too small (${buffer.length} bytes)`);
      return false;
    }
    
    writeFileSync(outputPath, buffer);
    console.log(`  Downloaded: ${(buffer.length / 1024).toFixed(1)}KB`);
    return true;
  } catch (error) {
    console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  DOWNLOAD IMAGES WITH PLAYWRIGHT');
  console.log('='.repeat(70));
  
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf('--limit');
  const startIndex = args.indexOf('--start');
  
  const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1]) || 5 : 5;
  const start = startIndex >= 0 ? parseInt(args[startIndex + 1]) || 0 : 0;
  
  // Ensure directories exist
  if (!existsSync(CONFIG.downloadDir)) {
    mkdirSync(CONFIG.downloadDir, { recursive: true });
  }
  
  const mappings = loadMappings();
  const toDownload = mappings.slice(start, start + limit);
  
  console.log(`\nWill download ${toDownload.length} images (starting at ${start})`);
  console.log(`Total available: ${mappings.length}\n`);
  
  // Launch browser
  console.log('Launching browser...');
  const browser = await playwright.chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });
    
    const page = await context.newPage();
    
    // First, visit the main site to get cookies
    console.log('Visiting main site to establish session...');
    await page.goto('https://www.sheskin.org/', { waitUntil: 'networkidle' });
    await delay(2000);
    
    let success = 0;
    let failed = 0;
    const failedItems: ImageMapping[] = [];
    
    for (let i = 0; i < toDownload.length; i++) {
      const mapping = toDownload[i];
      const overallIndex = start + i + 1;
      
      console.log(`\n[${overallIndex}/${mappings.length}] ${mapping.title}`);
      console.log(`  URL: ${mapping.imageUrl.substring(0, 50)}...`);
      
      // Determine output path
      const urlExt = mapping.imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
      const outputPath = join(CONFIG.downloadDir, `collaborations-${mapping.slug}.${urlExt}`);
      
      // Skip if exists and valid
      if (existsSync(outputPath)) {
        try {
          const stat = readFileSync(outputPath);
          if (stat.length > 1000) {
            console.log(`  Already exists (${(stat.length / 1024).toFixed(1)}KB), skipping`);
            success++;
            continue;
          }
        } catch {}
      }
      
      const result = await downloadImage(page, mapping, outputPath);
      
      if (result) {
        success++;
      } else {
        failed++;
        failedItems.push(mapping);
      }
      
      // Delay between downloads
      await delay(CONFIG.delayMs);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('  SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Total: ${toDownload.length}`);
    console.log(`  ✅ Success: ${success}`);
    console.log(`  ❌ Failed: ${failed}`);
    
    if (failedItems.length > 0) {
      const failedPath = join(process.cwd(), 'tmp/image-repair', 'failed-playwright.json');
      writeFileSync(failedPath, JSON.stringify(failedItems, null, 2));
      console.log(`\n  Failed items saved: ${failedPath}`);
    }
    
    if (success > 0) {
      console.log('\n  ✅ Next step: Upload to Bunny CDN');
      console.log('     npx tsx scripts/upload-collab-images.ts');
    }
    
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
