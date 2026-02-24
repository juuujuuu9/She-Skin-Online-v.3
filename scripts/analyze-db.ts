import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { audioPosts } from './src/lib/db/schema';

const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client);

async function analyze() {
  const posts = await db.select().from(audioPosts);
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  DATABASE STATE AFTER IMPORT');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log(`📊 Total posts in DB: ${posts.length}\n`);
  
  const withArtwork = posts.filter(p => p.artwork && p.artwork.length > 0);
  const withYouTube = posts.filter(p => p.youtubeLink && p.youtubeLink.length > 0);
  const withSoundCloud = posts.filter(p => p.soundcloudLink && p.soundcloudLink.length > 0);
  const withAnyEmbed = posts.filter(p => (p.youtubeLink && p.youtubeLink.length > 0) || (p.soundcloudLink && p.soundcloudLink.length > 0));
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CONTENT STATUS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🎬 YouTube links: ${withYouTube.length}`);
  console.log(`☁️ SoundCloud links: ${withSoundCloud.length}`);
  console.log(`✅ Any embed: ${withAnyEmbed.length}`);
  console.log(`🖼️ With artwork URL: ${withArtwork.length}`);
  console.log(`❌ Missing embed: ${posts.length - withAnyEmbed.length}\n`);
  
  const artistCounts: Record<string, number> = {};
  posts.forEach(p => {
    artistCounts[p.artist] = (artistCounts[p.artist] || 0) + 1;
  });
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TOP ARTISTS');
  console.log('═══════════════════════════════════════════════════════════');
  Object.entries(artistCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 15)
    .forEach(([artist, count]) => {
      console.log(`  ${artist}: ${count}`);
    });
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SAMPLE POSTS');
  console.log('═══════════════════════════════════════════════════════════');
  posts.slice(0, 10).forEach(p => {
    const hasYT = p.youtubeLink ? 'YouTube ' : '';
    const hasSC = p.soundcloudLink ? 'SoundCloud' : '';
    const hasArt = p.artwork ? '✅' : '❌';
    console.log(`\n  ${hasArt} ${p.title}`);
    console.log(`     Artist: ${p.artist} | Embeds: ${hasYT}${hasSC || 'None'}`);
    console.log(`     Slug: ${p.slug}`);
  });
}

analyze();
