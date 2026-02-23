/**
 * Bunny Storage Upload Webhook Handler
 * 
 * Bunny calls this endpoint after file upload completes.
 * We save metadata to DB and trigger post-processing (Sharp/FFmpeg).
 */

import type { APIRoute } from 'astro';
import { db } from '@lib/db';
import { media } from '@lib/db/schema';
import { logAction, AuditActions, AuditResources } from '@lib/audit';

interface BunnyUploadPayload {
  // Bunny Storage webhook payload
  StorageZoneName: string;
  Path: string;
  ObjectName: string;
  IsDirectory: boolean;
  Size: number;
  LastChanged: string;
  ServerId: number;
  UserId: string;
  DateCreated: string;
  StorageZoneId: number;
  // Custom metadata we send with upload
  Metadata?: {
    uploadedBy?: string;
    source?: 'admin' | 'works-editor';
  };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // Verify webhook signature (Bunny provides signature in headers)
    const signature = request.headers.get('X-Bunny-Signature');
    const webhookSecret = import.meta.env.BUNNY_WEBHOOK_SECRET;
    
    if (webhookSecret && signature) {
      // TODO: Verify signature if you set a webhook secret in Bunny
      // For now, we trust Bunny's IP whitelist
    }

    const payload: BunnyUploadPayload = await request.json();
    
    // Skip directories
    if (payload.IsDirectory) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // Determine file type
    const fileName = payload.ObjectName.toLowerCase();
    let mediaType: 'image' | 'audio' | 'video' | 'document' = 'document';
    
    if (/\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(fileName)) {
      mediaType = 'image';
    } else if (/\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(fileName)) {
      mediaType = 'audio';
    } else if (/\.(mp4|webm|mov|avi)$/i.test(fileName)) {
      mediaType = 'video';
    }

    // Build CDN URL
    const cdnUrl = `${import.meta.env.BUNNY_CDN_URL}/${payload.Path}${payload.ObjectName}`;
    
    // Generate unique ID for our DB
    const mediaId = `med_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Save to database
    const [savedMedia] = await db.insert(media).values({
      id: mediaId,
      originalName: payload.ObjectName,
      cdnUrl: cdnUrl,
      bunnyPath: `${payload.Path}${payload.ObjectName}`,
      size: payload.Size,
      mediaType: mediaType,
      status: 'pending', // Will be 'processed' after Sharp/FFmpeg runs
      metadata: {
        bunnyStorageZone: payload.StorageZoneName,
        bunnyServerId: payload.ServerId,
        uploadedVia: 'bunny-widget',
        source: payload.Metadata?.source || 'unknown',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    // Log the upload
    await logAction(
      request,
      null, // Will be set if we pass user info in metadata
      payload.Metadata?.uploadedBy || 'unknown',
      AuditActions.CREATE,
      AuditResources.MEDIA,
      mediaId,
      { 
        fileName: payload.ObjectName,
        size: payload.Size,
        type: mediaType,
      },
      true,
      'File uploaded via Bunny Widget'
    );

    // Trigger post-processing (Sharp for images, FFmpeg for audio)
    // This runs async - we don't wait for it
    await triggerPostProcessing(mediaId, cdnUrl, mediaType);

    return new Response(JSON.stringify({ 
      success: true, 
      mediaId,
      status: 'pending_processing'
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Bunny Webhook] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to process upload',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

async function triggerPostProcessing(
  mediaId: string, 
  cdnUrl: string, 
  mediaType: 'image' | 'audio' | 'video' | 'document'
) {
  try {
    // Call your existing media processor
    // This could be a queue job, direct function call, or API call
    
    if (mediaType === 'image') {
      // Trigger Sharp processing (generate thumbnails, WebP, AVIF)
      await fetch(`${import.meta.env.SITE_URL}/api/admin/media/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId, cdnUrl }),
      });
    } else if (mediaType === 'audio') {
      // Trigger FFmpeg processing (waveform, transcoding)
      await fetch(`${import.meta.env.SITE_URL}/api/admin/audio/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId, cdnUrl }),
      });
    }
    
    // For video, you might want Bunny Stream instead
    // For documents, no processing needed
    
  } catch (error) {
    console.error('[Post-processing] Failed to trigger:', error);
    // Don't fail the upload - processing can be retried manually
  }
}
