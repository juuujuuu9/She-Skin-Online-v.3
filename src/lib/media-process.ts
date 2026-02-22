/**
 * Media Processing Library
 * Handles image/audio/video processing for uploads
 */

import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { encode } from 'blurhash';

/**
 * Generate hash from file buffer
 */
export async function getFileHash(buffer: Buffer): Promise<string> {
  return createHash('md5').update(buffer).digest('hex').slice(0, 8);
}

/**
 * Generate blurhash from image buffer
 */
export async function generateBlurhash(buffer: Buffer): Promise<string> {
  try {
    const { data, info } = await sharp(buffer)
      .resize(32, 32, { fit: 'fill' })
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    
    return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
  } catch (error) {
    console.error('[generateBlurhash] Failed to generate blurhash:', error);
    return '';
  }
}

/**
 * Get dominant color from image buffer
 */
export async function getDominantColor(buffer: Buffer): Promise<string> {
  try {
    const { data, info } = await sharp(buffer)
      .resize(1, 1, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const r = data[0];
    const g = data[1];
    const b = data[2];
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch (error) {
    console.error('[getDominantColor] Failed to get dominant color:', error);
    return '#000000';
  }
}

// Media configuration
export const MEDIA_CONFIG = {
  maxSizeMB: 500,
  maxSizeBytes: 500 * 1024 * 1024,
  allowedTypes: {
    // Images
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/tiff': ['.tiff', '.tif'],
    'image/webp': ['.webp'],
    'image/gif': ['.gif'],
    // Audio
    'audio/wav': ['.wav'],
    'audio/aiff': ['.aiff', '.aif'],
    'audio/flac': ['.flac'],
    'audio/mp4': ['.m4a'],
    'audio/mpeg': ['.mp3'],
    'audio/ogg': ['.ogg'],
    // Video
    'video/mp4': ['.mp4', '.m4v'],
    'video/webm': ['.webm'],
    'video/quicktime': ['.mov'],
    'video/x-matroska': ['.mkv'],
    'video/avi': ['.avi'],
  },
  // Image processing settings
  sizes: {
    sm: 640,
    md: 1024,
    lg: 1920,
    xl: 2560,
  },
  imageQuality: 80,
};

// Image variant type
export interface ImageVariant {
  url: string;
  width: number;
  height: number;
  size: number;
}

// Processed image result
export interface ProcessedImage {
  id: string;
  originalName: string;
  hash: string;
  variants: Record<string, ImageVariant>;
  metadata: {
    width: number;
    height: number;
    format: string;
  };
  blurhash: string;
  dominantColor: string;
}

// Public media directory (for temporary processing)
const PUBLIC_MEDIA_DIR = join(process.cwd(), 'public', 'media');

/**
 * Store file in public directory (temporary during processing)
 */
async function storeFile(buffer: Buffer, filename: string): Promise<string> {
  const filePath = join(PUBLIC_MEDIA_DIR, filename);
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, buffer);
  return `/media/${filename}`;
}

/**
 * Delete a file from the public media directory
 */
async function deleteFile(url: string): Promise<void> {
  const filename = url.replace(/^\media\//, '');
  const filePath = join(PUBLIC_MEDIA_DIR, filename);
  try {
    await unlink(filePath);
  } catch {
    // Ignore errors (file may not exist)
  }
}

/**
 * Process image with Sharp - convert to WebP with multiple sizes
 * Stores temporarily in public directory for upload-service to read
 */
export async function processImageBuffer(
  buffer: Buffer,
  filename: string
): Promise<{ result: ProcessedImage }> {
  const id = basename(filename, extname(filename));
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  const variants: Record<string, ImageVariant> = {};

  // Generate WebP variants at different sizes
  for (const [sizeName, maxWidth] of Object.entries(MEDIA_CONFIG.sizes)) {
    // Skip if original is smaller than this size
    if (originalWidth < maxWidth * 0.5) continue;

    const processedBuffer = await image
      .clone()
      .resize(maxWidth, null, { 
        withoutEnlargement: true,
        fit: 'inside'
      })
      .webp({ 
        quality: MEDIA_CONFIG.imageQuality,
        effort: 6 
      })
      .toBuffer();

    const variantFilename = `images/${id}-${sizeName}.webp`;
    const url = await storeFile(processedBuffer, variantFilename);

    // Get dimensions of resized image
    const variantInfo = await sharp(processedBuffer).metadata();

    variants[sizeName] = {
      url,
      width: variantInfo.width || maxWidth,
      height: variantInfo.height || Math.round((variantInfo.width || maxWidth) * (originalHeight / originalWidth)),
      size: processedBuffer.length,
    };
  }

  // Generate metadata
  const hash = await getFileHash(buffer);
  const blurhash = await generateBlurhash(buffer);
  const dominantColor = await getDominantColor(buffer);

  const result: ProcessedImage = {
    id,
    originalName: filename,
    hash,
    variants,
    metadata: {
      width: originalWidth,
      height: originalHeight,
      format: 'webp',
    },
    blurhash,
    dominantColor,
  };

  return { result };
}

/**
 * Get audio metadata using ffmpeg
 */
export async function getAudioMetadata(buffer: Buffer, filename: string): Promise<{
  duration: number;
  format: string;
  bitrate?: number;
}> {
  const ext = extname(filename).toLowerCase().slice(1) || 'mp3';
  
  // Store temporarily to analyze
  const tempPath = join(process.cwd(), 'temp', `audio-${Date.now()}.${ext}`);
  await mkdir(dirname(tempPath), { recursive: true });
  await writeFile(tempPath, buffer);

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(tempPath, (err, metadata) => {
      // Clean up temp file
      unlink(tempPath).catch(() => {});
      
      if (err) {
        reject(err);
        return;
      }

      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      resolve({
        duration: metadata.format.duration || 0,
        format: ext,
        bitrate: metadata.format.bit_rate,
      });
    });
  });
}

/**
 * Get video metadata using ffmpeg
 */
export async function getVideoMetadata(buffer: Buffer, filename: string): Promise<{
  duration: number;
  format: string;
  width: number;
  height: number;
}> {
  const ext = extname(filename).toLowerCase().slice(1) || 'mp4';
  
  const tempPath = join(process.cwd(), 'temp', `video-${Date.now()}.${ext}`);
  await mkdir(dirname(tempPath), { recursive: true });
  await writeFile(tempPath, buffer);

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(tempPath, (err, metadata) => {
      unlink(tempPath).catch(() => {});
      
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      resolve({
        duration: metadata.format.duration || 0,
        format: ext,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
      });
    });
  });
}
