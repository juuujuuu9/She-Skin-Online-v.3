#!/usr/bin/env tsx
/**
 * Generate Image Fix Report
 * 
 * Creates a report of all broken images with their WordPress source URLs
 * for manual download and re-upload.
 * 
 * Usage: npx tsx scripts/generate-image-fix-report.ts
 */

import { db } from '../src/lib/db/index.js';
import { readFileSync, writeFileSync } from 'fs';

const CONFIG = {
  wpPostsPaths: {
    digital: './public/audio-covers/wp-digital-posts.json',
    collaborations: './public/audio-covers/wp-collabs-posts.json',
    physical: './public/audio-covers/wp-physical-posts.json',
  },
  reportFile: './tmp/image-fix-instructions.md',
};

interface WpPost {
  id: number;
  title: string;
  slug: string;
  featured_image_id: number | null;
  featured_image_url?: string;
}

async function main() {
  console.log('📋 Generating Image Fix Report\n');
  
  // Load WordPress posts
  const wpPostsBySlug: Record<string, WpPost> = {};
  
  for (const [category, path] of Object.entries(CONFIG.wpPostsPaths)) {
    try {
      const content = readFileSync(path, 'utf-8');
      const posts: WpPost[] = JSON.parse(content);
      for (const post of posts) {
        if (post.slug) {
          wpPostsBySlug[post.slug] = post;
        }
      }
    } catch (error) {
      console.error(`Failed to load ${category}: ${error}`);
    }
  }
  
  // Get works with broken images
  const allWorks = await db.query.works.findMany({
    with: {
      media: true,
    },
  });
  
  const worksWithMedia = allWorks.filter(w => w.media && w.media.length > 0);
  
  // Build report
  const fixableImages: any[] = [];
  const missingImages: any[] = [];
  
  for (const work of worksWithMedia) {
    const wpPost = wpPostsBySlug[work.slug];
    
    if (wpPost?.featured_image_url) {
      fixableImages.push({
        category: work.category,
        title: work.title,
        slug: work.slug,
        wpPostId: wpPost.id,
        currentUrl: work.media[0].url,
        wordpressUrl: wpPost.featured_image_url,
        suggestedFilename: `${work.slug}${wpPost.featured_image_url.match(/\.[^.]+$/)?.[0] || '.jpg'}`,
      });
    } else {
      missingImages.push({
        category: work.category,
        title: work.title,
        slug: work.slug,
        wpPostId: wpPost?.id,
        reason: wpPost ? 'No featured image in WordPress' : 'No matching WordPress post',
      });
    }
  }
  
  // Generate markdown report
  let report = `# SheSkin Broken Images Fix Report

Generated: ${new Date().toISOString()}

## Summary

- **Works with broken images:** ${worksWithMedia.length}
- **Fixable (has WordPress source):** ${fixableImages.length}
- **Missing (no WordPress source):** ${missingImages.length}

---

## Fixable Images (${fixableImages.length})

These images can be fixed by downloading from WordPress and uploading to Bunny CDN.

**Note:** WordPress site has bot protection. You must manually download these images from the WordPress admin panel or use a browser with the URLs below.

### Step-by-Step Instructions:

1. **Download images from WordPress:**
   - Log into WordPress admin: https://www.sheskin.org/wp-admin
   - Go to Media → Library
   - Search for the image by title or find by post
   - Download the original image file

2. **Upload to Bunny CDN:**
   - Log into Bunny CDN: https://panel.bunny.net
   - Go to Storage → she-skin → works/{category}/
   - Upload the image with the suggested filename

3. **Update database (automated):**
   - Run: \`npx tsx scripts/update-fixed-image-urls.ts\`

### Images to Fix:

| Category | Work Title | WordPress URL | Suggested Filename |
|----------|------------|---------------|-------------------|
`;

  for (const img of fixableImages) {
    report += `| ${img.category} | ${img.title} | [Link](${img.wordpressUrl}) | ${img.suggestedFilename} |\n`;
  }

  report += `

---

## Missing Images (${missingImages.length})

These works have no featured image in WordPress. They need images sourced manually.

| Category | Work Title | WordPress Post ID | Reason |
|----------|------------|-------------------|--------|
`;

  // Group by category for cleaner report
  const missingByCategory = missingImages.reduce((acc, img) => {
    acc[img.category] = acc[img.category] || [];
    acc[img.category].push(img);
    return acc;
  }, {} as Record<string, any[]>);
  
  for (const [category, images] of Object.entries(missingByCategory)) {
    report += `\n### ${category} (${images.length})\n\n`;
    for (const img of images) {
      report += `- **${img.title}** (ID: ${img.wpPostId || 'N/A'}) - ${img.reason}\n`;
    }
  }

  report += `

---

## Quick Fix Script

After manually downloading and uploading images to Bunny CDN at 
\`https://she-skin.b-cdn.net/works/{category}/{filename}\`, run:

\`\`\`bash
# Update database with new URLs
npx tsx scripts/update-fixed-image-urls.ts
\`\`\`

---

## JSON Data

The fixable images data is also available in JSON format at:
- \`./tmp/fixable-images.json\`
- \`./tmp/missing-images.json\`
`;

  writeFileSync(CONFIG.reportFile, report);
  writeFileSync('./tmp/fixable-images.json', JSON.stringify(fixableImages, null, 2));
  writeFileSync('./tmp/missing-images.json', JSON.stringify(missingImages, null, 2));
  
  console.log(`✅ Report generated: ${CONFIG.reportFile}`);
  console.log(`✅ Fixable images: ${fixableImages.length}`);
  console.log(`✅ Missing images: ${missingImages.length}`);
  console.log(`\nNext steps:`);
  console.log(`1. Open ${CONFIG.reportFile} to see the full list`);
  console.log(`2. Manually download images from WordPress`);
  console.log(`3. Upload to Bunny CDN`);
  console.log(`4. Run: npx tsx scripts/update-fixed-image-urls.ts`);
}

main().catch(console.error);
