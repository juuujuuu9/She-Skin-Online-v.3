/**
 * One-off: apply only the users table migration (0003).
 * Use when the DB already has tables from push/earlier migrations but "users" is missing.
 * Run from repo: npx dotenv -e .env -- tsx scripts/apply-users-migration.ts
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const CREATE_USERS = `
CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY NOT NULL,
  "username" text NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text DEFAULT 'admin' NOT NULL,
  "is_active" boolean DEFAULT true,
  "last_login_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "users_username_unique" UNIQUE("username"),
  CONSTRAINT "users_email_unique" UNIQUE("email")
)`;

async function main() {
  console.log('Applying users migration (0003)...');

  try {
    await sql.query(CREATE_USERS);
    console.log('Table "users" created or already exists.');
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === '42P07') {
      console.log('Table "users" already exists, skipping.');
    } else {
      throw e;
    }
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
