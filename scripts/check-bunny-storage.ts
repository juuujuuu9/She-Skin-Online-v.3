#!/usr/bin/env tsx
/**
 * Check Bunny Storage - List all files in BunnyCDN storage zone
 */

import { config } from 'dotenv';
config();

const CONFIG = {
  bunnyStorageKey: process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY || '',
  bunnyStorageZone: process.env.BUNNY_STORAGE_ZONE || 'she-skin',
  bunnyStorageEndpoint: process.env.BUNNY_STORAGE_ENDPOINT || 'ny.storage.bunnycdn.com',
};

async function listBunnyFiles(path: string = ''): Promise<any[]> {
  try {
    const url = `https://${CONFIG.bunnyStorageEndpoint}/${CONFIG.bunnyStorageZone}/${path}`;

    const response = await fetch(url, {
      headers: {
        'AccessKey': CONFIG.bunnyStorageKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`❌ API error: HTTP ${response.status}`);
      return [];
    }

    return await response.json() as any[];
  } catch (error) {
    console.error('❌ Error listing files:', error);
    return [];
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  CHECK BUNNY STORAGE');
  console.log('='.repeat(70));

  if (!CONFIG.bunnyStorageKey) {
    console.error('❌ BUNNY_STORAGE_PASSWORD or BUNNY_API_KEY not set');
    process.exit(1);
  }

  console.log('\n📁 Checking storage zone...\n');

  // List root directory
  const rootFiles = await listBunnyFiles();

  if (rootFiles.length === 0) {
    console.log('No files found or unable to access storage.');
    return;
  }

  console.log(`Found ${rootFiles.length} items in root:`);
  rootFiles.forEach(item => {
    if (item.IsDirectory) {
      console.log(`  📁 ${item.ObjectName}/`);
    } else {
      console.log(`  📄 ${item.ObjectName} (${(item.Length / 1024).toFixed(1)}KB)`);
    }
  });

  // Check works directory
  console.log('\n📁 Checking /works directory...');
  const worksFiles = await listBunnyFiles('works/');

  if (worksFiles.length > 0) {
    console.log(`Found ${worksFiles.length} items in works/:`);
    worksFiles.forEach(item => {
      if (item.IsDirectory) {
        console.log(`  📁 ${item.ObjectName}/`);
      }
    });

    // Check each subdirectory
    for (const item of worksFiles.filter(i => i.IsDirectory)) {
      const subFiles = await listBunnyFiles(`works/${item.ObjectName}/`);
      console.log(`\n  📁 works/${item.ObjectName}/ - ${subFiles.length} files`);

      // Show first 10 files
      subFiles.slice(0, 10).forEach(file => {
        if (!file.IsDirectory) {
          console.log(`    📄 ${file.ObjectName}`);
        }
      });

      // Show ALL files for digital
      if (item.ObjectName === 'digital' && subFiles.length > 10) {
        console.log(`\n    All ${subFiles.length} files in digital/:`);
        subFiles.forEach(file => {
          if (!file.IsDirectory) {
            console.log(`    📄 ${file.ObjectName}`);
          }
        });
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log('Storage check complete.');
}

main().catch(console.error);
