#!/usr/bin/env tsx
/**
 * Media Processor — Sole-Artist Edition
 * 
 * Design principles:
 * - WebP-only for images (no AVIF option paralysis)
 * - Content-hashed filenames for perfect cache invalidation
 * - Local fallback when Bunny unavailable (dev mode)
 * - Readable filenames in originals/, hashed URLs in output
 * - Sync processing with immediate feedback
 * 
 * Usage:
 *   npm run media:process              # Process all in media/originals/
 *   npm run media:process -- --file ./image.jpg  # Single file
 */

import { glob } from 'glob';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { createHash } from 'crypto';
import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { encode } from 'blurhash';
import { uploadToBunny, deleteFromBunny, isBunnyConfigured } from '../src/lib/bunny';

// Configuration
export const CONFIG = {
  sourceDir: process.env.MEDIA_SOURCE_DIR || './media/originals',
  outputDir: process.env.MEDIA_OUTPUT_DIR || './media/processed',
  manifestPath: process.env.MEDIA_MANIFEST || './media/manifest.json',
  cdnBaseUrl: process.env.BUNNY_CDN_URL || '',
  siteUrl: process.env.SITE_URL || '',
  sizes: {
    sm: 640,
    md: 1024,
    lg: 1920,
    xl: 2560,
  },
  imageQuality: 80,
  audioBitrates: { mp3: '256k', ogg: '192k' },
  maxFileSize: 100 * 1024 * 1024, // 100MB
};

// Types
export interface ImageVariant {
  url: string;
  width: number;
  height: number;
  size: number;
}

export interface ProcessedImage {
  id: string;
  original: string;
  hash: string;
  variants: {
    [size: string]: ImageVariant;
  };
  blurhash: string;
  dominantColor: string;
  aspectRatio: number;
  metadata: {
    width: number;
    height: number;
    format: string;
    hasAlpha: boolean;
  };
}

export interface ProcessedAudio {
  id: string;
  original: string;
  hash: string;
  variants: {
    mp3: { url: string; duration: number; size: number };
    ogg: { url: string; duration: number; size: number };
  };
  waveform: string;
  metadata: {
    duration: number;
    bitrate: number;
    sampleRate: number;
  };
}

export type PendingFile = {
  id: string;
  filename: string;
  type: 'image' | 'audio';
  originalPath: string;
  status: 'pending' | 'processing' | 'error';
  error?: string;
  uploadedAt: string;
  processedAt?: string;
};

type MediaManifest = {
  version: string;
  lastProcessed: string;
  images: Record<string, ProcessedImage>;
  audio: Record<string, ProcessedAudio>;
  pending: PendingFile[];
};

// Utility: Get file hash (first 8 chars for filename)
export async function getFileHash(path: string): Promise<string> {
  const buffer = await readFile(path);
  return createHash('md5').update(buffer).digest('hex').slice(0, 8);
}

// Utility: Load/save manifest
export async function loadManifest(): Promise<MediaManifest> {
  if (!existsSync(CONFIG.manifestPath)) {
    return {
      version: '2.0.0',
      lastProcessed: new Date().toISOString(),
      images: {},
      audio: {},
      pending: [],
    };
  }
  const manifest = JSON.parse(await readFile(CONFIG.manifestPath, 'utf-8'));
  // Migration: add pending array if missing
  if (!manifest.pending) {
    manifest.pending = [];
  }
  return manifest;
}

export async function saveManifest(manifest: MediaManifest) {
  await mkdir(dirname(CONFIG.manifestPath), { recursive: true });
  await writeFile(CONFIG.manifestPath, JSON.stringify(manifest, null, 2));
}

// Check file size
export function checkFileSize(path: string): Promise<number> {
  return readFile(path).then(b => b.length);
}

// Generate blurhash for skeleton loading
export async function generateBlurhash(imagePath: string): Promise<string> {
  const image = await sharp(imagePath)
    .resize(32, 32, { fit: 'inside' })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });
  
  return encode(
    new Uint8ClampedArray(image.data),
    image.info.width,
    image.info.height,
    4, 4
  );
}

// Get dominant color for placeholders
export async function getDominantColor(imagePath: string): Promise<string> {
  const { dominant } = await sharp(imagePath).stats();
  return `rgb(${dominant.r}, ${dominant.g}, ${dominant.b})`;
}

