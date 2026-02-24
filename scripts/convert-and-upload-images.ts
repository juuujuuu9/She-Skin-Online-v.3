#!/usr/bin/env tsx
/**
 * Convert JPG audio cover images to WebP and upload to Bunny CDN
 * 
 * Usage:
 *   npx tsx scripts/convert-and-upload-images.ts
 * 
 * This script:
 * 1. Reads the existing mapping file (slug -> local JPG filename)
 * 2. Converts each JPG to WebP using sharp
 * 3. Uploads WebP files to Bunny CDN (media/audio-covers/)
 * 4. Creates a new mapping file: slug -> CDN URL
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import sharpModule from 'sharp';
import { config } from 'dotenv';

const sharp = sharpModule;

// Load environment variables
config({ path: '.env' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Input
  inputDir: './public/audio-covers',
  inputMappingFile: './public/audio-covers-mapping.json',
  
  // Output
  outputMappingFile: './public/audio-covers-cdn-mapping.json',
  
  // Bunny CDN
  bunnyStorageKey: process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY || '',
  bunnyStorageZone: process.env.BUNNY_STORAGE_ZONE || 'she-skin',
  bunnyStorageEndpoint: process.env.BUNNY_STORAGE_ENDPOINT || 'ny.storage.bunnycdn.com',
  bunnyCdnUrl: process.env.BUNNY_CDN_URL || 'https://she-skin.b-cdn.net',
  bunnyBasePath: 'media/audio-covers',
  
  // Image processing
  webpQuality: 85,
  maxWidth: 1200,
};

// ============================================================================
// TYPES
// ============================================================================

interface InputMapping {
  [slug: string]: string; // slug -> local filename (e.g., "19817.jpg")
}

interface CdnMappingEntry {
  slug: string;
  localFilename: string;
  localPath: string;
  cdnUrl: string;
  bunnyPath: string;
  originalSize: number;
  webpSize: number;
  compressionRatio: number;
  success: boolean;
  error?: string;
}

interface CdnMapping {
  generatedAt: string;
  totalFiles: number;
  successful: number;
  failed: number;
  totalOriginalBytes: number;
  totalWebpBytes: number;
  entries: CdnMappingEntry[];
  slugToUrl: { [slug: string]: string }; // Quick lookup map
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Calculate string similarity (0-1) using Levenshtein distance
 */
function stringSimilarity(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;
  
  const distance = levenshteinDistance(a, b);
  return (len - distance) / len;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Normalize a filename for comparison (remove extensions, normalize separators)
 */
function normalizeFilename(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.(jpg|jpeg|png|gif|webp)$/i, '')
    .replace(/[_-]+/g, '')  // Remove all separators
    .replace(/\s+/g, '');   // Remove spaces
}

// Manual mappings for files with significantly different names
const MANUAL_FILE_MAPPINGS: Record<string, string> = {
  'emergency-xoxo-013-never-2far_along-mt1-stream.jpg': 'she-skin-emergency-xoxo-013-never-2far-along-mt1-stream.jpg',
  'hernbean5150-wsb-unreleased.jpg': 'hernbean5150-wsb-winter-so-blu-unreleased-tracks.jpg',
  'el-oh-vee-mursik.jpg': 'el-oh-v-ee-mursik-mt1-stream.jpg',
  'diesel-d-total-control-freestyle.jpg': 'diesel-d-total-control-freestyle-dnshe-s1.png',
};

/**
 * Find a file with flexible matching to handle:
 * 1. Exact match
 * 2. Underscore/dash mismatches
 * 3. Case-insensitive match
 * 4. Different extensions (.png vs .jpg)
 * 5. Fuzzy name matching (for similar but not exact names)
 * 6. Manual mappings for edge cases
 */
