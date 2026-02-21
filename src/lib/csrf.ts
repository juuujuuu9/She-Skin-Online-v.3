/**
 * CSRF Protection Utilities
 * 
 * Implements Double Submit Cookie pattern for state-changing operations
 */

import { createHmac } from 'node:crypto';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'X-CSRF-Token';

function getCsrfSecret(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error('ADMIN_SECRET required for CSRF');
  return secret;
}

export function generateCsrfToken(): { token: string; cookie: string } {
  const timestamp = Date.now().toString();
  const secret = getCsrfSecret();
  const signature = createHmac('sha256', secret)
    .update(timestamp)
    .digest('base64url');
  
  const token = `${timestamp}.${signature}`;
  const cookie = `${CSRF_COOKIE}=${token}; Path=/; SameSite=Lax`;
  
  return { token, cookie };
}

export function validateCsrfToken(request: Request): boolean {
  // Get token from header
  const headerToken = request.headers.get(CSRF_HEADER);
  
  // Get token from cookie
  const cookieHeader = request.headers.get('cookie');
  const cookieMatch = cookieHeader?.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`));
  const cookieToken = cookieMatch?.[1];
  
  if (!headerToken || !cookieToken) return false;
  if (headerToken !== cookieToken) return false;
  
  // Validate signature
  const [timestamp, signature] = cookieToken.split('.');
  if (!timestamp || !signature) return false;
  
  const expected = createHmac('sha256', getCsrfSecret())
    .update(timestamp)
    .digest('base64url');
  
  try {
    return signature === expected;
  } catch {
    return false;
  }
}

export function csrfCookieName(): string {
  return CSRF_COOKIE;
}

export function csrfHeaderName(): string {
  return CSRF_HEADER;
}
