/**
 * Database Connection
 *
 * Using Neon Serverless (PostgreSQL) with Drizzle ORM
 * Lazy-initialized so build can succeed without DATABASE_URL (required only at runtime for API routes)
 */

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import * as schema from './schema';

config({ path: '.env' });

let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set. Check your .env file.');
    }
    const sql = neon(process.env.DATABASE_URL);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    return (getDb() as Record<string | symbol, unknown>)[prop];
  },
});

export * from './schema';