async function findFileFlexible(dir: string, filename: string): Promise<string | null> {
  const fs = await import('fs/promises');
  const { join, extname, basename } = await import('path');
  
  // Check manual mappings first
  if (MANUAL_FILE_MAPPINGS[filename]) {
    const manualPath = join(dir, MANUAL_FILE_MAPPINGS[filename]);
    try {
      await fs.access(manualPath);
      return MANUAL_FILE_MAPPINGS[filename];
    } catch {
      // Manual mapping file doesn't exist, continue with other methods
    }
  }
  
  const baseName = basename(filename, extname(filename));
  const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  
  // Helper to try a specific filename
  const tryFile = async (name: string): Promise<string | null> => {
    try {
      await fs.access(join(dir, name));
      return name;
    } catch {
      return null;
    }
  };
  
  // Generate variants to try
  const variants: string[] = [];
  
  // Original filename
  variants.push(filename);
  
  // Underscores to dashes
  const withDashes = filename.replace(/_/g, '-');
  if (withDashes !== filename) variants.push(withDashes);
  
  // Dashes to underscores  
  const withUnderscores = filename.replace(/-/g, '_');
  if (withUnderscores !== filename) variants.push(withUnderscores);
  
  // Different extensions with original base
  const currentExt = extname(filename).toLowerCase();
  for (const ext of extensions) {
    if (ext !== currentExt) {
      variants.push(`${baseName}${ext}`);
      // Also with dash/underscore variants for different extensions
      if (withDashes !== filename) {
        const baseWithDashes = basename(withDashes, extname(withDashes));
        variants.push(`${baseWithDashes}${ext}`);
      }
      if (withUnderscores !== filename) {
        const baseWithUnderscores = basename(withUnderscores, extname(withUnderscores));
        variants.push(`${baseWithUnderscores}${ext}`);
      }
    }
  }
  
  // Try all variants
  for (const variant of variants) {
    const found = await tryFile(variant);
    if (found) return found;
  }
  
  // Case-insensitive directory scan
  try {
    const files = await fs.readdir(dir);
    const lowerVariants = variants.map(v => v.toLowerCase());
    
    for (const file of files) {
      const lowerFile = file.toLowerCase();
      if (lowerVariants.includes(lowerFile)) {
        return file;
      }
    }
    
    // Fuzzy matching: find best match by normalized similarity
    const targetNormalized = normalizeFilename(filename);
    let bestMatch: string | null = null;
    let bestScore = 0;
    const SIMILARITY_THRESHOLD = 0.85; // 85% similarity required
    
    for (const file of files) {
      // Skip non-image files
      if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(file)) continue;
      
      const fileNormalized = normalizeFilename(file);
      const similarity = stringSimilarity(targetNormalized, fileNormalized);
      
      if (similarity > bestScore && similarity >= SIMILARITY_THRESHOLD) {
        bestScore = similarity;
        bestMatch = file;
      }
    }
    
    if (bestMatch) {
      return bestMatch;
    }
  } catch {
    // Directory read failed
  }
  
  return null;
}

function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
  };
  return mimeTypes[ext] || 'image/jpeg';
}

