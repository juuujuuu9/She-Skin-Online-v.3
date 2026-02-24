import { db } from '../src/lib/db/index.js';

async function main() {
  const works = await db.query.works.findMany({ limit: 20 });
  console.log(JSON.stringify(works.map(w => ({ 
    id: w.id, 
    slug: w.slug, 
    category: w.category, 
    title: w.title.substring(0, 50) 
  })), null, 2));
}

main();
