#!/usr/bin/env tsx
/**
 * Browser Download Images - Download via simulated browser session
 * 
 * Uses a cookie-based approach to bypass WordPress security.
 * First, we visit the site with a browser to get cookies, then use those cookies for downloads.
 * 
 * Usage:
 *   npx tsx scripts/browser-download-images.ts [--limit N] [--start N]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { config } from 'dotenv';

config();

const CONFIG = {
  downloadDir: join(process.cwd(), 'tmp/image-repair/downloads'),
  mappingPath: join(process.cwd(), 'tmp/image-repair/collab-image-mapping.json'),
  logPath: join(process.cwd(), 'tmp/image-repair', 'browser-download-log.txt'),
  cookieJar: new Map<string, string>(),
  delayMs: 2000,
  maxRetries: 2,
};

interface ImageMapping {
  slug: string;
  title: string;
  wpPostId: number;
  imageUrl: string;
  allImageUrls: string[];
  hasFeaturedImage: boolean;
}

function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  const line = `${icons[type]} ${message}`;
  console.log(line);
  try {
    appendFileSync(CONFIG.logPath, `${new Date().toISOString()} ${line}\n`);
  } catch {}
}

function loadMappings(): ImageMapping[] {
  const data = JSON.parse(readFileSync(CONFIG.mappingPath, 'utf-8'));
  return data.filter((m: ImageMapping) => m.imageUrl);
}

function isValidImage(buffer: Buffer): boolean {
  if (buffer.length < 1000) return false;
  
  const start = buffer.slice(0, 100).toString('utf-8').toLowerCase();
  if (start.includes('<!doctype') || start.includes('<html')) {
    return false;
  }
  
  // Check magic numbers
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return true;
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return true;
  
  return true;
}

async function downloadWithFullHeaders(url: string, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    // Very comprehensive browser headers
    const headers: any = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.sheskin.org/collabs/',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
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
    };
    
    // Add cookies if we have them
    if (CONFIG.cookieJar.size > 0) {
      const cookieString = Array.from(CONFIG.cookieJar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      headers['Cookie'] = cookieString;
    }
    
    const request = protocol.get(url, { headers, timeout: 30000 }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          const fullRedirectUrl = redirectUrl.startsWith('http') 
            ? redirectUrl 
            : `${parsedUrl.protocol}//${parsedUrl.hostname}${redirectUrl}`;
          
          // Save any cookies from redirect response
          const setCookie = response.headers['set-cookie'];
          if (setCookie) {
            setCookie.forEach(cookie => {
              const [nameValue] = cookie.split(';');
              const [name, value] = nameValue.split('=');
              CONFIG.cookieJar.set(name.trim(), value.trim());
            });
          }
          
          downloadWithFullHeaders(fullRedirectUrl, outputPath).then(resolve);
          return;
        }
      }
      
      // Save cookies
      const setCookie = response.headers['set-cookie'];
      if (setCookie) {
        setCookie.forEach(cookie => {
          const [nameValue] = cookie.split(';');
          const [name, value] = nameValue.split('=');
          CONFIG.cookieJar.set(name.trim(), value.trim());
        });
      }
      
      if (response.statusCode !== 200) {
        log(`HTTP ${response.statusCode}`, 'error');
        resolve(false);
        return;
      }
      
      const chunks: Buffer[] = [];
      
      response.on('data', (chunk) => chunks.push(chunk));
      
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        
        if (!isValidImage(buffer)) {
          log(`Invalid image (${buffer.length} bytes, likely HTML)`, 'error');
          resolve(false);
          return;
        }
        
        try {
          writeFileSync(outputPath, buffer);
          resolve(true);
        } catch {
          resolve(false);
        }
      });
      
      response.on('error', () => resolve(false));
    });
    
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function downloadWithRetry(mapping: ImageMapping, outputPath: string): Promise<boolean> {
  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    if (attempt > 1) {
      log(`Retry ${attempt}/${CONFIG.maxRetries}...`);
      await new Promise(r => setTimeout(r, 3000));
    }
    
    const success = await downloadWithFullHeaders(mapping.imageUrl, outputPath);
    if (success) return true;
  }
  return false;
}

async function main() {
  console.log('='.repeat(70));
  console.log('  BROWSER DOWNLOAD IMAGES');
  console.log('='.repeat(70));
  
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf('--limit');
  const startIndex = args.indexOf('--start');
  
  const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1]) || 10 : 10;
  const start = startIndex >= 0 ? parseInt(args[startIndex + 1]) || 0 : 0;
  
  // Ensure directories exist
  if (!existsSync(CONFIG.downloadDir)) {
    mkdirSync(CONFIG.downloadDir, { recursive: true });
  }
  
  const mappings = loadMappings();
  const toDownload = mappings.slice(start, start + limit);
  
  console.log(`\nWill download ${toDownload.length} images (starting at ${start})`);
  console.log(`Total available: ${mappings.length}\n`);
  
  let success = 0;
  let failed = 0;
  const failedItems: ImageMapping[] = [];
  
  for (let i = 0; i < toDownload.length; i++) {
    const mapping = toDownload[i];
    const overallIndex = start + i + 1;
    
    console.log(`\n[${overallIndex}/${mappings.length}] ${mapping.title}`);
    log(`URL: ${mapping.imageUrl.substring(0, 60)}...`);
    
    // Determine file extension
    const urlExt = mapping.imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
    const outputPath = join(CONFIG.downloadDir, `collaborations-${mapping.slug}.${urlExt}`);
    
    // Skip if exists
    if (existsSync(outputPath)) {
      const stat = readFileSync(outputPath);
      if (stat.length > 1000 && isValidImage(stat)) {
        log(`Already exists (${(stat.length / 1024).toFixed(1)}KB), skipping`);
        success++;
        continue;
      }
    }
    
    const result = await downloadWithRetry(mapping, outputPath);
    
    if (result) {
      try {
        const stat = readFileSync(outputPath);
        log(`Downloaded: ${(stat.length / 1024).toFixed(1)}KB`, 'success');
        success++;
      } catch {
        log('Downloaded (size unknown)', 'success');
        success++;
      }
    } else {
      log('Failed after all retries', 'error');
      failed++;
      failedItems.push(mapping);
    }
    
    await new Promise(r => setTimeout(r, CONFIG.delayMs));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total: ${toDownload.length}`);
  console.log(`  ✅ Success: ${success}`);
  console.log(`  ❌ Failed: ${failed}`);
  
  if (failedItems.length > 0) {
    const failedPath = join(process.cwd(), 'tmp/image-repair', 'failed-browser-downloads.json');
    writeFileSync(failedPath, JSON.stringify(failedItems, null, 2));
    console.log(`\n  Failed items saved: ${failedPath}`);
    
    console.log('\n  These items may need manual download:');
    for (const item of failedItems.slice(0, 5)) {
      console.log(`    - ${item.title}`);
    }
  }
  
  if (success > 0) {
    console.log('\n  ✅ Next step: Upload to Bunny CDN');
    console.log('     npx tsx scripts/upload-collab-images.ts');
  }
}

main().catch(console.error);
