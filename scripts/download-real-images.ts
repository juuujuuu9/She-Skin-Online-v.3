#!/usr/bin/env -S npx tsx
/**
 * Download SheSkin audio cover images from WordPress
 * 
 * Problem: WordPress attachment URLs are HTML pages, not direct image files.
 * Solution: Fetch each attachment page and extract the actual image src.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const MAPPINGS_FILE = '/Users/user/Downloads/all-featured-mappings.csv';
const IMAGES_FILE = '/Users/user/Downloads/all-images.json';
const POSTS_FILE = '/Users/user/Downloads/audio-posts.json';
const OUTPUT_DIR = '/Users/user/Development/sheskin/repo/public/audio-covers';

interface ImageEntry {
  ID: number;
  url: string;
}

interface PostEntry {
  ID: number;
  post_title: string;
  post_content: string;
  post_name?: string;
}

interface FeaturedMapping {
  postId: number;
  thumbnailId: number;
}

/**
 * Parse the featured mappings CSV
 */
async function parseMappings(): Promise<FeaturedMapping[]> {
  const content = await fs.readFile(MAPPINGS_FILE, 'utf-8');
  const lines = content.trim().split('\n');
  
  const mappings: FeaturedMapping[] = [];
  for (const line of lines) {
    const [postId, thumbnailId] = line.split(',').map(s => parseInt(s.trim(), 10));
    if (postId && thumbnailId) {
      mappings.push({ postId, thumbnailId });
    }
  }
  
  return mappings;
}

/**
 * Load the images JSON
 */
async function loadImages(): Promise<Map<number, string>> {
  const content = await fs.readFile(IMAGES_FILE, 'utf-8');
  const images: ImageEntry[] = JSON.parse(content);
  
  const map = new Map<number, string>();
  for (const img of images) {
    map.set(img.ID, img.url);
  }
  
  return map;
}

/**
 * Load the posts JSON and extract slugs
 */
async function loadPosts(): Promise<Map<number, { title: string; slug: string }>> {
  const content = await fs.readFile(POSTS_FILE, 'utf-8');
  // Parse TSV format (ID	post_title	post_content)
  const lines = content.trim().split('\n');
  
  // Skip header
  const map = new Map<number, { title: string; slug: string }>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Split by tab, handling empty fields
    const parts = line.split('\t');
    const id = parseInt(parts[0]?.trim(), 10);
    const title = parts[1]?.trim() || '';
    
    if (id && title) {
      // Generate slug from title: lowercase, replace spaces/special chars with hyphens
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
      
      map.set(id, { title, slug });
    }
  }
  
  return map;
}

/**
 * Extract the actual image URL from a WordPress attachment page
 */
