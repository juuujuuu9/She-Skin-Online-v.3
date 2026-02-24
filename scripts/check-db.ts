import { db } from '../src/lib/db/index.ts';
import { works, workMedia } from '../src/lib/db/schema.ts';
import { count } from 'drizzle-orm';

async function checkTables() {
  const result = await db.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.log('Tables in database:');
  result.rows.forEach((r: { table_name: string }) => console.log('  -', r.table_name));
  
  // Check if posts table exists
  const hasPosts = result.rows.some((r: { table_name: string }) => r.table_name === 'posts');
  console.log('\nCMS tables present:', hasPosts ? 'YES ✓' : 'NO ✗');
  
  // Check existing works
  const worksCount = await db.select({ count: count() }).from(works);
  console.log('\nWorks in database:', worksCount[0].count);
  
  const mediaCount = await db.select({ count: count() }).from(workMedia);
  console.log('Work media in database:', mediaCount[0].count);
  
  // Show sample works
  if (worksCount[0].count > 0) {
    const sample = await db.select().from(works).limit(3);
    console.log('\nSample works:');
    sample.forEach(w => console.log(`  - ${w.slug}: ${w.title}`));
  }
}

checkTables().catch(console.error);
