/**
 * Upload Service - Unified media upload handling
 * 
 * This service provides a single interface for all media uploads across
 * Works, Audio, and Uploads admin pages.
 */

import { db } from './db';
import { media } from './db/schema';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import { uploadToBunny, deleteFromBunny } from './bunny';
import { nanoid } from './nanoid';
import { processImageBuffer, processVideoBuffer, type ProcessedImage, type ProcessedVideo } from './media-process';
import type { Media } from './db/schema';
import { unlink } from 'fs/promises';
import { join } from 'path';

// Upload configuration
export const UPLOAD_CONFIG = {
  maxSizeBytes: 500 * 1024 * 1024, // 500MB
  maxSizeMB: 500,
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

// Upload options
export interface UploadOptions {
  altText?: string;
  processImage?: boolean; // Generate WebP variants
  uploadedBy?: string;
}

// List options
export interface ListMediaOptions {
  type?: 'image' | 'audio' | 'video' | 'document';
  search?: string;
  limit?: number;
  offset?: number;
  unusedOnly?: boolean;
}

// Upload result
export interface UploadResult {
  success: boolean;
  media?: Media;
  error?: string;
}

/**
 * Get media type from MIME type
 */
function getMediaType(mimeType: string): 'image' | 'audio' | 'video' | 'document' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

/**
 * Validate file before upload
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > UPLOAD_CONFIG.maxSizeBytes) {
    return {
      valid: false,
      error: `File too large. Max size: ${UPLOAD_CONFIG.maxSizeMB}MB`,
    };
  }

  // Check MIME type
  const allowedTypes = Object.keys(UPLOAD_CONFIG.allowedTypes);
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type "${file.type}" not allowed`,
    };
  }

  // Check extension
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const allowedExts = Object.values(UPLOAD_CONFIG.allowedTypes).flat();
  if (!allowedExts.includes(`.${ext}`)) {
    return {
      valid: false,
      error: `File extension ".${ext}" not allowed`,
    };
  }

  return { valid: true };
}

/**
 * Process image and generate WebP variants
 */
async function processAndUploadImage(
  buffer: Buffer,
  id: string,
  datePath: string,
  friendlyFilename: string
): Promise<{ variants: ProcessedImage['variants']; width: number; height: number; blurhash: string; dominantColor: string; mainUrl: string }> {
  // Use friendly filename (without extension) for processing path
  const baseName = friendlyFilename.replace(/\.webp$/, '');
  const filenameForProcessing = `${datePath}/${baseName}.webp`;
  const { result } = await processImageBuffer(buffer, filenameForProcessing);

  // Upload variants to Bunny
  const variants: ProcessedImage['variants'] = {};

  for (const [sizeName, variantData] of Object.entries(result.variants)) {
    // Get the file buffer from the processed result
    // The variant URL in result is local, we need to upload to Bunny
    const variantBuffer = await fetchVariantBuffer(variantData.url);
    if (variantBuffer) {
      const bunnyUrl = await uploadToBunny(
        variantBuffer,
        `${datePath}/${baseName}-${sizeName}.webp`,
        { contentType: 'image/webp' }
      );

      variants[sizeName] = {
        url: bunnyUrl,
        width: variantData.width,
        height: variantData.height,
        size: variantBuffer.length,
      };
    }
  }

  const mainUrl = variants.xl?.url || variants.lg?.url || variants.md?.url || variants.sm?.url || '';

  // Clean up temporary local files after successful upload
  await cleanupTempFiles(result.variants);

  return {
    variants,
    width: result.metadata.width,
    height: result.metadata.height,
    blurhash: result.blurhash,
    dominantColor: result.dominantColor,
    mainUrl,
  };
}

/**
 * Process video and generate H.264 variants
 */
async function processAndUploadVideo(
  buffer: Buffer,
  id: string,
  datePath: string,
  friendlyFilename: string
): Promise<{ variants: ProcessedVideo['variants']; width: number; height: number; mainUrl: string }> {
  // Use friendly filename (without extension) for processing path
  const baseName = friendlyFilename.replace(/\.[^/.]+$/, '');
  const filenameForProcessing = `${datePath}/${baseName}.mp4`;
  const { result } = await processVideoBuffer(buffer, filenameForProcessing);

  // Upload variants to Bunny
  const variants: ProcessedVideo['variants'] = {};

  for (const [sizeName, variantData] of Object.entries(result.variants)) {
    // Get the file buffer from the processed result
    const variantBuffer = await fetchVariantBuffer(variantData.url);
    if (variantBuffer) {
      const bunnyUrl = await uploadToBunny(
        variantBuffer,
        `${datePath}/${baseName}-${sizeName}.mp4`,
        { contentType: 'video/mp4' }
      );

      variants[sizeName] = {
        url: bunnyUrl,
        width: variantData.width,
        height: variantData.height,
        size: variantBuffer.length,
      };
    }
  }

  const mainUrl = variants['1080p']?.url || variants['720p']?.url || variants['480p']?.url || variants.original?.url || '';

  // Clean up temporary local files after successful upload
  await cleanupTempFiles(result.variants);

  return {
    variants,
    width: result.metadata.width,
    height: result.metadata.height,
    mainUrl,
  };
}

/**
 * Fetch variant buffer from local file (helper for image processing)
 */
async function fetchVariantBuffer(url: string): Promise<Buffer | null> {
  try {
    // URL is like "/media/images/file.webp" - convert to local path
    const localPath = url.replace('/media/', '');
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    const filePath = join(process.cwd(), 'public', 'media', localPath);
    return await readFile(filePath);
  } catch {
    return null;
  }
}

/**
 * Clean up temporary local files after upload to Bunny
 */
async function cleanupTempFiles(variants: ProcessedImage['variants']): Promise<void> {
  for (const variantData of Object.values(variants)) {
    try {
      // URL is like "/media/images/file.webp" - convert to local path
      const localPath = variantData.url.replace('/media/', '');
      const filePath = join(process.cwd(), 'public', 'media', localPath);
      await unlink(filePath);
    } catch {
      // Ignore errors (file may not exist or already deleted)
    }
  }
}

/**
 * Generate a human-friendly filename from original name
 * Sanitizes, adds short unique suffix for collision resistance
 */
function generateFriendlyFilename(originalName: string, newExt?: string): string {
  // Extract base name (remove extension)
  const baseName = originalName.replace(/\.[^/.]+$/, '');
  
  // Sanitize: lowercase, replace non-alphanumeric with hyphens, collapse multiple hyphens
  const sanitized = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')      // Trim leading/trailing hyphens
    .substring(0, 50);             // Limit length
  
  // Add short unique suffix (6 chars from nanoid alphabet)
  const shortUnique = nanoid(6);
  
  // Use provided extension or preserve original
  const ext = newExt || originalName.split('.').pop()?.toLowerCase() || 'bin';
  
  return `${sanitized}-${shortUnique}.${ext}`;
}

/**
 * Upload a media file to the database and CDN
 */
export async function uploadMedia(
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  try {
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const id = nanoid();
    const now = new Date();
    const datePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const mediaType = getMediaType(file.type);
    const originalName = file.name;
    const ext = originalName.split('.').pop()?.toLowerCase() || '';

    let mainUrl: string;
    let variants: Media['variants'] = undefined;
    let width: number | undefined;
    let height: number | undefined;
    let blurhash: string | undefined;
    let dominantColor: string | undefined;
    let fileSize = file.size;

    const buffer = Buffer.from(await file.arrayBuffer());

    // Generate friendly filename for images (converted to webp)
    // or use original name for non-image files
    const friendlyFilename = mediaType === 'image'
      ? generateFriendlyFilename(originalName, 'webp')
      : generateFriendlyFilename(originalName);

    if (mediaType === 'image' && options.processImage !== false) {
      // Process image with Sharp, upload variants
      const processed = await processAndUploadImage(buffer, id, datePath, friendlyFilename);
      mainUrl = processed.mainUrl;
      variants = processed.variants;
      width = processed.width;
      height = processed.height;
      blurhash = processed.blurhash;
      dominantColor = processed.dominantColor;

      // Calculate total size of all variants
      fileSize = Object.values(variants || {}).reduce((sum, v) => sum + (v?.size || 0), 0);
    } else if (mediaType === 'video') {
      // Process video with ffmpeg, upload variants
      const processed = await processAndUploadVideo(buffer, id, datePath, friendlyFilename);
      mainUrl = processed.mainUrl;
      variants = processed.variants;
      width = processed.width;
      height = processed.height;

      // Calculate total size of all variants
      fileSize = Object.values(variants || {}).reduce((sum, v) => sum + (v?.size || 0), 0);
    } else {
      // Upload raw file for audio, documents
      const filename = `${datePath}/${friendlyFilename}`;
      mainUrl = await uploadToBunny(buffer, filename, { contentType: file.type });
    }

    // Insert into database
    const [newMedia] = await db.insert(media).values({
      id,
      filename: friendlyFilename,
      originalName,
      mimeType: mediaType === 'image' ? 'image/webp' : mediaType === 'video' ? 'video/mp4' : file.type,
      fileSize,
      url: mainUrl,
      path: `${datePath}/${id}`,
      variants,
      width,
      height,
      blurhash,
      dominantColor,
      refCount: 0,
      mediaType,
      altText: options.altText || null,
      uploadedBy: options.uploadedBy || 'admin',
      createdAt: now,
      updatedAt: now,
    }).returning();

    return {
      success: true,
      media: newMedia,
    };
  } catch (error) {
    console.error('[uploadMedia] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Get a single media item by ID
 */
export async function getMedia(id: string): Promise<Media | null> {
  try {
    const result = await db.select().from(media).where(eq(media.id, id)).limit(1);
    return result[0] || null;
  } catch (error) {
    console.error('[getMedia] Error:', error);
    return null;
  }
}

/**
 * List media with optional filtering
 */
export async function listMedia(options: ListMediaOptions = {}): Promise<{
  media: Media[];
  total: number;
  hasMore: boolean;
}> {
  const {
    type,
    search,
    limit = 50,
    offset = 0,
    unusedOnly = false,
  } = options;

  try {
    const conditions: Array<any> = [isNull(media.deletedAt)];

    if (type) {
      conditions.push(eq(media.mediaType, type));
    }

    if (unusedOnly) {
      conditions.push(eq(media.refCount, 0));
    }

    if (search) {
      conditions.push(sql`${media.filename} ILIKE ${`%${search}%`} OR ${media.originalName} ILIKE ${`%${search}%`}`);
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    const mediaList = await db.select().from(media).where(whereClause).orderBy(desc(media.createdAt)).limit(limit).offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(media)
      .where(whereClause);

    const total = countResult[0]?.count || 0;

    return {
      media: mediaList,
      total,
      hasMore: offset + mediaList.length < total,
    };
  } catch (error) {
    console.error('[listMedia] Error:', error);
    return { media: [], total: 0, hasMore: false };
  }
}

/**
 * Delete a media item
 * Checks ref count before deleting (unless force=true)
 */
export async function deleteMedia(
  id: string,
  force = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const mediaItem = await getMedia(id);
    if (!mediaItem) {
      return { success: false, error: 'Media not found' };
    }

    // Check if media is in use
    if (mediaItem.refCount > 0 && !force) {
      return {
        success: false,
        error: `Cannot delete media that is still in use (${mediaItem.refCount} references)`,
      };
    }

    // Delete from Bunny CDN
    try {
      await deleteFromBunny(mediaItem.path);
      
      // Delete variants if image
      if (mediaItem.variants && typeof mediaItem.variants === 'object') {
        const v = mediaItem.variants as Record<string, { url?: string }>;
        for (const key of Object.keys(v)) {
          if (v[key]?.url) {
            try {
              // Extract path from URL
              const url = v[key].url!;
              const pathMatch = url.match(/\/([^/]+\/)?([^/]+-\w+\.webp)$/);
              if (pathMatch) {
                await deleteFromBunny(`${mediaItem.path}/${key}.webp`);
              }
            } catch (e) {
              console.warn(`[deleteMedia] Failed to delete variant ${key}:`, e);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[deleteMedia] CDN delete failed (may already be deleted):', e);
    }

    // Delete from database
    await db.delete(media).where(eq(media.id, id));

    return { success: true };
  } catch (error) {
    console.error('[deleteMedia] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    };
  }
}

/**
 * Update media metadata
 */
export async function updateMedia(
  id: string,
  updates: { altText?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Partial<typeof media.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (updates.altText !== undefined) {
      updateData.altText = updates.altText;
    }

    await db.update(media).set(updateData).where(eq(media.id, id));

    return { success: true };
  } catch (error) {
    console.error('[updateMedia] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Update failed',
    };
  }
}

/**
 * Increment reference count for media
 */
export async function incrementRefCount(id: string): Promise<void> {
  const current = await getMedia(id);
  if (!current) return;
  
  await db
    .update(media)
    .set({
      refCount: current.refCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(media.id, id));
}

/**
 * Decrement reference count for media
 */
export async function decrementRefCount(id: string): Promise<void> {
  const current = await getMedia(id);
  if (!current) return;
  
  await db
    .update(media)
    .set({
      refCount: Math.max(current.refCount - 1, 0),
      updatedAt: new Date(),
    })
    .where(eq(media.id, id));
}

/**
 * Media manifest interface
 */
export interface MediaManifest {
  pending: Array<{
    id: string;
    status: 'pending' | 'processing' | 'error';
    createdAt: string;
    [key: string]: unknown;
  }>;
  images: Record<string, {
    id: string;
    originalName: string;
    createdAt: string;
    metadata: { width?: number; height?: number };
    variants: Record<string, { url: string; size: number }>;
  }>;
  audio: Record<string, {
    id: string;
    originalName: string;
    createdAt: string;
    metadata: { format?: string };
    variants: { original?: { url: string; size: number } };
  }>;
  video: Record<string, {
    id: string;
    originalName: string;
    createdAt: string;
    metadata: { format?: string; duration?: number; width?: number; height?: number };
    variants: Record<string, { url: string; size: number; width: number; height: number }>;
  }>;
}

/**
 * Load the media manifest from disk
 */
export async function loadManifest(): Promise<MediaManifest> {
  const { readFile } = await import('fs/promises');
  const { join } = await import('path');
  
  try {
    const manifestPath = join(process.cwd(), 'public', 'data', 'media-manifest.json');
    const content = await readFile(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Return empty manifest if file doesn't exist or can't be read
    return {
      pending: [],
      images: {},
      audio: {},
      video: {},
    };
  }
}
