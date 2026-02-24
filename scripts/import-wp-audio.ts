#!/usr/bin/env tsx
/**
 * Import WordPress audio posts from WP-CLI export into SheSkin Astro database
 * 
 * Usage: npx tsx scripts/import-wp-audio.ts
 * 
 * Expected JSON format (TSV from WP-CLI):
 * - ID: WordPress post ID
 * - post_title: Track title (e.g., "she_skin - beside a luv like mine (mt1 stream)")
 * - post_content: Contains YouTube and SoundCloud URLs
 * - post_date: Publication date
 * - post_name: URL slug
 * - post_status: publish/draft
 */

import { db } from '../src/lib/db/index.js';
import { audioPosts } from '../src/lib/db/schema.js';
import { nanoid } from 'nanoid';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// CONFIGURATION
// ============================================================================

const JSON_FILE_PATH = '/Users/user/Downloads/audio-posts.json';

// ============================================================================
// TYPES
// ============================================================================

interface WordPressPost {
  ID: string;
  post_title: string;
  post_content: string;
  post_date?: string;
  post_name?: string;
  post_status: string;
}

interface ParsedTrack {
  id: string;
  title: string;
  artist: string;
  slug: string;
  youtubeLink: string | null;
  soundcloudLink: string | null;
  publishedAt: Date | null;
  status: 'published' | 'draft';
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Extract artist and title from post_title
 * Format: "Artist - Title" or "Artist: Title"
 */
function extractArtistAndTitle(postTitle: string): { artist: string; title: string } {
  if (!postTitle || postTitle.trim() === '') {
    return { artist: 'she_skin', title: 'Untitled' };
  }

  const trimmedTitle = postTitle.trim();
  
  // Try "Artist - Title" or "Artist: Title" pattern
  const separatorMatch = trimmedTitle.match(/^(.+?)\s*[-:]\s*(.+)$/);
  
  if (separatorMatch) {
    const potentialArtist = separatorMatch[1].trim();
    const potentialTitle = separatorMatch[2].trim();
    
    // Validate artist looks like a real artist name
    // Should be more than 1 character and not just numbers/punctuation
    if (potentialArtist.length > 1 && !/^\d+\.?$/.test(potentialArtist)) {
      return { 
        artist: normalizeArtistName(potentialArtist), 
        title: potentialTitle 
      };
    }
  }
  
  // Default to she_skin if no clear artist separator found
  return { artist: 'she_skin', title: trimmedTitle };
}

/**
 * Normalize artist name (capitalize, clean up common variations)
 */
function normalizeArtistName(artist: string): string {
  const normalized = artist.trim();
  
  // Common artist name normalizations
  const artistMap: Record<string, string> = {
    'she_skin': 'she_skin',
    'she skin': 'she_skin',
    'sheskin': 'she_skin',
    'libc': 'LIBC',
    'LIBC': 'LIBC',
    'hernbean5150': 'Hernbean5150',
    'hernbean': 'Hernbean5150',
    'd. thornhill': 'D. Thornhill',
    'd thornhill': 'D. Thornhill',
    'd.thornhill': 'D. Thornhill',
    '8shaped': '8SHAPED',
    'diesel d': 'Diesel D',
    'ad1': 'AD1',
  };
  
  const lowerArtist = normalized.toLowerCase();
  return artistMap[lowerArtist] || normalized;
}

/**
 * Extract YouTube URL from post_content
 * Handles youtube.com, youtu.be, and gate.sc redirect URLs
 */
function extractYouTubeUrl(content: string): string | null {
  if (!content) return null;
  
  // Pattern 1: Standard youtube.com/watch?v=VIDEO_ID
  let match = content.match(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
  if (match) return match[0];
  
  // Pattern 2: Short youtu.be/VIDEO_ID
  match = content.match(/https?:\/\/(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (match) return match[0];
  
  // Pattern 3: YouTube embed URLs
  match = content.match(/https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://youtube.com/watch?v=${match[1]}`;
  
  // Pattern 4: gate.sc redirect URLs (extract the actual YouTube URL)
  match = content.match(/https?:\/\/gate\.sc\/\?url=(https%3A%2F%2Fyoutu\.be%2F[a-zA-Z0-9_-]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
  
  return null;
}

/**
 * Extract SoundCloud URL from post_content
 */
function extractSoundCloudUrl(content: string): string | null {
  if (!content) return null;
  
  // Pattern: soundcloud.com/username/track-name
  // Allow for query parameters and additional path segments
  const match = content.match(/https?:\/\/(?:www\.)?soundcloud\.com\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)+/);
  if (match) {
    // Clean up the URL (remove query parameters if present)
    const url = match[0];
    const queryIndex = url.indexOf('?');
    return queryIndex > 0 ? url.substring(0, queryIndex) : url;
  }
  
  // Pattern: on.soundcloud.com short URLs
  const shortMatch = content.match(/https?:\/\/on\.soundcloud\.com\/[a-zA-Z0-9]+/);
  if (shortMatch) return shortMatch[0];
  
  return null;
}

/**
 * Generate a clean slug from post_name or title
 */
function generateSlug(postName: string | undefined, title: string, id: string): string {
  // Use post_name if available and valid
  if (postName && postName.trim() !== '') {
    return postName.trim().toLowerCase();
  }
  
  // Otherwise, generate from title
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
  
  // Append ID to ensure uniqueness
  return `${baseSlug}-${id}`;
}

/**
 * Parse post_date into Date object
 */
function parsePostDate(dateStr: string | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Parse post_status into our status format
 */
function parseStatus(status: string): 'published' | 'draft' {
  return status === 'publish' ? 'published' : 'draft';
}

// ============================================================================
// FILE PARSING
// ============================================================================

/**
 * Parse TSV content from WP-CLI export
 * The file is tab-separated with columns: ID, post_title, post_content
 */
function parseTsvContent(content: string): WordPressPost[] {
  const posts: WordPressPost[] = [];
  const lines = content.split('\n');
  
  // Skip header row if present
  let startIndex = 0;
  if (lines[0]?.includes('ID') && lines[0]?.includes('post_title')) {
    startIndex = 1;
  }
  
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Split by tabs
    const parts = line.split('\t');
    
    // We need at least ID and post_title
    if (parts.length < 2) continue;
    
    const id = parts[0]?.trim();
    const postTitle = parts[1]?.trim() || '';
    const postContent = parts[2]?.trim() || '';
    
    // Skip if no valid ID
    if (!id || id === 'ID') continue;
    
    posts.push({
      ID: id,
      post_title: postTitle,
      post_content: postContent,
      post_status: 'publish', // Default to published
    });
  }
  
  return posts;
}

/**
 * Process WordPress posts into our track format
 */
function processPosts(posts: WordPressPost[]): ParsedTrack[] {
  const tracks: ParsedTrack[] = [];
  const usedSlugs = new Set<string>();
  
  for (const post of posts) {
    const { artist, title } = extractArtistAndTitle(post.post_title);
    const youtubeLink = extractYouTubeUrl(post.post_content);
    const soundcloudLink = extractSoundCloudUrl(post.post_content);
    
    // Generate unique slug
    let slug = generateSlug(post.post_name, title, post.ID);
    let uniqueSlug = slug;
    let counter = 1;
    
    while (usedSlugs.has(uniqueSlug)) {
      uniqueSlug = `${slug}-${counter}`;
      counter++;
    }
    usedSlugs.add(uniqueSlug);
    
    tracks.push({
      id: post.ID,
      title,
      artist,
      slug: uniqueSlug,
      youtubeLink,
      soundcloudLink,
      publishedAt: parsePostDate(post.post_date),
      status: parseStatus(post.post_status),
    });
  }
  
  return tracks;
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Check for existing slugs to avoid duplicates
 */
async function getExistingSlugs(): Promise<Set<string>> {
  try {
    const existing = await db.select({ slug: audioPosts.slug }).from(audioPosts);
    return new Set(existing.map(r => r.slug));
  } catch (error) {
    console.warn('Warning: Could not fetch existing slugs:', error);
    return new Set();
  }
}

/**
 * Import tracks into database
 */
async function importTracks(tracks: ParsedTrack[]): Promise<{ inserted: number; skipped: number; errors: number }> {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  
  // Get existing slugs to avoid duplicates
  const existingSlugs = await getExistingSlugs();
  
  for (const track of tracks) {
    // Skip if slug already exists
    if (existingSlugs.has(track.slug)) {
      console.log(`  ⚠️  Skipping duplicate slug: ${track.slug}`);
      skipped++;
      continue;
    }
    
    try {
      await db.insert(audioPosts).values({
        id: nanoid(),
        title: track.title,
        artist: track.artist,
        slug: track.slug,
        youtubeLink: track.youtubeLink,
        soundcloudLink: track.soundcloudLink,
        status: track.status,
        publishedAt: track.publishedAt || new Date(),
      });
      
      inserted++;
      existingSlugs.add(track.slug);
      
      if (inserted % 10 === 0) {
        console.log(`  Progress: ${inserted}/${tracks.length} tracks inserted...`);
      }
    } catch (error) {
      console.error(`  ❌ Error inserting track "${track.title}":`, error);
      errors++;
    }
  }
  
  return { inserted, skipped, errors };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('WordPress Audio Posts Import');
  console.log('='.repeat(60));
  console.log();
  
  // Check if file exists
  try {
    readFileSync(JSON_FILE_PATH, 'utf-8');
  } catch (error) {
    console.error(`❌ Error: Could not read file at ${JSON_FILE_PATH}`);
    console.error('Please ensure the file exists and is accessible.');
    process.exit(1);
  }
  
  console.log(`📁 Reading file: ${JSON_FILE_PATH}`);
  const content = readFileSync(JSON_FILE_PATH, 'utf-8');
  
  console.log('🔍 Parsing WordPress posts...');
  const posts = parseTsvContent(content);
  console.log(`   Found ${posts.length} posts`);
  
  if (posts.length === 0) {
    console.error('❌ No posts found in file!');
    process.exit(1);
  }
  
  console.log('\n🎵 Processing tracks...');
  const tracks = processPosts(posts);
  console.log(`   Processed ${tracks.length} tracks`);
  
  // Show sample tracks
  console.log('\n📋 Sample tracks:');
  tracks.slice(0, 5).forEach((track, i) => {
    console.log(`   ${i + 1}. ${track.artist} - ${track.title}`);
    console.log(`      Slug: ${track.slug}`);
    console.log(`      YouTube: ${track.youtubeLink || '—'}`);
    console.log(`      SoundCloud: ${track.soundcloudLink || '—'}`);
    console.log();
  });
  
  // Show statistics
  const withYouTube = tracks.filter(t => t.youtubeLink).length;
  const withSoundCloud = tracks.filter(t => t.soundcloudLink).length;
  const withBoth = tracks.filter(t => t.youtubeLink && t.soundcloudLink).length;
  const withNeither = tracks.filter(t => !t.youtubeLink && !t.soundcloudLink).length;
  
  console.log('📊 Statistics:');
  console.log(`   Total tracks: ${tracks.length}`);
  console.log(`   With YouTube: ${withYouTube}`);
  console.log(`   With SoundCloud: ${withSoundCloud}`);
  console.log(`   With both: ${withBoth}`);
  console.log(`   With neither: ${withNeither}`);
  
  // Count artists
  const artistCounts = new Map<string, number>();
  tracks.forEach(t => {
    artistCounts.set(t.artist, (artistCounts.get(t.artist) || 0) + 1);
  });
  
  console.log('\n🎤 Artists:');
  Array.from(artistCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([artist, count]) => {
      console.log(`   ${artist}: ${count} tracks`);
    });
  
  // Import to database
  console.log('\n💾 Importing to database...');
  const result = await importTracks(tracks);
  
  console.log();
  console.log('='.repeat(60));
  console.log('✅ Import Complete!');
  console.log('='.repeat(60));
  console.log(`   Inserted: ${result.inserted}`);
  console.log(`   Skipped (duplicates): ${result.skipped}`);
  console.log(`   Errors: ${result.errors}`);
  console.log();
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
