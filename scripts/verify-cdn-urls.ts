#!/usr/bin/env node
/**
 * Verify CDN URLs are accessible
 */

const COLLAB_URLS = [
  'https://she-skin.b-cdn.net/works/collaborations/collaborations-20077-harto-falion-best-ofthe-worst-official-mv.jpg',
  'https://she-skin.b-cdn.net/works/collaborations/collaborations-19987-haunted-mound-virginia-832k99.jpg',
  'https://she-skin.b-cdn.net/works/collaborations/collaborations-19881-she-skin-x-snack-skateboards.jpg',
  'https://she-skin.b-cdn.net/works/collaborations/collaborations-19704-carpet-company-deck-design.jpg',
];

async function checkUrl(url: string): Promise<{url: string, status: number, ok: boolean}> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return { url: url.slice(-40), status: response.status, ok: response.ok };
  } catch (err) {
    return { url: url.slice(-40), status: 0, ok: false };
  }
}

async function main() {
  console.log('Checking CDN URLs...\n');

  for (const url of COLLAB_URLS) {
    const result = await checkUrl(url);
    console.log(`${result.ok ? '✅' : '❌'} ${result.status} ${result.url}`);
  }
}

main();
