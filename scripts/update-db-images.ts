#!/usr/bin/env tsx
/**
 * Update audio_posts table with Bunny CDN artwork URLs
 * 
 * Usage:
 *   npx tsx scripts/update-db-images.ts
 * 
 * This script:
 * 1. Reads the CDN mapping file (slug -> CDN URL)
 * 2. Matches slugs to audio_posts table entries
 * 3. Updates the artwork column with CDN URLs
 */

import { readFile } from 'fs/promises';
import { config } from 'dotenv';
import { db } from '../src/lib/db/index.js';
import { audioPosts } from '../src/lib/db/schema.js';
import { eq } from 'drizzle-orm';

// Load environment variables
config({ path: '.env' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  cdnMappingFile: './public/audio-covers-cdn-mapping.json',
  dryRun: process.argv.includes('--dry-run'),
};

// ============================================================================
// TYPES
// ============================================================================

interface CdnMappingEntry {
  slug: string;
  localFilename: string;
  cdnUrl: string;
  success: boolean;
}

interface CdnMapping {
  generatedAt: string;
  totalFiles: number;
  successful: number;
  failed: number;
  entries: CdnMappingEntry[];
  slugToUrl: { [slug: string]: string };
}

interface UpdateResult {
  slug: string;
  cdnUrl: string;
  dbSlug?: string;
  title?: string;
  previousArtwork?: string | null;
  success: boolean;
  error?: string;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🗄️  Audio Posts Artwork URL Updater\n');
  console.log('=' .repeat(60));
  
  if (CONFIG.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made to the database\n');
  }
  
  try {
    // Read CDN mapping file
    console.log('\n📖 Reading CDN mapping file...');
    const mappingContent = await readFile(CONFIG.cdnMappingFile, 'utf-8');
    const mapping: CdnMapping = JSON.parse(mappingContent);
    
    console.log(`  ✓ Mapping generated at: ${mapping.generatedAt}`);
    console.log(`  ✓ Total entries: ${mapping.totalFiles}`);
    console.log(`  ✓ Successful uploads: ${mapping.successful}`);
    console.log(`  ✓ Failed uploads: ${mapping.failed}`);
    
    // Get all successful CDN entries
    const successfulEntries = mapping.entries.filter(e => e.success);
    console.log(`\n🔄 Will update ${successfulEntries.length} database records`);
    
    if (successfulEntries.length === 0) {
      console.log('⚠️  No successful CDN uploads found. Nothing to update.');
      return;
    }
    
    // Get all audio posts from database to match slugs
    console.log('\n📊 Fetching audio posts from database...');
    const allPosts = await db.select({
      id: audioPosts.id,
      slug: audioPosts.slug,
      title: audioPosts.title,
      artwork: audioPosts.artwork,
    }).from(audioPosts);
    
    console.log(`  ✓ Found ${allPosts.length} audio posts in database`);
    
    // Create a map for quick lookup
    const dbSlugMap = new Map(allPosts.map(p => [p.slug, p]));
    
    // Build normalized lookup maps from database
    // DB slugs like: "beside-a-luv-like-mine-mt1-stream-20184"
    // We need to match against CDN localFilename like: "she-skin-beside-a-luv-like-mine-mt1-stream.jpg"
    const dbSlugNormalizedMap = new Map<string, typeof allPosts[0]>();
    for (const post of allPosts) {
      // Normalize DB slug: remove numeric suffix and convert to lowercase
      const normalized = post.slug.replace(/-\d+$/, '').toLowerCase();
      dbSlugNormalizedMap.set(normalized, post);
      // Also add the full slug for exact matching
      dbSlugNormalizedMap.set(post.slug.toLowerCase(), post);
    }
    
    // Known artist prefixes to strip from CDN slugs for matching
    const artistPrefixes = [
      'she-skin-',
      'she_skin-',
      'libc-',
      'hernbean5150-',
      'd-thornhill-',
      'bailey-goldsborough-',
      '8shaped-',
      'ad1-',
      'lisp-',
      'shenandoah-',
      'halcyon-veil-',
      'diesel-d-',
      'stay-anesthesia-',
      'emergency-xoxo-',
      'kantase-',
      'el-oh-vee-',
    ];
    
    // Track results
    const results: UpdateResult[] = [];
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let notFound = 0;
    
    console.log('\n🔄 Processing updates...\n');
    
    for (let i = 0; i < successfulEntries.length; i++) {
      const entry = successfulEntries[i];
      const { slug, cdnUrl, localFilename } = entry;
      
      console.log(`[${i + 1}/${successfulEntries.length}] Processing: ${slug}`);
      
      // Find matching database entry with fallback strategies
      // Strategy: Use localFilename (without extension) which has correct format
      const baseFilename = localFilename.replace(/\.[^.]+$/, ''); // Remove extension
      const normalizedCdnSlug = baseFilename.toLowerCase();
      
      let dbPost = dbSlugNormalizedMap.get(normalizedCdnSlug);
      let matchType: 'exact' | 'normalized' | 'stripped-prefix' | null = null;
      
      // 1. Try exact slug match first
      if (dbSlugMap.get(slug)) {
        dbPost = dbSlugMap.get(slug);
        matchType = 'exact';
      }
      // 2. Try normalized match (localFilename without extension)
      else if (dbPost) {
        matchType = 'normalized';
        console.log(`  🔄 Matched via normalized slug: ${slug} → ${dbPost.slug}`);
      }
      // 3. Try stripping artist prefixes
      else {
        for (const prefix of artistPrefixes) {
          if (normalizedCdnSlug.startsWith(prefix)) {
            const strippedSlug = normalizedCdnSlug.slice(prefix.length);
            dbPost = dbSlugNormalizedMap.get(strippedSlug);
            if (dbPost) {
              matchType = 'stripped-prefix';
              console.log(`  🔄 Matched by stripping prefix "${prefix}": ${slug} → ${dbPost.slug}`);
              break;
            }
          }
        }
      }
      
      if (!dbPost) {
        console.log(`  ⚠️  No matching database entry found for slug: ${slug}`);
        results.push({
          slug,
          cdnUrl,
          success: false,
          error: 'No matching database entry found',
        });
        notFound++;
        continue;
      }
      
      console.log(`  Found: "${dbPost.title}" (ID: ${dbPost.id})`);
      
      // Check if artwork is already set to this URL
      if (dbPost.artwork === cdnUrl) {
        console.log(`  ⏭️  Already up to date, skipping`);
        results.push({
          slug,
          cdnUrl,
          dbSlug: dbPost.slug,
          title: dbPost.title,
          previousArtwork: dbPost.artwork,
          success: true,
        });
        skipped++;
        continue;
      }
      
      if (!CONFIG.dryRun) {
        try {
          // Update the database
          await db.update(audioPosts)
            .set({ 
              artwork: cdnUrl,
              updatedAt: new Date(),
            })
            .where(eq(audioPosts.id, dbPost.id));
          
          console.log(`  ✅ Updated artwork URL`);
          if (dbPost.artwork) {
            console.log(`  📝 Previous: ${dbPost.artwork}`);
          }
          console.log(`  📝 New: ${cdnUrl}`);
          
          results.push({
            slug,
            cdnUrl,
            dbSlug: dbPost.slug,
            title: dbPost.title,
            previousArtwork: dbPost.artwork,
            success: true,
          });
          updated++;
          
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.log(`  ❌ Database update failed: ${errorMsg}`);
          
          results.push({
            slug,
            cdnUrl,
            dbSlug: dbPost.slug,
            title: dbPost.title,
            previousArtwork: dbPost.artwork,
            success: false,
            error: errorMsg,
          });
          failed++;
        }
      } else {
        // Dry run - simulate the update
        console.log(`  🔍 Would update artwork URL (dry run)`);
        if (dbPost.artwork) {
          console.log(`  📝 Current: ${dbPost.artwork}`);
        }
        console.log(`  📝 Would set to: ${cdnUrl}`);
        
        results.push({
          slug,
          cdnUrl,
          dbSlug: dbPost.slug,
          title: dbPost.title,
          previousArtwork: dbPost.artwork,
          success: true,
        });
        updated++;
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 DATABASE UPDATE SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total CDN entries:    ${successfulEntries.length}`);
    console.log(`Matched in DB:        ${successfulEntries.length - notFound}`);
    console.log(`Not found in DB:      ${notFound}`);
    
    if (CONFIG.dryRun) {
      console.log(`\n🔍 DRY RUN - Would update: ${updated}`);
      console.log(`🔍 DRY RUN - Would skip: ${skipped}`);
    } else {
      console.log(`\n✅ Updated:            ${updated}`);
      console.log(`⏭️  Skipped (current):  ${skipped}`);
      console.log(`❌ Failed:             ${failed}`);
    }
    
    // Show unmatched slugs
    if (notFound > 0) {
      console.log('\n⚠️  Slugs not found in database:');
      results
        .filter(r => r.error === 'No matching database entry found')
        .forEach(r => console.log(`   - ${r.slug}`));
    }
    
    // Show failed updates
    if (failed > 0) {
      console.log('\n❌ Failed updates:');
      results
        .filter(r => !r.success && r.error && r.error !== 'No matching database entry found')
        .forEach(r => console.log(`   - ${r.slug}: ${r.error}`));
    }
    
    console.log('\n✅ Done!');
    
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main();
