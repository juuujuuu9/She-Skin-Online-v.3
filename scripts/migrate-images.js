#!/usr/bin/env node
/**
 * Image Migration Script — WordPress → Bunny.net CDN
 * 
 * Downloads images from WordPress URLs, processes them,
 * and prepares for upload to Bunny.net CDN.
 * 
 * Usage:
 *   node scripts/migrate-images.js --source collaborations
 *   node scripts/migrate-images.js --download-only
 *   node scripts/migrate-images.js --process-only
 */

import { config } from 'dotenv';
import { promises as fs } from 'fs';
import { join, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Load env
config({ path: join(__dirname, '../.env') });

// Parse command line args
const args = process.argv.slice(2);
const downloadOnly = args.includes('--download-only');
const processOnly = args.includes('--process-only');
const sourceArg = args.find(arg => arg.startsWith('--source='))?.split('=')[1] || 'collaborations';

// Paths
const TMP_DIR = join(ROOT_DIR, 'tmp', 'image-migration');
const OUTPUT_DIR = join(TMP_DIR, 'processed');

/**
 * Download an image from URL
 */
async function downloadImage(url, outputPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    
    client.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        downloadImage(res.headers.location, outputPath)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        await fs.writeFile(outputPath, buffer);
        resolve({ path: outputPath, size: buffer.length, mimeType: res.headers['content-type'] });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Generate safe filename from URL
 */
function getSafeFilename(url) {
  const base = basename(new URL(url).pathname);
  const name = base.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
  // Remove WordPress size suffix (-1024x768) to get base name
  return name.replace(/-\d+x\d+\.(jpg|jpeg|png|webp)$/i, '.$1');
}

/**
 * Check if sharp is available
 */
async function checkSharp() {
  try {
    const sharp = await import('sharp');
    return sharp.default;
  } catch {
    return null;
  }
}

/**
 * Process image with Sharp (if available)
 */
async function processImage(inputPath, outputDir, filename) {
  const sharp = await checkSharp();
  
  if (!sharp) {
    console.log('⚠️  Sharp not installed. Run: npm install sharp blurhash');
    console.log('   Copying original file without processing...');
    const outputPath = join(outputDir, filename);
    await fs.copyFile(inputPath, outputPath);
    return [{ path: outputPath, width: null, size: (await fs.stat(inputPath)).size }];
  }
  
  const sizes = [
    { suffix: 'sm', width: 640 },
    { suffix: 'md', width: 1024 },
    { suffix: 'lg', width: 1920 },
  ];
  
  const results = [];
  const baseName = filename.replace(extname(filename), '');
  
  for (const { suffix, width } of sizes) {
    const outputPath = join(outputDir, `${baseName}-${suffix}.webp`);
    
    try {
      await sharp(inputPath)
        .resize(width, null, { 
          withoutEnlargement: true,
          fit: 'inside',
        })
        .webp({ 
          quality: 85,
          effort: 4, // Balance speed vs compression
        })
        .toFile(outputPath);
      
      const stats = await fs.stat(outputPath);
      results.push({
        suffix,
        path: outputPath,
        width,
        size: stats.size,
      });
      
      console.log(`  ✓ ${suffix}: ${(stats.size / 1024).toFixed(1)}KB`);
    } catch (err) {
      console.error(`  ✗ Failed to create ${suffix}:`, err.message);
    }
  }
  
  return results;
}

/**
 * Generate blurhash (if blurhash package available)
 */
async function generateBlurhash(imagePath) {
  try {
    const { encode } = await import('blurhash');
    const sharp = await checkSharp();
    if (!sharp) return null;
    
    const { data, info } = await sharp(imagePath)
      .resize(32, 32, { fit: 'fill' })
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    
    return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
  } catch {
    return null;
  }
}

/**
 * Get dominant color
 */
async function getDominantColor(imagePath) {
  try {
    const sharp = await checkSharp();
    if (!sharp) return '#f0f0f0';
    
    const { dominant } = await sharp(imagePath).stats();
    
    const { r, g, b } = dominant;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return '#f0f0f0';
  }
}

/**
 * Migrate collaborations images
 */
async function migrateCollaborations() {
  console.log('🎨 Migrating collaborations images...\n');
  
  // Load collaborations data
  const collabPath = join(ROOT_DIR, 'src', 'data', 'collaborations.json');
  const collaborations = JSON.parse(await fs.readFile(collabPath, 'utf-8'));
  
  // Ensure directories exist
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(join(OUTPUT_DIR, 'collaborations'), { recursive: true });
  
  const wpImages = collaborations.filter(item => 
    item.image?.src?.includes('sheskin.org') && item.image?.src?.includes('wp-content')
  );
  
  console.log(`Found ${wpImages.length} WordPress images to migrate\n`);
  
  const migrated = [];
  const errors = [];
  
  for (let i = 0; i < wpImages.length; i++) {
    const item = wpImages[i];
    const url = item.image.src;
    const filename = getSafeFilename(url);
    
    console.log(`[${i + 1}/${wpImages.length}] ${item.title?.substring(0, 50) || 'Untitled'}...`);
    
    try {
      // Download
      const downloadPath = join(TMP_DIR, filename);
      console.log(`  Downloading...`);
      const downloadInfo = await downloadImage(url, downloadPath);
      console.log(`  ✓ Downloaded: ${(downloadInfo.size / 1024).toFixed(1)}KB`);
      
      if (downloadOnly) {
        migrated.push({ item, downloadPath, filename });
        continue;
      }
      
      // Process
      console.log(`  Processing...`);
      const variants = await processImage(
        downloadPath,
        join(OUTPUT_DIR, 'collaborations'),
        filename
      );
      
      // Generate metadata
      const blurhash = await generateBlurhash(downloadPath);
      const dominantColor = await getDominantColor(downloadPath);
      
      // Prepare CDN paths (these would be uploaded to Bunny)
      const baseName = filename.replace(extname(filename), '');
      const cdnBase = `https://sheskin.b-cdn.net/collaborations/${baseName}`;
      
      migrated.push({
        original: item,
        filename: baseName,
        variants: variants.map(v => ({
          suffix: v.suffix,
          cdnUrl: `${cdnBase}-${v.suffix}.webp`,
          width: v.width,
          size: v.size,
        })),
        blurhash,
        dominantColor,
        originalSize: downloadInfo.size,
        totalProcessedSize: variants.reduce((sum, v) => sum + v.size, 0),
      });
      
      console.log(`  ✓ Complete\n`);
      
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}\n`);
      errors.push({ item, error: err.message });
    }
  }
  
  // Save migration report
  const reportPath = join(TMP_DIR, 'migration-report.json');
  await fs.writeFile(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    total: wpImages.length,
    succeeded: migrated.length,
    failed: errors.length,
    items: migrated,
    errors,
  }, null, 2));
  
  console.log('\n📊 Migration Summary');
  console.log('═'.repeat(50));
  console.log(`Total images:    ${wpImages.length}`);
  console.log(`Successful:      ${migrated.length}`);
  console.log(`Failed:          ${errors.length}`);
  
  if (migrated.length > 0) {
    const totalOriginal = migrated.reduce((sum, m) => sum + (m.originalSize || 0), 0);
    const totalProcessed = migrated.reduce((sum, m) => sum + (m.totalProcessedSize || 0), 0);
    const savings = ((1 - totalProcessed / totalOriginal) * 100).toFixed(1);
    
    console.log(`\n💾 Size Comparison`);
    console.log(`Original total:   ${(totalOriginal / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Processed total:  ${(totalProcessed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Savings:          ${savings}%`);
  }
  
  console.log(`\n📁 Report saved: ${reportPath}`);
  
  if (!downloadOnly && migrated.length > 0) {
    console.log('\n📤 Next steps:');
    console.log('1. Upload processed images to Bunny.net (path: collaborations/):');
    console.log(`   ${OUTPUT_DIR}/collaborations/`);
    console.log('2. Run: node scripts/migrate-images.js --update-json');
    console.log('3. Test the collaborations page');
  }
  
  return { migrated, errors };
}

/**
 * Update collaborations.json with CDN URLs
 */
async function updateCollaborationsJson() {
  const reportPath = join(TMP_DIR, 'migration-report.json');
  
  let report;
  try {
    report = JSON.parse(await fs.readFile(reportPath, 'utf-8'));
  } catch {
    console.error('❌ No migration report found. Run migration first.');
    process.exit(1);
  }
  
  const collabPath = join(ROOT_DIR, 'src', 'data', 'collaborations.json');
  const collaborations = JSON.parse(await fs.readFile(collabPath, 'utf-8'));
  
  console.log('📝 Updating collaborations.json...\n');
  
  for (const migration of report.items) {
    const item = collaborations.find(c => c.slug === migration.original.slug);
    if (!item) continue;
    
    // Update to CDN URL with variants
    const mdVariant = migration.variants.find(v => v.suffix === 'md');
    item.image.src = mdVariant?.cdnUrl || migration.variants[0]?.cdnUrl;
    
    // Add variant info if using Lightning components
    item.image.variants = {
      sm: { url: migration.variants.find(v => v.suffix === 'sm')?.cdnUrl, width: 640 },
      md: { url: migration.variants.find(v => v.suffix === 'md')?.cdnUrl, width: 1024 },
      lg: { url: migration.variants.find(v => v.suffix === 'lg')?.cdnUrl, width: 1920 },
    };
    item.image.blurhash = migration.blurhash;
    item.image.dominantColor = migration.dominantColor;
    
    console.log(`✓ Updated: ${item.title?.substring(0, 40) || 'Untitled'}...`);
  }
  
  // Backup original
  const backupPath = join(ROOT_DIR, 'src', 'data', 'collaborations.json.backup');
  await fs.copyFile(collabPath, backupPath);
  console.log(`\n💾 Backup saved: ${backupPath}`);
  
  // Save updated
  await fs.writeFile(collabPath, JSON.stringify(collaborations, null, 2));
  console.log(`✅ Updated: ${collabPath}`);
}

// Main
async function main() {
  console.log('🚀 she_skin Image Migration Tool\n');
  
  if (args.includes('--help')) {
    console.log('Usage:');
    console.log('  node scripts/migrate-images.js --source=collaborations');
    console.log('  node scripts/migrate-images.js --download-only');
    console.log('  node scripts/migrate-images.js --update-json');
    console.log('\nOptions:');
    console.log('  --source=NAME     Source to migrate (default: collaborations)');
    console.log('  --download-only   Just download, don\'t process');
    console.log('  --update-json     Update collaborations.json with CDN URLs');
    process.exit(0);
  }
  
  if (args.includes('--update-json')) {
    await updateCollaborationsJson();
    return;
  }
  
  if (sourceArg === 'collaborations') {
    await migrateCollaborations();
  } else {
    console.error(`❌ Unknown source: ${sourceArg}`);
    console.log('Available: collaborations');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
