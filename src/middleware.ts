/**
 * Astro Middleware - Security Layer
 *
 * Provides CSRF origin validation and security headers
 */

import { defineMiddleware } from 'astro:middleware';

// Content Security Policy
// Adjust these directives based on your application's needs
const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'",  // Required for Astro's island architecture
    "'unsafe-eval'",    // Required for some React patterns
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'",  // Required for Tailwind CSS
    'https://fonts.googleapis.com',  // Google Fonts stylesheet
  ],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://*.b-cdn.net',      // Bunny.net CDN
    'https://*.bunnycdn.com',   // Bunny.net storage
  ],
  'media-src': [
    "'self'",
    'https://*.b-cdn.net',      // Bunny.net CDN for audio/video
    'https://*.bunnycdn.com',
  ],
  'connect-src': [
    "'self'",
    'https://*.stripe.com',     // Stripe payment processing
    'https://*.neon.tech',      // Neon database (if direct connection needed)
  ],
  'font-src': [
    "'self'",
    'data:',
    'https://fonts.gstatic.com',  // Google Fonts font files
  ],
  'frame-src': [
    "'self'",
    'https://*.stripe.com',       // Stripe checkout iframe
    'https://www.youtube.com',    // YouTube video embeds
    'https://www.youtube-nocookie.com', // Privacy-friendly YouTube embeds
  ],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  // frame-ancestors set dynamically in middleware based on environment
  'upgrade-insecure-requests': [],  // Upgrade HTTP to HTTPS
};

/**
 * Build CSP header string from directives
 */
function buildCSP(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) return key;
      return `${key} ${values.join(' ')}`;
    })
    .join('; ');
}

/**
 * Generate nonce for inline scripts (if needed in future)
 */
function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

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
  // X-Frame-Options: DENY in production, SAMEORIGIN in development
  // (allows browser extensions/dev tools to frame the page during development)
  response.headers.set('X-Frame-Options', import.meta.env.PROD ? 'DENY' : 'SAMEORIGIN');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Add Content Security Policy
  // frame-ancestors: 'none' in production, 'self' in development
  // (allows dev tools and preview environments to frame the page)
  const cspDirectives = {
    ...CSP_DIRECTIVES,
    'frame-ancestors': import.meta.env.PROD ? ["'none'"] : ["'self'", 'http://localhost:*', 'https://localhost:*'],
  };
  const csp = buildCSP(cspDirectives);
  response.headers.set('Content-Security-Policy', csp);

  // Additional security headers
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(self), usb=(), magnetometer=(), gyroscope=(), fullscreen=(self)');

  return response;
});
