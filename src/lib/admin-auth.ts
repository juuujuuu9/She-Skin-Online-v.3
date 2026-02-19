/**
 * Admin auth: Basic Auth + signed session cookie.
 * Used by /admin page and /api/admin/* routes.
 */

import { config } from 'dotenv';
import { createHmac, timingSafeEqual } from 'node:crypto';

config({ path: '.env' });

const COOKIE_NAME = 'admin_session';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

function getSecret(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('ADMIN_SECRET must be set and at least 16 characters');
  }
  return secret;
}

function getPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error('ADMIN_PASSWORD must be set');
  }
  return password;
}

function sign(value: string): string {
  const secret = getSecret();
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createSessionCookie(): { name: string; value: string; options: string } {
  const timestamp = Date.now().toString();
  const signature = sign(timestamp);
  const value = `${timestamp}.${signature}`;
  const options = 'HttpOnly; Path=/; Max-Age=86400; SameSite=Strict';
  return { name: COOKIE_NAME, value, options };
}

export function verifySessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const raw = match?.[1];
  if (!raw) return false;
  const [timestamp, signature] = raw.split('.');
  if (!timestamp || !signature) return false;
  const age = Date.now() - parseInt(timestamp, 10);
  if (age < 0 || age > SESSION_MAX_AGE_MS) return false;
  const expected = sign(timestamp);
  try {
    return timingSafeEqual(Buffer.from(signature, 'base64url'), Buffer.from(expected, 'base64url'));
  } catch {
    return false;
  }
}

function parseBasicAuth(authHeader: string | null): { user: string; pass: string } | null {
  if (!authHeader || !authHeader.startsWith('Basic ')) return null;
  try {
    const b64 = authHeader.slice(6);
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon === -1) return null;
    return { user: decoded.slice(0, colon), pass: decoded.slice(colon + 1) };
  } catch {
    return null;
  }
}

/**
 * Returns true if request is authenticated, or { setCookie: true } if Basic Auth succeeded.
 */
export function isAdminAuthenticated(request: Request): boolean | { setCookie: true } {
  if (!process.env.ADMIN_PASSWORD?.trim()) {
    console.warn('Admin auth: ADMIN_PASSWORD not set, denying access');
    return false;
  }

  const cookieHeader = request.headers.get('cookie');
  if (verifySessionCookie(cookieHeader)) return true;

  const auth = parseBasicAuth(request.headers.get('authorization'));
  if (!auth) return false;
  const expected = getPassword();
  const a = Buffer.from(auth.pass, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  try {
    if (timingSafeEqual(a, b)) return { setCookie: true };
  } catch {}
  return false;
}

export function requireAdminAuth(request: Request): Response | null {
  const auth = isAdminAuthenticated(request);
  if (auth === false) {
    return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Admin"' } });
  }
  return null;
}
