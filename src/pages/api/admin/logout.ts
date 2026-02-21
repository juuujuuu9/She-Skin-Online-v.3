import type { APIRoute } from 'astro';

export const POST: APIRoute = async () => {
  // Clear the admin session cookie by sending Set-Cookie with Max-Age=0.
  // Must be in our Response so the browser actually clears it.
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
