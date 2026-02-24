import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { audioPosts } from '../src/lib/db/schema.ts';
import { asc } from 'drizzle-orm';
import { config } from 'dotenv';

config({ path: '.env' });

const connectionString = process.env.DATABASE_URL;
const sql = neon(connectionString);
const db = drizzle(sql);

async function main() {
  const posts = await db.select().from(audioPosts).orderBy(asc(audioPosts.createdAt));
  console.log(JSON.stringify(posts, null, 2));
}

main();
