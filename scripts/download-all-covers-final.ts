#!/usr/bin/env tsx
/**
 * Download ALL 85 SheSkin audio covers using WordPress featured image mappings
 * 
 * Input files:
 * - /Users/user/Downloads/all-featured-mappings.csv (post_id,thumbnail_id)
 * - /Users/user/Downloads/all-images.json (attachment_id → image_url)
 * - /Users/user/Downloads/audio-posts.json (post info with titles/slugs)
 * 
 * Output:
 * - Images saved to: /Users/user/Development/sheskin/repo/public/audio-covers/POST-SLUG.jpg
 * - Mapping file: cover-mappings-final.json
 */

import * as fs from 'fs';
import * as path from 'path';

const MAPPINGS_CSV = '/Users/user/Downloads/all-featured-mappings.csv';
const IMAGES_JSON = '/Users/user/Downloads/all-images.json';
const POSTS_JSON = '/Users/user/Downloads/audio-posts.json';
const OUTPUT_DIR = '/Users/user/Development/sheskin/repo/public/audio-covers';
const MAPPING_OUTPUT = '/Users/user/Development/sheskin/repo/scripts/cover-mappings-final.json';

// Types
interface ImageMapping {
  ID: number;
  url: string;
}

interface PostInfo {
  ID: number;
  post_title: string;
  post_content: string;
  post_name?: string;
}

interface CoverMapping {
  postId: number;
  thumbnailId: number;
  postTitle: string;
  postSlug: string;
  imageUrl: string;
  localPath: string;
  status: 'downloaded' | 'failed' | 'skipped';
  error?: string;
}

// Parse CSV (post_id,thumbnail_id pairs)
function parseCSV(content: string): Array<{ postId: number; thumbnailId: number }> {
  const lines = content.trim().split('\n');
  const mappings: Array<{ postId: number; thumbnailId: number }> = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [postId, thumbnailId] = trimmed.split(',').map(v => parseInt(v.trim(), 10));
    if (!isNaN(postId) && !isNaN(thumbnailId)) {
      mappings.push({ postId, thumbnailId });
    }
  }
  
  return mappings;
}

// Parse TSV (audio-posts.json is actually TSV format)
function parseTSV(content: string): PostInfo[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split('\t').map(h => h.trim());
  const posts: PostInfo[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split('\t');
    const post: any = {};
    
    headers.forEach((header, index) => {
      const value = values[index]?.trim() || '';
      if (header === 'ID') {
        post[header] = parseInt(value, 10) || 0;
      } else {
        post[header] = value;
      }
    });
    
    if (post.ID) {
      posts.push(post as PostInfo);
    }
  }
  
  return posts;
}

// Generate slug from post title (WordPress-style)
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

