# Bunny.net CDN Setup Guide — she_skin

Quick setup to get your images loading at lightning speed.

---

## Step 1: Get Your Credentials

### 1.1 Storage API Key
1. Go to [dash.bunny.net](https://dash.bunny.net)
2. Click **Storage** in the left sidebar
3. Select your storage zone (or create one)
4. Click **FTP & API Access**
5. Copy the **API Key**

### 1.2 CDN URL
In the same Storage zone:
- Your CDN URL looks like: `https://your-zone.b-cdn.net`
- Copy this from the **CDN URL** field

### 1.3 Storage Zone Name
- This is the name of your storage zone (e.g., `sheskin`)
- Found at the top of the storage zone page

---

## Step 2: Update Your .env

Replace the placeholder values in `/Users/user/Development/sheskin/repo/.env`:

```bash
# Bunny.net CDN
BUNNY_API_KEY=your-actual-api-key-here
BUNNY_STORAGE_ZONE=your-storage-zone-name
BUNNY_CDN_URL=https://your-zone.b-cdn.net
BUNNY_STORAGE_ENDPOINT=ny.storage.bunnycdn.com  # or your region
```

### Storage Regions
- New York: `ny.storage.bunnycdn.com` (default)
- Los Angeles: `la.storage.bunnycdn.com`
- London: `uk.storage.bunnycdn.com`
- Singapore: `sg.storage.bunnycdn.com`

Pick the closest to your users.

---

## Step 3: Test the Connection

Run the test script:

```bash
cd /Users/user/Development/sheskin/repo
node scripts/test-bunny.js
```

You should see:
```
🐰 Bunny.net Connection Test
═══════════════════════════════
✅ Configuration valid
✅ Connected to storage zone: your-zone
✅ CDN URL: https://your-zone.b-cdn.net
✅ Test file uploaded successfully
✅ Test file accessible via CDN

All systems go! 🚀
```

---

## Step 4: Enable Image Optimization (Optional but Recommended)

### Enable Bunny Optimizer
1. In Bunny dashboard, go to **Storage**
2. Select your zone
3. Go to **Optimizer** tab
4. Enable **Bunny Optimizer**
5. Enable:
   - ✓ WebP Auto Conversion
   - ✓ AVIF Auto Conversion
   - ✓ Image Compression

This gives you automatic format conversion (WebP/AVIF) and compression.

### Pricing
- Free tier: 10GB storage, 10GB bandwidth/month
- Optimizer: $3.50/month per zone (worth it for auto WebP)

---

## Step 5: Migrate Your Images

### Option A: Quick Migration (Collaborations)

```bash
# Install dependencies
npm install sharp blurhash

# Download and optimize all collaboration images
node scripts/migrate-images.js --source=collaborations

# Upload to Bunny
node scripts/upload-to-bunny.js --folder=tmp/image-migration/processed/collaborations --target=collaborations

# Update the JSON file
node scripts/migrate-images.js --update-json
```

### Option B: Manual Upload

1. Go to **Storage** in Bunny dashboard
2. Click **Upload Files**
3. Create folders:
   - `collaborations/`
   - `works/`
   - `products/`
4. Upload your images

### Option C: Sync Script

For ongoing uploads, use the sync script:

```bash
# Upload all images in a folder
node scripts/upload-to-bunny.js --folder=public/media/digital --target=digital
```

---

## Step 6: Update Your Code

### For Collaborations

Replace the WordPress URLs in `src/data/collaborations.json`:

```json
// Before
{
  "image": {
    "src": "https://www.sheskin.org/wp-content/uploads/2025/11/Screenshot...PM-1024x570.png",
    "alt": "Description"
  }
}

// After
{
  "image": {
    "src": "https://your-zone.b-cdn.net/collaborations/artwork-md.webp",
    "alt": "Description",
    "variants": {
      "sm": { "url": "https://your-zone.b-cdn.net/collaborations/artwork-sm.webp", "width": 640 },
      "md": { "url": "https://your-zone.b-cdn.net/collaborations/artwork-md.webp", "width": 1024 },
      "lg": { "url": "https://your-zone.b-cdn.net/collaborations/artwork-lg.webp", "width": 1920 }
    },
    "blurhash": "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
    "dominantColor": "#8B5A2B"
  }
}
```

---

## Using CDN URLs in Code

### Direct Links
```astro
<img src="https://your-zone.b-cdn.net/works/artwork.webp" />
```

### With Optimization Parameters
```
https://your-zone.b-cdn.net/works/artwork.jpg?width=800&quality=85&format=webp
```

Parameters:
- `width=800` — Resize width
- `height=600` — Resize height
- `quality=85` — Compression quality (1-100)
- `format=webp` — Convert to WebP
- `format=avif` — Convert to AVIF
- `crop=800,600` — Crop dimensions

### With Lightning Components
```astro
<LightningImage
  src="https://your-zone.b-cdn.net/works/artwork.webp"
  alt="Description"
  width={1200}
  height={800}
  priority={true}
/>
```

---

## Troubleshooting

### "Configuration invalid"
- Check your API key is copied correctly (no extra spaces)
- Verify storage zone name matches exactly (case-sensitive)

### "Failed to upload"
- Check API key has write permissions
- Verify you're using the correct storage endpoint for your region

### "Images not loading"
- Check CDN URL is correct in `.env`
- Verify images exist in Bunny dashboard
- Check browser console for 404 errors

### "CORS errors"
In Bunny dashboard:
1. Go to **Storage** → Your Zone
2. Click **Headers**
3. Add CORS headers:
   ```
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Methods: GET, HEAD
   ```

---

## Performance Check

After migration, test your page:

```bash
# Install Lighthouse
npm install -g lighthouse

# Test collaborations page
lighthouse http://localhost:4321/works/collaborations --output=json

# Look for:
# - First Contentful Paint < 1.5s
# - Largest Contentful Paint < 2.5s
# - Images served from b-cdn.net
# - WebP format
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Test connection | `node scripts/test-bunny.js` |
| Migrate images | `node scripts/migrate-images.js` |
| Upload folder | `node scripts/upload-to-bunny.js --folder=X --target=Y` |
| Update JSON | `node scripts/migrate-images.js --update-json` |

---

## Dashboard URLs

- **Bunny Dashboard**: https://dash.bunny.net
- **Storage**: https://dash.bunny.net/storage
- **Statistics**: https://dash.bunny.net/statistics

---

*Ready to make your images fly! 🚀*
