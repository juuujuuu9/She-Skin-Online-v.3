/**
 * Script to upload audio cover images to Bunny CDN
 */
import { readFile } from 'fs/promises';
import { readdir, writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Bunny CDN config from env
const BUNNY_API_KEY = process.env.BUNNY_API_KEY || 'f852e8f3-4e83-4a6b-aa1ca6853026-2636-425d';
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'she-skin';
const BUNNY_CDN_URL = process.env.BUNNY_CDN_URL || 'https://she-skin.b-cdn.net';
const BUNNY_STORAGE_ENDPOINT = process.env.BUNNY_STORAGE_ENDPOINT || 'ny.storage.bunnycdn.com';

function getMimeType(filename) {
  const ext = extname(filename).toLowerCase();
  const mimeTypes = {
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

async function uploadToBunny(file, filename) {
  const contentType = getMimeType(filename);
  const cleanFilename = filename.startsWith('/') ? filename.slice(1) : filename;
  const uploadUrl = `https://${BUNNY_STORAGE_ENDPOINT}/${BUNNY_STORAGE_ZONE}/${cleanFilename}`;
  
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'AccessKey': BUNNY_API_KEY,
      'Content-Type': contentType,
    },
    body: file,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bunny.net upload failed: ${response.status} ${errorText}`);
  }

  const encodedPath = cleanFilename.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const cleanCdnUrl = BUNNY_CDN_URL.endsWith('/') ? BUNNY_CDN_URL.slice(0, -1) : BUNNY_CDN_URL;
  return `${cleanCdnUrl}/${encodedPath}`;
}

async function main() {
  const audioDir = join(process.cwd(), 'public', 'media', 'audio');
  const outputFile = join(process.cwd(), 'audio-cover-urls.json');
  
  console.log('📁 Checking audio directory:', audioDir);
  
  // Get all webp files
  const files = await readdir(audioDir);
  const webpFiles = files.filter(f => f.toLowerCase().endsWith('.webp'));
  
  console.log(`🖼️  Found ${webpFiles.length} WebP images`);
  
  if (webpFiles.length === 0) {
    console.log('No WebP files found. Exiting.');
    return;
  }
  
  const mapping = {
    uploadedAt: new Date().toISOString(),
    totalFiles: webpFiles.length,
    totalBytes: 0,
    files: {}
  };
  
  for (const filename of webpFiles) {
    const filepath = join(audioDir, filename);
    const buffer = await readFile(filepath);
    const bunnyPath = `media/audio/${filename}`;
    
    console.log(`\n📤 Uploading: ${filename} (${(buffer.length / 1024).toFixed(2)} KB)`);
    
    try {
      const cdnUrl = await uploadToBunny(buffer, bunnyPath);
      mapping.files[filename] = {
        originalPath: filepath,
        bunnyPath: bunnyPath,
        cdnUrl: cdnUrl,
        sizeBytes: buffer.length,
        sizeKB: Math.round(buffer.length / 1024 * 100) / 100
      };
      mapping.totalBytes += buffer.length;
      console.log(`   ✅ Uploaded: ${cdnUrl}`);
    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}`);
      mapping.files[filename] = {
        originalPath: filepath,
        error: error.message
      };
    }
  }
  
  // Save mapping file
  await writeFile(outputFile, JSON.stringify(mapping, null, 2));
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 UPLOAD SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total files: ${webpFiles.length}`);
  console.log(`Total size: ${(mapping.totalBytes / 1024).toFixed(2)} KB (${(mapping.totalBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Mapping saved to: ${outputFile}`);
  console.log('\n✅ Done!');
}

main().catch(console.error);
