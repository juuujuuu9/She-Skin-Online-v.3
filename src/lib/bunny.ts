/**
 * Bunny.net CDN Integration
 * 
 * For uploading and managing product images
 */

import { readFile } from 'fs/promises';
import { extname } from 'path';

function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
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

export interface UploadOptions {
  contentType?: string;
}

/**
 * Upload a file to Bunny.net storage
 * 
 * @param file - File buffer 
 * @param filename - Desired filename in storage (include path if needed)
 * @returns CDN URL of uploaded file
 */
export async function uploadToBunny(
  file: Buffer,
  filename: string,
  options?: UploadOptions
): Promise<string> {
  const apiKey = process.env.BUNNY_API_KEY;
  const storageZone = process.env.BUNNY_STORAGE_ZONE;
  const cdnUrl = process.env.BUNNY_CDN_URL;
  const storageEndpoint = process.env.BUNNY_STORAGE_ENDPOINT || 'storage.bunnycdn.com';

  if (!apiKey || !storageZone) {
    throw new Error('Bunny.net credentials not configured');
  }

  const contentType = options?.contentType || getMimeType(filename);
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
    throw new Error(`Bunny.net upload failed: ${response.status} ${errorText}`);
  }

  const encodedPath = cleanFilename.split('/').map(segment => encodeURIComponent(segment)).join('/');
  
  if (cdnUrl) {
    const cleanCdnUrl = cdnUrl.endsWith('/') ? cdnUrl.slice(0, -1) : cdnUrl;
    return `${cleanCdnUrl}/${encodedPath}`;
  }
  throw new Error('BUNNY_CDN_URL not configured');
}

/**
 * Upload an image file (path or buffer)
 */
export async function uploadImageToBunny(
  file: Buffer | string,
  filename: string
): Promise<string> {
  const fileBuffer = typeof file === 'string' ? await readFile(file) : file;
  return uploadToBunny(fileBuffer, filename, { contentType: getMimeType(filename) });
}

/**
 * Delete a file from Bunny.net storage
 */
export async function deleteFromBunny(filename: string): Promise<void> {
  const apiKey = process.env.BUNNY_API_KEY;
  const storageZone = process.env.BUNNY_STORAGE_ZONE;
  const storageEndpoint = process.env.BUNNY_STORAGE_ENDPOINT || 'storage.bunnycdn.com';

  if (!apiKey || !storageZone) {
    throw new Error('Bunny.net credentials not configured');
  }

  const cleanFilename = filename.startsWith('/') ? filename.slice(1) : filename;
  const deleteUrl = `https://${storageEndpoint}/${storageZone}/${cleanFilename}`;
  
  const response = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: { 'AccessKey': apiKey },
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Bunny.net delete failed: ${response.status} ${errorText}`);
  }
}
