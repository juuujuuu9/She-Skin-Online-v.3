import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { audioPosts } from '../src/lib/db/schema.ts';
import { asc, eq } from 'drizzle-orm';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env' });

const connectionString = process.env.DATABASE_URL;
const sql = neon(connectionString);
const db = drizzle(sql);

const BUNNY_API_KEY = process.env.BUNNY_API_KEY;
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_STORAGE_ENDPOINT = process.env.BUNNY_STORAGE_ENDPOINT;
const BUNNY_STORAGE_PASSWORD = process.env.BUNNY_STORAGE_PASSWORD;
const BUNNY_CDN_URL = process.env.BUNNY_CDN_URL;

function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function downloadThumbnail(videoId, outputPath) {
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  
  try {
    const response = await fetch(thumbnailUrl);
    if (!response.ok) {
      // Try hqdefault if maxres is not available
      const hqUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      const hqResponse = await fetch(hqUrl);
      if (!hqResponse.ok) return false;
      const buffer = await hqResponse.arrayBuffer();
      fs.writeFileSync(outputPath, Buffer.from(buffer));
      return true;
    }
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(buffer));
    return true;
  } catch (error) {
    console.error(`Error downloading thumbnail for ${videoId}:`, error.message);
    return false;
  }
}

async function uploadToBunny(filePath, bunnyPath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const response = await fetch(`https://${BUNNY_STORAGE_ENDPOINT}/${BUNNY_STORAGE_ZONE}/${bunnyPath}`, {
      method: 'PUT',
      headers: {
        'AccessKey': BUNNY_STORAGE_PASSWORD,
        'Content-Type': 'image/jpeg',
      },
      body: fileBuffer,
    });
    
    if (response.ok) {
      return `${BUNNY_CDN_URL}/${bunnyPath}`;
    }
    return null;
  } catch (error) {
    console.error(`Error uploading to Bunny:`, error.message);
    return null;
  }
}

async function updateDatabase(postId, artworkUrl) {
  try {
    await db.update(audioPosts)
      .set({ artwork: artworkUrl })
      .where(eq(audioPosts.id, postId));
    return true;
  } catch (error) {
    console.error(`Error updating database:`, error.message);
    return false;
  }
}

async function main() {
  const tmpDir = '/Users/user/Development/sheskin/repo/tmp/youtube-thumbs';
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const posts = await db.select().from(audioPosts).orderBy(asc(audioPosts.createdAt));
  
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;
  
  // Process only tracks with YouTube links
  const postsWithYouTube = posts.filter(p => extractYouTubeId(p.youtubeLink));
  
  console.log(`Processing ${postsWithYouTube.length} tracks with YouTube links...\n`);
  
  for (let i = 0; i < postsWithYouTube.length; i++) {
    const post = postsWithYouTube[i];
    const videoId = extractYouTubeId(post.youtubeLink);
    
    console.log(`[${i + 1}/${postsWithYouTube.length}] Processing: ${post.title}`);
    console.log(`  Video ID: ${videoId}`);
    
    // Download thumbnail
    const localPath = path.join(tmpDir, `${videoId}.jpg`);
    const downloaded = await downloadThumbnail(videoId, localPath);
    
    if (!downloaded) {
      console.log(`  ❌ Failed to download thumbnail`);
      failCount++;
      continue;
    }
    
    // Upload to Bunny CDN
    const bunnyPath = `media/audio/covers/youtube-${videoId}.jpg`;
    const cdnUrl = await uploadToBunny(localPath, bunnyPath);
    
    if (!cdnUrl) {
      console.log(`  ❌ Failed to upload to Bunny CDN`);
      failCount++;
      continue;
    }
    
    // Update database
    const updated = await updateDatabase(post.id, cdnUrl);
    
    if (updated) {
      console.log(`  ✅ Updated: ${cdnUrl}`);
      successCount++;
    } else {
      console.log(`  ❌ Failed to update database`);
      failCount++;
    }
    
    // Clean up local file
    fs.unlinkSync(localPath);
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n========================================`);
  console.log(`Done!`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Skipped (no YouTube): ${posts.length - postsWithYouTube.length}`);
}

main().catch(console.error);
