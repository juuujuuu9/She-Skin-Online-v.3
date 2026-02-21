/**
 * Astro Middleware - Security Layer
 * 
 * Provides CSRF origin validation and security headers
 */

import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  
  // CSRF Protection: Validate origin on state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    
    // If origin is set and doesn't match host, reject
    if (origin && host) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host !== host) {
          console.warn(`[CSRF] Blocked request from ${origin} to ${host}`);
          return new Response(
            JSON.stringify({ error: 'Invalid origin - CSRF protection' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } catch {
        // Invalid origin URL, let it through (may be empty or malformed)
      }
    }
  }
  
  // Continue to next middleware/handler
  const response = await next();
  
  // Add security headers to all responses
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  return response;
});