// Upload or save locally
async function storeFile(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const hasBunny = isBunnyConfigured();
  
  if (hasBunny) {
    // Production: Upload to Bunny CDN
    return uploadToBunny(buffer, filename, { contentType });
  } else {
    // Development: Save to local output dir
    const localPath = join(CONFIG.outputDir, filename);
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, buffer);
    
    // Return relative URL
    return `/media/processed/${filename}`;
  }
}

// Delete file (CDN or local)
async function deleteFile(urlOrPath: string): Promise<void> {
  const hasBunny = isBunnyConfigured();
  
  if (hasBunny) {
    // Extract path from CDN URL
    const cdnUrl = CONFIG.cdnBaseUrl;
    if (urlOrPath.startsWith(cdnUrl)) {
      const path = urlOrPath.slice(cdnUrl.length + 1); // +1 for the /
      await deleteFromBunny(path);
    }
  } else {
    // Local file: extract path from relative URL
    if (urlOrPath.startsWith('/media/processed/')) {
      const localPath = join(process.cwd(), urlOrPath);
      try {
        await unlink(localPath);
      } catch {
        // File may not exist
      }
    }
  }
}

// Process single image
export async function processImage(
  inputPath: string,
  manifest: MediaManifest
): Promise<{ result: ProcessedImage; replaced?: boolean }> {
  const filename = basename(inputPath, extname(inputPath));
  const fileSize = await checkFileSize(inputPath);
  
  if (fileSize > CONFIG.maxFileSize) {
    throw new Error(`File too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Consider compressing to FLAC or reducing sample rate.`);
  }
  
  const hash = await getFileHash(inputPath);
  
  // Check if already processed and unchanged
  const existing = manifest.images[filename];
  if (existing && existing.hash === hash) {
    console.log(`⏭️  Skipping ${filename} (unchanged)`);
    return { result: existing };
  }
  
  console.log(`🖼️  Processing ${filename}...`);
  
  const pipeline = sharp(inputPath);
  const metadata = await pipeline.metadata();
  const blurhash = await generateBlurhash(inputPath);
  const dominantColor = await getDominantColor(inputPath);
  
  const variants: ProcessedImage['variants'] = {};
  
  // Process each size as WebP only
  for (const [sizeName, width] of Object.entries(CONFIG.sizes)) {
    // Skip if image is smaller than target
    if ((metadata.width || 0) < width) continue;
    
    const resizeOpts = { width, withoutEnlargement: true };
    
    const processedBuffer = await pipeline
      .clone()
      .resize(resizeOpts.width, undefined, resizeOpts)
      .webp({ 
        quality: CONFIG.imageQuality,
        effort: 6,
        smartSubsample: true,
      })
      .toBuffer();
    
    // Store with content-hashed filename: filename-hash-size.webp
    const hashedFilename = `images/${filename}-${hash}-${sizeName}.webp`;
    const url = await storeFile(processedBuffer, hashedFilename, 'image/webp');
    
    // Get dimensions of processed image
    const processedInfo = await sharp(processedBuffer).metadata();
    
    variants[sizeName] = {
      url,
      width: processedInfo.width || width,
      height: processedInfo.height || Math.round(width / (metadata.width! / metadata.height!)),
      size: processedBuffer.length,
    };
    
    console.log(`   ✓ webp ${sizeName}: ${(processedBuffer.length / 1024).toFixed(1)}KB`);
  }
  
  const result: ProcessedImage = {
    id: filename,
    original: inputPath,
    hash,
    variants,
    blurhash,
    dominantColor,
    aspectRatio: (metadata.width || 1) / (metadata.height || 1),
    metadata: {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      hasAlpha: metadata.hasAlpha || false,
    },
  };
  
  // Clean up old variants if replacing
  if (existing) {
    console.log(`   🧹 Cleaning up old variants for ${filename}`);
    await cleanupOldImageVariants(existing);
  }
  
  return { result, replaced: !!existing };
}

