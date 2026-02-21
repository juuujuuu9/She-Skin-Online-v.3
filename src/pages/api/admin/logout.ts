/**
 * Admin Logout API
 * POST /api/admin/logout
 */

import type { APIRoute } from 'astro';

export const POST: APIRoute = async () => {
  // Clear the admin session cookie
  const clearCookie =
    'admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict' +
    (import.meta.env.PROD ? '; Secure' : '');
    
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Set-Cookie': clearCookie,
  });
  
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers,
  });
};

// Also support GET for simple logout links
export const GET: APIRoute = async () => {
  const clearCookie =
    'admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict' +
    (import.meta.env.PROD ? '; Secure' : '');
    
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/admin/login?logged_out=1',
      'Set-Cookie': clearCookie,
    },
  });
};
