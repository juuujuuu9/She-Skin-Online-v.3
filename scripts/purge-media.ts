#!/usr/bin/env tsx
/**
 * Database Media/Audio Purge Script
 * Deletes ALL media and audio entries from the database
 */

import postgres from 'postgres';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config({ path: '.env' });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

async function listTables(): Promise<string[]> {
  console.log('\n📋 DATABASE TABLES:');
  console.log('==================');
  
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  
  for (const row of tables) {
    const countResult = await sql`SELECT COUNT(*) FROM ${sql(row.table_name)}`;
    console.log(`  • ${row.table_name}: ${countResult[0].count} rows`);
  }
  
  return tables.map(t => t.table_name as string);
}

async function getTableCount(tableName: string): Promise<number> {
  const result = await sql`SELECT COUNT(*) FROM ${sql(tableName)}`;
  return parseInt(result[0].count as string);
}

async function deleteFromTable(tableName: string): Promise<number> {
  const beforeCount = await getTableCount(tableName);
  if (beforeCount === 0) {
    console.log(`  ℹ️  ${tableName}: already empty`);
    return 0;
  }
  
  await sql`DELETE FROM ${sql(tableName)}`;
  const afterCount = await getTableCount(tableName);
  
  if (afterCount === 0) {
    console.log(`  ✅ ${tableName}: deleted ${beforeCount} rows`);
    return beforeCount;
  } else {
    console.log(`  ⚠️  ${tableName}: ${afterCount} rows remaining (unexpected!)`);
    return beforeCount - afterCount;
  }
}

async function purgeDatabase() {
  console.log('\n🔥 DATABASE PURGE - Media/Audio Tables');
  console.log('======================================');
  
  let totalDeleted = 0;
  
  // Tables to purge (in order to respect foreign key constraints)
  const tablesToPurge = [
    // Audio-related tables (child tables first)
    'audio_posts',
    'audio_tracks', 
    'work_media',
    'works', // audio works are in here
    
    // Media library tables
    'post_media',
    'product_images',
    'media',
    
    // Content tables that might have audio
    'revisions',
    'post_meta',
    'posts',
  ];
  
  console.log('\n🎯 Purging tables...');
  
  for (const table of tablesToPurge) {
    try {
      const deleted = await deleteFromTable(table);
      totalDeleted += deleted;
    } catch (error: any) {
      console.log(`  ❌ ${table}: ERROR - ${error.message}`);
    }
  }
  
  return totalDeleted;
}

async function purgeCacheFiles() {
  console.log('\n🗑️  CACHE FILES PURGE');
  console.log('=====================');
  
  const filesToDelete = [
    'audio-cover-urls.json',
  ];
  
  let deletedCount = 0;
  
  for (const file of filesToDelete) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      fs.unlinkSync(filePath);
      console.log(`  ✅ Deleted: ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
      deletedCount++;
    } else {
      console.log(`  ℹ️  Not found: ${file}`);
    }
  }
  
  // Check for any other audio-related JSON files
  const contentImportedDir = path.join(process.cwd(), 'content-imported');
  if (fs.existsSync(contentImportedDir)) {
    const manifestDir = path.join(contentImportedDir, 'media-manifest');
    const filesJson = path.join(manifestDir, 'files.json');
    if (fs.existsSync(filesJson)) {
      fs.unlinkSync(filesJson);
      console.log(`  ✅ Deleted: content-imported/media-manifest/files.json`);
      deletedCount++;
    }
  }
  
  return deletedCount;
}

async function verifyState() {
  console.log('\n✅ VERIFICATION - Current Database State');
  console.log('=======================================');
  
  const tables = await listTables();
  
  console.log('\n📊 Audio/Media Related Table Status:');
  const mediaTables = ['audio_posts', 'audio_tracks', 'media', 'work_media', 'works', 'posts', 'post_media'];
  
  let allClear = true;
  for (const table of mediaTables) {
    if (tables.includes(table)) {
      const count = await getTableCount(table);
      const status = count === 0 ? '✅ EMPTY' : `⚠️  ${count} rows`;
      console.log(`  ${table}: ${status}`);
      if (count > 0) allClear = false;
    }
  }
  
  return allClear;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     SheSkin Database Media/Audio Purge Script            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  
  // Show current state
  await listTables();
  
  // Confirm purge
  console.log('\n⚠️  WARNING: This will DELETE ALL media/audio data!');
  console.log('   Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Execute purge
  const dbDeleted = await purgeDatabase();
  const filesDeleted = await purgeCacheFiles();
  
  // Verify
  const allClear = await verifyState();
  
  // Summary
  console.log('\n📋 PURGE SUMMARY');
  console.log('================');
  console.log(`  Database rows deleted: ${dbDeleted}`);
  console.log(`  Cache files deleted: ${filesDeleted}`);
  console.log(`  All media tables empty: ${allClear ? '✅ YES' : '⚠️  NO'}`);
  
  if (allClear) {
    console.log('\n🎉 Database is ready for fresh WordPress import!');
  } else {
    console.log('\n⚠️  Some tables still have data - review above');
  }
  
  await sql.end();
  process.exit(allClear ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