// Process audio file
export async function processAudio(
  inputPath: string,
  manifest: MediaManifest
): Promise<{ result: ProcessedAudio; replaced?: boolean }> {
  const filename = basename(inputPath, extname(inputPath));
  const fileSize = await checkFileSize(inputPath);
  
  if (fileSize > CONFIG.maxFileSize) {
    throw new Error(`File too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Consider compressing to FLAC or reducing sample rate.`);
  }
  
  const hash = await getFileHash(inputPath);
  
  const existing = manifest.audio[filename];
  if (existing && existing.hash === hash) {
    console.log(`⏭️  Skipping ${filename} (unchanged)`);
    return { result: existing };
  }
  
  console.log(`🎵 Processing ${filename}...`);
  
  return new Promise((resolve, reject) => {
    const variants = {} as ProcessedAudio['variants'];
    let metadata: { duration: number; bitrate: number; sampleRate: number } = {
      duration: 0, bitrate: 0, sampleRate: 44100,
    };
    
    // Get metadata first
    ffmpeg.ffprobe(inputPath, async (err, data) => {
      if (err) return reject(err);
      
      const stream = data.streams.find(s => s.codec_type === 'audio');
      metadata = {
        duration: data.format.duration || 0,
        bitrate: (data.format.bit_rate || 0) / 1000,
        sampleRate: stream?.sample_rate || 44100,
      };
      
      try {
        // Process MP3 (256k)
        const mp3Buffer = await transcodeToBuffer(inputPath, 'libmp3lame', CONFIG.audioBitrates.mp3);
        const mp3Filename = `audio/${filename}-${hash}.mp3`;
        const mp3Url = await storeFile(mp3Buffer, mp3Filename, 'audio/mpeg');
        variants.mp3 = {
          url: mp3Url,
          duration: metadata.duration,
          size: mp3Buffer.length,
        };
        console.log(`   ✓ mp3: ${(mp3Buffer.length / 1024).toFixed(1)}KB`);
        
        // Process OGG (192k)
        const oggBuffer = await transcodeToBuffer(inputPath, 'libvorbis', CONFIG.audioBitrates.ogg);
        const oggFilename = `audio/${filename}-${hash}.ogg`;
        const oggUrl = await storeFile(oggBuffer, oggFilename, 'audio/ogg');
        variants.ogg = {
          url: oggUrl,
          duration: metadata.duration,
          size: oggBuffer.length,
        };
        console.log(`   ✓ ogg: ${(oggBuffer.length / 1024).toFixed(1)}KB`);
        
        // Generate waveform data
        const waveformUrl = await generateWaveform(inputPath, filename, hash);
        console.log(`   ✓ waveform generated`);
        
        const result: ProcessedAudio = {
          id: filename,
          original: inputPath,
          hash,
          variants,
          waveform: waveformUrl,
          metadata,
        };
        
        // Clean up old variants if replacing
        if (existing) {
          console.log(`   🧹 Cleaning up old variants for ${filename}`);
          await cleanupOldAudioVariants(existing);
        }
        
        resolve({ result, replaced: !!existing });
      } catch (error) {
        reject(error);
      }
    });
  });
}

// Transcode audio to buffer
function transcodeToBuffer(
  input: string,
  codec: string,
  bitrate: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    
    ffmpeg(input)
      .audioCodec(codec)
      .audioBitrate(bitrate)
      .format(codec === 'libmp3lame' ? 'mp3' : 'ogg')
      .on('error', reject)
      .pipe()
      .on('data', (chunk: Buffer) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// Generate waveform JSON for visualization
async function generateWaveform(
  inputPath: string,
  filename: string,
  hash: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const waveformData: number[] = [];
    
    ffmpeg(inputPath)
      .audioFilters('acompressor,highpass=f=20,lowpass=f=20000')
      .format('null')
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(100)
      .on('error', reject)
      .pipe()
      .on('data', (chunk: Buffer) => {
        for (let i = 0; i < chunk.length; i += 2) {
          const sample = chunk.readInt16LE(i);
          waveformData.push(Math.abs(sample) / 32768);
        }
      })
      .on('end', async () => {
        try {
          // Downsample to 100 points
          const downsampled = downsample(waveformData, 100);
          const jsonFilename = `audio/${filename}-${hash}-waveform.json`;
          const buffer = Buffer.from(JSON.stringify(downsampled));
          const url = await storeFile(buffer, jsonFilename, 'application/json');
          resolve(url);
        } catch (error) {
          reject(error);
        }
      });
  });
}

