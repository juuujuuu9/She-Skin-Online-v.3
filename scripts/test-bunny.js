#!/usr/bin/env node
/**
 * Bunny.net Connection Test
 * 
 * Verifies your Bunny.net credentials are working correctly.
 * 
 * Usage:
 *   node scripts/test-bunny.js
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
config({ path: join(__dirname, '../.env') });

console.log('🐰 Bunny.net Connection Test\n');
console.log('═══════════════════════════════\n');

// Check configuration
const apiKey = process.env.BUNNY_API_KEY;
const storageZone = process.env.BUNNY_STORAGE_ZONE;
const cdnUrl = process.env.BUNNY_CDN_URL;
const storageEndpoint = process.env.BUNNY_STORAGE_ENDPOINT || 'storage.bunnycdn.com';

if (!apiKey || apiKey === 'your-api-key' || apiKey === 'your-actual-api-key-here') {
  console.error('❌ BUNNY_API_KEY not configured');
  console.log('\n📝 To fix:');
  console.log('1. Go to https://dash.bunny.net → Storage → Your Zone → FTP & API Access');
  console.log('2. Copy the API Key');
  console.log('3. Update .env: BUNNY_API_KEY=your-actual-key');
  process.exit(1);
}

if (!storageZone || storageZone === 'your-storage-zone' || storageZone === 'your-storage-zone-name') {
  console.error('❌ BUNNY_STORAGE_ZONE not configured');
  console.log('\n📝 To fix:');
  console.log('1. Go to https://dash.bunny.net → Storage');
  console.log('2. Copy your storage zone name');
  console.log('3. Update .env: BUNNY_STORAGE_ZONE=your-zone-name');
  process.exit(1);
}

if (!cdnUrl || cdnUrl === 'https://your-zone.b-cdn.net' || cdnUrl === 'https://your-zone.b-cdn.net') {
  console.error('❌ BUNNY_CDN_URL not configured');
  console.log('\n📝 To fix:');
  console.log('1. Go to https://dash.bunny.net → Storage → Your Zone');
  console.log('2. Copy the CDN URL');
  console.log('3. Update .env: BUNNY_CDN_URL=https://your-zone.b-cdn.net');
  process.exit(1);
}

console.log('✅ Configuration valid\n');
console.log(`   Storage Zone: ${storageZone}`);
console.log(`   CDN URL: ${cdnUrl}`);
console.log(`   Endpoint: ${storageEndpoint}\n`);

// Test upload function
async function uploadToBunny(file, filename, options = {}) {
  const contentType = options.contentType || 'application/octet-stream';
  const cleanFilename = filename.startsWith('/') ? filename.slice(1) : filename;
  const uploadUrl = `https://${storageEndpoint}/${storageZone}/${cleanFilename}`;
  
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'AccessKey': apiKey,
      'Content-Type': contentType,
    },
    body: file,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} ${errorText}`);
  }

  const encodedPath = cleanFilename.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const cleanCdnUrl = cdnUrl.endsWith('/') ? cdnUrl.slice(0, -1) : cdnUrl;
  return `${cleanCdnUrl}/${encodedPath}`;
}

// Test delete function
async function deleteFromBunny(filename) {
  const cleanFilename = filename.startsWith('/') ? filename.slice(1) : filename;
  const deleteUrl = `https://${storageEndpoint}/${storageZone}/${cleanFilename}`;
  
  const response = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: { 'AccessKey': apiKey },
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Delete failed: ${response.status} ${errorText}`);
  }
}

// Test connection by uploading a small test file
async function testConnection() {
  const testContent = `Bunny.net test file created at ${new Date().toISOString()}`;
  const testBuffer = Buffer.from(testContent);
  const testFilename = `test/connection-test-${Date.now()}.txt`;
  
  console.log('🧪 Testing upload...\n');
  
  try {
    // Upload test file
    const uploadedUrl = await uploadToBunny(testBuffer, testFilename, {
      contentType: 'text/plain',
    });
    
    console.log('✅ Test file uploaded successfully');
    console.log(`   URL: ${uploadedUrl}\n`);
    
    // Verify it's accessible
    console.log('🧪 Testing CDN accessibility...\n');
    
    const response = await fetch(uploadedUrl, { method: 'HEAD' });
    
    if (response.ok) {
      console.log('✅ Test file accessible via CDN');
      console.log(`   Status: ${response.status}`);
      console.log(`   Content-Type: ${response.headers.get('content-type')}\n`);
    } else {
      console.warn('⚠️  File uploaded but CDN returned:', response.status);
      console.log('   This is normal - CDN may need a moment to propagate\n');
    }
    
    // Clean up test file
    console.log('🧪 Cleaning up test file...\n');
    await deleteFromBunny(testFilename);
    console.log('✅ Test file deleted\n');
    
    console.log('═══════════════════════════════');
    console.log('✨ All systems go! Your Bunny.net is configured correctly.\n');
    console.log('Next steps:');
    console.log('1. Install sharp: npm install sharp blurhash');
    console.log('2. Run: node scripts/migrate-images.js --source=collaborations');
    console.log('3. Upload: node scripts/upload-to-bunny.js --folder=tmp/image-migration/processed/collaborations --target=collaborations');
    console.log('4. Update: node scripts/migrate-images.js --update-json\n');
    
  } catch (error) {
    console.error('❌ Connection test failed:\n');
    console.error(`   ${error.message}\n`);
    
    if (error.message.includes('credentials') || error.message.includes('401')) {
      console.log('📝 Troubleshooting:');
      console.log('   - Double-check your API key (no extra spaces)');
      console.log('   - Verify storage zone name matches exactly');
      console.log('   - Check storage endpoint region is correct\n');
    }
    
    if (error.message.includes('403')) {
      console.log('📝 Authentication issue:');
      console.log('   - Your API key may be invalid or expired');
      console.log('   - Generate a new key in Bunny dashboard\n');
    }
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.log('📝 Network issue:');
      console.log('   - Check your internet connection');
      console.log('   - Verify storage endpoint is correct');
      console.log(`   - Current endpoint: ${storageEndpoint}\n`);
    }
    
    process.exit(1);
  }
}

testConnection();
