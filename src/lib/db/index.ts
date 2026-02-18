/**
 * Database Connection
 * 
 * Using Neon Serverless (PostgreSQL) with Drizzle ORM
 */

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import * as schema from './schema';

// Load environment variables (Astro loads .env automatically, but this ensures it's loaded)
config({ path: '.env' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set. Check your .env file.');
}

// Create Neon HTTP client
const sql = neon(process.env.DATABASE_URL);

// Create Drizzle instance
export const db = drizzle(sql, { schema });

// Export schema for use in queries
export * from './schema';
