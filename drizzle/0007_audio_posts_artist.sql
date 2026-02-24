-- Migration: Add artist column to audio_posts table
-- Created: 2025-02-23

-- Add artist column with default value
ALTER TABLE "audio_posts" ADD COLUMN IF NOT EXISTS "artist" text DEFAULT 'she_skin' NOT NULL;

-- Update existing rows to have 'she_skin' as the artist
UPDATE "audio_posts" SET "artist" = 'she_skin' WHERE "artist" IS NULL;
