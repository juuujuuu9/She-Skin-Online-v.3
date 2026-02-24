#!/usr/bin/env node
/**
 * Database Migration Script - Add artist column to audio_posts
 * 
 * Run: npx tsx scripts/migrate-add-artist.ts
 */

import { db } from '../src/lib/db/index.js';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('🔄 Running migration: Add artist column to audio_posts...');

  try {
    // Check if column already exists
    const checkResult = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'audio_posts' AND column_name = 'artist'
    `);

    if (checkResult.rows.length > 0) {
      console.log('✅ Column "artist" already exists, skipping...');
      return;
    }

    // Add the artist column
    await db.execute(sql`
      ALTER TABLE "audio_posts" 
      ADD COLUMN "artist" text DEFAULT 'she_skin' NOT NULL
    `);
    console.log('✅ Added "artist" column to audio_posts table');

    // Update any existing rows (should already be set by default, but just in case)
    await db.execute(sql`
      UPDATE "audio_posts" 
      SET "artist" = 'she_skin' 
      WHERE "artist" IS NULL
    `);
    console.log('✅ Updated existing rows with default artist');

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

migrate();
