#!/usr/bin/env tsx
/**
 * Clear audio_posts table and re-import all tracks
 */

import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_4ObYRKdi9wkz@ep-late-grass-ai3sntla-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  console.log('Checking existing audio_posts...');
  
  const result = await sql`SELECT COUNT(*) as count FROM "audio_posts"`;
  console.log(`Found ${result[0].count} existing tracks`);
  
  console.log('Deleting existing tracks...');
  await sql`DELETE FROM "audio_posts"`;
  
  console.log('✅ Table cleared!');
}

main().catch(console.error);
