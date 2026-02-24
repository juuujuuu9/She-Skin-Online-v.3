import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { audioPosts } from '../src/lib/db/schema.ts';
import { asc } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const connectionString = process.env.DATABASE_URL;
const sql = neon(connectionString);
const db = drizzle(sql);

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

async function main() {
  const posts = await db.select().from(audioPosts).orderBy(asc(audioPosts.createdAt));
  
  let withYouTube = 0;
  let withoutYouTube = 0;
  const analysis = [];
  
  for (const post of posts) {
    const videoId = extractYouTubeId(post.youtubeLink);
    if (videoId) {
      withYouTube++;
      analysis.push({
        id: post.id,
        title: post.title,
        artist: post.artist,
        videoId: videoId,
        currentArtwork: post.artwork,
        hasYouTube: true
      });
    } else {
      withoutYouTube++;
      analysis.push({
        id: post.id,
        title: post.title,
        artist: post.artist,
        videoId: null,
        currentArtwork: post.artwork,
        hasYouTube: false
      });
    }
  }
  
  console.log('Total tracks:', posts.length);
  console.log('With YouTube:', withYouTube);
  console.log('Without YouTube:', withoutYouTube);
  console.log('\nAnalysis (first 20):');
  console.log(JSON.stringify(analysis.slice(0, 20), null, 2));
}

main();
