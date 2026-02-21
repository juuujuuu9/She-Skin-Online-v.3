export const prerender = false;

import type { APIRoute } from 'astro';
import { processShopPasswordSubmission } from '../../../lib/shop-password';

export const POST: APIRoute = async ({ request }) => {
  const result = await processShopPasswordSubmission(request);
  
  if (result.success) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (result.cookie) {
      headers['Set-Cookie'] = `${result.cookie.name}=${result.cookie.value}; ${result.cookie.options}`;
    }
    
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );
  }
  
  return new Response(
    JSON.stringify({ success: false, error: 'Invalid password' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
};

// Check status (for client-side checks if needed)
export const GET: APIRoute = async ({ request }) => {
  const { checkShopAccess } = await import('../../../lib/shop-password');
  const access = checkShopAccess(request);
  
  return new Response(
    JSON.stringify({
      needsPassword: access.needsPassword,
      hasAccess: access.hasAccess,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
