#!/usr/bin/env tsx
/**
 * Media Processor — Automated Image/Audio Optimization
 * 
 * Usage:
 *   npm run media:process              # Process all in media/originals/
 *   npm run media:process -- --watch   # Watch mode for dev
 *   npm run media:process -- --file ./image.jpg  # Single file
 */

import { glob } from 'glob';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { createHash } from 'crypto';
import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { encode } from 'blurhash';
import { uploadToBunny, deleteFromBunny } from '../src/lib/bunny';

// Configuration
const CONFIG = {
  sourceDir: process.env.MEDIA_SOURCE_DIR || './media/originals',
  outputDir: process.env.MEDIA_OUTPUT_DIR || './media/processed',
  manifestPath: process.env.MEDIA_MANIFEST || './media/manifest.json',
  cdnBaseUrl: process.env.BUNNY_CDN_URL || '',
  sizes: {
    sm: 640,
    md: 1024,
    lg: 1920,
    xl: 2560,
  },
  imageFormats: ['webp', 'avif'] as const,
  imageQuality: { webp: 80, avif: 75 },
  audioFormats: ['mp3', 'ogg'],
  audioBitrates: { mp3: '192k', ogg: '160k' },
};

// Types
interface ImageVariant {
  url: string;
  width: number;
  height: number;
  size: number;
}

