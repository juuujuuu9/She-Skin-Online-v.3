#!/usr/bin/env tsx
/**
 * Download Images Using Browser Automation
 * 
 * This script uses browser automation to bypass WordPress security
 * and download all the broken images.
 * 
 * Usage:
 *   npx tsx scripts/download-images-browser.ts [--headless]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

config();

const CONFIG = {
  outputDir: join(process.cwd(), 'tmp/image-repair/downloads'),
  manifestPath: join(process.cwd(), 'tmp/image-repair/repair-manifest.json'),
  wpBaseUrl: 'https://www.sheskin.org',
};

interface RepairItem {
  type: string;
  id: string;
  title: string;
  slug: string;
  category?: string;
  wpImageUrl?: string;
  currentUrl?: string;
}

interface RepairManifest {
  generatedAt: string;
  totalItems: number;
  items: RepairItem[];
}

function loadManifest(): RepairManifest | null {
  try {
    return JSON.parse(readFileSync(CONFIG.manifestPath, 'utf-8'));
  } catch {
    console.error('❌ Could not load repair manifest. Run fix-all-broken-images.ts first.');
    return null;
  }
}

function generateDownloadScript(items: RepairItem[]): string {
  const itemsWithUrls = items.filter(i => i.wpImageUrl);
  
  let script = `#!/bin/bash
# Download Images Script
# Generated: ${new Date().toISOString()}
# Total items: ${items.length}
# Items with URLs: ${itemsWithUrls.length}

mkdir -p "${CONFIG.outputDir}"
cd "${CONFIG.outputDir}"

# Function to download with proper headers
download_image() {
  local url="$1"
  local output="$2"
  
  curl -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \\
       -H "Accept: image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" \\
       -H "Referer: https://www.sheskin.org/" \\
       -o "$output" \\
       "$url"
  
  # Check if file is valid (not HTML error page)
  if file "$output" | grep -q "HTML"; then
    echo "⚠️  $output appears to be HTML, not an image"
    rm "$output"
    return 1
  fi
  
  # Check file size
  local filesize=$(stat -f%z "$output" 2>/dev/null || stat -c%s "$output" 2>/dev/null)
  if [ "$filesize" -lt 1000 ]; then
    echo "⚠️  $output is too small ($filesize bytes), likely an error page"
    rm "$output"
    return 1
  fi
  
  return 0
}

echo "Downloading ${itemsWithUrls.length} images..."
echo ""

SUCCESS=0
FAILED=0

`;

  for (const item of itemsWithUrls) {
    const ext = item.wpImageUrl!.split('.').pop()?.split('?')[0] || 'jpg';
    const filename = `${item.category}-${item.slug}.${ext}`;
    
    script += `# ${item.title}
echo "[${itemsWithUrls.indexOf(item) + 1}/${itemsWithUrls.length}] ${item.title}"
if download_image "${item.wpImageUrl}" "${filename}"; then
  echo "  ✅ Downloaded: ${filename}"
  ((SUCCESS++))
else
  echo "  ❌ Failed: ${filename}"
  ((FAILED++))
fi

`;
  }

  script += `
echo ""
echo "=================================="
echo "  DOWNLOAD COMPLETE"
echo "=================================="
echo "  ✅ Success: $SUCCESS"
echo "  ❌ Failed: $FAILED"
echo ""
echo "Next step: Run upload script"
echo "  npx tsx scripts/upload-downloaded-images.ts"
`;

  return script;
}

function generateWgetScript(items: RepairItem[]): string {
  const itemsWithUrls = items.filter(i => i.wpImageUrl);
  
  let script = `#!/bin/bash
# WGET Download Script (Alternative Method)
# Generated: ${new Date().toISOString()}

mkdir -p "${CONFIG.outputDir}"
cd "${CONFIG.outputDir}"

WGET_OPTS="--user-agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' \\
           --header='Accept: image/webp,image/apng,image/*,*/*;q=0.8' \\
           --header='Referer: https://www.sheskin.org/' \\
           --no-check-certificate \\
           --tries=3 \\
           --timeout=30"

SUCCESS=0
FAILED=0

