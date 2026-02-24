#!/usr/bin/env tsx
/**
 * Extract Image URLs from Collaboration Posts
 * 
 * Parses wp-collabs-posts.json to extract all image URLs from content
 * and creates a mapping of slugs to their image URLs
 * 
 * Usage:
 *   npx tsx scripts/extract-collab-images.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface CollabPost {
  id: number;
  title: string;
  slug: string;
  content: string;
  featured_image_id: number | null;
}

interface ImageMapping {
  slug: string;
  title: string;
  wpPostId: number;
  imageUrl: string | null;
  allImageUrls: string[];
  hasFeaturedImage: boolean;
}

function extractImageUrls(content: string): string[] {
  const urls: string[] = [];
  
  // Match src attributes in img tags
  const imgRegex = /<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
  let match;
  
  while ((match = imgRegex.exec(content)) !== null) {
    urls.push(match[1]);
  }
  
  // Also look for href links that might be images
  const hrefRegex = /<a[^>]+href=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|gif|webp))["'][^>]*>/gi;
  while ((match = hrefRegex.exec(content)) !== null) {
    if (!urls.includes(match[1])) {
      urls.push(match[1]);
    }
  }
  
  return urls;
}

function main() {
  console.log('='.repeat(70));
  console.log('  EXTRACT COLLABORATION IMAGE URLs');
  console.log('='.repeat(70));
  
  // Load the JSON file
  const jsonPath = join(process.cwd(), 'public/audio-covers/wp-collabs-posts.json');
  const posts: CollabPost[] = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  
  console.log(`\nLoaded ${posts.length} collaboration posts\n`);
  
  const mappings: ImageMapping[] = [];
  let withImages = 0;
  let withoutImages = 0;
  
  for (const post of posts) {
    const imageUrls = extractImageUrls(post.content);
    const primaryImage = imageUrls[0] || null;
    
    if (primaryImage) {
      withImages++;
    } else {
      withoutImages++;
    }
    
    mappings.push({
      slug: post.slug,
      title: post.title,
      wpPostId: post.id,
      imageUrl: primaryImage,
      allImageUrls: imageUrls,
      hasFeaturedImage: post.featured_image_id !== null,
    });
  }
  
  // Save full mapping
  const outputPath = join(process.cwd(), 'tmp/image-repair', 'collab-image-mapping.json');
  writeFileSync(outputPath, JSON.stringify(mappings, null, 2));
  console.log(`✅ Full mapping saved: ${outputPath}`);
  
  // Create CSV for easy viewing
  const csvLines = ['slug,title,imageUrl,hasFeaturedImage'];
  for (const m of mappings) {
    const safeTitle = `"${m.title.replace(/"/g, '""')}"`;
    const url = m.imageUrl || '';
    csvLines.push(`${m.slug},${safeTitle},${url},${m.hasFeaturedImage}`);
  }
  const csvPath = join(process.cwd(), 'tmp/image-repair', 'collab-image-mapping.csv');
  writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`✅ CSV saved: ${csvPath}`);
  
  // Create download list (only posts with images)
  const withImagesList = mappings.filter(m => m.imageUrl);
  const downloadListPath = join(process.cwd(), 'tmp/image-repair', 'collab-download-list.txt');
  const downloadLines = withImagesList.map(m => `${m.slug}|${m.title}|${m.imageUrl}`);
  writeFileSync(downloadListPath, downloadLines.join('\n'));
  console.log(`✅ Download list saved: ${downloadListPath}`);
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total posts: ${posts.length}`);
  console.log(`  ✅ With images in content: ${withImages}`);
  console.log(`  ❌ Without images: ${withoutImages}`);
  console.log(`  📌 With featured_image_id: ${mappings.filter(m => m.hasFeaturedImage).length}`);
  
  // Show sample
  console.log('\n  Sample mappings:');
  for (let i = 0; i < Math.min(5, withImagesList.length); i++) {
    const m = withImagesList[i];
    console.log(`    ${i + 1}. ${m.title}`);
    console.log(`       ${m.imageUrl?.substring(0, 70)}...`);
  }
  
  // Posts without images
  if (withoutImages > 0) {
    console.log(`\n  ⚠️  Posts without images (${withoutImages}):`);
    const without = mappings.filter(m => !m.imageUrl).slice(0, 5);
    for (const m of without) {
      console.log(`    - ${m.title}`);
    }
    if (withoutImages > 5) {
      console.log(`    ... and ${withoutImages - 5} more`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('  NEXT STEPS');
  console.log('='.repeat(70));
  console.log('  1. Review the mapping files in tmp/image-repair/');
  console.log('  2. Download images from WordPress (manual or browser)');
  console.log('  3. Run: npx tsx scripts/upload-collab-images.ts');
  console.log('');
}

main();