// Downsample array to target length
function downsample(data: number[], targetLength: number): number[] {
  const blockSize = Math.floor(data.length / targetLength);
  const result: number[] = [];
  
  for (let i = 0; i < targetLength; i++) {
    const block = data.slice(i * blockSize, (i + 1) * blockSize);
    result.push(Math.max(...block));
  }
  
  return result;
}

// Clean up old image variants
async function cleanupOldVariants(processed: ProcessedImage | ProcessedAudio) {
  if ('variants' in processed && processed.variants) {
    if (processed.variants) {
      // Image variants
      const imageProcessed = processed as ProcessedImage;
      for (const variant of Object.values(imageProcessed.variants)) {
        await deleteFile(variant.url);
      }
    }
  }
}

// Clean up old image variants specifically
async function cleanupOldImageVariants(processed: ProcessedImage) {
  for (const variant of Object.values(processed.variants)) {
    await deleteFile(variant.url);
  }
}

// Clean up old audio variants specifically
async function cleanupOldAudioVariants(processed: ProcessedAudio) {
  await deleteFile(processed.variants.mp3.url);
  await deleteFile(processed.variants.ogg.url);
  await deleteFile(processed.waveform);
}

// Process pending files from manifest queue
async function processPending(): Promise<MediaManifest> {
  const manifest = await loadManifest();
  const pending = manifest.pending.filter(p => p.status === 'pending');
  
  if (pending.length === 0) {
    console.log('No pending files to process.');
    return manifest;
  }
  
  console.log(`Processing ${pending.length} pending file(s)...\n`);
  
  for (const file of pending) {
    try {
      file.status = 'processing';
      await saveManifest(manifest);
      
      const inputPath = file.originalPath;
      
      if (file.type === 'image') {
        const { result, replaced } = await processImage(inputPath, manifest);
        manifest.images[result.id] = result;
        console.log(`✅ ${file.filename} ${replaced ? '(replaced)' : ''}`);
      } else {
        const { result, replaced } = await processAudio(inputPath, manifest);
        manifest.audio[result.id] = result;
        console.log(`✅ ${file.filename} ${replaced ? '(replaced)' : ''}`);
      }
      
      // Remove from pending
      manifest.pending = manifest.pending.filter(p => p.id !== file.id);
      
    } catch (err) {
      console.error(`❌ Failed to process ${file.filename}:`, err);
      file.status = 'error';
      file.error = err instanceof Error ? err.message : 'Processing failed';
    }
    
    await saveManifest(manifest);
  }
  
  manifest.lastProcessed = new Date().toISOString();
  await saveManifest(manifest);
  
  console.log(`\n✅ Processing complete!`);
  
  return manifest;
}

