#!/usr/bin/env tsx
/**
 * Apply artist column migration
 */

import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_4ObYRKdi9wkz@ep-late-grass-ai3sntla-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  console.log('Adding artist column to audio_posts...');
  
  await sql`ALTER TABLE "audio_posts" ADD COLUMN IF NOT EXISTS "artist" text DEFAULT 'she_skin' NOT NULL`;
  
  console.log('Updating existing rows...');
  await sql`UPDATE "audio_posts" SET "artist" = 'she_skin' WHERE "artist" IS NULL`;
  
  console.log('✅ Migration complete!');
}

main().catch(console.error);
