/**
 * Admin API — Upload images to Bunny.net CDN
 * 
 * POST /api/admin/upload
 * Body: FormData with 'file' and optional 'folder'
 */

import type { APIRoute } from 'astro';
import { checkAdminAuth } from '@lib/admin-auth';
import { uploadToBunny } from '@lib/bunny';

export const POST: APIRoute = async ({ request }) => {
  // Check auth
  const auth = checkAdminAuth(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = (formData.get('folder') as string) || 'uploads';
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return new Response(JSON.stringify({ error: 'File must be an image' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Generate filename
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
    const filename = `${folder}/${timestamp}-${safeName}`;
    
    // Upload to Bunny
    const url = await uploadToBunny(buffer, filename, {
      contentType: file.type,
    });
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        url,
        filename: safeName,
        size: buffer.length,
      }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
    
  } catch (error) {
    console.error('Upload error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Upload failed', 
        details: error.message 
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
