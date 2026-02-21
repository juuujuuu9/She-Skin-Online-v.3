/**
 * Update the admin user's password in the database.
 * Set ADMIN_NEW_PASSWORD in .env (or pass via env) then run:
 *
 *   npx tsx scripts/update-admin-password.ts
 *
 * Uses username "admin" by default; override with ADMIN_USERNAME if needed.
 */
import 'dotenv/config';
import { db } from '../src/lib/db';
import { users } from '../src/lib/db/schema';
import { hashPassword } from '../src/lib/admin-auth';
import { eq } from 'drizzle-orm';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const NEW_PASSWORD = process.env.ADMIN_NEW_PASSWORD;

async function main() {
  if (!NEW_PASSWORD || NEW_PASSWORD.length < 6) {
    console.error('Set ADMIN_NEW_PASSWORD in .env (at least 6 characters), then run this script.');
    process.exit(1);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.username, ADMIN_USERNAME),
  });

  if (!user) {
    console.error('Admin user not found for username:', ADMIN_USERNAME);
    process.exit(1);
  }

  const passwordHash = await hashPassword(NEW_PASSWORD);
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  console.log('✅ Password updated for user:', user.username);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
