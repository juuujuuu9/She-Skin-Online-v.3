#!/usr/bin/env tsx
/**
 * Import audio tracks from sheskin_audio_complete_table.md into the database
 */

import { db } from '../src/lib/db';
import { audioPosts } from '../src/lib/db/schema';
import { nanoid } from 'nanoid';
import { readFileSync } from 'fs';
import { join } from 'path';

// Cover images (50 total) - will cycle through these
const COVER_IMAGES = [
  '004-COVER.webp',
  '006-cover.webp',
  '9CAE3838-683D-4657-AA18-19BDC12AF2A4.webp',
  'BALLM-COVER.webp',
  'COVA-copy.webp',
  'COVE-copy.webp',
  'D-FINAL.webp',
  'HBLIBC-SQUARE-COVER.webp',
  'L-A-A-COVER.webp',
  'Layer-1-copy.webp',
  'NEWE-copy.webp',
  'SCENT-AH-WHO-COVER.webp',
  'Screen-Shot-2023-07-28-at-1.01.46-PM.webp',
  'Screen-Shot-2023-07-28-at-1.03.24-PM.webp',
  'Screen-Shot-2023-11-14-at-4.58.43-PM.webp',
  'Screen-Shot-2023-11-14-at-5.00.22-PM.webp',
  'Screen-Shot-2023-12-06-at-7.23.25-PM.webp',
  'Screen-Shot-2023-12-14-at-3.21.55-PM.webp',
  'Screen-Shot-2024-01-01-at-8.08.07-PM.webp',
  'Screen-Shot-2024-01-01-at-8.10.22-PM.webp',
  'Screen-Shot-2024-02-15-at-11.17.22-PM.webp',
  'Screen-Shot-2024-02-23-at-2.54.23-PM.webp',
  'Screen-Shot-2024-03-13-at-8.09.01-PM.webp',
  'Screen-Shot-2024-06-04-at-9.27.47-PM.webp',
  'Screen-Shot-2024-06-16-at-3.03.28-PM.webp',
  'Screen-Shot-2024-06-29-at-10.45.43-AM.webp',
  'Screen-Shot-2024-08-09-at-12.45.33-PM.webp',
  'Screen-Shot-2024-09-03-at-1.00.31-PM.webp',
  'Screen-Shot-2025-02-16-at-9.41.28-PM.webp',
  'Screen-Shot-2025-03-10-at-8.25.01-PM.webp',
  'Screen-Shot-2025-06-08-at-11.36.36-PM.webp',
  'Screenshot-2025-09-07-at-5.33.49-PM.webp',
  'Screenshot-2025-11-15-at-12.04.29-PM.webp',
  'Screenshot-2025-11-30-at-3.21.11-PM.webp',
  'Screenshot-2025-12-17-at-12.47.33-AM.webp',
  'Untitled-2-29.webp',
  'Untitled-2.webp',
  'Untitled-4-1.webp',
  'W1.webp',
  'c1.webp',
  'cova.webp',
  'cover-sept-copy.webp',
  'cover.webp',
  'exoxo-copy.webp',
  'mj.webp',
  'n1.webp',
  'never-2.webp',
  'new-logo.webp',
  's-coverr-copy.webp',
  'sas1.webp',
];

const CDN_BASE_URL = 'https://she-skin.b-cdn.net/media/audio';

interface Track {
  number: number;
  title: string;
  artist: string;
  youtubeLink: string | null;
  soundcloudLink: string | null;
}

function extractLinks(markdown: string): { youtube: string | null; soundcloud: string | null } {
  const youtubeMatch = markdown.match(/\[Watch\]\((https:\/\/youtube\.com\/watch\?v=[^)]+)\)/);
  const soundcloudMatch = markdown.match(/\[Listen\]\((https:\/\/soundcloud\.com\/[^)]+)\)/);
  
  return {
    youtube: youtubeMatch ? youtubeMatch[1] : null,
    soundcloud: soundcloudMatch ? soundcloudMatch[1] : null,
  };
}

