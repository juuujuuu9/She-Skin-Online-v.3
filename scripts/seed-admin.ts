/**
 * Seed script - Create initial admin user
 * Usage: npx tsx scripts/seed-admin.ts
 */

import { db } from '../src/lib/db';
import { users } from '../src/lib/db/schema';
import { hashPassword } from '../src/lib/admin-auth';
import { eq } from 'drizzle-orm';
import { nanoid } from '../src/lib/nanoid';

const ADMIN_USERNAME = 'admin';
const ADMIN_EMAIL = 'juju.hardee@gmail.com';
const ADMIN_PASSWORD = 'saratoga';

async function seedAdmin() {
  console.log('🔧 Seeding admin user...\n');

  try {
    // Check if user already exists
    const existing = await db.query.users.findFirst({
      where: eq(users.username, ADMIN_USERNAME),
    });

    if (existing) {
      console.log('⚠️  Admin user already exists');
      console.log('   Username:', existing.username);
      console.log('   Email:', existing.email);
      console.log('\nTo reset password, use the forgot-password flow.');
      process.exit(0);
    }

    // Hash password
    console.log('🔐 Hashing password...');
    const passwordHash = await hashPassword(ADMIN_PASSWORD);

    // Create user
    console.log('👤 Creating admin user...');
    await db.insert(users).values({
      id: nanoid(),
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      passwordHash,
      role: 'admin',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log('\n✅ Admin user created successfully!');
    console.log('================================');
    console.log('Username:', ADMIN_USERNAME);
    console.log('Email:', ADMIN_EMAIL);
    console.log('Password:', ADMIN_PASSWORD);
    console.log('================================\n');

  } catch (error) {
    console.error('❌ Failed to seed admin:', error);
    process.exit(1);
  }

  process.exit(0);
}

seedAdmin();
