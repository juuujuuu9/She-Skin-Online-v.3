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

// Video configuration for web-optimized compression
export const VIDEO_CONFIG = {
  // High quality CRF values (lower = higher quality, larger file)
  // CRF 20-23 is considered "high quality" for web
  crf: 23,
  // Preset affects compression speed vs efficiency
  preset: 'medium', // Options: ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow
  // Audio codec and bitrate
  audioCodec: 'aac',
  audioBitrate: '128k',
  // Output format
  videoCodec: 'libx264',
  outputFormat: 'mp4',
  // Resolution variants (height-based, width calculated to maintain aspect ratio)
  sizes: {
    '1080p': { height: 1080, maxWidth: 1920 },
    '720p': { height: 720, maxWidth: 1280 },
    '480p': { height: 480, maxWidth: 854 },
  } as Record<string, { height: number; maxWidth: number }>,
};

// Video variant type
export interface VideoVariant {
  url: string;
  width: number;
  height: number;
  size: number;
  bitrate?: number;
}

// Processed video result
export interface ProcessedVideo {
  id: string;
  originalName: string;
  hash: string;
  variants: Record<string, VideoVariant>;
  metadata: {
    width: number;
    height: number;
    duration: number;
    format: string;
  };
}

/**
 * Process video with ffmpeg - generate web-optimized H.264 variants
 * Uses CRF encoding for consistent quality without massive files
 */
export async function processVideoBuffer(
  buffer: Buffer,
  filename: string
): Promise<{ result: ProcessedVideo }> {
  const id = basename(filename, extname(filename));
  const ext = extname(filename).toLowerCase().slice(1) || 'mp4';

  // Write buffer to temp file for processing
  const tempInputPath = join(process.cwd(), 'temp', `video-input-${Date.now()}.${ext}`);
  await mkdir(dirname(tempInputPath), { recursive: true });
  await writeFile(tempInputPath, buffer);

  // Get source metadata
  const metadata = await new Promise<{
    width: number;
    height: number;
    duration: number;
  }>((resolve, reject) => {
    ffmpeg.ffprobe(tempInputPath, (err, meta) => {
      if (err) {
        unlink(tempInputPath).catch(() => {});
        reject(err);
        return;
      }
      const videoStream = meta.streams.find(s => s.codec_type === 'video');
      resolve({
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        duration: meta.format.duration || 0,
      });
    });
  });

  const sourceHeight = metadata.height;
  const sourceWidth = metadata.width;
  const aspectRatio = sourceWidth / sourceHeight;

  // Generate variants at different resolutions
  const variants: Record<string, VideoVariant> = {};

  for (const [sizeName, { height: targetHeight, maxWidth }] of Object.entries(VIDEO_CONFIG.sizes)) {
    // Skip if source is smaller than this variant
    if (sourceHeight < targetHeight * 0.8) continue;

    // Calculate width maintaining aspect ratio
    const targetWidth = Math.min(Math.round(targetHeight * aspectRatio), maxWidth);

    const variantFilename = `videos/${id}-${sizeName}.mp4`;
    const tempOutputPath = join(process.cwd(), 'temp', variantFilename);
    await mkdir(dirname(tempOutputPath), { recursive: true });

    // Transcode with ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempInputPath)
        .videoCodec(VIDEO_CONFIG.videoCodec)
        .audioCodec(VIDEO_CONFIG.audioCodec)
        .audioBitrate(VIDEO_CONFIG.audioBitrate)
        .size(`${targetWidth}x${targetHeight}`)
        .addOption('-crf', String(VIDEO_CONFIG.crf))
        .addOption('-preset', VIDEO_CONFIG.preset)
        .addOption('-movflags', '+faststart') // Web optimization
        .addOption('-pix_fmt', 'yuv420p') // Compatibility
        .addOption('-profile:v', 'high') // H.264 profile
        .addOption('-level', '4.2') // H.264 level
        .on('error', (err) => {
          unlink(tempOutputPath).catch(() => {});
          reject(err);
        })
        .on('end', () => resolve())
        .save(tempOutputPath);
    });

    // Read the processed file and store it
    const processedBuffer = await readFile(tempOutputPath);
    const url = await storeFile(processedBuffer, variantFilename);

    // Get file size
    const stats = await import('fs/promises').then(fs => fs.stat(tempOutputPath));

    variants[sizeName] = {
      url,
      width: targetWidth,
      height: targetHeight,
      size: stats.size,
    };

    // Clean up temp output file
    await unlink(tempOutputPath).catch(() => {});
  }

  // If no variants were created (source was very small), create at least one optimized version
  if (Object.keys(variants).length === 0) {
    const variantFilename = `videos/${id}-original.mp4`;
    const tempOutputPath = join(process.cwd(), 'temp', variantFilename);
    await mkdir(dirname(tempOutputPath), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempInputPath)
        .videoCodec(VIDEO_CONFIG.videoCodec)
        .audioCodec(VIDEO_CONFIG.audioCodec)
        .audioBitrate(VIDEO_CONFIG.audioBitrate)
        .addOption('-crf', String(VIDEO_CONFIG.crf))
        .addOption('-preset', VIDEO_CONFIG.preset)
        .addOption('-movflags', '+faststart')
        .addOption('-pix_fmt', 'yuv420p')
        .on('error', (err) => {
          unlink(tempOutputPath).catch(() => {});
          reject(err);
        })
        .on('end', () => resolve())
        .save(tempOutputPath);
    });

    const processedBuffer = await readFile(tempOutputPath);
    const url = await storeFile(processedBuffer, variantFilename);
    const stats = await import('fs/promises').then(fs => fs.stat(tempOutputPath));

    variants.original = {
      url,
      width: sourceWidth,
      height: sourceHeight,
      size: stats.size,
    };

    await unlink(tempOutputPath).catch(() => {});
  }

  // Clean up input temp file
  await unlink(tempInputPath).catch(() => {});

  // Generate hash
  const hash = await getFileHash(buffer);

  const result: ProcessedVideo = {
    id,
    originalName: filename,
    hash,
    variants,
    metadata: {
      width: sourceWidth,
      height: sourceHeight,
      duration: metadata.duration,
      format: 'mp4',
    },
  };

  return { result };
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
