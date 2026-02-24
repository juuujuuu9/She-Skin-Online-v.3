#!/usr/bin/env node
/**
 * Download missing SheSkin audio cover images using featured image mappings
 * 
 * Data sources:
 * 1. featured-mappings.csv - post_id,thumbnail_id pairs
 * 2. all-images.json - attachment_id → image_url mappings  
 * 3. audio-posts.json - post_id → post data (for slug extraction)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const FEATURED_MAPPINGS_PATH = '/Users/user/Downloads/featured-mappings.csv';
const ALL_IMAGES_PATH = '/Users/user/Downloads/all-images.json';
const AUDIO_POSTS_PATH = '/Users/user/Downloads/audio-posts.json';
const OUTPUT_DIR = '/Users/user/Development/sheskin/repo/public/audio-covers';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Created output directory: ${OUTPUT_DIR}`);
}

// Read and parse featured-mappings.csv
function loadFeaturedMappings(): Map<number, number> {
  const content = fs.readFileSync(FEATURED_MAPPINGS_PATH, 'utf-8');
  const lines = content.trim().split('\n');
  const mappings = new Map<number, number>();
  
  for (const line of lines) {
    const [postId, thumbnailId] = line.trim().split(',').map(s => parseInt(s.trim(), 10));
    if (!isNaN(postId) && !isNaN(thumbnailId)) {
      mappings.set(postId, thumbnailId);
    }
  }
  
  console.log(`Loaded ${mappings.size} featured image mappings`);
  return mappings;
}

// Read and parse all-images.json
function loadAllImages(): Map<number, string> {
  const content = fs.readFileSync(ALL_IMAGES_PATH, 'utf-8');
  const images = JSON.parse(content);
  const imageMap = new Map<number, string>();
  
  for (const img of images) {
    if (img.ID && img.url) {
      imageMap.set(img.ID, img.url);
    }
  }
  
  console.log(`Loaded ${imageMap.size} image URLs`);
  return imageMap;
}

// Extract slug from WordPress-style URL
function extractSlugFromUrl(url: string): string | null {
  // Try to extract the slug from URLs like:
  // https://www.sheskin.org/audio/she_skin-smiled-009-never-2far_along/
  // https://www.sheskin.org/audio/dnshe_v-4/
  
  const match = url.match(/\/audio\/([^/]+)\//);
  if (match) {
    return match[1];
  }
  
  // Try other patterns
  const altMatch = url.match(/sheskin\.org\/(?:[^/]+\/)?([^/]+)\/$/);
  if (altMatch) {
    return altMatch[1];
  }
  
  return null;
}

// Read and parse audio-posts.json
function loadAudioPosts(): Map<number, { title: string; slug: string | null }> {
  const content = fs.readFileSync(AUDIO_POSTS_PATH, 'utf-8');
  const lines = content.trim().split('\n');
  const posts = new Map<number, { title: string; slug: string | null }>();
  
  // Skip header line if present
  let startIdx = 0;
  if (lines[0].startsWith('ID') || lines[0].startsWith('id')) {
    startIdx = 1;
  }
  
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    // Split by tab character (TSV format)
    const parts = line.split('\t');
    if (parts.length >= 2) {
      const postId = parseInt(parts[0].trim(), 10);
      const title = parts[1].trim();
      
      if (!isNaN(postId) && title) {
        // Extract slug from title or URL
        let slug: string | null = null;
        
        // Try to create a slug from the title
        // Look for URLs in the content that might give us the slug
        const contentParts = parts.slice(2).join('\t');
        const urlMatch = contentParts.match(/https?:\/\/[^\s\n]+/);
        if (urlMatch) {
          slug = extractSlugFromUrl(urlMatch[0]);
        }
        
        // If no slug from URL, create from title
        if (!slug && title) {
          slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        }
        
        posts.set(postId, { title, slug });
      }
    }
  }
  
  console.log(`Loaded ${posts.size} audio posts`);
  return posts;
}

// Check if file already exists
function fileExists(slug: string): boolean {
  const filepath = path.join(OUTPUT_DIR, `${slug}.jpg`);
  return fs.existsSync(filepath);
}

// Download image from URL
async function downloadImage(url: string, slug: string): Promise<boolean> {
  const filepath = path.join(OUTPUT_DIR, `${slug}.jpg`);
  
  try {
    // First, fetch the URL which may redirect to the actual image
    const response = await fetch(url, { 
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.error(`  ❌ Failed to fetch ${url}: ${response.status}`);
      return false;
    }
    
    // Get the final URL after redirects
    const finalUrl = response.url;
    
    // If it's a WordPress attachment URL, we need to get the direct image URL
    let imageUrl = finalUrl;
    
    if (finalUrl.includes('?attachment_id=') || !finalUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      // This is likely a WordPress attachment page, need to fetch it and extract image
      const html = await response.text();
      
      // Try to find the actual image URL in the HTML
      const imgMatch = html.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif))[^"']*["']/i);
      if (imgMatch) {
        imageUrl = imgMatch[1];
      } else {
        // Try og:image meta tag
        const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (ogMatch) {
          imageUrl = ogMatch[1];
        }
      }
    }
    
    // Download the actual image
    const imgResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (!imgResponse.ok) {
      console.error(`  ❌ Failed to download image from ${imageUrl}: ${imgResponse.status}`);
      return false;
    }
    
    const buffer = Buffer.from(await imgResponse.arrayBuffer());
    fs.writeFileSync(filepath, buffer);
    
    return true;
  } catch (error) {
    console.error(`  ❌ Error downloading ${url}: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

// Main function
async function main() {
  console.log('🎵 SheSkin Missing Cover Image Downloader');
  console.log('=========================================\n');
  
  // Load all data
  const featuredMappings = loadFeaturedMappings();
  const imageMap = loadAllImages();
  const audioPosts = loadAudioPosts();
  
  console.log('');
  
  // Track results
  let total = 0;
  let alreadyExists = 0;
  let downloaded = 0;
  let failed = 0;
  let skippedNoImage = 0;
  let skippedNoSlug = 0;
  
  const failedItems: Array<{ postId: number; reason: string }> = [];
  
  // Process each featured mapping
  for (const [postId, thumbnailId] of featuredMappings) {
    total++;
    
    // Get the post info
    const post = audioPosts.get(postId);
    if (!post) {
      console.log(`⚠️  Post ${postId}: Not found in audio-posts.json`);
      skippedNoSlug++;
      failedItems.push({ postId, reason: 'Post not found' });
      continue;
    }
    
    if (!post.slug) {
      console.log(`⚠️  Post ${postId}: Could not extract slug from "${post.title}"`);
      skippedNoSlug++;
      failedItems.push({ postId, reason: 'No slug' });
      continue;
    }
    
    // Check if already downloaded
    if (fileExists(post.slug)) {
      console.log(`⏭️  ${post.slug}: Already exists`);
      alreadyExists++;
      continue;
    }
    
    // Get the image URL
    const imageUrl = imageMap.get(thumbnailId);
    if (!imageUrl) {
      console.log(`⚠️  ${post.slug}: No image URL for thumbnail ${thumbnailId}`);
      skippedNoImage++;
      failedItems.push({ postId, reason: `No image for thumbnail ${thumbnailId}` });
      continue;
    }
    
    // Download the image
    console.log(`⬇️  ${post.slug}: Downloading from ${imageUrl.substring(0, 60)}...`);
    
    const success = await downloadImage(imageUrl, post.slug);
    
    if (success) {
      console.log(`  ✅ Downloaded successfully`);
      downloaded++;
    } else {
      console.log(`  ❌ Download failed`);
      failed++;
      failedItems.push({ postId, reason: 'Download failed' });
    }
    
    // Small delay to be nice to the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Print summary
  console.log('\n=========================================');
  console.log('📊 DOWNLOAD SUMMARY');
  console.log('=========================================');
  console.log(`Total mappings processed: ${total}`);
  console.log(`✅ Newly downloaded:     ${downloaded}`);
  console.log(`⏭️  Already existed:      ${alreadyExists}`);
  console.log(`⚠️  No image URL:         ${skippedNoImage}`);
  console.log(`⚠️  No slug found:        ${skippedNoSlug}`);
  console.log(`❌ Failed downloads:      ${failed}`);
  console.log('=========================================\n');
  
  if (failedItems.length > 0 && failedItems.length <= 20) {
    console.log('Failed items:');
    for (const item of failedItems) {
      console.log(`  - Post ${item.postId}: ${item.reason}`);
    }
  }
  
  console.log(`\n💾 Output directory: ${OUTPUT_DIR}`);
}

main().catch(console.error);
