import * as fs from 'fs';

// Read the TSV file
const content = fs.readFileSync('/Users/user/Downloads/audio-posts.json', 'utf-8');
const lines = content.split('\n');

console.log('═══════════════════════════════════════════════════════════');
console.log('  SHESKIN EXPORT ANALYSIS (FIXED PARSER)');
console.log('═══════════════════════════════════════════════════════════\n');

// Parse TSV handling multi-line content
const headers = lines[0].split('\t');
console.log('Headers:', headers);
console.log('Total lines:', lines.length);

// Count actual records (lines starting with a number = ID)
let recordCount = 0;
const records: any[] = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  // A new record starts with a numeric ID
  if (/^\d+\t/.test(line)) {
    recordCount++;
    const cols = line.split('\t');
    records.push({
      id: cols[0],
      title: cols[1] || '',
      content: cols[2] || '',
      date: cols[3] || '',
      slug: cols[4] || '',
      status: cols[5] || ''
    });
  }
}

console.log(`\n📊 TOTAL AUDIO POSTS: ${recordCount}\n`);

// Analyze
const withYouTube = records.filter(r => r.content.includes('youtube') || r.content.includes('youtu.be'));
const withSoundCloud = records.filter(r => r.content.includes('soundcloud'));
const withAnyEmbed = records.filter(r => 
  r.content.includes('youtube') || 
  r.content.includes('youtu.be') || 
  r.content.includes('soundcloud')
);

console.log('═══════════════════════════════════════════════════════════');
console.log('  EMBED STATUS');
console.log('═══════════════════════════════════════════════════════════');
console.log(`🎬 YouTube: ${withYouTube.length}`);
console.log(`☁️ SoundCloud: ${withSoundCloud.length}`);
console.log(`✅ Any embed: ${withAnyEmbed.length}`);
console.log(`❌ No embed: ${recordCount - withAnyEmbed.length}\n`);

// Artist breakdown
const artistMap: Record<string, number> = {};
records.forEach(r => {
  const match = r.title.match(/^([^-]+)\s*-/);
  const artist = match ? match[1].trim() : 'Unknown';
  artistMap[artist] = (artistMap[artist] || 0) + 1;
});

console.log('═══════════════════════════════════════════════════════════');
console.log('  ARTIST BREAKDOWN');
console.log('═══════════════════════════════════════════════════════════');
Object.entries(artistMap)
  .sort(([,a], [,b]) => b - a)
  .forEach(([artist, count]) => {
    console.log(`  ${artist}: ${count}`);
  });

// Sample posts with embeds
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  SAMPLE POSTS (with embeds)');
console.log('═══════════════════════════════════════════════════════════');
withAnyEmbed.slice(0, 10).forEach(r => {
  const hasYT = r.content.includes('youtube') || r.content.includes('youtu.be');
  const hasSC = r.content.includes('soundcloud');
  console.log(`\n  📀 ${r.title}`);
  console.log(`     Slug: ${r.slug || 'N/A'}`);
  console.log(`     Embeds: ${hasYT ? 'YouTube ' : ''}${hasSC ? 'SoundCloud' : ''}`);
});
