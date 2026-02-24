#!/usr/bin/env tsx
/**
 * Diagnose Broken Images in SheSkin Database
 * 
 * This script checks all work images to see which ones are broken
 * without making any changes.
 * 
 * Usage: npx tsx scripts/diagnose-images.ts [--category=digital|collaborations|physical]
 */

import { db } from '../src/lib/db/index.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CONFIG = {
  reportFile: './tmp/diagnose-images-report.json',
};

async function checkImageUrl(url: string): Promise<{ 
  isValid: boolean; 
  contentType?: string; 
  size?: number;
  isHtml?: boolean;
}> {
  try {
    const response = await fetch(url, { 
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      return { isValid: false };
    }
    
    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');
    const size = contentLength ? parseInt(contentLength) : 0;
    
    // Check if it's an HTML page (broken)
    if (contentType.includes('text/html')) {
      return { isValid: false, contentType, size, isHtml: true };
    }
    
    // Check if it's an image
    if (!contentType.startsWith('image/')) {
      return { isValid: false, contentType, size };
    }
    
    // Check file size (if too small, likely broken)
    if (size < 1000) { // Less than 1KB is suspicious
      return { isValid: false, contentType, size };
    }
    
    return { isValid: true, contentType, size };
  } catch (error) {
    return { isValid: false };
  }
}

async function main() {
  console.log('🔍 SheSkin Images Diagnosis\n');
  console.log('='.repeat(60));
  
  const categoryFilter = process.argv.find(arg => arg.startsWith('--category='))?.split('=')[1];
  
  // Get all works with media
  console.log('Fetching works from database...');
  const allWorks = await db.query.works.findMany({
    with: {
      media: true,
    },
  });
  
  console.log(`Found ${allWorks.length} total works`);
  
  let worksToCheck = allWorks;
  if (categoryFilter) {
    worksToCheck = allWorks.filter(w => w.category === categoryFilter);
    console.log(`Filtered to ${worksToCheck.length} works in category: ${categoryFilter}`);
  }
  
  // Check each work's image
  const results = {
    total: worksToCheck.length,
    withImages: 0,
    withoutImages: 0,
    validImages: 0,
    brokenImages: 0,
    brokenDetails: [] as any[],
    validDetails: [] as any[],
  };
  
  for (let i = 0; i < worksToCheck.length; i++) {
    const work = worksToCheck[i];
    const primaryMedia = work.media?.find(m => m.isPrimary) || work.media?.[0];
    
    process.stdout.write(`\r[${i + 1}/${worksToCheck.length}] Checking ${work.slug}...            `);
    
    if (!primaryMedia) {
      results.withoutImages++;
      continue;
    }
    
    results.withImages++;
    const checkResult = await checkImageUrl(primaryMedia.url);
    
    if (checkResult.isValid) {
      results.validImages++;
      results.validDetails.push({
        id: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        url: primaryMedia.url,
        contentType: checkResult.contentType,
        size: checkResult.size,
      });
    } else {
      results.brokenImages++;
      results.brokenDetails.push({
        id: work.id,
        slug: work.slug,
        title: work.title,
        category: work.category,
        url: primaryMedia.url,
        contentType: checkResult.contentType,
        size: checkResult.size,
        isHtml: checkResult.isHtml,
      });
    }
  }
  
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 DIAGNOSIS SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total works: ${results.total}`);
  console.log(`With images: ${results.withImages}`);
  console.log(`Without images: ${results.withoutImages}`);
  console.log(`✅ Valid images: ${results.validImages}`);
  console.log(`❌ Broken images: ${results.brokenImages}`);
  
  if (results.brokenImages > 0) {
    console.log('\n❌ Broken Images by Category:');
    const byCategory = results.brokenDetails.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    for (const [cat, count] of Object.entries(byCategory)) {
      console.log(`  ${cat}: ${count}`);
    }
    
    console.log('\n❌ Sample Broken URLs (first 10):');
    results.brokenDetails.slice(0, 10).forEach(item => {
      console.log(`  - ${item.slug}`);
      console.log(`    URL: ${item.url}`);
      console.log(`    Type: ${item.isHtml ? 'HTML (captcha)' : item.contentType || 'unknown'}, Size: ${item.size} bytes`);
    });
  }
  
  // Save full report
  writeFileSync(CONFIG.reportFile, JSON.stringify(results, null, 2));
  console.log(`\nFull report saved to: ${CONFIG.reportFile}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
