# BUNNY UPLOAD WIDGET - INTEGRATION GUIDE

## Quick Start

### 1. Environment Variables

Add to `.env`:
```bash
# Bunny Upload Widget
PUBLIC_BUNNY_UPLOAD_API_KEY=your-upload-api-key
PUBLIC_BUNNY_STORAGE_ZONE=she-skin
PUBLIC_BUNNY_CDN_URL=https://she-skin.b-cdn.net
BUNNY_WEBHOOK_SECRET=your-webhook-secret-optional
```

Get these from:
- Bunny Dashboard → Storage → Your Zone → API → Upload Widget Key
- Bunny Dashboard → Storage → Your Zone → Settings → Webhook

### 2. Configure Bunny Webhook

In Bunny Dashboard:
1. Go to Storage → Your Zone → Settings → Webhooks
2. Add webhook URL: `https://sheskinv3.thoughtform.world/api/webhooks/bunny-upload`
3. Select events: `Upload`
4. Save

### 3. Update Components

#### Works Editor (`WorkEditor.astro`)

Replace the media picker with BunnyUploader:

```astro
---
// At top of file
import { BunnyUploader } from '@components/admin/BunnyUploader';
---

<!-- Replace your custom upload modal with: -->
<div class="media-selection">
  <BunnyUploader
    client:load
    variant="button"
    path="/works/"
    accept="image/*,audio/*"
    metadata={{ source: 'works-editor' }}
    onUploadComplete={(files) => {
      // Files uploaded to Bunny
      // Add them to your selectedMedia state
      files.forEach(file => {
        addMediaToWork(file);
      });
    }}
  />
  
  <!-- Your existing selected media grid stays the same -->
  <div class="selected-media-grid">
    {selectedMedia.map(media => (
      <MediaThumbnail media={media} />
    ))}
  </div>
</div>
```

#### Uploads Dashboard (`admin/index.astro`)

Replace the dropzone:

```astro
<div class="upload-area">
  <BunnyUploader
    client:load
    variant="dropzone"
    path="/uploads/"
    metadata={{ source: 'admin-dashboard' }}
    onUploadComplete={() => {
      // Refresh the recent uploads list
      window.location.reload();
    }}
  />
</div>

<!-- Recent uploads list stays the same -->
```

#### Media Library (`admin/media.astro`)

Add upload button:

```astro
<header class="flex justify-between items-center">
  <h1>Media Library</h1>
  <BunnyUploader
    client:load
    variant="button"
    path="/library/"
    onUploadComplete={() => {
      // Refresh media grid
      refetchMedia();
    }}
  />
</header>
```

## API Changes

### New Endpoint
- `POST /api/webhooks/bunny-upload` - Handles Bunny webhooks

### Deprecated (to be deleted)
- `POST /api/admin/media/upload` - Replaced by Bunny widget
- `POST /api/admin/media/process-pending` - Triggered by webhook now

## Data Flow

```
User → Bunny Upload Widget → Bunny Storage → Webhook → Your DB
                                      ↓
                              Sharp/FFmpeg processing
```

## Webhook Payload

Your webhook receives:
```json
{
  "StorageZoneName": "she-skin",
  "Path": "/works/",
  "ObjectName": "photo.jpg",
  "Size": 1024000,
  "IsDirectory": false,
  "Metadata": {
    "source": "works-editor",
    "uploadedBy": "user@email.com"
  }
}
```

You save to DB and trigger processing.

## Error Handling

Bunny Widget handles:
- Network failures (auto-retry)
- Large files (resumable upload)
- Invalid file types (validation)
- Progress tracking

You handle:
- Webhook processing errors
- Post-processing (Sharp/FFmpeg) failures

## Styling

The `BunnyUploader` component uses your existing design system:
- Background: `#1a1a1a`
- Borders: `#333` / `#444`
- Text: `text-gray-400`
- Buttons: `bg-blue-600`

Matches your current admin UI.