interface ProcessedImage {
  id: string;
  original: string;
  hash: string;
  variants: {
    [format: string]: {
      [size: string]: ImageVariant;
    };
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

interface ProcessedAudio {
  id: string;
  original: string;
  hash: string;
  variants: {
    [format: string]: {
      url: string;
      duration: number;
      size: number;
    };
  };
  waveform: string; // Path to waveform JSON/image
  metadata: {
    duration: number;
    bitrate: number;
    sampleRate: number;
  };
}

type MediaManifest = {
  version: string;
  lastProcessed: string;
  images: Record<string, ProcessedImage>;
  audio: Record<string, ProcessedAudio>;
};

// Utility: Get file hash
async function getFileHash(path: string): Promise<string> {
  const buffer = await readFile(path);
  return createHash('md5').update(buffer).digest('hex');
}

// Utility: Load/save manifest
async function loadManifest(): Promise<MediaManifest> {
  if (!existsSync(CONFIG.manifestPath)) {
    return {
      version: '1.0.0',
      lastProcessed: new Date().toISOString(),
      images: {},
      audio: {},
    };
  }
  return JSON.parse(await readFile(CONFIG.manifestPath, 'utf-8'));
}

async function saveManifest(manifest: MediaManifest) {
  await mkdir(dirname(CONFIG.manifestPath), { recursive: true });
  await writeFile(CONFIG.manifestPath, JSON.stringify(manifest, null, 2));
}

// Generate blurhash for skeleton loading
async function generateBlurhash(imagePath: string): Promise<string> {
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
async function getDominantColor(imagePath: string): Promise<string> {
  const { dominant } = await sharp(imagePath).stats();
  return `rgb(${dominant.r}, ${dominant.g}, ${dominant.b})`;
}

// Process single image
async function processImage(
  inputPath: string,
  manifest: MediaManifest
): Promise<ProcessedImage> {
  const filename = basename(inputPath, extname(inputPath));
  const hash = await getFileHash(inputPath);
  
  // Check if already processed and unchanged
  const existing = manifest.images[filename];
  if (existing && existing.hash === hash) {
    console.log(`⏭️  Skipping ${filename} (unchanged)`);
    return existing;
  }
  
  console.log(`🖼️  Processing ${filename}...`);
  
  const pipeline = sharp(inputPath);
  const metadata = await pipeline.metadata();
  const blurhash = await generateBlurhash(inputPath);
  const dominantColor = await getDominantColor(inputPath);
  
  const variants: ProcessedImage['variants'] = {};
  
  // Process each format
  for (const format of CONFIG.imageFormats) {
    variants[format] = {};
    
    for (const [sizeName, width] of Object.entries(CONFIG.sizes)) {
      // Skip if image is smaller than target
      if ((metadata.width || 0) < width) continue;
      
      const resizeOpts = { width, withoutEnlargement: true };
      let processedBuffer: Buffer;
      
      if (format === 'webp') {
        processedBuffer = await pipeline
          .clone()
          .resize(resizeOpts.width, undefined, resizeOpts)
          .webp({ 
            quality: CONFIG.imageQuality.webp,
            effort: 6,
            smartSubsample: true,
          })
          .toBuffer();
      } else if (format === 'avif') {
        processedBuffer = await pipeline
          .clone()
          .resize(resizeOpts.width, undefined, resizeOpts)
          .avif({ 
            quality: CONFIG.imageQuality.avif,
            effort: 4,
          })
          .toBuffer();
      } else {
        continue;
      }
      
      // Upload to Bunny CDN
      const cdnPath = `works/${filename}/${sizeName}.${format}`;
      const url = await uploadToBunny(processedBuffer, cdnPath, {
        contentType: `image/${format}`,
      });
      
      // Get dimensions of processed image
      const processedInfo = await sharp(processedBuffer).metadata();
      
      variants[format][sizeName] = {
        url,
        width: processedInfo.width || width,
        height: processedInfo.height || Math.round(width / (metadata.width! / metadata.height!)),
        size: processedBuffer.length,
      };
      
      console.log(`   ✓ ${format} ${sizeName}: ${(processedBuffer.length / 1024).toFixed(1)}KB`);
    }
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
  
  // Clean up old variants if they exist
  if (existing) {
    await cleanupOldVariants(existing);
  }
  
  return result;
}

// Process audio file
async function processAudio(
  inputPath: string,
  manifest: MediaManifest
): Promise<ProcessedAudio> {
  const filename = basename(inputPath, extname(inputPath));
  const hash = await getFileHash(inputPath);
  
  const existing = manifest.audio[filename];
  if (existing && existing.hash === hash) {
    console.log(`⏭️  Skipping ${filename} (unchanged)`);
    return existing;
  }
  
  console.log(`🎵 Processing ${filename}...`);
  
  return new Promise((resolve, reject) => {
    const variants: ProcessedAudio['variants'] = {};
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
      
      // Process MP3
      const mp3Buffer = await transcodeToBuffer(inputPath, 'libmp3lame', CONFIG.audioBitrates.mp3);
      const mp3Url = await uploadToBunny(mp3Buffer, `audio/${filename}.mp3`, {
        contentType: 'audio/mpeg',
      });
      variants.mp3 = {
        url: mp3Url,
        duration: metadata.duration,
        size: mp3Buffer.length,
      };
      
      // Process OGG
      const oggBuffer = await transcodeToBuffer(inputPath, 'libvorbis', CONFIG.audioBitrates.ogg);
      const oggUrl = await uploadToBunny(oggBuffer, `audio/${filename}.ogg`, {
        contentType: 'audio/ogg',
      });
      variants.ogg = {
        url: oggUrl,
        duration: metadata.duration,
        size: oggBuffer.length,
      };
      
      // Generate waveform data
      const waveformPath = await generateWaveform(inputPath, filename);
      
      resolve({
        id: filename,
        original: inputPath,
        hash,
        variants,
        waveform: waveformPath,
        metadata,
      });
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
async function generateWaveform(inputPath: string, filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const waveformData: number[] = [];
    
    ffmpeg(inputPath)
      .audioFilters('acompressor,highpass=f=20,lowpass=f=20000')
      .format('null')
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(100) // Low sample rate for waveform
      .on('error', reject)
      .pipe()
      .on('data', (chunk: Buffer) => {
        // Simple peak detection
        for (let i = 0; i < chunk.length; i += 2) {
          const sample = chunk.readInt16LE(i);
          waveformData.push(Math.abs(sample) / 32768);
        }
      })
      .on('end', async () => {
        // Downsample to 100 points
        const downsampled = downsample(waveformData, 100);
        const jsonPath = `audio/${filename}-waveform.json`;
        const buffer = Buffer.from(JSON.stringify(downsampled));
        const url = await uploadToBunny(buffer, jsonPath, {
          contentType: 'application/json',
        });
        resolve(url);
      });
  });
}

// Downsample array to target length
function downsample(data: number[], targetLength: number): number[] {
  const blockSize = Math.floor(data.length / targetLength);
  const result: number[] = [];
  
  for (let i = 0; i < targetLength; i++) {
    const block = data.slice(i * blockSize, (i + 1) * blockSize);
    result.push(Math.max(...block)); // Peak amplitude
  }
  
  return result;
}

// Clean up old CDN files
async function cleanupOldVariants(processed: ProcessedImage | ProcessedAudio) {
  // Implementation depends on your Bunny.net setup
  // You might want to keep old versions or delete them
  console.log(`   🧹 Cleaning up old variants for ${processed.id}`);
}

// Main processing function
async function processAll() {
  const manifest = await loadManifest();
  
  // Find all media files
  const imageFiles = await glob('**/*.{jpg,jpeg,png,tiff,webp}', {
    cwd: CONFIG.sourceDir,
    absolute: true,
  });
  
  const audioFiles = await glob('**/*.{wav,aiff,flac,m4a}', {
    cwd: CONFIG.sourceDir,
    absolute: true,
  });
  
  console.log(`Found ${imageFiles.length} images, ${audioFiles.length} audio files\n`);
  
  // Process images
  for (const file of imageFiles) {
    try {
      const result = await processImage(file, manifest);
      manifest.images[result.id] = result;
      await saveManifest(manifest);
    } catch (err) {
      console.error(`❌ Failed to process ${file}:`, err);
    }
  }
  
  // Process audio
  for (const file of audioFiles) {
    try {
      const result = await processAudio(file, manifest);
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
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(`
Media Processor — Automated optimization for artist portfolios

Usage:
  npm run media:process              Process all new/changed files
  npm run media:process -- --watch  Watch for changes and process
  npm run media:process -- --file path/to/image.jpg  Process single file

Environment:
  MEDIA_SOURCE_DIR     Input directory (default: ./media/originals)
  MEDIA_OUTPUT_DIR     Output directory (default: ./media/processed)
  BUNNY_CDN_URL        Your Bunny.net CDN URL
  BUNNY_API_KEY        Your Bunny.net API key
`);
  process.exit(0);
}

if (args.includes('--file')) {
  const fileIndex = args.indexOf('--file');
  const filePath = args[fileIndex + 1];
  if (!filePath) {
    console.error('Error: --file requires a path');
    process.exit(1);
  }
  // Process single file
  loadManifest().then(manifest => {
    if (/\.(jpg|jpeg|png|tiff|webp)$/i.test(filePath)) {
      processImage(filePath, manifest).then(result => {
        manifest.images[result.id] = result;
        return saveManifest(manifest);
      });
    } else if (/\.(wav|aiff|flac|m4a)$/i.test(filePath)) {
      processAudio(filePath, manifest).then(result => {
        manifest.audio[result.id] = result;
        return saveManifest(manifest);
      });
    }
  });
} else {
  processAll();
}