// Main processing function
export async function processAll(): Promise<MediaManifest> {
  // First process any pending files
  const manifest = await processPending();
  
  // Then scan for new files not in manifest or pending
  const imageFiles = await glob('**/*.{jpg,jpeg,png,tiff,webp}', {
    cwd: CONFIG.sourceDir,
    absolute: true,
  });
  
  const audioFiles = await glob('**/*.{wav,aiff,flac,m4a}', {
    cwd: CONFIG.sourceDir,
    absolute: true,
  });
  
  // Filter out files already processed or pending
  const newImageFiles = imageFiles.filter(f => {
    const id = basename(f, extname(f));
    return !manifest.images[id] && !manifest.pending.find(p => p.id === id);
  });
  
  const newAudioFiles = audioFiles.filter(f => {
    const id = basename(f, extname(f));
    return !manifest.audio[id] && !manifest.pending.find(p => p.id === id);
  });
  
  console.log(`Found ${newImageFiles.length} new images, ${newAudioFiles.length} new audio files\n`);
  
  // Process new images
  for (const file of newImageFiles) {
    try {
      const { result } = await processImage(file, manifest);
      manifest.images[result.id] = result;
      await saveManifest(manifest);
    } catch (err) {
      console.error(`❌ Failed to process ${file}:`, err);
    }
  }
  
  // Process new audio
  for (const file of newAudioFiles) {
    try {
      const { result } = await processAudio(file, manifest);
      manifest.audio[result.id] = result;
      await saveManifest(manifest);
    } catch (err) {
      console.error(`❌ Failed to process ${file}:`, err);
    }
  }
  
  manifest.lastProcessed = new Date().toISOString();
  await saveManifest(manifest);
  
  console.log(`\n✅ Processing complete!`);
  console.log(`   Images: ${Object.keys(manifest.images).length}`);
  console.log(`   Audio: ${Object.keys(manifest.audio).length}`);
  console.log(`   Pending: ${manifest.pending.length}`);
  console.log(`   Mode: ${isBunnyConfigured() ? 'CDN (Bunny)' : 'Local (dev)'}`);
  
  return manifest;
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(`
Media Processor — Automated optimization for artist portfolios

Usage:
  npm run media:process              Process all new/changed files
  npm run media:process -- --pending   Process only pending queue
  npm run media:process -- --file path/to/image.jpg  Process single file

Environment:
  MEDIA_SOURCE_DIR     Input directory (default: ./media/originals)
  MEDIA_OUTPUT_DIR     Output directory (default: ./media/processed)
  BUNNY_CDN_URL        Your Bunny.net CDN URL (optional for dev)
  BUNNY_API_KEY        Your Bunny.net API key (optional for dev)
  BUNNY_STORAGE_ZONE   Your Bunny.net storage zone (optional for dev)

Storage:
  Drop files in media/originals/images/ or media/originals/audio/
  Run npm run media:process to generate optimized variants
  Reference by manifest ID in your content (e.g., coverImage: "EP-Artwork")

Async Processing:
  Files uploaded via /admin/media are queued as "pending"
  Click "Process Pending" in admin or run npm run media:process -- --pending
`);
  process.exit(0);
}

if (args.includes('--pending')) {
  // Process only pending queue
  loadManifest().then(async manifest => {
    const pending = manifest.pending.filter(p => p.status === 'pending');
    if (pending.length === 0) {
      console.log('No pending files to process.');
      return;
    }
    console.log(`Processing ${pending.length} pending file(s)...\n`);
    for (const file of pending) {
      try {
        file.status = 'processing';
        await saveManifest(manifest);
        const inputPath = file.originalPath;
        if (file.type === 'image') {
          const { result, replaced } = await processImage(inputPath, manifest);
          manifest.images[result.id] = result;
          console.log(`✅ ${file.filename} ${replaced ? '(replaced)' : ''}`);
        } else {
          const { result, replaced } = await processAudio(inputPath, manifest);
          manifest.audio[result.id] = result;
          console.log(`✅ ${file.filename} ${replaced ? '(replaced)' : ''}`);
        }
        manifest.pending = manifest.pending.filter(p => p.id !== file.id);
      } catch (err) {
        console.error(`❌ Failed to process ${file.filename}:`, err);
        file.status = 'error';
        file.error = err instanceof Error ? err.message : 'Processing failed';
      }
      await saveManifest(manifest);
    }
    console.log('\n✅ Processing complete!');
  });
} else if (args.includes('--file')) {
  const fileIndex = args.indexOf('--file');
  const filePath = args[fileIndex + 1];
  if (!filePath) {
    console.error('Error: --file requires a path');
    process.exit(1);
  }
  // Process single file
  loadManifest().then(async manifest => {
    try {
      if (/\.(jpg|jpeg|png|tiff|webp)$/i.test(filePath)) {
        const { result } = await processImage(filePath, manifest);
        manifest.images[result.id] = result;
        await saveManifest(manifest);
        console.log(`\n✅ Image processed: ${result.id}`);
        console.log(`   Variants: ${Object.keys(result.variants).join(', ')}`);
      } else if (/\.(wav|aiff|flac|m4a)$/i.test(filePath)) {
        const { result } = await processAudio(filePath, manifest);
        manifest.audio[result.id] = result;
        await saveManifest(manifest);
        console.log(`\n✅ Audio processed: ${result.id}`);
        console.log(`   Duration: ${result.metadata.duration.toFixed(1)}s`);
        console.log(`   MP3: ${(result.variants.mp3.size / 1024).toFixed(1)}KB`);
        console.log(`   OGG: ${(result.variants.ogg.size / 1024).toFixed(1)}KB`);
      }
    } catch (err) {
      console.error(`❌ Failed to process ${filePath}:`, err);
      process.exit(1);
    }
  });
} else {
  processAll();
}