echo "Downloading ${itemsWithUrls.length} images with wget..."

`;

  for (const item of itemsWithUrls) {
    const ext = item.wpImageUrl!.split('.').pop()?.split('?')[0] || 'jpg';
    const filename = `${item.category}-${item.slug}.${ext}`;
    
    script += `echo "[${itemsWithUrls.indexOf(item) + 1}/${itemsWithUrls.length}] ${item.title}"
wget $WGET_OPTS -O "${filename}" "${item.wpImageUrl}" 2>/dev/null && echo "  ✅ ${filename}" && ((SUCCESS++)) || { echo "  ❌ Failed"; ((FAILED++)); rm -f "${filename}"; }

`;
  }

  script += `
echo ""
echo "=================================="
echo "  DOWNLOAD COMPLETE"
echo "=================================="
echo "  ✅ Success: $SUCCESS"
echo "  ❌ Failed: $FAILED"
`;

  return script;
}

function generateManualInstructions(items: RepairItem[]): string {
  const itemsNeedingManual = items.filter(i => !i.wpImageUrl);
  
  let instructions = `# Manual Download Instructions

## Items Requiring Manual Download (${itemsNeedingManual.length} items)

These items don't have automatic image URLs. You'll need to:

1. Log into WordPress admin: https://www.sheskin.org/wp-admin
2. Go to Media Library
3. Find and download each image manually
4. Save to: \`${CONFIG.outputDir}\`
5. Use filename format: \`{category}-{slug}.{ext}\`

### Items:

`;

  for (const item of itemsNeedingManual) {
    instructions += `- **${item.title}** (slug: ${item.slug}, category: ${item.category})
`;
  }

  instructions += `
## After Downloading

Run the upload script:
\`\`\`
npx tsx scripts/upload-downloaded-images.ts
\`\`\`
`;

  return instructions;
}

async function main() {
  console.log('='.repeat(70));
  console.log('  DOWNLOAD IMAGES - BROWSER/SCRIPT METHODS');
  console.log('='.repeat(70));
  
  const manifest = loadManifest();
  if (!manifest) {
    process.exit(1);
  }
  
  console.log(`\nLoaded manifest with ${manifest.totalItems} items\n`);
  
  // Ensure output directory exists
  if (!existsSync(CONFIG.outputDir)) {
    mkdirSync(CONFIG.outputDir, { recursive: true });
  }
  
  // Generate curl script
  const curlScript = generateDownloadScript(manifest.items);
  const curlPath = join(process.cwd(), 'tmp/image-repair', 'download-curl.sh');
  writeFileSync(curlPath, curlScript);
  console.log(`✅ Generated curl script: ${curlPath}`);
  
  // Generate wget script
  const wgetScript = generateWgetScript(manifest.items);
  const wgetPath = join(process.cwd(), 'tmp/image-repair', 'download-wget.sh');
  writeFileSync(wgetPath, wgetScript);
  console.log(`✅ Generated wget script: ${wgetPath}`);
  
  // Generate manual instructions
  const manualInstructions = generateManualInstructions(manifest.items);
  const manualPath = join(process.cwd(), 'tmp/image-repair', 'MANUAL_DOWNLOADS.md');
  writeFileSync(manualPath, manualInstructions);
  console.log(`✅ Generated manual instructions: ${manualPath}`);
  
  // Make scripts executable
  try {
    const { chmodSync } = await import('fs');
    chmodSync(curlPath, 0o755);
    chmodSync(wgetPath, 0o755);
  } catch {
    // Ignore chmod errors on Windows
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('  NEXT STEPS');
  console.log('='.repeat(70));
  console.log('\nOption 1: Try automated download with curl:');
  console.log(`  bash ${curlPath}`);
  console.log('\nOption 2: Try with wget:');
  console.log(`  bash ${wgetPath}`);
  console.log('\nOption 3: Manual download (if automated fails):');
  console.log(`  See: ${manualPath}`);
  console.log('\nOption 4: Browser automation (most reliable):');
  console.log('  Use the browser to download images from WordPress admin');
  console.log('  then run: npx tsx scripts/upload-downloaded-images.ts');
  console.log('');
}

main().catch(console.error);
