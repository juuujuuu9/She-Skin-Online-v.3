export const prerender = false;

import type { APIRoute } from 'astro';
import { checkAdminAuth } from '@lib/admin-auth';
import {
  loadManifest,
  saveManifest,
  MEDIA_CONFIG,
  type PendingFile
} from '@lib/media-process';
import { uploadToBunny } from '@lib/bunny';
import { writeFile, mkdir } from 'fs/promises';
import { join, basename, extname } from 'path';

export const POST: APIRoute = async ({ request }) => {
  // Log upload attempt for debugging
  console.log('[upload] Received upload request');

  const cookieHeader = request.headers.get('cookie');
  const csrfHeader = request.headers.get('X-CSRF-Token');

  console.log('[upload] Cookie header:', cookieHeader ? `present (length: ${cookieHeader.length})` : 'MISSING');
  if (cookieHeader) {
    const cookieNames = cookieHeader.split(';').map(c => c.split('=')[0].trim());
    console.log('[upload] Cookie names found:', cookieNames.join(', '));
    const hasSession = cookieNames.includes('admin_session');
    const hasCsrf = cookieNames.includes('csrf_token');
    console.log('[upload] Has admin_session:', hasSession);
    console.log('[upload] Has csrf_token:', hasCsrf);
  }
  console.log('[upload] X-CSRF-Token header:', csrfHeader ? `present (length: ${csrfHeader.length})` : 'MISSING');
  console.log('[upload] Origin:', request.headers.get('origin'));

  const auth = await checkAdminAuth(request);

  if (!auth.valid) {
    console.log('[upload] Auth failed:', auth.debug);
    return new Response(
      JSON.stringify({ error: 'Unauthorized', reason: auth.debug || 'unknown' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log('[upload] Auth success, user:', auth.userId);

  // Check CSRF
  const { validateCsrfToken } = await import('@lib/csrf');
  if (!validateCsrfToken(request)) {
    console.log('[upload] CSRF validation failed');
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log('[upload] CSRF validation success');

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    // Support both 'folder' (legacy) and 'folder' param names
    const folder = (formData.get('folder') as string) || 'uploads';
    const direct = formData.get('direct') === 'true' || folder !== 'uploads';

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate file type
    const allowedTypes = Object.keys(MEDIA_CONFIG.allowedTypes);
    if (!allowedTypes.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: `File type ${file.type} not allowed` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate file size
    const maxSize = MEDIA_CONFIG.maxSizeBytes;
    if (file.size > maxSize) {
      return new Response(
        JSON.stringify({ error: `File too large. Max size: ${MEDIA_CONFIG.maxSizeMB}MB` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get file extension
    const ext = extname(file.name).toLowerCase();
    if (!ext) {
      return new Response(
        JSON.stringify({ error: 'File must have an extension' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check extension against allowed types
    const allowedExts = Object.values(MEDIA_CONFIG.allowedTypes).flat();
    if (!allowedExts.includes(ext)) {
      return new Response(
        JSON.stringify({ error: `File extension ${ext} not allowed` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Determine media type from folder or file type
    let type: 'image' | 'audio' | 'video' | 'document' = 'document';
    if (folder === 'audio' || file.type.startsWith('audio/')) {
      type = 'audio';
    } else if (file.type.startsWith('video/')) {
      type = 'video';
    } else if (file.type.startsWith('image/')) {
      type = 'image';
    }

    // Save file to temp directory for later processing
    const tmpDir = join(process.cwd(), 'tmp', 'uploads');
    await mkdir(tmpDir, { recursive: true });
    const timestamp = Date.now();
    const id = `${type}_${timestamp}_${Math.random().toString(36).substring(2, 9)}`;
    const tmpPath = join(tmpDir, `${id}${ext}`);
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(tmpPath, Buffer.from(arrayBuffer));

    // Create pending file entry with path
    const pendingFile: PendingFile = {
      id,
      originalName: file.name,
      type,
      folder,
      size: file.size,
      mimeType: file.type,
      uploadedAt: new Date().toISOString(),
      uploadedBy: auth.userId,
      status: 'pending',
      originalPath: tmpPath,
    };

    // Save to pending manifest
    const manifest = await loadManifest();
    manifest.pending.push(pendingFile);
    await saveManifest(manifest);

    console.log('[upload] Saved pending file:', { id, tmpPath, size: file.size });

    // If direct upload is requested (not pending), upload to Bunny immediately
    if (direct) {
      console.log('[upload] Direct upload requested, uploading to Bunny...');
      const bunnyResult = await uploadToBunny(tmpPath, `${folder}/${id}${ext}`);

      if (!bunnyResult.success) {
        // Update status to failed
        pendingFile.status = 'failed';
        pendingFile.error = bunnyResult.error || 'Upload to Bunny failed';
        const updatedManifest = await loadManifest();
        const idx = updatedManifest.pending.findIndex(p => p.id === id);
        if (idx >= 0) {
          updatedManifest.pending[idx] = pendingFile;
          await saveManifest(updatedManifest);
        }

        return new Response(
          JSON.stringify({ error: pendingFile.error }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Update to completed
      pendingFile.status = 'completed';
      pendingFile.bunnyUrl = bunnyResult.url;
      pendingFile.bunnyPath = bunnyResult.path;
      const updatedManifest = await loadManifest();
      const idx = updatedManifest.pending.findIndex(p => p.id === id);
      if (idx >= 0) {
        updatedManifest.pending[idx] = pendingFile;
        await saveManifest(updatedManifest);
      }

      console.log('[upload] Direct upload complete:', bunnyResult.url);

      return new Response(
        JSON.stringify({
          id,
          type,
          status: 'completed',
          url: bunnyResult.url,
          path: bunnyResult.path,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Return pending status
    return new Response(
      JSON.stringify({
        id,
        type,
        status: 'pending',
        message: 'File saved for processing. Use /api/admin/media/process-pending to process.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[upload] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Upload failed', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
