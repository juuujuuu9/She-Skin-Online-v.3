/**
 * Admin auth: Basic Auth + signed session cookie.
 * Used by /admin page and /api/admin/* routes.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const COOKIE_NAME = 'admin_session';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

// Cache for env values
let cachedPassword: string | undefined;
let cachedSecret: string | undefined;

function loadEnvFromFile(): void {
  if (cachedPassword !== undefined) return;
  
  try {
    const envPath = resolve(process.cwd(), '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
      
      if (key === 'ADMIN_PASSWORD') cachedPassword = value;
      if (key === 'ADMIN_SECRET') cachedSecret = value;
    }
  } catch {
    // Fallback to process.env if .env file can't be read
  }
  
  // Fallback to process.env
  if (!cachedPassword) cachedPassword = process.env.ADMIN_PASSWORD;
  if (!cachedSecret) cachedSecret = process.env.ADMIN_SECRET;
}

function getAdminSecret(): string {
  loadEnvFromFile();
  if (!cachedSecret || cachedSecret.length < 16) {
    throw new Error('ADMIN_SECRET must be set and at least 16 characters');
  }
  return cachedSecret;
}

function getAdminPassword(): string {
  loadEnvFromFile();
  if (!cachedPassword) {
    throw new Error('ADMIN_PASSWORD must be set');
  }
  return cachedPassword;
}

/** Verify a plain password against ADMIN_PASSWORD (timing-safe). For use by login form. */
export function verifyAdminPassword(plain: string): boolean {
  loadEnvFromFile();
  const expected = cachedPassword;
  if (!expected?.trim()) return false;
  const a = Buffer.from(plain, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function sign(value: string): string {
  const secret = getAdminSecret();
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
  return verifySessionCookieValue(raw ?? null);
}

/** Verify using the cookie value only (e.g. from Astro cookies.get('admin_session')?.value). */
export function verifySessionCookieValue(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return false;
  const [timestamp, signature] = value.trim().split('.');
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
 * Pass sessionCookieValue when using Astro context.cookies (e.g. cookies.get('admin_session')?.value)
 * so the session is read the same way Astro set it.
 */
export function isAdminAuthenticated(
  request: Request,
  sessionCookieValue?: string | null
): boolean | { setCookie: true } {
  loadEnvFromFile();
  if (!cachedPassword?.trim()) {
    console.warn('Admin auth: ADMIN_PASSWORD not set, denying access');
    return false;
  }

  if (sessionCookieValue !== undefined) {
    if (verifySessionCookieValue(sessionCookieValue)) return true;
  } else {
    const cookieHeader = request.headers.get('cookie');
    if (verifySessionCookie(cookieHeader)) return true;
  }

  const auth = parseBasicAuth(request.headers.get('authorization'));
  if (!auth) return false;
  const expected = getAdminPassword();
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

/**
 * Check admin auth and return result object
 * Used by Astro pages for simpler auth checking
 */
export function checkAdminAuth(request: Request): { valid: boolean; setCookie?: boolean } {
  loadEnvFromFile();
  if (!cachedPassword?.trim()) {
    console.warn('Admin auth: ADMIN_PASSWORD not set, denying access');
    return { valid: false };
  }

  const cookieHeader = request.headers.get('cookie');
  if (verifySessionCookie(cookieHeader)) {
    return { valid: true };
  }

  const auth = parseBasicAuth(request.headers.get('authorization'));
  if (!auth) return { valid: false };
  
  const expected = getAdminPassword();
  const a = Buffer.from(auth.pass, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return { valid: false };
  
  try {
    if (timingSafeEqual(a, b)) {
      return { valid: true, setCookie: true };
    }
  } catch {}
  
  return { valid: false };
}
