#!/usr/bin/env tsx
/**
 * Diagnose Image Issues - Media Gallery & Collaborations
 * 
 * This script checks:
 * 1. Media gallery items - are URLs valid Bunny CDN URLs?
 * 2. Collaborations - which ones have images vs missing images?
 * 3. Work media entries - are they properly linked?
 */

import { db } from '../src/lib/db/index.js';
import { media, works, workMedia } from '../src/lib/db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = process.cwd();

interface DiagnosisResult {
  mediaGallery: {
    total: number;
    validUrls: number;
    brokenUrls: number;
    missingVariants: number;
    issues: Array<{ id: string; filename: string; url: string; issue: string }>;
  };
  collaborations: {
    total: number;
    withImages: number;
    withoutImages: number;
    withBunnyCdnImages: number;
    withOldUrls: number;
    issues: Array<{ id: string; title: string; slug: string; issue: string; mediaCount: number; url?: string }>;
  };
  wpCollabsAvailable: number;
  wpCollabsWithFeaturedImages: number;
  wpCollabsWithContentImages: number;
}

async function diagnoseMediaGallery(): Promise<DiagnosisResult['mediaGallery']> {
  console.log('\n🔍 Checking Media Gallery...\n');
  
  const allMedia = await db.select().from(media).where(isNull(media.deletedAt));
  
  const issues: DiagnosisResult['mediaGallery']['issues'] = [];
  let validUrls = 0;
  let brokenUrls = 0;
  let missingVariants = 0;
  
  for (const item of allMedia) {
    const isBunnyUrl = item.url?.includes('b-cdn.net');
    const hasVariants = item.variants && typeof item.variants === 'object' && Object.keys(item.variants).length > 0;
    
    if (!isBunnyUrl) {
      brokenUrls++;
      issues.push({
        id: item.id,
        filename: item.filename,
        url: item.url || 'null',
        issue: 'URL is not a Bunny CDN URL',
      });
    } else {
      validUrls++;
    }
    
    if (!hasVariants && item.mediaType === 'image') {
      missingVariants++;
      if (isBunnyUrl) {
        issues.push({
          id: item.id,
          filename: item.filename,
          url: item.url,
          issue: 'Missing image variants (sm, md, lg)',
        });
      }
    }
  }
  
  console.log(`  Total media items: ${allMedia.length}`);
  console.log(`  ✅ Valid Bunny CDN URLs: ${validUrls}`);
  console.log(`  ❌ Broken/other URLs: ${brokenUrls}`);
  console.log(`  ⚠️  Missing variants: ${missingVariants}`);
  
  return {
    total: allMedia.length,
    validUrls,
    brokenUrls,
    missingVariants,
    issues,
  };
}

async function diagnoseCollaborations(): Promise<DiagnosisResult['collaborations']> {
  console.log('\n🔍 Checking Collaborations...\n');
  
  const collabWorks = await db.query.works.findMany({
    where: and(
      eq(works.category, 'collaborations'),
      eq(works.published, true),
      isNull(works.deletedAt)
    ),
    with: {
      media: true,
    },
  });
  
  const issues: DiagnosisResult['collaborations']['issues'] = [];
  let withImages = 0;
  let withoutImages = 0;
  let withBunnyCdnImages = 0;
  let withOldUrls = 0;
  
  for (const work of collabWorks) {
    const hasMedia = work.media && work.media.length > 0;
    const mediaUrl = hasMedia ? work.media[0].url : null;
    const isBunnyUrl = mediaUrl?.includes('b-cdn.net');
    
    if (hasMedia && isBunnyUrl) {
      withImages++;
      withBunnyCdnImages++;
    } else if (hasMedia) {
      withImages++;
      withOldUrls++;
      issues.push({
        id: work.id,
        title: work.title,
        slug: work.slug,
        issue: 'Has old/broken image URL',
        mediaCount: work.media.length,
        url: mediaUrl || undefined,
      });
    } else {
      withoutImages++;
      issues.push({
        id: work.id,
        title: work.title,
        slug: work.slug,
        issue: 'NO MEDIA - needs image import',
        mediaCount: 0,
      });
    }
  }
  
  console.log(`  Total collaborations: ${collabWorks.length}`);
  console.log(`  ✅ With Bunny CDN images: ${withBunnyCdnImages}`);
  console.log(`  ⚠️  With old/broken URLs: ${withOldUrls}`);
  console.log(`  ❌ Without any images: ${withoutImages}`);
  
  return {
    total: collabWorks.length,
    withImages,
    withoutImages,
    withBunnyCdnImages,
    withOldUrls,
    issues,
  };
}

