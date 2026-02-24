#!/usr/bin/env node
/**
 * Download SheSkin audio cover images from WordPress
 * 
 * Parses audio posts and attachments, downloads cover images,
 * and saves them with post slug filenames.
 */

import { promises as fs } from 'fs';
import * as path from 'path';

// Configuration
const CONFIG = {
  postsFile: '/Users/user/Downloads/audio-posts.json',
  imagesFile: '/Users/user/Downloads/all-images.json',
  outputDir: '/Users/user/Development/sheskin/repo/public/audio-covers',
  mappingFile: '/Users/user/Development/sheskin/repo/public/audio-covers-mapping.json',
  delayMs: 500, // Delay between downloads to be respectful
};

// Types
interface AudioPost {
  ID: string;
  post_title: string;
  post_content: string;
}

interface Attachment {
  ID: number;
  url: string;
}

interface DownloadResult {
  slug: string;
  originalUrl: string;
  localFilename: string;
  success: boolean;
  error?: string;
}

interface SlugMapping {
  [slug: string]: string;
}

/**
 * Parse TSV content into array of objects
 */
function parseTSV(content: string): AudioPost[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split('\t').map(h => h.trim());
  const posts: AudioPost[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const post: any = {};
    headers.forEach((header, index) => {
      post[header] = values[index]?.trim() || '';
    });
    posts.push(post as AudioPost);
  }
  
  return posts;
}

/**
 * Extract slug from attachment URL
 * Pattern: /audio/POST-SLUG/...
 */
function extractSlugFromUrl(url: string): string | null {
  // Match the pattern /audio/SLUG/ followed by anything
  const match = url.match(/\/audio\/([^\/]+)\//);
  return match ? match[1] : null;
}

/**
 * Get file extension from URL
 */
function getFileExtension(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    return match ? `.${match[1].toLowerCase()}` : '.jpg';
  } catch {
    return '.jpg';
  }
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

/**
 * Download an image with retry logic
 */
async function downloadImage(url: string, outputPath: string, retries = 3): Promise<void> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const buffer = await response.arrayBuffer();
      await fs.writeFile(outputPath, Buffer.from(buffer));
      return;
      
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries) {
        const delay = attempt * 1000;
        console.log(`  ⚠️  Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  throw lastError || new Error('Download failed after retries');
}

/**
 * Get the actual image URL from WordPress attachment URL
 * WordPress attachment pages often need to be resolved to the actual image
 */
async function resolveImageUrl(url: string): Promise<string> {
  // If URL ends with a slug (no file extension), it's likely an attachment page
  // Try to fetch it and extract the actual image URL, or append common image patterns
  if (!url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
    // Common WordPress patterns for attachment images
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    return `${baseUrl}/`;
  }
  return url;
}

/**
 * Main function
 */
async function main() {
  console.log('🎵 SheSkin Audio Cover Image Downloader\n');
  
  try {
    // Read and parse input files
    console.log('📖 Reading input files...');
    
    const postsContent = await fs.readFile(CONFIG.postsFile, 'utf-8');
    const posts = parseTSV(postsContent);
    console.log(`  ✓ Loaded ${posts.length} audio posts`);
    
    const imagesContent = await fs.readFile(CONFIG.imagesFile, 'utf-8');
    const attachments: Attachment[] = JSON.parse(imagesContent);
    console.log(`  ✓ Loaded ${attachments.length} attachments`);
    
    // Create a map of post slugs to post data for reference
    const postSlugMap = new Map<string, AudioPost>();
    for (const post of posts) {
      // Generate slug from post_title similar to WordPress logic
      const generatedSlug = post.post_title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      postSlugMap.set(generatedSlug, post);
    }
    
    // Extract audio cover images (attachments with /audio/ in URL)
    const audioAttachments = attachments.filter(att => {
      const slug = extractSlugFromUrl(att.url);
      return slug !== null;
    });
    
    console.log(`\n🎯 Found ${audioAttachments.length} audio cover images to download`);
    
    // Ensure output directory exists
    await ensureDir(CONFIG.outputDir);
    
    // Download images
    const results: DownloadResult[] = [];
    const mapping: SlugMapping = {};
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < audioAttachments.length; i++) {
      const attachment = audioAttachments[i];
      const slug = extractSlugFromUrl(attachment.url)!;
      
      console.log(`\n[${i + 1}/${audioAttachments.length}] Processing: ${slug}`);
      console.log(`  URL: ${attachment.url}`);
      
      // Determine filename
      const ext = getFileExtension(attachment.url) || '.jpg';
      const filename = `${slug}${ext}`;
      const outputPath = path.join(CONFIG.outputDir, filename);
      
      try {
        // Resolve the actual image URL
        const resolvedUrl = await resolveImageUrl(attachment.url);
        
        // Download the image
        await downloadImage(resolvedUrl, outputPath);
        
        // Verify the file was created and has content
        const stats = await fs.stat(outputPath);
        if (stats.size === 0) {
          throw new Error('Downloaded file is empty');
        }
        
        console.log(`  ✅ Downloaded: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);
        
        results.push({
          slug,
          originalUrl: attachment.url,
          localFilename: filename,
          success: true,
        });
        mapping[slug] = filename;
        successCount++;
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`  ❌ Failed: ${errorMsg}`);
        
        results.push({
          slug,
          originalUrl: attachment.url,
          localFilename: filename,
          success: false,
          error: errorMsg,
        });
        failCount++;
      }
      
      // Add delay between downloads
      if (i < audioAttachments.length - 1) {
        await new Promise(r => setTimeout(r, CONFIG.delayMs));
      }
    }
    
    // Save mapping file
    await fs.writeFile(
      CONFIG.mappingFile,
      JSON.stringify(mapping, null, 2),
      'utf-8'
    );
    console.log(`\n📝 Saved mapping file: ${CONFIG.mappingFile}`);
    
    // Save detailed results
    const resultsFile = path.join(CONFIG.outputDir, 'download-results.json');
    await fs.writeFile(
      resultsFile,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        total: audioAttachments.length,
        success: successCount,
        failed: failCount,
        results,
      }, null, 2),
      'utf-8'
    );
    console.log(`📝 Saved results file: ${resultsFile}`);
    
    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 DOWNLOAD SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total images:     ${audioAttachments.length}`);
    console.log(`✅ Successful:    ${successCount}`);
    console.log(`❌ Failed:        ${failCount}`);
    console.log(`\n📂 Output directory: ${CONFIG.outputDir}`);
    
    if (failCount > 0) {
      console.log('\n⚠️  Failed downloads:');
      results
        .filter(r => !r.success)
        .forEach(r => console.log(`   - ${r.slug}: ${r.error}`));
    }
    
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main();
