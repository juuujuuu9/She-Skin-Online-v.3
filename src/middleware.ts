/**
 * Astro Middleware - Security Layer + Clerk Auth
 *
 * Provides CSRF origin validation, security headers, and Clerk authentication
 */

import { clerkMiddleware } from '@clerk/astro/server';
import { createRouteMatcher } from '@clerk/astro/server';

// Content Security Policy
const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    'https://*.clerk.accounts.dev',
    'https://clerk.sheskinv3.thoughtform.world',
    'https://clerk.js',  // Clerk JS
    'blob:',  // Required for Clerk web workers
  ],
  'worker-src': ["'self'", 'blob:'],  // Clerk uses blob workers
  'style-src': [
    "'self'",
    "'unsafe-inline'",
    'https://fonts.googleapis.com',
    'https://*.clerk.accounts.dev',
    'https://clerk.sheskinv3.thoughtform.world',
  ],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://*.b-cdn.net',
    'https://*.bunnycdn.com',
    'https://img.clerk.com',
  ],
  'media-src': [
    "'self'",
    'https://*.b-cdn.net',
    'https://*.bunnycdn.com',
  ],
  'connect-src': [
    "'self'",
    'https://*.stripe.com',
    'https://*.neon.tech',
    'https://*.clerk.accounts.dev',
    'https://clerk.sheskinv3.thoughtform.world',
  ],
  'font-src': [
    "'self'",
    'data:',
    'https://fonts.gstatic.com',
  ],
  'frame-src': [
    "'self'",
    'https://*.stripe.com',
    'https://www.youtube.com',
    'https://www.youtube-nocookie.com',
    'https://*.clerk.accounts.dev',
    'https://clerk.sheskinv3.thoughtform.world',
  ],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'upgrade-insecure-requests': [],
};

function buildCSP(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) return key;
      return `${key} ${values.join(' ')}`;
    })
    .join('; ');
}

// Define admin routes that need protection
const isAdminRoute = createRouteMatcher(['/admin(.*)']);
const isPublicAdminRoute = createRouteMatcher(['/admin/login']);

// Clerk middleware with auth protection
export const onRequest = clerkMiddleware(async (auth, context, next) => {
  const { request } = context;
  const url = new URL(request.url);

  // Protect admin routes (except login pages)
  if (isAdminRoute(request) && !isPublicAdminRoute(request)) {
    const authResult = auth();
    if (!authResult.userId) {
      // Not authenticated, redirect to login
      return context.redirect('/admin/login');
    }
  }

  // CSRF Protection: Validate origin on state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

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
        // Invalid origin URL
      }
    }
  }

  // Continue to next middleware/handler
  const response = await next();

  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', import.meta.env.PROD ? 'DENY' : 'SAMEORIGIN');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Add CSP with Clerk domains
  const cspDirectives = {
    ...CSP_DIRECTIVES,
    'frame-ancestors': import.meta.env.PROD ? ["'none'"] : ["'self'", 'http://localhost:*', 'https://localhost:*'],
  };
  response.headers.set('Content-Security-Policy', buildCSP(cspDirectives));
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(self), usb=(), magnetometer=(), gyroscope=(), fullscreen=(self)');

  return response;
});