async function extractImageUrl(attachmentUrl: string): Promise<string | null> {
  try {
    console.log(`  Fetching attachment page: ${attachmentUrl}`);
    const response = await fetch(attachmentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.error(`  Failed to fetch ${attachmentUrl}: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    
    // Try multiple patterns to find the actual image URL
    // Pattern 1: Look for <img> with data-src or src containing wp-content/uploads
    const imgMatch = html.match(/<img[^>]+(?:data-src|src)="(https:\/\/www\.sheskin\.org\/wp-content\/uploads\/[^"]+)"/);
    if (imgMatch) {
      console.log(`  Found image via wp-content/uploads pattern: ${imgMatch[1]}`);
      return imgMatch[1];
    }
    
    // Pattern 2: Look for any image URL in the page
    const anyImgMatch = html.match(/src="(https:\/\/www\.sheskin\.org\/[^"]+\.(?:jpg|jpeg|png|gif|webp))"/i);
    if (anyImgMatch) {
      console.log(`  Found image via general pattern: ${anyImgMatch[1]}`);
      return anyImgMatch[1];
    }
    
    // Pattern 3: Look for attachment URL pattern in the HTML
    const attachmentMatch = html.match(/href="(https:\/\/www\.sheskin\.org\/[^"]+\.(?:jpg|jpeg|png|gif|webp))"/i);
    if (attachmentMatch) {
      console.log(`  Found image via href pattern: ${attachmentMatch[1]}`);
      return attachmentMatch[1];
    }
    
    // Pattern 4: Try WordPress JSON API endpoint
    const apiMatch = html.match(/"url":"(https:\/\/www\.sheskin\.org\/[^"]+\.(?:jpg|jpeg|png|gif|webp))"/i);
    if (apiMatch) {
      console.log(`  Found image via JSON pattern: ${apiMatch[1]}`);
      return apiMatch[1].replace(/\\/g, '');
    }
    
    console.error(`  Could not extract image URL from ${attachmentUrl}`);
    return null;
  } catch (error) {
    console.error(`  Error extracting image URL: ${error}`);
    return null;
  }
}

/**
 * Download an image and save it to the output directory
 */
async function downloadImage(imageUrl: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`  Downloading image: ${imageUrl}`);
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.error(`  Failed to download ${imageUrl}: ${response.status}`);
      return false;
    }
    
    // Verify it's an image
    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      console.error(`  Not an image! Content-Type: ${contentType}`);
      return false;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, buffer);
    console.log(`  Saved to ${outputPath} (${buffer.length} bytes)`);
    return true;
  } catch (error) {
    console.error(`  Error downloading image: ${error}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('=== SheSkin Audio Cover Image Downloader ===\n');
  
  // Load data
  console.log('Loading data files...');
  const mappings = await parseMappings();
  const imagesMap = await loadImages();
  const postsMap = await loadPosts();
  
  console.log(`Loaded ${mappings.length} featured mappings`);
  console.log(`Loaded ${imagesMap.size} image entries`);
  console.log(`Loaded ${postsMap.size} posts\n`);
  
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  
  let successCount = 0;
  let failCount = 0;
  const failedMappings: FeaturedMapping[] = [];
  
  // Process each mapping
  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    console.log(`\n[${i + 1}/${mappings.length}] Processing post ${mapping.postId} (thumbnail: ${mapping.thumbnailId})`);
    
    // Get post info
    const post = postsMap.get(mapping.postId);
    if (!post) {
      console.error(`  Post ${mapping.postId} not found in posts data`);
      failCount++;
      failedMappings.push(mapping);
      continue;
    }
    console.log(`  Title: ${post.title}`);
    console.log(`  Slug: ${post.slug}`);
    
    // Get attachment URL
    const attachmentUrl = imagesMap.get(mapping.thumbnailId);
    if (!attachmentUrl) {
      console.error(`  Thumbnail ${mapping.thumbnailId} not found in images data`);
      failCount++;
      failedMappings.push(mapping);
      continue;
    }
    
    // Extract actual image URL from attachment page
    const imageUrl = await extractImageUrl(attachmentUrl);
    if (!imageUrl) {
      console.error(`  Could not extract image URL from ${attachmentUrl}`);
      failCount++;
      failedMappings.push(mapping);
      continue;
    }
    
    // Determine file extension
    const ext = imageUrl.split('?')[0].match(/\.([a-zA-Z0-9]+)$/)?.[1] || 'jpg';
    const outputPath = path.join(OUTPUT_DIR, `${post.slug}.${ext}`);
    
    // Download the image
    const success = await downloadImage(imageUrl, outputPath);
    if (success) {
      successCount++;
    } else {
      failCount++;
      failedMappings.push(mapping);
    }
    
    // Small delay to be polite
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Summary
  console.log(`\n=== Summary ===`);
  console.log(`Total: ${mappings.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  
  if (failedMappings.length > 0) {
    console.log(`\nFailed mappings (post_id,thumbnail_id):`);
    for (const m of failedMappings) {
      console.log(`  ${m.postId},${m.thumbnailId}`);
    }
    
    // Save failed mappings for retry
    const failedCsv = failedMappings.map(m => `${m.postId},${m.thumbnailId}`).join('\n');
    await fs.writeFile(path.join(OUTPUT_DIR, '..', 'failed-mappings.csv'), failedCsv);
    console.log(`\nFailed mappings saved to failed-mappings.csv`);
  }
}

main().catch(console.error);
