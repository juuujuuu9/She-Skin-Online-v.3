# Nucleus Commerce — Artist Portfolio Boilerplate

A headless commerce and portfolio starter for artists, designers, and small brands. Built on Astro + Drizzle + Bunny CDN.

## 🎯 Perfect For

- Artist portfolios with archive sections
- Small brands wanting to escape WordPress/Shopify bloat
- Clients who need simple dashboards, not enterprise admin panels
- Projects requiring custom media handling

## 🚀 Quick Start

```bash
# 1. Clone and install
npm install

# 2. Set up environment
cp .env.example .env
# Edit with your credentials

# 3. Set up database
npm run db:push

# 4. Start dev server
npm run dev
```

## 📁 Project Structure

```
src/
├── content/              # Content collections (git-tracked)
│   ├── works/           # Portfolio pieces (audio, physical, digital)
│   ├── products/        # Shop products
│   └── pages/           # CMS pages (about, contact, etc.)
├── components/
│   ├── ui/              # Shared UI (OptimizedImage, etc.)
│   ├── shop/            # E-commerce components
│   └── works/           # Portfolio components
├── pages/
│   ├── works/           # Archive views
│   ├── shop/            # Store pages
│   ├── admin/           # Client dashboard
│   └── api/             # API routes
├── lib/
│   ├── db/              # Database schema & queries
│   ├── validation.ts    # Input validation (Zod)
│   ├── audit.ts         # Security audit logging
│   ├── rate-limit.ts    # Rate limiting
│   ├── csrf.ts          # CSRF protection
│   ├── bunny.ts         # CDN integration
│   └── media-processor.ts
├── middleware.ts         # Astro middleware (CSP, security headers)
└── layouts/

media/
├── originals/           # Client uploads (gitignored)
├── processed/           # Generated variants (gitignored)
└── manifest.json        # Asset registry

scripts/
├── media-processor.ts   # Image/audio optimization
└── migrate-wp.ts        # WordPress migration
```

## 🖼️ Automated Media Processing

### The Problem

Artists upload huge PNGs, RAW photos, uncompressed audio. This kills page speed.

### The Solution

Drop files in `media/originals/`. Run one command. Get optimized assets on CDN.

```bash
# Process all new/changed files
npm run media:process

# Watch for changes (dev mode)
npm run media:watch

# Process single file
npm run media:process -- --file ./photo.jpg
```

### What Happens

**Images:**
- Converted to WebP (80% quality) and AVIF (75% quality)
- Generated at 4 sizes: 640w, 1024w, 1920w, 2560w
- Blurhash generated for skeleton loading
- Dominant color extracted for placeholders
- Uploaded to Bunny.net CDN
- Manifest updated with all variants

**Audio:**
- Transcoded to MP3 (192k) and OGG (160k)
- Waveform JSON generated for visualization
- Uploaded to CDN

### Usage in Templates

```astro
---
import OptimizedImage from '@components/ui/OptimizedImage.astro';
---

<OptimizedImage
  src={work.media[0].src}
  alt={work.media[0].alt}
  variants={work.media[0].variants}  // Auto-generated
  blurhash={work.media[0].blurhash}  // For skeleton loading
  width={work.media[0].width}
  height={work.media[0].height}
/>
```

Renders:
```html
<picture>
  <source type="image/avif" srcset="...avif 640w, ...avif 1024w..." />
  <source type="image/webp" srcset="...webp 640w, ...webp 1024w..." />
  <img src="original.jpg" loading="lazy" decoding="async" />
</picture>
```

## 🛍️ E-Commerce

### Product Data

Products are defined in `src/content/products/` as YAML/JSON:

```yaml
name: Airbrushed Hoodie
slug: airbrushed-hoodie
price: 15000  # $150.00 in cents
description: |
  Custom airbrushed design on premium cotton.
images:
  - src: https://cdn.example.com/hoodie-lg.webp
    alt: Front view
    isPrimary: true
    variants:
      webp:
        sm: { url: ..., width: 640, height: 800 }
        md: { url: ..., width: 1024, height: 1280 }
inventory:
  trackQuantity: true
  quantity: 5
variants:
  - name: Size
    options:
      - value: M
        inventory: 2
      - value: L
        inventory: 3
stripePriceId: price_1234567890
```

### Checkout

Uses Stripe Checkout — no backend cart logic required. Just create a session and redirect.

## 🎨 Portfolio/Works

Works are content entries with media galleries:

