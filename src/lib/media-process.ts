/**
 * Media Process — Shared library for image/audio processing
 * 
 * Used by:
 * - scripts/media-processor.ts (CLI)
 * - pages/api/admin/media/upload.ts (Admin API)
 * 
 * This module provides pure processing functions without CLI/HTTP concerns.
 */

import { glob } from 'glob';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { createHash } from 'crypto';
import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { encode } from 'blurhash';
import { uploadToBunny, deleteFromBunny, isBunnyConfigured } from './bunny.js';

// Configuration
export const MEDIA_CONFIG = {
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

export type MediaManifest = {
  version: string;
  lastProcessed: string;
  images: Record<string, ProcessedImage>;
  audio: Record<string, ProcessedAudio>;
  pending: PendingFile[];
};

export interface PendingFile {
  id: string;
  filename: string;
  type: 'image' | 'audio';
  originalPath: string;
  status: 'pending' | 'processing' | 'error';
  error?: string;
  uploadedAt: string;
  processedAt?: string;
}

export type ProcessingResult = 
  | { type: 'image'; data: ProcessedImage; replaced?: boolean }
  | { type: 'audio'; data: ProcessedAudio; replaced?: boolean };

// ============================================================================
// Utilities
// ============================================================================

export async function getFileHash(buffer: Buffer): Promise<string> {
  return createHash('md5').update(buffer).digest('hex').slice(0, 8);
}

export async function loadManifest(): Promise<MediaManifest> {
  if (!existsSync(MEDIA_CONFIG.manifestPath)) {
    return {
      version: '2.0.0',
      lastProcessed: new Date().toISOString(),
      images: {},
      audio: {},
      pending: [],
    };
  }
  const manifest = JSON.parse(await readFile(MEDIA_CONFIG.manifestPath, 'utf-8'));
  // Migration: add pending array if missing
  if (!manifest.pending) {
    manifest.pending = [];
  }
  return manifest;
}

export async function saveManifest(manifest: MediaManifest) {
  await mkdir(dirname(MEDIA_CONFIG.manifestPath), { recursive: true });
  await writeFile(MEDIA_CONFIG.manifestPath, JSON.stringify(manifest, null, 2));
}

// ============================================================================
// Storage (CDN or Local)
// ============================================================================

async function storeFile(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const hasBunny = isBunnyConfigured();
  
  if (hasBunny) {
    return uploadToBunny(buffer, filename, { contentType });
  } else {
    const localPath = join(MEDIA_CONFIG.outputDir, filename);
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, buffer);
    return `/media/processed/${filename}`;
  }
}

async function deleteFile(urlOrPath: string): Promise<void> {
  const hasBunny = isBunnyConfigured();
  
  if (hasBunny) {
    const cdnUrl = MEDIA_CONFIG.cdnBaseUrl;
    if (urlOrPath.startsWith(cdnUrl)) {
      const path = urlOrPath.slice(cdnUrl.length + 1);
      await deleteFromBunny(path);
    }
  } else {
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

// ============================================================================
// Image Processing
// ============================================================================

export async function generateBlurhash(imageBuffer: Buffer): Promise<string> {
  const image = await sharp(imageBuffer)
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

export async function getDominantColor(imageBuffer: Buffer): Promise<string> {
  const { dominant } = await sharp(imageBuffer).stats();
  return `rgb(${dominant.r}, ${dominant.g}, ${dominant.b})`;
}

export async function processImageBuffer(
  buffer: Buffer,
  filename: string,
  manifest: MediaManifest
): Promise<{ result: ProcessedImage; replaced?: boolean }> {
  const id = basename(filename, extname(filename));
  const hash = await getFileHash(buffer);
  
  // Check for existing
  const existing = manifest.images[id];
  if (existing && existing.hash === hash) {
    return { result: existing };
  }
  
  const pipeline = sharp(buffer);
  const metadata = await pipeline.metadata();
  const blurhash = await generateBlurhash(buffer);
  const dominantColor = await getDominantColor(buffer);
  
  const variants: ProcessedImage['variants'] = {};
  
  // Generate WebP variants for each size
  for (const [sizeName, width] of Object.entries(MEDIA_CONFIG.sizes)) {
    if ((metadata.width || 0) < width) continue;
    
    const processedBuffer = await pipeline
      .clone()
      .resize(width, undefined, { withoutEnlargement: true })
      .webp({ 
        quality: MEDIA_CONFIG.imageQuality,
        effort: 6,
        smartSubsample: true,
      })
      .toBuffer();
    
    const hashedFilename = `images/${id}-${hash}-${sizeName}.webp`;
    const url = await storeFile(processedBuffer, hashedFilename, 'image/webp');
    
    const processedInfo = await sharp(processedBuffer).metadata();
    
    variants[sizeName] = {
      url,
      width: processedInfo.width || width,
      height: processedInfo.height || Math.round(width / (metadata.width! / metadata.height!)),
      size: processedBuffer.length,
    };
  }
  
  const result: ProcessedImage = {
    id,
    original: filename,
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
  
  // Cleanup old variants
  if (existing) {
    for (const variant of Object.values(existing.variants)) {
      await deleteFile(variant.url);
    }
  }
  
  return { result, replaced: !!existing };
}

// ============================================================================
// Audio Processing
// ============================================================================

function transcodeToBuffer(
  inputBuffer: Buffer,
  codec: string,
  bitrate: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    
    // Write input to temp file since ffmpeg needs a path
    const tempPath = join(MEDIA_CONFIG.outputDir, `.temp-${Date.now()}.raw`);
    writeFile(tempPath, inputBuffer).then(() => {
      ffmpeg(tempPath)
        .audioCodec(codec)
        .audioBitrate(bitrate)
        .format(codec === 'libmp3lame' ? 'mp3' : 'ogg')
        .on('error', (err) => {
          unlink(tempPath).catch(() => {});
          reject(err);
        })
        .on('end', () => {
          unlink(tempPath).catch(() => {});
          resolve(Buffer.concat(chunks));
        })
        .pipe()
        .on('data', (chunk: Buffer) => chunks.push(chunk));
    });
  });
}

async function generateWaveform(
  inputBuffer: Buffer,
  id: string,
  hash: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const waveformData: number[] = [];
    const tempPath = join(MEDIA_CONFIG.outputDir, `.temp-waveform-${Date.now()}.raw`);
    
    writeFile(tempPath, inputBuffer).then(() => {
      ffmpeg(tempPath)
        .audioFilters('acompressor,highpass=f=20,lowpass=f=20000')
        .format('null')
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(100)
        .on('error', (err) => {
          unlink(tempPath).catch(() => {});
          reject(err);
        })
        .pipe()
        .on('data', (chunk: Buffer) => {
          for (let i = 0; i < chunk.length; i += 2) {
            const sample = chunk.readInt16LE(i);
            waveformData.push(Math.abs(sample) / 32768);
          }
        })
        .on('end', async () => {
          unlink(tempPath).catch(() => {});
          
          try {
            // Downsample to 100 points
            const blockSize = Math.floor(waveformData.length / 100);
            const downsampled: number[] = [];
            for (let i = 0; i < 100; i++) {
              const block = waveformData.slice(i * blockSize, (i + 1) * blockSize);
              downsampled.push(Math.max(...block));
            }
            
            const jsonFilename = `audio/${id}-${hash}-waveform.json`;
            const buffer = Buffer.from(JSON.stringify(downsampled));
            const url = await storeFile(buffer, jsonFilename, 'application/json');
            resolve(url);
          } catch (error) {
            reject(error);
          }
        });
    });
  });
}

