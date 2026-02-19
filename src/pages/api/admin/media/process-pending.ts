import type { APIRoute } from 'astro';
import { isAdminAuthenticated } from '@lib/admin-auth';
import { 
  processMediaFile, 
  loadManifest, 
  saveManifest,
  type PendingFile,
  type ProcessingResult
} from '@lib/media-process';
import { readFile } from 'fs/promises';

export const POST: APIRoute = async ({ request }) => {
  const auth = isAdminAuthenticated(request);
  if (auth === false) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }), 
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    const manifest = await loadManifest();
    const pending = manifest.pending.filter(p => p.status === 'pending');
    
    if (pending.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0,
          message: 'No pending files to process' 
        }), 
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    
    // Process each pending file sequentially
    // NOTE: This may hit timeout for very long audio. In that case,
    // processing continues in background but client gets partial results.
    for (const file of pending) {
      try {
        // Update status to processing
        file.status = 'processing';
        await saveManifest(manifest);
        
        // Read the original file
        const buffer = await readFile(file.originalPath);
        
        // Process it
        const result: ProcessingResult = await processMediaFile(
          buffer, 
          file.filename, 
          manifest
        );
        
        // Update manifest with result
        if (result.type === 'image') {
          manifest.images[result.data.id] = result.data;
        } else {
          manifest.audio[result.data.id] = result.data;
        }
        
        // Remove from pending
        manifest.pending = manifest.pending.filter(p => p.id !== file.id);
        
        results.push({ id: file.id, success: true });
        
      } catch (error) {
        console.error(`Failed to process ${file.id}:`, error);
        
        // Update pending with error
        const pendingFile = manifest.pending.find(p => p.id === file.id);
        if (pendingFile) {
          pendingFile.status = 'error';
          pendingFile.error = error instanceof Error ? error.message : 'Processing failed';
        }
        
        results.push({ 
          id: file.id, 
          success: false, 
          error: error instanceof Error ? error.message : 'Processing failed'
        });
      }
      
      // Save after each file in case of timeout
      await saveManifest(manifest);
    }
    
    manifest.lastProcessed = new Date().toISOString();
    await saveManifest(manifest);
    
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.length - successCount;
    
    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        succeeded: successCount,
        failed: errorCount,
        results,
        message: `${successCount} processed, ${errorCount} failed`,
      }), 
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Process pending error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Processing failed' 
      }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// GET status of pending files
export const GET: APIRoute = async ({ request }) => {
  const auth = isAdminAuthenticated(request);
  if (auth === false) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }), 
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    const manifest = await loadManifest();
    
    return new Response(
      JSON.stringify({
        pending: manifest.pending,
        counts: {
          pending: manifest.pending.filter(p => p.status === 'pending').length,
          processing: manifest.pending.filter(p => p.status === 'processing').length,
          error: manifest.pending.filter(p => p.status === 'error').length,
        },
        images: Object.keys(manifest.images).length,
        audio: Object.keys(manifest.audio).length,
      }), 
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to load status' 
      }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
