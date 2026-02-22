/**
 * Media Processing Library
 * Handles manifest management for uploaded media files
 */

import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { join, extname, basename } from 'path';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';

/**
 * Get media duration using FFmpeg
 * Returns duration in seconds
 */
async function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error('FFprobe error:', err);
        resolve(0);
        return;
      }
      const duration = metadata.format?.duration || 0;
      resolve(Math.round(duration));
    });
  });
}

/**
 * Get video dimensions using FFmpeg
 */
async function getVideoDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        resolve(null);
        return;
      }
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (videoStream?.width && videoStream?.height) {
        resolve({ width: videoStream.width, height: videoStream.height });
      } else {
        resolve(null);
      }
    });
  });
}

// Media configuration
export const MEDIA_CONFIG = {
  maxSizeMB: 500, // Increased for video
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
};

// Types
export interface PendingFile {
  id: string;
  originalName: string;
  type: 'image' | 'audio' | 'video' | 'document';
  folder: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'error';
  error?: string;
  originalPath?: string;
  bunnyUrl?: string;
  bunnyPath?: string;
}

export interface ProcessedMedia {
  id: string;
  type: 'image' | 'audio' | 'video';
  originalName: string;
  variants: Record<string, {
    url: string;
    size: number;
    width?: number;
    height?: number;
  }>;
  metadata: {
    width?: number;
    height?: number;
    duration?: number;
    format?: string;
  };
  createdAt: string;
}

export interface MediaManifest {
  pending: PendingFile[];
  images: Record<string, ProcessedMedia>;
  audio: Record<string, ProcessedMedia>;
  video: Record<string, ProcessedMedia>;
}

const MANIFEST_PATH = join(process.cwd(), 'data', 'media-manifest.json');

/**
 * Load the media manifest from disk
 */
