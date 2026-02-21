/**
 * Test endpoint for cookie debugging
 * GET: Returns current cookies
 * POST: Sets a test cookie and returns it
 */

import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const cookieHeader = request.headers.get('cookie');
  const allHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    allHeaders[key] = value;
  });

  console.log('[test-cookie] GET received cookies:', cookieHeader || 'none');
  console.log('[test-cookie] All headers:', JSON.stringify(allHeaders, null, 2));

  return new Response(
    JSON.stringify({
      receivedCookies: cookieHeader || null,
      cookieCount: cookieHeader ? cookieHeader.split(';').length : 0,
      cookieNames: cookieHeader ? cookieHeader.split(';').map(c => c.split('=')[0].trim()) : [],
      allHeadersReceived: Object.keys(allHeaders),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};

export const POST: APIRoute = async ({ request }) => {
  console.log('[test-cookie] POST request received');

  const testValue = `test_${Date.now()}`;
  const setCookie = `test_cookie=${testValue}; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax`;

  console.log('[test-cookie] Setting cookie:', setCookie);

  return new Response(
    JSON.stringify({
      message: 'Test cookie set',
      cookieValue: testValue,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setCookie,
      },
    }
  );
};