async function uploadToBunny(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const { bunnyStorageKey, bunnyStorageEndpoint, bunnyStorageZone, bunnyCdnUrl, bunnyBasePath } = CONFIG;
  
  if (!bunnyStorageKey) {
    throw new Error('BUNNY_STORAGE_PASSWORD or BUNNY_API_KEY not set in environment');
  }
  
  const bunnyPath = `${bunnyBasePath}/${filename}`;
  const uploadUrl = `https://${bunnyStorageEndpoint}/${bunnyStorageZone}/${bunnyPath}`;
  
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'AccessKey': bunnyStorageKey,
      'Content-Type': contentType,
    },
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bunny.net upload failed: ${response.status} ${errorText}`);
  }

  // Build CDN URL
  const cleanCdnUrl = bunnyCdnUrl.endsWith('/') ? bunnyCdnUrl.slice(0, -1) : bunnyCdnUrl;
  return `${cleanCdnUrl}/${bunnyPath}`;
}

async function convertToWebP(inputPath: string): Promise<{ buffer: Buffer; size: number }> {
  const buffer = await sharp(inputPath)
    .resize(CONFIG.maxWidth, undefined, { 
      withoutEnlargement: true,
      fit: 'inside'
    })
    .webp({
      quality: CONFIG.webpQuality,
      effort: 6,
      smartSubsample: true,
    })
    .toBuffer();
  
  return { buffer, size: buffer.length };
}

async function getFileSize(filePath: string): Promise<number> {
  const fs = await import('fs/promises');
  const stats = await fs.stat(filePath);
  return stats.size;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🎵 Audio Cover Image Converter & Uploader\n');
  console.log('=' .repeat(60));
  
  // Validate config
  if (!CONFIG.bunnyStorageKey) {
    console.error('❌ Error: BUNNY_STORAGE_PASSWORD or BUNNY_API_KEY not found in .env');
    process.exit(1);
  }
  
  try {
    // Read input mapping file
    console.log('\n📖 Reading input mapping file...');
    const inputMappingContent = await readFile(CONFIG.inputMappingFile, 'utf-8');
    const inputMapping: InputMapping = JSON.parse(inputMappingContent);
    const slugs = Object.keys(inputMapping);
    console.log(`  ✓ Found ${slugs.length} entries in mapping file`);
    
    // Verify input directory exists
    const fs = await import('fs/promises');
    try {
      await fs.access(CONFIG.inputDir);
    } catch {
      console.error(`❌ Error: Input directory not found: ${CONFIG.inputDir}`);
      process.exit(1);
    }
    
    // Process each image
    const entries: CdnMappingEntry[] = [];
    let successful = 0;
    let failed = 0;
    let totalOriginalBytes = 0;
    let totalWebpBytes = 0;
    
    console.log(`\n🔄 Processing ${slugs.length} images...\n`);
    
    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i];
      const mappedFilename = inputMapping[slug];
      
      console.log(`[${i + 1}/${slugs.length}] Processing: ${slug}`);
      console.log(`  Mapped file: ${mappedFilename}`);
      
      try {
        // Find file with flexible matching (handles underscore/dash mismatches)
        const localFilename = await findFileFlexible(CONFIG.inputDir, mappedFilename);
        if (!localFilename) {
          throw new Error(`File not found: ${mappedFilename} (tried exact, dashes, underscores, case-insensitive)`);
        }
        
        if (localFilename !== mappedFilename) {
          console.log(`  ✓ Found as: ${localFilename}`);
        }
        
        const localPath = join(CONFIG.inputDir, localFilename);
        
        // Get original file size
        const originalSize = await getFileSize(localPath);
        totalOriginalBytes += originalSize;
        
        // Convert to WebP
        console.log(`  🔄 Converting to WebP...`);
        const { buffer: webpBuffer, size: webpSize } = await convertToWebP(localPath);
        totalWebpBytes += webpSize;
        
        // Generate WebP filename (replace extension or append .webp)
        const baseName = basename(localFilename, extname(localFilename));
        const webpFilename = `${baseName}.webp`;
        
        // Upload to Bunny CDN
        console.log(`  📤 Uploading to Bunny CDN...`);
        const cdnUrl = await uploadToBunny(webpBuffer, webpFilename, 'image/webp');
        
        const compressionRatio = ((1 - webpSize / originalSize) * 100);
        
        console.log(`  ✅ Uploaded: ${cdnUrl}`);
        console.log(`  📊 Size: ${(originalSize / 1024).toFixed(1)}KB → ${(webpSize / 1024).toFixed(1)}KB (${compressionRatio.toFixed(1)}% smaller)`);
        
        entries.push({
          slug,
          localFilename,
          localPath,
          cdnUrl,
          bunnyPath: `${CONFIG.bunnyBasePath}/${webpFilename}`,
          originalSize,
          webpSize,
          compressionRatio,
          success: true,
        });
        
        successful++;
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`  ❌ Failed: ${errorMsg}`);
        
        entries.push({
          slug,
          localFilename: typeof localFilename !== 'undefined' ? localFilename : mappedFilename,
          localPath: typeof localPath !== 'undefined' ? localPath : join(CONFIG.inputDir, mappedFilename),
          cdnUrl: '',
          bunnyPath: '',
          originalSize: 0,
          webpSize: 0,
          compressionRatio: 0,
          success: false,
          error: errorMsg,
        });
        
        failed++;
      }
      
      console.log(''); // Empty line between entries
    }
    
    // Build slug -> URL mapping
    const slugToUrl: { [slug: string]: string } = {};
    for (const entry of entries) {
      if (entry.success) {
        slugToUrl[entry.slug] = entry.cdnUrl;
      }
    }
    
    // Create output mapping
    const outputMapping: CdnMapping = {
      generatedAt: new Date().toISOString(),
      totalFiles: slugs.length,
      successful,
      failed,
      totalOriginalBytes,
      totalWebpBytes,
      entries,
      slugToUrl,
    };
    
    // Save mapping file
    await writeFile(CONFIG.outputMappingFile, JSON.stringify(outputMapping, null, 2));
    console.log(`📝 Saved CDN mapping to: ${CONFIG.outputMappingFile}`);
    
    // Print summary
    const totalCompression = totalOriginalBytes > 0 
      ? ((1 - totalWebpBytes / totalOriginalBytes) * 100).toFixed(1)
      : '0';
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 CONVERSION & UPLOAD SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total files:      ${slugs.length}`);
    console.log(`✅ Successful:    ${successful}`);
    console.log(`❌ Failed:        ${failed}`);
    console.log(`\nOriginal size:    ${(totalOriginalBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`WebP size:        ${(totalWebpBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Space saved:      ${totalCompression}%`);
    console.log(`\nCDN Base URL:     ${CONFIG.bunnyCdnUrl}`);
    console.log(`Storage Path:     ${CONFIG.bunnyBasePath}`);
    
    if (failed > 0) {
      console.log('\n⚠️  Failed uploads:');
      entries
        .filter(e => !e.success)
        .forEach(e => console.log(`   - ${e.slug}: ${e.error}`));
    }
    
    console.log('\n✅ Done! Run scripts/update-db-images.ts to update the database.');
    
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main();
