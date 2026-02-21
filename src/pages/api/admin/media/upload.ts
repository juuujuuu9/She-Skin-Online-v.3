import type { APIRoute } from 'astro';
import { isAdminAuthenticated, createSessionCookie } from '@lib/admin-auth';
import { 
  loadManifest, 
  saveManifest,
  MEDIA_CONFIG,
  type PendingFile 
} from '@lib/media-process';
import { writeFile, mkdir } from 'fs/promises';
import { join, basename, extname } from 'path';

export const POST: APIRoute = async ({ request, cookies }) => {
  // Check admin auth (use Astro cookies so session is read the same way login set it)
  const sessionValue = cookies.get('admin_session')?.value;
  const auth = isAdminAuthenticated(request, sessionValue);
  if (auth === false) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }), 
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
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
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 100MB. Consider compressing to FLAC or reducing sample rate.`
        }), 
        { status: 413, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
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
    const ext = extname(file.name).toLowerCase();
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
    
    const buffer = Buffer.from(await file.arrayBuffer());
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
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth && typeof auth === 'object' && auth.setCookie) {
      const { name, value, options } = createSessionCookie();
      headers['Set-Cookie'] = `${name}=${value}; ${options}`;
    }
    return new Response(
      JSON.stringify({
        success: true,
        id,
        type: pending.type,
        status: 'pending',
        message: 'File uploaded and queued for processing',
      }), 
      { status: 200, headers }
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