```yaml
---
title: "Driving on the Sun"
slug: "libc-driving-on-the-sun"
category: audio
date: 2024-03-15
featured: true
media:
  - type: audio
    src: https://cdn.example.com/track.mp3
    variants:
      mp3: { url: ..., duration: 245 }
      ogg: { url: ..., duration: 245 }
    waveform: https://cdn.example.com/track-waveform.json
    title: "Driving on the Sun"
  - type: image
    src: https://cdn.example.com/cover.webp
    variants: { ... }
    blurhash: "LKO2?U%2Tw=w~qV@Rj%2..."
tags: ["libc", "2024", "electronic"]
---

Track notes and description here. Supports **Markdown**.
```

### Archive Pages

Automatic archive pages at `/works/[category]/`:
- `/works/audio/` — List view with waveforms
- `/works/physical/` — Grid view with hover effects
- `/works/digital/` — Grid view
- `/works/collaborations/` — Grid view

## 🔒 Security

Enterprise-grade security features built-in:

| Feature | Implementation |
|---------|---------------|
| **Input Validation** | Zod schemas enforce type safety and limits |
| **CSRF Protection** | Double Submit Cookie pattern |
| **CSP Headers** | Content Security Policy blocks XSS |
| **Rate Limiting** | 5 login attempts per 15 minutes |
| **Soft Deletes** | Recoverable deletion for all content |
| **Audit Logging** | All admin actions logged to database |
| **Security Headers** | X-Frame-Options, X-XSS-Protection, etc. |

See `SECURITY_FIXES.md` and `SECURITY_IMPROVEMENTS.md` for detailed security documentation.

## 👤 Client Dashboard

Located at `/admin/` (Basic Auth protected).

### Features

- **Quick Upload**: Drag-and-drop media, auto-processes
- **Work Editor**: Add/edit portfolio pieces
- **Product Manager**: Inventory, pricing, variants
- **Order Viewer**: Simple order list from Stripe
- **Trash/Restore**: Soft-deleted items can be recovered

### Widget-Based

Dashboard shows only what the client needs:
- Artist view: Recent uploads, work count, shop orders
- Editor view: Content list, quick publish

## 🔄 Migrating from WordPress

```bash
# 1. Export WordPress to WXR
# WordPress Admin → Tools → Export → All content

# 2. Run migration
npm run migrate:wp -- \
  --source sheskin-export.xml \
  --output ./content

# 3. Download and process media
npm run migrate:media -- \
  --source https://sheskin.org/wp-content/uploads/ \
  --output ./media/originals/

npm run media:process

# 4. Build and deploy
npm run build
```

## 📊 Cost Breakdown

| Service | Cost | Notes |
|---------|------|-------|
| Neon DB | Free | 512 MB, 1 project |
| Bunny.net | ~$1/mo | 10GB storage + CDN |
| Vercel | Free | 100GB bandwidth |
| Stripe | 2.9% + $0.30 | Per transaction |
| **Total** | **~$1/mo** | + transaction fees |

## 🛠️ Customization

### Adding New Work Categories

1. Update `src/content.config.ts`:
```typescript
category: z.enum(['audio', 'physical', 'digital', 'collaborations', 'newcategory'])
```

2. Add archive page config in `src/pages/works/[category].astro`

3. Create a sample entry in `src/content/works/newcategory/`

### Changing Image Sizes

Edit `scripts/media-processor.ts`:
```typescript
const SIZES = {
  sm: 480,   // Change from 640
  md: 800,   // Change from 1024
  lg: 1600,  // etc.
  xl: 2400,
};
```

### Adding Payment Methods

Edit `src/lib/stripe.ts` or add `src/lib/btcpay.ts` for crypto.

## 📚 Documentation

| File | Description |
|------|-------------|
| `README.md` | This file - getting started guide |
| `SECURITY.md` | Security overview and features |
| `VALIDATION.md` | Input validation documentation |
| `SECURITY_FIXES.md` | Security audit and fixes |
| `SECURITY_IMPROVEMENTS.md` | Zod validation and CSP details |
| `MEDIA_IMPLEMENTATION.md` | Media processing documentation |
| `AUDIO_PLAYER.md` | Audio player implementation |
| `SHOP_PASSWORD.md` | Shop password gate setup |

## 📚 Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Bunny.net CDN
BUNNY_API_KEY=...
BUNNY_STORAGE_ZONE=...
BUNNY_CDN_URL=https://xxx.b-cdn.net

# Admin Auth
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=... # bcrypt hash

# Site
SITE_URL=https://yoursite.com
```

## 📄 License

MIT — Use for client projects, modify, sell. Just don't blame me when things break.

---

Built for artists who deserve better than WordPress.
