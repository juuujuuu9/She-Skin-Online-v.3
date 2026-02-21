/**
 * One-off: verify admin user exists and password "saratoga" matches stored hash.
 * Run: npx tsx scripts/verify-admin-login.ts
 */
import 'dotenv/config';
import { db } from '../src/lib/db';
import { users } from '../src/lib/db/schema';
import { verifyPassword } from '../src/lib/admin-auth';
import { eq } from 'drizzle-orm';

async function main() {
  const user = await db.query.users.findFirst({
    where: eq(users.username, 'admin'),
  });
  if (!user) {
    console.log('❌ No user with username "admin" in DB');
    process.exit(1);
  }
  console.log('User found: id=', user.id, 'isActive=', user.isActive);
  const match = await verifyPassword('saratoga', user.passwordHash);
  console.log('Password "saratoga" matches stored hash:', match);
  console.log('ADMIN_SECRET set:', !!process.env.ADMIN_SECRET, 'length >= 16:', (process.env.ADMIN_SECRET?.length ?? 0) >= 16);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
