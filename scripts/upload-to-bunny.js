#!/usr/bin/env node
/**
 * Upload images to Bunny.net CDN
 * 
 * Usage:
 *   node scripts/upload-to-bunny.js --folder=tmp/image-migration/processed/collaborations --target=collaborations
 *   node scripts/upload-to-bunny.js --file=public/media/digital/artwork.webp --target=digital
 */

import { config } from 'dotenv';
import { readdirSync, statSync, readFileSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Load env
config({ path: join(__dirname, '../.env') });

// Parse args
const args = process.argv.slice(2);
const folderArg = args.find(arg => arg.startsWith('--folder='))?.split('=')[1];
const fileArg = args.find(arg => arg.startsWith('--file='))?.split('=')[1];
const targetArg = args.find(arg => arg.startsWith('--target='))?.split('=')[1] || 'uploads';
const dryRun = args.includes('--dry-run');

if (!folderArg && !fileArg) {
  console.log('🐰 Bunny.net Upload Tool\n');
  console.log('Usage:');
  console.log('  Upload a folder:');
  console.log('    node scripts/upload-to-bunny.js --folder=path/to/images --target=collaborations');
  console.log('\n  Upload a single file:');
  console.log('    node scripts/upload-to-bunny.js --file=path/to/image.webp --target=works');
  console.log('\n  Dry run (show what would be uploaded):');
  console.log('    node scripts/upload-to-bunny.js --folder=path/to/images --target=collaborations --dry-run');
  console.log('\nOptions:');
  console.log('  --folder=PATH    Path to folder containing images');
  console.log('  --file=PATH      Path to single image file');
  console.log('  --target=NAME    Target folder in Bunny storage (default: uploads)');
  console.log('  --dry-run        Show what would be uploaded without actually uploading');
  process.exit(1);
}

console.log('🐰 Bunny.net Upload Tool\n');
console.log('═══════════════════════════════\n');

if (dryRun) {
  console.log('🔍 DRY RUN MODE - No files will be uploaded\n');
}

// Check credentials
const apiKey = process.env.BUNNY_API_KEY;
const storageZone = process.env.BUNNY_STORAGE_ZONE;
const cdnUrl = process.env.BUNNY_CDN_URL;
const storageEndpoint = process.env.BUNNY_STORAGE_ENDPOINT || 'storage.bunnycdn.com';

if (!apiKey || apiKey === 'your-api-key' || apiKey === 'your-actual-api-key-here') {
  console.error('❌ Bunny.net not configured');
  console.log('\nRun: node scripts/test-bunny.js');
  process.exit(1);
}

const supportedFormats = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'];

async function uploadToBunny(file, filename, options = {}) {
  const contentType = options.contentType || 'application/octet-stream';
  const cleanFilename = filename.startsWith('/') ? filename.slice(1) : filename;
  const uploadUrl = `https://${storageEndpoint}/${storageZone}/${cleanFilename}`;
  
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'AccessKey': apiKey,
      'Content-Type': contentType,
    },
    body: file,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} ${errorText}`);
  }

  const encodedPath = cleanFilename.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const cleanCdnUrl = cdnUrl.endsWith('/') ? cdnUrl.slice(0, -1) : cdnUrl;
  return `${cleanCdnUrl}/${encodedPath}`;
}

async function uploadFile(filePath, targetPath) {
  const ext = extname(filePath).toLowerCase();
  if (!supportedFormats.includes(ext)) {
    console.log(`  ⚠️  Skipping unsupported format: ${basename(filePath)}`);
    return null;
  }
  
  const buffer = readFileSync(filePath);
  const filename = join(targetArg, targetPath);
  
  if (dryRun) {
    console.log(`  📄 ${filename} (${(buffer.length / 1024).toFixed(1)}KB)`);
    return { dryRun: true, filename, size: buffer.length };
  }
  
  try {
    const url = await uploadToBunny(buffer, filename);
    console.log(`  ✅ ${filename} (${(buffer.length / 1024).toFixed(1)}KB)`);
    return { url, filename, size: buffer.length };
  } catch (error) {
    console.error(`  ❌ ${filename} - ${error.message}`);
    return null;
  }
}

async function uploadFolder(folderPath) {
  const fullPath = join(ROOT_DIR, folderPath);
  
  let files;
  try {
    files = readdirSync(fullPath);
  } catch (error) {
    console.error(`❌ Cannot read folder: ${folderPath}`);
    console.error(`   ${error.message}`);
    process.exit(1);
  }
  
  const imageFiles = files.filter(file => {
    const ext = extname(file).toLowerCase();
    return supportedFormats.includes(ext);
  });
  
  console.log(`📁 Uploading from: ${folderPath}`);
  console.log(`   Found ${imageFiles.length} images\n`);
  
  if (imageFiles.length === 0) {
    console.log('⚠️  No supported images found');
    return;
  }
  
  const results = [];
  let successCount = 0;
  let failCount = 0;
  let totalSize = 0;
  
  for (const file of imageFiles) {
    const filePath = join(fullPath, file);
    const stat = statSync(filePath);
    
    if (stat.isDirectory()) continue;
    
    const result = await uploadFile(filePath, file);
    if (result) {
      results.push(result);
      successCount++;
      totalSize += result.size || 0;
    } else {
      failCount++;
    }
  }
  
  console.log('\n═══════════════════════════════\n');
  console.log('📊 Upload Summary\n');
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed:     ${failCount}`);
  console.log(`   Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
  
  if (!dryRun && results.length > 0) {
    console.log(`\n📁 CDN Path: ${cdnUrl}/${targetArg}/`);
    console.log(`\n📝 Example URL:`);
    console.log(`   ${results[0].url}`);
  }
  
  if (failCount > 0) {
    process.exit(1);
  }
}

async function uploadSingleFile(filePath) {
  const fullPath = join(ROOT_DIR, filePath);
  const filename = basename(filePath);
  
  console.log(`📄 Uploading: ${filename}\n`);
  
  const result = await uploadFile(fullPath, filename);
  
  if (result && !dryRun) {
    console.log(`\n✅ Uploaded successfully`);
    console.log(`   URL: ${result.url}`);
  }
}

// Main
async function main() {
  if (folderArg) {
    await uploadFolder(folderArg);
  } else if (fileArg) {
    await uploadSingleFile(fileArg);
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