export async function processAudioBuffer(
  buffer: Buffer,
  filename: string,
  manifest: MediaManifest
): Promise<{ result: ProcessedAudio; replaced?: boolean }> {
  const id = basename(filename, extname(filename));
  const hash = await getFileHash(buffer);
  
  const existing = manifest.audio[id];
  if (existing && existing.hash === hash) {
    return { result: existing };
  }
  
  return new Promise((resolve, reject) => {
    // Write to temp file for ffprobe
    const tempPath = join(MEDIA_CONFIG.outputDir, `.temp-probe-${Date.now()}.raw`);
    
    writeFile(tempPath, buffer).then(() => {
      ffmpeg.ffprobe(tempPath, async (err, data) => {
        if (err) {
          unlink(tempPath).catch(() => {});
          return reject(err);
        }
        
        const stream = data.streams.find(s => s.codec_type === 'audio');
        const metadata = {
          duration: data.format.duration || 0,
          bitrate: (data.format.bit_rate || 0) / 1000,
          sampleRate: stream?.sample_rate || 44100,
        };
        
        try {
          // Process MP3
          const mp3Buffer = await transcodeToBuffer(buffer, 'libmp3lame', MEDIA_CONFIG.audioBitrates.mp3);
          const mp3Filename = `audio/${id}-${hash}.mp3`;
          const mp3Url = await storeFile(mp3Buffer, mp3Filename, 'audio/mpeg');
          
          // Process OGG
          const oggBuffer = await transcodeToBuffer(buffer, 'libvorbis', MEDIA_CONFIG.audioBitrates.ogg);
          const oggFilename = `audio/${id}-${hash}.ogg`;
          const oggUrl = await storeFile(oggBuffer, oggFilename, 'audio/ogg');
          
          // Generate waveform
          const waveformUrl = await generateWaveform(buffer, id, hash);
          
          // Cleanup temp file
          unlink(tempPath).catch(() => {});
          
          const result: ProcessedAudio = {
            id,
            original: filename,
            hash,
            variants: {
              mp3: { url: mp3Url, duration: metadata.duration, size: mp3Buffer.length },
              ogg: { url: oggUrl, duration: metadata.duration, size: oggBuffer.length },
            },
            waveform: waveformUrl,
            metadata,
          };
          
          // Cleanup old variants
          if (existing) {
            await deleteFile(existing.variants.mp3.url);
            await deleteFile(existing.variants.ogg.url);
            await deleteFile(existing.waveform);
          }
          
          resolve({ result, replaced: !!existing });
        } catch (error) {
          unlink(tempPath).catch(() => {});
          reject(error);
        }
      });
    });
  });
}

// ============================================================================
// Main Entry Point for API
// ============================================================================

export async function processMediaFile(
  buffer: Buffer,
  filename: string,
  manifest: MediaManifest
): Promise<ProcessingResult> {
  const ext = extname(filename).toLowerCase();
  
  if (buffer.length > MEDIA_CONFIG.maxFileSize) {
    throw new Error(`File too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Maximum is 100MB. Consider compressing to FLAC or reducing sample rate.`);
  }
  
  if (['.jpg', '.jpeg', '.png', '.tiff', '.webp'].includes(ext)) {
    const { result, replaced } = await processImageBuffer(buffer, filename, manifest);
    return { type: 'image', data: result, replaced };
  }
  
  if (['.wav', '.aiff', '.flac', '.m4a'].includes(ext)) {
    const { result, replaced } = await processAudioBuffer(buffer, filename, manifest);
    return { type: 'audio', data: result, replaced };
  }
  
  throw new Error(`Unsupported file type: ${ext}`);
}

export function getManifestEntry(
  manifest: MediaManifest,
  id: string
): ProcessedImage | ProcessedAudio | undefined {
  return manifest.images[id] || manifest.audio[id];
}
