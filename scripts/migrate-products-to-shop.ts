import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { works, products, workMedia, productImages } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from '../src/lib/nanoid';

const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client);

async function migrate() {
  console.log('=== MIGRATING PHYSICAL WORKS TO PRODUCTS TABLE ===\n');
  
  // Get all physical works
  const physicalWorks = await db.select().from(works).where(eq(works.category, 'physical'));
  console.log(`Found ${physicalWorks.length} physical works to migrate\n`);
  
  let migrated = 0;
  let skipped = 0;
  
  for (const work of physicalWorks) {
    try {
      // Check if product already exists
      const existing = await db.select().from(products).where(eq(products.slug, work.slug));
      if (existing.length > 0) {
        console.log(`  Skipping (exists): ${work.title}`);
        skipped++;
        continue;
      }
      
      // Create product
      const productId = nanoid();
      await db.insert(products).values({
        id: productId,
        name: work.title,
        slug: work.slug,
        description: work.description,
        shortDescription: work.description?.substring(0, 200),
        price: work.price,
        regularPrice: work.price,
        onSale: false,
        stockStatus: 'IN_STOCK',
        createdAt: work.createdAt,
        updatedAt: work.updatedAt,
      });
      
      // Get work media and create product images
      const media = await db.select().from(workMedia).where(eq(workMedia.workId, work.id));
      for (const wm of media) {
        if (wm.type === 'image' || wm.type === 'cover') {
          await db.insert(productImages).values({
            id: nanoid(),
            productId: productId,
            imageUrl: wm.url,
            altText: work.title,
            isPrimary: wm.isPrimary,
            sortOrder: wm.sortOrder,
          });
        }
      }
      
      console.log(`  Migrated: ${work.title}`);
      migrated++;
    } catch (err) {
      console.error(`  Failed: ${work.title}`, err);
    }
  }
  
  console.log(`\n=== MIGRATION COMPLETE ===`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total: ${migrated + skipped}`);
  
  // Now delete from works table
  console.log('\n=== DELETING FROM WORKS TABLE ===');
  const deleted = await db.delete(works).where(eq(works.category, 'physical'));
  console.log(`Deleted physical works from works table`);
}

migrate();
