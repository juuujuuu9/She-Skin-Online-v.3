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
  const auth = await checkAdminAuth(request);
  
  if (!auth.valid) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check CSRF
  const { validateCsrfToken } = await import('@lib/csrf');
  if (!validateCsrfToken(request)) {
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
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
    
    // Check file size (100MB limit)
    if (file.size > MEDIA_CONFIG.maxFileSize) {
      return new Response(
        JSON.stringify({ 
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 100MB.`
        }), 
        { status: 413, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = extname(file.name).toLowerCase();
    
    // Determine media type
    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');
    
    if (!isImage && !isAudio) {
      return new Response(
        JSON.stringify({ error: `Unsupported file type: ${file.type}` }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const type = isImage ? 'images' : 'audio';
    const allowedImageExts = ['.jpg', '.jpeg', '.png', '.tiff', '.webp'];
    const allowedAudioExts = ['.wav', '.aiff', '.flac', '.m4a'];
    
    if (isImage && !allowedImageExts.includes(ext)) {
      return new Response(
        JSON.stringify({ error: `Unsupported image format: ${ext}. Use: ${allowedImageExts.join(', ')}` }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    if (isAudio && !allowedAudioExts.includes(ext)) {
      return new Response(
        JSON.stringify({ error: `Unsupported audio format: ${ext}. Use: ${allowedAudioExts.join(', ')}` }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // DIRECT UPLOAD MODE: Upload immediately to CDN (for work editors)
    if (direct) {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
      const filename = `${folder}/${timestamp}-${safeName}`;
      
      const url = await uploadToBunny(buffer, filename, {
        contentType: file.type,
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          url,
          filename: safeName,
          size: buffer.length,
          mode: 'direct',
        }), 
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    // QUEUE MODE: Save to disk and add to manifest for background processing
    // Sanitize filename
    const sanitizedName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    const id = basename(sanitizedName, ext);
    
    // Save to originals folder
    const originalsDir = join(MEDIA_CONFIG.sourceDir, type);
    await mkdir(originalsDir, { recursive: true });
    const originalPath = join(originalsDir, sanitizedName);
    
    await writeFile(originalPath, buffer);
    
    // Add to pending queue
    const manifest = await loadManifest();
    
    // Remove from pending if already exists (re-upload)
    manifest.pending = manifest.pending.filter(p => p.id !== id);
    
    const pending: PendingFile = {
      id,
      filename: sanitizedName,
      type: isImage ? 'image' : 'audio',
      originalPath: `media/originals/${type}/${sanitizedName}`,
      status: 'pending',
      uploadedAt: new Date().toISOString(),
    };
    
    manifest.pending.push(pending);
    await saveManifest(manifest);
    
    return new Response(
      JSON.stringify({
        success: true,
        id,
        type: pending.type,
        status: 'pending',
        mode: 'queued',
        message: 'File uploaded and queued for processing',
      }), 
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Media upload error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Upload failed' 
      }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// Disable body parsing for multipart
export const config = {
  bodyParser: false,
};
