#!/usr/bin/env tsx
/**
 * Verify audio_posts import
 */

import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_4ObYRKdi9wkz@ep-late-grass-ai3sntla-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  console.log('Verifying audio_posts import...\n');
  
  // Count total tracks
  const totalResult = await sql`SELECT COUNT(*) as count FROM "audio_posts"`;
  console.log(`Total tracks: ${totalResult[0].count}`);
  
  // Count by artist
  const artistResult = await sql`
    SELECT artist, COUNT(*) as count 
    FROM "audio_posts" 
    GROUP BY artist 
    ORDER BY count DESC
  `;
  console.log('\nTracks by artist:');
  artistResult.forEach((row: { artist: string; count: number }) => {
    console.log(`  ${row.artist}: ${row.count}`);
  });
  
  // Count tracks with YouTube links
  const youtubeResult = await sql`SELECT COUNT(*) as count FROM "audio_posts" WHERE "youtube_link" IS NOT NULL`;
  console.log(`\nTracks with YouTube: ${youtubeResult[0].count}`);
  
  // Count tracks with SoundCloud links
  const soundcloudResult = await sql`SELECT COUNT(*) as count FROM "audio_posts" WHERE "soundcloud_link" IS NOT NULL`;
  console.log(`Tracks with SoundCloud: ${soundcloudResult[0].count}`);
  
  // Show sample tracks
  console.log('\nSample tracks:');
  const samples = await sql`SELECT title, artist, "youtube_link", "soundcloud_link" FROM "audio_posts" ORDER BY created_at LIMIT 5`;
  samples.forEach((track: { title: string; artist: string; youtube_link: string; soundcloud_link: string }, i: number) => {
    console.log(`  ${i + 1}. ${track.artist} - ${track.title}`);
    console.log(`     YouTube: ${track.youtube_link || '—'} | SoundCloud: ${track.soundcloud_link || '—'}`);
  });
  
  console.log('\n✅ Verification complete!');
}

main().catch(console.error);