// Download image from URL
async function downloadImage(url: string, outputPath: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  console.log('🎵 SheSkin Cover Image Downloader - FINAL');
  console.log('=' .repeat(50));
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Created output directory: ${OUTPUT_DIR}`);
  }
  
  // Read and parse input files
  console.log('\n📂 Reading input files...');
  
  const csvContent = fs.readFileSync(MAPPINGS_CSV, 'utf-8');
  const featuredMappings = parseCSV(csvContent);
  console.log(`   ✓ CSV mappings: ${featuredMappings.length} entries`);
  
  const imagesContent = fs.readFileSync(IMAGES_JSON, 'utf-8');
  const imagesData: ImageMapping[] = JSON.parse(imagesContent);
  console.log(`   ✓ Images data: ${imagesData.length} entries`);
  
  const postsContent = fs.readFileSync(POSTS_JSON, 'utf-8');
  const postsData = parseTSV(postsContent);
  console.log(`   ✓ Posts data: ${postsData.length} entries`);
  
  // Build lookup maps
  const imageUrlMap = new Map<number, string>();
  for (const img of imagesData) {
    imageUrlMap.set(img.ID, img.url);
  }
  
  const postMap = new Map<number, PostInfo>();
  for (const post of postsData) {
    postMap.set(post.ID, post);
  }
  
  // Count existing images before download
  const existingFilesBefore = fs.existsSync(OUTPUT_DIR) 
    ? fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')).length 
    : 0;
  
  // Process each mapping
  console.log('\n⬇️  Downloading cover images...\n');
  
  const results: CoverMapping[] = [];
  let downloadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  for (let i = 0; i < featuredMappings.length; i++) {
    const { postId, thumbnailId } = featuredMappings[i];
    const post = postMap.get(postId);
    const imageUrl = imageUrlMap.get(thumbnailId);
    
    const progress = `[${i + 1}/${featuredMappings.length}]`;
    
    if (!post) {
      console.log(`${progress} ⚠️  Post ${postId} not found`);
      results.push({
        postId,
        thumbnailId,
        postTitle: 'Unknown',
        postSlug: 'unknown',
        imageUrl: imageUrl || 'unknown',
        localPath: '',
        status: 'failed',
        error: 'Post not found'
      });
      failedCount++;
      continue;
    }
    
    if (!imageUrl) {
      console.log(`${progress} ⚠️  Image ${thumbnailId} not found for "${post.post_title}"`);
      results.push({
        postId,
        thumbnailId,
        postTitle: post.post_title,
        postSlug: generateSlug(post.post_title),
        imageUrl: 'unknown',
        localPath: '',
        status: 'failed',
        error: 'Image URL not found'
      });
      failedCount++;
      continue;
    }
    
    // Generate filename from post title
    const slug = generateSlug(post.post_title);
    const ext = imageUrl.match(/\.(jpg|jpeg|png|gif|webp)(?:\?|$)/i)?.[1] || 'jpg';
    const filename = `${slug}.${ext}`;
    const outputPath = path.join(OUTPUT_DIR, filename);
    
    // Check if already exists
    if (fs.existsSync(outputPath)) {
      console.log(`${progress} ⏭️  Already exists: ${filename}`);
      results.push({
        postId,
        thumbnailId,
        postTitle: post.post_title,
        postSlug: slug,
        imageUrl,
        localPath: outputPath,
        status: 'skipped'
      });
      skippedCount++;
      continue;
    }
    
    // Download the image
    const success = await downloadImage(imageUrl, outputPath);
    
    if (success) {
      console.log(`${progress} ✅ Downloaded: ${filename}`);
      results.push({
        postId,
        thumbnailId,
        postTitle: post.post_title,
        postSlug: slug,
        imageUrl,
        localPath: outputPath,
        status: 'downloaded'
      });
      downloadedCount++;
    } else {
      console.log(`${progress} ❌ Failed: ${filename}`);
      results.push({
        postId,
        thumbnailId,
        postTitle: post.post_title,
        postSlug: slug,
        imageUrl,
        localPath: '',
        status: 'failed',
        error: 'Download failed'
      });
      failedCount++;
    }
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Count total images after download
  const totalImagesNow = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')).length;
  
  // Save mapping file
  fs.writeFileSync(MAPPING_OUTPUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalMappings: results.length,
    downloaded: downloadedCount,
    skipped: skippedCount,
    failed: failedCount,
    totalImagesInFolder: totalImagesNow,
    mappings: results
  }, null, 2));
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ NEW images downloaded: ${downloadedCount}`);
  console.log(`⏭️  Already existed (skipped): ${skippedCount}`);
  console.log(`❌ Failed: ${failedCount}`);
  console.log(`📁 Total images in folder: ${totalImagesNow}`);
  console.log(`\n📝 Mapping file saved to: ${MAPPING_OUTPUT}`);
  
  if (failedCount > 0) {
    console.log('\n⚠️  Failed downloads:');
    results.filter(r => r.status === 'failed').forEach(r => {
      console.log(`   - Post ${r.postId}: ${r.error}`);
    });
  }
}

main().catch(console.error);
