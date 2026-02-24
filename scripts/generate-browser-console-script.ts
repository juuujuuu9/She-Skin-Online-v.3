#!/usr/bin/env tsx
/**
 * Generate Browser Console Download Script
 * 
 * Creates a JavaScript snippet that can be pasted into browser console
 * to download all collaboration images.
 * 
 * Usage:
 *   npx tsx scripts/generate-browser-console-script.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface ImageMapping {
  slug: string;
  title: string;
  imageUrl: string;
}

function main() {
  console.log('='.repeat(70));
  console.log('  GENERATE BROWSER CONSOLE DOWNLOAD SCRIPT');
  console.log('='.repeat(70));
  
  const mappingPath = join(process.cwd(), 'tmp/image-repair/collab-image-mapping.json');
  const mappings: ImageMapping[] = JSON.parse(readFileSync(mappingPath, 'utf-8'));
  const withImages = mappings.filter(m => m.imageUrl);
  
  console.log(`\nLoaded ${withImages.length} images with URLs\n`);
  
  // Generate JavaScript code
  const jsCode = `// ============================================================
// Collaboration Images Bulk Download Script
// Generated: ${new Date().toLocaleString()}
// Total Images: ${withImages.length}
// ============================================================

(function() {
  const images = ${JSON.stringify(withImages.map(m => ({
    slug: m.slug,
    title: m.title,
    url: m.imageUrl
  })), null, 2)};

  let downloaded = 0;
  let failed = 0;
  const failedList = [];

  console.log('Starting download of ' + images.length + ' images...');
  console.log('Images will be saved to your Downloads folder');
  console.log('');

  function downloadImage(img, index) {
    return new Promise((resolve) => {
      setTimeout(() => {
        fetch(img.url, {
          headers: {
            'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          }
        })
        .then(response => {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.blob();
        })
        .then(blob => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          
          // Extract extension from URL or default to jpg
          const ext = img.url.split('.').pop().split('?')[0] || 'jpg';
          a.download = 'collaborations-' + img.slug + '.' + ext;
          
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          downloaded++;
          console.log('✅ [' + (index + 1) + '/' + images.length + '] Downloaded: ' + img.title);
          resolve(true);
        })
        .catch(err => {
          failed++;
          failedList.push({ slug: img.slug, title: img.title, error: err.message });
          console.log('❌ [' + (index + 1) + '/' + images.length + '] Failed: ' + img.title);
          resolve(false);
        });
      }, index * 800); // 800ms delay between downloads
    });
  }

  // Download all images
  const promises = images.map((img, i) => downloadImage(img, i));
  
  Promise.all(promises).then(() => {
    setTimeout(() => {
      console.log('');
      console.log('============================================================');
      console.log('  DOWNLOAD COMPLETE');
      console.log('============================================================');
      console.log('  ✅ Success: ' + downloaded);
      console.log('  ❌ Failed: ' + failed);
      console.log('');
      
      if (failed > 0) {
        console.log('Failed items:');
        failedList.forEach(item => {
          console.log('  - ' + item.title + ' (' + item.slug + ')');
        });
        console.log('');
        console.log('You may need to download these manually from WordPress admin.');
      }
      
      console.log('Next steps:');
      console.log('1. Move downloaded files from Downloads to:');
      console.log('   tmp/image-repair/downloads/');
      console.log('2. Run: npx tsx scripts/upload-collab-images.ts');
      console.log('============================================================');
    }, 1000);
  });
})();
`;

  // Save the script
  const outputPath = join(process.cwd(), 'tmp/image-repair', 'browser-console-download.js');
  writeFileSync(outputPath, jsCode);
  
  console.log('✅ Browser console script generated!\n');
  console.log('File: ' + outputPath);
  console.log('');
  console.log('='.repeat(70));
  console.log('  HOW TO USE');
  console.log('='.repeat(70));
  console.log('');
  console.log('1. Open Chrome/Firefox');
  console.log('2. Go to: https://www.sheskin.org/');
  console.log('3. Press F12 to open Developer Tools');
  console.log('4. Click Console tab');
  console.log('5. Copy ALL the code from: browser-console-download.js');
  console.log('6. Paste into console and press Enter');
  console.log('7. Wait for downloads to complete');
  console.log('8. Move files from Downloads to tmp/image-repair/downloads/');
  console.log('9. Run: npx tsx scripts/upload-collab-images.ts');
  console.log('');
  console.log('Note: The script adds 800ms delay between downloads to be polite.');
  console.log('');
  
  // Also create a simple HTML file that does the same thing
  const htmlCode = `<!DOCTYPE html>
<html>
<head>
  <title>Download Collaboration Images</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
    button { padding: 12px 24px; font-size: 16px; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 4px; }
    button:hover { background: #0056b3; }
    #log { margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px; white-space: pre-wrap; font-family: monospace; max-height: 400px; overflow-y: auto; }
    .success { color: green; }
    .error { color: red; }
  </style>
</head>
<body>
  <h1>Download Collaboration Images</h1>
  <p>Total images to download: <strong>${withImages.length}</strong></p>
  <p>Click the button below to download all images. They will be saved to your Downloads folder.</p>
  <button onclick="startDownload()">Download All Images</button>
  <div id="log"></div>

  <script>
    const images = ${JSON.stringify(withImages.map(m => ({
      slug: m.slug,
      title: m.title,
      url: m.imageUrl
    })), null, 2)};

    function log(msg, type) {
      const el = document.getElementById('log');
      const line = document.createElement('div');
      line.textContent = msg;
      if (type) line.className = type;
      el.appendChild(line);
      el.scrollTop = el.scrollHeight;
    }

    async function startDownload() {
      document.getElementById('log').innerHTML = '';
      log('Starting download of ' + images.length + ' images...');
      log('');

      let downloaded = 0;
      let failed = 0;

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        try {
          const response = await fetch(img.url, {
            headers: { 'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }
          });
          
          if (!response.ok) throw new Error('HTTP ' + response.status);
          
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          
          const ext = img.url.split('.').pop().split('?')[0] || 'jpg';
          a.download = 'collaborations-' + img.slug + '.' + ext;
          
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          downloaded++;
          log('✅ [' + (i + 1) + '/' + images.length + '] ' + img.title, 'success');
        } catch (err) {
          failed++;
          log('❌ [' + (i + 1) + '/' + images.length + '] ' + img.title + ': ' + err.message, 'error');
        }
        
        // Delay between downloads
        await new Promise(r => setTimeout(r, 800));
      }

      log('');
      log('============================================================');
      log('DOWNLOAD COMPLETE');
      log('============================================================');
      log('✅ Success: ' + downloaded);
      log('❌ Failed: ' + failed);
      log('');
      log('Next steps:');
      log('1. Move files from Downloads to: tmp/image-repair/downloads/');
      log('2. Run: npx tsx scripts/upload-collab-images.ts');
      log('============================================================');
    }
  </script>
</body>
</html>`;

  const htmlPath = join(process.cwd(), 'tmp/image-repair', 'download-images.html');
  writeFileSync(htmlPath, htmlCode);
  
  console.log('✅ HTML download page also created!\n');
  console.log('File: ' + htmlPath);
  console.log('');
  console.log('You can open this HTML file in your browser and click');
  console.log('"Download All Images" to download all at once.');
  console.log('');
}

main();
