#!/usr/bin/env tsx
/**
 * Download Images with Browser Headers
 * 
 * Uses sophisticated headers to bypass WordPress security
 * 
 * Usage:
 *   npx tsx scripts/download-with-browser-headers.ts [--limit N] [--start N]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, createWriteStream } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { promisify } from 'util';
import { pipeline } from 'stream';

config();

const streamPipeline = promisify(pipeline);

const CONFIG = {
  outputDir: join(process.cwd(), 'tmp/image-repair/downloads'),
  manifestPath: join(process.cwd(), 'tmp/image-repair/repair-manifest.json'),
  logPath: join(process.cwd(), 'tmp/image-repair', 'download-log.txt'),
  delayMs: 1500,
  maxRetries: 2,
};

interface RepairItem {
  type: string;
  id: string;
  title: string;
  slug: string;
  category?: string;
  wpImageUrl?: string;
  currentUrl?: string;
}

function log(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌' };
  const line = `${icons[type]} ${message}`;
  console.log(line);
  try {
    appendFileSync(CONFIG.logPath, `${new Date().toISOString()} ${line}\n`);
  } catch {}
}

function isValidImage(buffer: Buffer): boolean {
  if (buffer.length < 100) return false;
  
  const start = buffer.slice(0, 100).toString('utf-8').toLowerCase();
  if (start.includes('<!doctype') || start.includes('<html') || start.includes('<head')) {
    return false;
  }
  
  // Check image magic numbers
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true; // PNG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return true; // JPEG
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return true; // WebP
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return true; // GIF
  
  return true; // Assume valid if not HTML
}

function loadManifest(): RepairItem[] {
  try {
    const manifest = JSON.parse(readFileSync(CONFIG.manifestPath, 'utf-8'));
    return manifest.items.filter((i: RepairItem) => i.wpImageUrl);
  } catch {
    console.error('❌ Could not load repair manifest');
    process.exit(1);
  }
}

function downloadFile(url: string, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.sheskin.org/',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'DNT': '1',
      },
      timeout: 30000,
    };
    
    const request = protocol.request(options, async (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          const fullRedirectUrl = redirectUrl.startsWith('http') 
            ? redirectUrl 
            : `${parsedUrl.protocol}//${parsedUrl.hostname}${redirectUrl}`;
          const result = await downloadFile(fullRedirectUrl, outputPath);
          resolve(result);
          return;
        }
      }
      
      if (response.statusCode !== 200) {
        log(`HTTP ${response.statusCode}`, 'error');
        resolve(false);
        return;
      }
      
      const fileStream = createWriteStream(outputPath);
      
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        
        // Validate the downloaded file
        try {
          const buffer = readFileSync(outputPath);
          
          if (!isValidImage(buffer)) {
            log(`Invalid image (HTML page or too small)`, 'error');
            try { require('fs').unlinkSync(outputPath); } catch {}
            resolve(false);
            return;
          }
          
          resolve(true);
        } catch {
          resolve(false);
        }
      });
      
      fileStream.on('error', () => {
        try { require('fs').unlinkSync(outputPath); } catch {}
        resolve(false);
      });
      
      response.on('error', () => {
        try { require('fs').unlinkSync(outputPath); } catch {}
        resolve(false);
      });
    });
    
    request.on('error', () => {
      resolve(false);
    });
    
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    
    request.end();
  });
}

async function downloadWithRetry(item: RepairItem, outputPath: string): Promise<boolean> {
  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    if (attempt > 1) {
      log(`Retry ${attempt}/${CONFIG.maxRetries}...`);
    }
    
    const success = await downloadFile(item.wpImageUrl!, outputPath);
    if (success) return true;
    
    if (attempt < CONFIG.maxRetries) {
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  }
  return false;
}

async function main() {
  console.log('='.repeat(70));
  console.log('  DOWNLOAD IMAGES WITH ADVANCED HEADERS');
  console.log('='.repeat(70));
  
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf('--limit');
  const startIndex = args.indexOf('--start');
  
  const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1]) || Infinity : 5; // Default to 5 for testing
  const start = startIndex >= 0 ? parseInt(args[startIndex + 1]) || 0 : 0;
  
  // Ensure directories exist
  if (!existsSync(CONFIG.outputDir)) {
    mkdirSync(CONFIG.outputDir, { recursive: true });
  }
  
  const items = loadManifest();
  const itemsToDownload = items.slice(start, start + limit);
  
  console.log(`\nDownloading ${itemsToDownload.length} images (starting from ${start})...`);
  console.log(`Total available: ${items.length}`);
  console.log('');
  
  let success = 0;
  let failed = 0;
  const failedItems: RepairItem[] = [];
  
  for (let i = 0; i < itemsToDownload.length; i++) {
    const item = itemsToDownload[i];
    const overallIndex = start + i + 1;
    
    console.log(`\n[${overallIndex}/${items.length}] ${item.title}`);
    
    const ext = item.wpImageUrl!.split('.').pop()?.split('?')[0] || 'jpg';
    const filename = `${item.category}-${item.slug}.${ext}`;
    const outputPath = join(CONFIG.outputDir, filename);
    
    // Skip if already exists and valid
    if (existsSync(outputPath)) {
      try {
        const stat = readFileSync(outputPath);
        if (stat.length > 1000 && isValidImage(stat)) {
          log(`Already exists (${(stat.length / 1024).toFixed(1)}KB), skipping`);
          success++;
          continue;
        }
      } catch {}
    }
    
    const result = await downloadWithRetry(item, outputPath);
    
    if (result) {
      try {
        const stat = readFileSync(outputPath);
        log(`Downloaded: ${filename} (${(stat.length / 1024).toFixed(1)}KB)`, 'success');
        success++;
      } catch {
        log(`Downloaded: ${filename}`, 'success');
        success++;
      }
    } else {
      log(`Failed: ${filename}`, 'error');
      failed++;
      failedItems.push(item);
    }
    
    // Delay between downloads
    await new Promise(r => setTimeout(r, CONFIG.delayMs));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total: ${itemsToDownload.length}`);
  console.log(`  ✅ Success: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);
  
  if (failedItems.length > 0) {
    const failedPath = join(process.cwd(), 'tmp/image-repair', 'failed-downloads.json');
    writeFileSync(failedPath, JSON.stringify(failedItems, null, 2));
    console.log(`\n  Failed items saved to: ${failedPath}`);
  }
  
  if (success > 0) {
    console.log('\n  ✅ Next step: Upload to Bunny CDN');
    console.log('     npx tsx scripts/upload-downloaded-images.ts');
  }
}

main().catch(console.error);
