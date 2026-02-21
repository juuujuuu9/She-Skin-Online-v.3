/**
 * Admin Logout API
 * POST /api/admin/logout
 */

import type { APIRoute } from 'astro';
import { checkAdminAuth } from '@lib/admin-auth';
import { logAction, AuditActions, AuditResources } from '@lib/audit';

export const POST: APIRoute = async ({ request }) => {
  // Get user info before clearing cookie
  const auth = await checkAdminAuth(request);
  
  // Clear the admin session cookie
  const clearCookie =
    'admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' +
    (import.meta.env.PROD ? '; Secure' : '');
  
  // Log logout action
  if (auth.valid && auth.user) {
    await logAction(
      request,
      auth.userId || null,
      auth.user.username,
      AuditActions.LOGOUT,
      AuditResources.USER,
      auth.userId || null,
      {},
      true
    );
  }
    
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
export const GET: APIRoute = async ({ request }) => {
  // Get user info before clearing cookie
  const auth = await checkAdminAuth(request);
  
  // Clear the admin session cookie
  const clearCookie =
    'admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' +
    (import.meta.env.PROD ? '; Secure' : '');
  
  // Log logout action
  if (auth.valid && auth.user) {
    await logAction(
      request,
      auth.userId || null,
      auth.user.username,
      AuditActions.LOGOUT,
      AuditResources.USER,
      auth.userId || null,
      {},
      true
    );
  }
    
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/admin/login?logged_out=1',
      'Set-Cookie': clearCookie,
    },
  });
};
