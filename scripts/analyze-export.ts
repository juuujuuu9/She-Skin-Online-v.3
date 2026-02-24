import * as fs from 'fs';
import * as path from 'path';

// Read files
const postsFile = '/Users/user/Downloads/audio-posts.json';
const imagesFile = '/Users/user/Downloads/all-images.json';
const downloadResults = './public/download-results.json';
const mappingFile = './public/audio-covers-mapping.json';

console.log('═══════════════════════════════════════════════════════════');
console.log('  SHESKIN WORDPRESS EXPORT ANALYSIS');
console.log('═══════════════════════════════════════════════════════════\n');

// Parse posts (TSV format)
const postsContent = fs.readFileSync(postsFile, 'utf-8');
const postsLines = postsContent.trim().split('\n');
const headers = postsLines[0].split('\t');
const posts = postsLines.slice(1).map(line => {
  const cols = line.split('\t');
  return {
    id: cols[0],
    title: cols[1] || '',
    content: cols[2] || '',
    date: cols[3] || '',
    slug: cols[4] || '',
    status: cols[5] || ''
  };
});

console.log(`📊 TOTAL POSTS: ${posts.length}\n`);

// Parse images
const imagesContent = fs.readFileSync(imagesFile, 'utf-8');
const images = JSON.parse(imagesContent);
console.log(`🖼️ TOTAL ATTACHMENTS: ${images.length}\n`);

// Parse download results
let downloadedSlugs: string[] = [];
if (fs.existsSync(downloadResults)) {
  const results = JSON.parse(fs.readFileSync(downloadResults, 'utf-8'));
  downloadedSlugs = results.filter((r: any) => r.success).map((r: any) => r.slug);
  console.log(`✅ SUCCESSFULLY DOWNLOADED: ${downloadedSlugs.length}`);
  console.log(`❌ FAILED/NO SLUG: ${results.length - downloadedSlugs.length}\n`);
}

// Parse mapping file
let mapping: Record<string, string> = {};
if (fs.existsSync(mappingFile)) {
  mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));
}

// Analyze posts
const postsWithYouTube = posts.filter(p => p.content.includes('youtube') || p.content.includes('youtu.be'));
const postsWithSoundCloud = posts.filter(p => p.content.includes('soundcloud'));
const postsWithEmbed = posts.filter(p => p.content.includes('youtube') || p.content.includes('soundcloud') || p.content.includes('youtu.be'));
const postsWithImage = posts.filter(p => downloadedSlugs.includes(p.slug));
const postsWithoutImage = posts.filter(p => !downloadedSlugs.includes(p.slug));

console.log('═══════════════════════════════════════════════════════════');
console.log('  EMBED STATUS');
console.log('═══════════════════════════════════════════════════════════');
console.log(`🎬 YouTube links: ${postsWithYouTube.length}`);
console.log(`☁️ SoundCloud links: ${postsWithSoundCloud.length}`);
console.log(`✅ Posts with ANY embed: ${postsWithEmbed.length}`);
console.log(`❌ Posts without embed: ${posts.length - postsWithEmbed.length}\n`);

console.log('═══════════════════════════════════════════════════════════');
console.log('  IMAGE STATUS');
console.log('═══════════════════════════════════════════════════════════');
console.log(`✅ Posts WITH cover image: ${postsWithImage.length}`);
console.log(`❌ Posts WITHOUT cover image: ${postsWithoutImage.length}\n`);

// COMPLETE posts (have embed + image)
const completePosts = posts.filter(p => 
  downloadedSlugs.includes(p.slug) && 
  (p.content.includes('youtube') || p.content.includes('soundcloud') || p.content.includes('youtu.be'))
);

console.log('═══════════════════════════════════════════════════════════');
console.log('  COMPLETENESS');
console.log('═══════════════════════════════════════════════════════════');
console.log(`✅ COMPLETE (image + embed): ${completePosts.length}`);
console.log(`⚠️  MISSING IMAGE ONLY: ${postsWithEmbed.length - completePosts.length}`);
console.log(`⚠️  MISSING EMBED ONLY: ${postsWithImage.length - completePosts.length}`);
console.log(`❌ MISSING BOTH: ${posts.length - postsWithEmbed.length - postsWithImage.length + completePosts.length}\n`);

// Artist breakdown
console.log('═══════════════════════════════════════════════════════════');
console.log('  TOP ARTISTS (by post count)');
console.log('═══════════════════════════════════════════════════════════');
const artistCounts: Record<string, number> = {};
posts.forEach(p => {
  const artistMatch = p.title.match(/^([^-:]+)[-:]/);
  const artist = artistMatch ? artistMatch[1].trim() : 'Unknown';
  artistCounts[artist] = (artistCounts[artist] || 0) + 1;
});
Object.entries(artistCounts)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 10)
  .forEach(([artist, count]) => {
    console.log(`  ${artist}: ${count}`);
  });

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  SAMPLE COMPLETE POSTS (with image + embed)');
console.log('═══════════════════════════════════════════════════════════');
completePosts.slice(0, 5).forEach(p => {
  console.log(`\n  📀 ${p.title}`);
  console.log(`     Slug: ${p.slug}`);
  console.log(`     Image: ${mapping[p.slug] || 'N/A'}`);
  const hasYT = p.content.includes('youtube') || p.content.includes('youtu.be');
  const hasSC = p.content.includes('soundcloud');
  console.log(`     Embeds: ${hasYT ? 'YouTube ' : ''}${hasSC ? 'SoundCloud' : ''}`);
});

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  SAMPLE INCOMPLETE POSTS (missing image)');
console.log('═══════════════════════════════════════════════════════════');
postsWithoutImage.slice(0, 5).forEach(p => {
  console.log(`\n  📀 ${p.title}`);
  console.log(`     Slug: ${p.slug}`);
  console.log(`     Date: ${p.date}`);
  const hasYT = p.content.includes('youtube') || p.content.includes('youtu.be');
  const hasSC = p.content.includes('soundcloud');
  console.log(`     Has embed: ${hasYT || hasSC ? 'Yes' : 'No'}`);
});

console.log('\n═══════════════════════════════════════════════════════════');