export async function loadManifest(): Promise<MediaManifest> {
  try {
    const data = await readFile(MANIFEST_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    // Return empty manifest if file doesn't exist
    return {
      pending: [],
      images: {},
      audio: {},
    };
  }
}

/**
 * Save the media manifest to disk
 */
export async function saveManifest(manifest: MediaManifest): Promise<void> {
  const dir = join(process.cwd(), 'data');
  await mkdir(dir, { recursive: true });
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
}

// Processing result type
export interface ProcessingResult {
  type: 'image' | 'audio';
  data: ProcessedMedia;
}

// Public media directory
const PUBLIC_MEDIA_DIR = join(process.cwd(), 'public', 'media');

// Image processing config
const IMAGE_CONFIG = {
  sizes: {
    sm: { width: 400, height: 400, fit: 'inside' as const },
    md: { width: 800, height: 800, fit: 'inside' as const },
    lg: { width: 1600, height: 1600, fit: 'inside' as const },
  },
  quality: 85,
  effort: 6,
};

/**
 * Store file in public directory
 */
async function storeFile(buffer: Buffer, filename: string): Promise<string> {
  const filePath = join(PUBLIC_MEDIA_DIR, filename);
  await mkdir(PUBLIC_MEDIA_DIR, { recursive: true });
  await writeFile(filePath, buffer);
  return `/media/${filename}`;
}

/**
 * Process image with Sharp - convert to WebP with multiple sizes
 */
async function processImageWithSharp(
  buffer: Buffer,
  id: string
): Promise<ProcessedMedia> {
  const image = sharp(buffer);
  const metadata = await image.metadata();

  const variants: Record<string, { url: string; size: number; width?: number; height?: number }> = {};

  // Generate WebP variants at different sizes
  for (const [sizeName, sizeConfig] of Object.entries(IMAGE_CONFIG.sizes)) {
    const processedBuffer = await image
      .clone()
      .resize(sizeConfig.width, sizeConfig.height, {
        fit: sizeConfig.fit,
        withoutEnlargement: true,
      })
      .webp({
        quality: IMAGE_CONFIG.quality,
        effort: IMAGE_CONFIG.effort,
        smartSubsample: true,
      })
      .toBuffer();

    const filename = `${id}-${sizeName}.webp`;
    const url = await storeFile(processedBuffer, filename);

    variants[sizeName] = {
      url,
      size: processedBuffer.length,
      width: sizeConfig.width,
      height: sizeConfig.height,
    };
  }

  return {
    id,
    type: 'image',
    originalName: `${id}.jpg`,
    variants,
    metadata: {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: 'webp',
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Process audio file - store original and extract metadata
 */
async function processAudioFile(
  buffer: Buffer,
  id: string,
  originalName: string
): Promise<ProcessedMedia> {
  const ext = extname(originalName).toLowerCase() || '.mp3';
  const filename = `${id}${ext}`;

  // Write to temp file for FFprobe
  const tmpDir = join(process.cwd(), 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const tmpPath = join(tmpDir, filename);
  await writeFile(tmpPath, buffer);

  // Extract duration
  let duration = 0;
  try {
    duration = await getMediaDuration(tmpPath);
    console.log(`[processAudioFile] Duration: ${duration}s for ${id}`);
  } catch (err) {
    console.error(`[processAudioFile] Failed to get duration for ${id}:`, err);
  }

  // Store the file
  const url = await storeFile(buffer, filename);

  // Clean up temp file
  try {
    await unlink(tmpPath);
  } catch {
    // Ignore cleanup errors
  }

  return {
    id,
    type: 'audio',
    originalName,
    variants: {
      original: { url, size: buffer.length },
    },
    metadata: {
      format: ext.slice(1) || 'mp3',
      duration,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Process video file - store original and extract metadata
 */
async function processVideoFile(
  buffer: Buffer,
  id: string,
  originalName: string,
  mimeType: string
): Promise<ProcessedMedia> {
  const ext = extname(originalName).toLowerCase() || '.mp4';
  const filename = `${id}${ext}`;

  // Write to temp file for FFprobe
  const tmpDir = join(process.cwd(), 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const tmpPath = join(tmpDir, filename);
  await writeFile(tmpPath, buffer);

  // Extract duration and dimensions
  let duration = 0;
  let width = 1920;
  let height = 1080;

  try {
    duration = await getMediaDuration(tmpPath);
    const dimensions = await getVideoDimensions(tmpPath);
    if (dimensions) {
      width = dimensions.width;
      height = dimensions.height;
    }
    console.log(`[processVideoFile] Duration: ${duration}s, ${width}x${height} for ${id}`);
  } catch (err) {
    console.error(`[processVideoFile] Failed to get metadata for ${id}:`, err);
  }

  // Store the file
  const url = await storeFile(buffer, filename);

  // Clean up temp file
  try {
    await unlink(tmpPath);
  } catch {
    // Ignore cleanup errors
  }

  return {
    id,
    type: 'video',
    originalName,
    variants: {
      original: { url, size: buffer.length },
    },
    metadata: {
      format: ext.slice(1) || 'mp4',
      duration,
      width,
      height,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Process a media file (image, audio, or video)
 * Images are converted to WebP with multiple sizes for optimal performance
 */
export async function processMediaFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  manifest: MediaManifest
): Promise<ProcessingResult> {
  const ext = extname(filename).toLowerCase();
  const id = filename.replace(/\.[^.]+$/, '');
  const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.gif'].includes(ext);
  const isAudio = ['.wav', '.aiff', '.flac', '.m4a', '.mp3', '.ogg'].includes(ext);
  const isVideo = ['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.avi'].includes(ext);

  if (isImage) {
    const result = await processImageWithSharp(buffer, id);

    console.log(`[processMediaFile] Image processed: ${id}`);
    console.log(`  Original size: ${(buffer.length / 1024).toFixed(1)}KB`);
    console.log(`  WebP sizes: sm=${(result.variants.sm.size / 1024).toFixed(1)}KB, md=${(result.variants.md.size / 1024).toFixed(1)}KB, lg=${(result.variants.lg.size / 1024).toFixed(1)}KB`);

    return { type: 'image', data: result };
  }

  if (isAudio) {
    const result = await processAudioFile(buffer, id, filename);
    return { type: 'audio', data: result };
  }

  if (isVideo) {
    const result = await processVideoFile(buffer, id, filename, mimeType);
    console.log(`[processMediaFile] Video stored: ${id} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
    return { type: 'video', data: result };
  }

  throw new Error(`Unsupported file type: ${ext}`);
}