function extractArtistAndTitle(fullTitle: string): { artist: string; title: string } {
  // Patterns to check for artist extraction
  const patterns = [
    // "Artist - Title" or "Artist: Title"
    /^([^:-]+)\s*[-:]\s*(.+)$/,
  ];
  
  for (const pattern of patterns) {
    const match = fullTitle.match(pattern);
    if (match) {
      const artist = match[1].trim();
      const title = match[2].trim();
      
      // Validate artist looks like an artist name (not just a number or short word)
      if (artist.length > 1 && !/^\d+\.?$/.test(artist)) {
        return { artist, title };
      }
    }
  }
  
  // Default to she_skin if no artist pattern found
  return { artist: 'she_skin', title: fullTitle };
}

function parseTable(content: string): Track[] {
  const tracks: Track[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Match table rows like: | 1 | she_skin - beside a luv like mine | [Watch](...) | — |
    const match = line.match(/^\|\s*(\d+)\s*\|\s*([^|]+)\|\s*([^|]*)\|\s*([^|]*)\|/);
    if (match) {
      const number = parseInt(match[1], 10);
      const fullTitle = match[2].trim();
      const youtubeCell = match[3].trim();
      const soundcloudCell = match[4].trim();
      
      // Skip header rows
      if (isNaN(number) || number < 1 || number > 180) continue;
      
      const { artist, title } = extractArtistAndTitle(fullTitle);
      const { youtube: youtubeFromCell } = extractLinks(youtubeCell);
      const { soundcloud: soundcloudFromCell } = extractLinks(soundcloudCell);
      
      tracks.push({
        number,
        title,
        artist,
        youtubeLink: youtubeFromCell,
        soundcloudLink: soundcloudFromCell,
      });
    }
  }
  
  return tracks;
}

function generateSlug(title: string, number: number): string {
  // Create a slug from the title
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  
  return `${number}-${baseSlug}`;
}

async function main() {
  console.log('Reading audio table...');
  
  const tablePath = join(process.env.HOME || '/Users/user', '.openclaw', 'workspace', 'sheskin_audio_complete_table.md');
  const content = readFileSync(tablePath, 'utf-8');
  
  console.log('Parsing tracks...');
  const tracks = parseTable(content);
  console.log(`Found ${tracks.length} tracks`);
  
  if (tracks.length === 0) {
    console.error('No tracks found!');
    process.exit(1);
  }
  
  console.log('\nSample tracks:');
  tracks.slice(0, 5).forEach(track => {
    console.log(`  ${track.number}. ${track.artist} - ${track.title}`);
    console.log(`     YouTube: ${track.youtubeLink || '—'} | SoundCloud: ${track.soundcloudLink || '—'}`);
  });
  
  console.log('\nInserting tracks into database...');
  
  let inserted = 0;
  let errors = 0;
  
  for (const track of tracks) {
    try {
      // Cycle through cover images
      const coverImage = COVER_IMAGES[(track.number - 1) % COVER_IMAGES.length];
      const artworkUrl = `${CDN_BASE_URL}/${coverImage}`;
      
      const slug = generateSlug(track.title, track.number);
      
      await db.insert(audioPosts).values({
        id: nanoid(),
        title: track.title,
        artist: track.artist,
        slug: slug,
        artwork: artworkUrl,
        youtubeLink: track.youtubeLink,
        soundcloudLink: track.soundcloudLink,
        status: 'published',
        publishedAt: new Date(),
      });
      
      inserted++;
      
      if (inserted % 10 === 0) {
        console.log(`  Progress: ${inserted}/${tracks.length} tracks inserted...`);
      }
    } catch (error) {
      console.error(`  Error inserting track ${track.number} (${track.title}):`, error);
      errors++;
    }
  }
  
  console.log(`\n✅ Done! Inserted ${inserted} tracks (${errors} errors)`);
  console.log(`\nArtwork distribution: Used ${COVER_IMAGES.length} unique images, cycled ${Math.ceil(tracks.length / COVER_IMAGES.length)} times`);
}

main().catch(console.error);
