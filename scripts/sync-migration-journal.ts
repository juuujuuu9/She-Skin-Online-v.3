/**
 * One-off: Mark migrations 0000–0003 as already applied in the DB.
 * Use when the DB was created with push or partial runs and you want
 * future `npm run db:migrate` to only run new migrations.
 *
 * Run from repo: npx tsx scripts/sync-migration-journal.ts
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const migrationsDir = join(process.cwd(), 'drizzle');
const journalPath = join(migrationsDir, 'meta', '_journal.json');

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

function hashFile(path: string): string {
  const content = readFileSync(path, 'utf8');
  return createHash('sha256').update(content).digest('hex');
}

async function main() {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: JournalEntry[];
  };

  console.log('Marking migrations as applied in drizzle.__drizzle_migrations...');

  // Ensure schema and table exist (same as neon-http migrator)
  await sql.query(`
    CREATE SCHEMA IF NOT EXISTS "drizzle"
  `);
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  for (const entry of journal.entries) {
    const filePath = join(migrationsDir, `${entry.tag}.sql`);
    const hash = hashFile(filePath);
    const createdAt = entry.when;

    // Insert if not already present (by created_at, which is unique in order)
    await sql.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
       SELECT $1, $2
       WHERE NOT EXISTS (
         SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE created_at = $2
       )`,
      [hash, createdAt]
    );
    console.log('  ', entry.tag, '-> applied');
  }

  console.log('Done. Future db:migrate will only run new migrations.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