async function checkWordPressCollabs(): Promise<{ available: number; withFeaturedImages: number; withContentImages: number }> {
  console.log('\n🔍 Checking WordPress Export Data...\n');
  
  try {
    const collabsPath = join(ROOT_DIR, 'public/audio-covers/wp-collabs-posts.json');
    const collabs = JSON.parse(readFileSync(collabsPath, 'utf-8'));
    
    let withFeaturedImages = 0;
    let withContentImages = 0;
    
    for (const post of collabs) {
      if (post.featured_image_url) {
        withFeaturedImages++;
      }
      
      // Check for images in content
      const imgMatch = post.content?.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
      if (imgMatch) {
        withContentImages++;
      }
    }
    
    console.log(`  Total WP collaborations: ${collabs.length}`);
    console.log(`  With featured images: ${withFeaturedImages}`);
    console.log(`  With content images: ${withContentImages}`);
    
    return {
      available: collabs.length,
      withFeaturedImages,
      withContentImages,
    };
  } catch (error) {
    console.log('  ❌ Could not read wp-collabs-posts.json');
    return { available: 0, withFeaturedImages: 0, withContentImages: 0 };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  IMAGE ISSUES DIAGNOSIS');
  console.log('='.repeat(70));
  
  const result: DiagnosisResult = {
    mediaGallery: await diagnoseMediaGallery(),
    collaborations: await diagnoseCollaborations(),
    wpCollabsAvailable: 0,
    wpCollabsWithFeaturedImages: 0,
    wpCollabsWithContentImages: 0,
  };
  
  const wpStats = await checkWordPressCollabs();
  result.wpCollabsAvailable = wpStats.available;
  result.wpCollabsWithFeaturedImages = wpStats.withFeaturedImages;
  result.wpCollabsWithContentImages = wpStats.withContentImages;
  
  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  
  console.log('\n📸 Media Gallery:');
  if (result.mediaGallery.brokenUrls === 0 && result.mediaGallery.missingVariants === 0) {
    console.log('  ✅ All media items look good!');
  } else {
    console.log(`  ❌ ${result.mediaGallery.brokenUrls} items with broken URLs`);
    console.log(`  ⚠️  ${result.mediaGallery.missingVariants} items missing variants`);
  }
  
  console.log('\n🤝 Collaborations:');
  if (result.collaborations.withoutImages === 0 && result.collaborations.withOldUrls === 0) {
    console.log('  ✅ All collaborations have Bunny CDN images!');
  } else {
    console.log(`  ❌ ${result.collaborations.withoutImages} collaborations need images imported`);
    console.log(`  ⚠️  ${result.collaborations.withOldUrls} collaborations have old/broken URLs`);
    console.log(`  📦 ${result.wpCollabsWithContentImages} images available in WordPress export`);
  }
  
  // Print detailed issues
  if (result.collaborations.issues.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('  COLLABORATIONS NEEDING ATTENTION');
    console.log('='.repeat(70));
    
    result.collaborations.issues.forEach((issue, i) => {
      console.log(`\n  ${i + 1}. ${issue.title}`);
      console.log(`     Slug: ${issue.slug}`);
      console.log(`     Issue: ${issue.issue}`);
      if (issue.url) {
        console.log(`     Current URL: ${issue.url.substring(0, 80)}${issue.url.length > 80 ? '...' : ''}`);
      }
    });
  }
  
  // Save detailed report
  const reportPath = join(ROOT_DIR, 'tmp', 'image-diagnosis-report.json');
  try {
    const fs = await import('fs');
    if (!fs.existsSync(join(ROOT_DIR, 'tmp'))) {
      fs.mkdirSync(join(ROOT_DIR, 'tmp'));
    }
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
    console.log(`\n📝 Detailed report saved to: ${reportPath}`);
  } catch {
    // Ignore write errors
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('  NEXT STEPS');
  console.log('='.repeat(70));
  
  if (result.collaborations.withoutImages > 0) {
    console.log('\n1. Run the import script for missing collaboration images:');
    console.log('   npx tsx scripts/import-all-works.ts --start-from=collaborations');
  }
  
  if (result.collaborations.withOldUrls > 0) {
    console.log('\n2. Fix collaborations with old URLs - need to re-upload images');
  }
  
  if (result.mediaGallery.brokenUrls > 0) {
    console.log('\n3. Fix media gallery items with broken URLs');
  }
  
  console.log('\n');
}

main().catch(console.error);
