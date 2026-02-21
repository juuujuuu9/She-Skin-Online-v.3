/**
 * Admin auth: Database-backed user authentication with session cookies
 * Used by /admin page and /api/admin/* routes.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const COOKIE_NAME = 'admin_session';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const DEBUG_AUTH = process.env.DEBUG_ADMIN_LOGIN === '1' || process.env.DEBUG_ADMIN_LOGIN === 'true'; // Enable via env var

// Admin secret from env for signing cookies
function getAdminSecret(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('ADMIN_SECRET must be set and at least 16 characters');
  }
  return secret;
}

function sign(value: string): string {
  const secret = getAdminSecret();
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createSessionCookie(userId: string): { name: string; value: string; options: string } {
  const timestamp = Date.now().toString();
  const data = `${userId}.${timestamp}`;
  const signature = sign(data);
  const value = `${data}.${signature}`;
  const options = 'HttpOnly; Path=/; Max-Age=86400; SameSite=Lax';
  return { name: COOKIE_NAME, value, options };
}

export function verifySessionCookie(cookieHeader: string | null): { valid: boolean; userId?: string; debug?: string } {
  if (!cookieHeader) {
    if (DEBUG_AUTH) console.debug('[verifySessionCookie] No cookie header');
    return { valid: false, debug: 'no_cookie_header' };
  }
  
  if (DEBUG_AUTH) {
    console.debug('[verifySessionCookie] Cookie header present, length:', cookieHeader.length);
    // Log first 200 chars to see cookie names without exposing values
    const cookieNames = cookieHeader.split(';').map(c => c.split('=')[0].trim()).join(', ');
    console.debug('[verifySessionCookie] Cookie names:', cookieNames);
  }
  
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  let raw = match?.[1]?.trim();
  
  if (DEBUG_AUTH) {
    console.debug('[verifySessionCookie] Cookie match:', match ? 'found' : 'not found', 'raw length:', raw?.length ?? 0);
  }
  
  if (!raw) return { valid: false, debug: 'cookie_not_found' };
  
  try {
    if (raw.includes('%')) raw = decodeURIComponent(raw);
  } catch {
    /* leave raw as-is */
  }
  
  const parts = raw.split('.');
  if (parts.length !== 3) {
    if (DEBUG_AUTH) console.debug('[verifySessionCookie] Invalid format, expected 3 parts got:', parts.length);
    return { valid: false, debug: 'invalid_format' };
  }
  
  const [userId, timestamp, signature] = parts;
  if (!userId || !timestamp || !signature) {
    if (DEBUG_AUTH) console.debug('[verifySessionCookie] Missing parts');
    return { valid: false, debug: 'missing_parts' };
  }
  
  // Check age
  const age = Date.now() - parseInt(timestamp, 10);
  if (age < 0 || age > SESSION_MAX_AGE_MS) {
    if (DEBUG_AUTH) console.debug('[verifySessionCookie] Session expired, age:', age);
    return { valid: false, debug: 'session_expired' };
  }
  
  // Verify signature
  const data = `${userId}.${timestamp}`;
  const expected = sign(data);
  try {
    const valid = timingSafeEqual(Buffer.from(signature, 'base64url'), Buffer.from(expected, 'base64url'));
    if (DEBUG_AUTH) console.debug('[verifySessionCookie] Signature valid:', valid);
    return valid ? { valid: true, userId } : { valid: false, debug: 'invalid_signature' };
  } catch {
    if (DEBUG_AUTH) console.debug('[verifySessionCookie] Signature verification error');
    return { valid: false, debug: 'signature_error' };
  }
}

/** Hash password using bcrypt */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/** Verify password against hash */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Support both Node.js and Astro environments
// In Astro, use import.meta.env.DEV; in Node.js, use process.env
// DEBUG_AUTH is defined at the top of this file

/** Verify admin credentials against database */
export async function verifyAdminCredentials(username: string, password: string): Promise<{ valid: boolean; userId?: string }> {
  try {
    if (DEBUG_AUTH) {
      console.debug('[admin-auth] verifyAdminCredentials: username=', username ? `${username.slice(0, 2)}***` : '(empty)', 'passwordLength=', password?.length ?? 0);
    }

    const user = await db.query.users.findFirst({
      where: eq(users.username, username),
    });

    if (DEBUG_AUTH) {
      console.debug('[admin-auth] User lookup:', user ? `found id=${user.id} isActive=${user.isActive}` : 'not found');
    }

    if (!user || !user.isActive) {
      return { valid: false };
    }

    const valid = await verifyPassword(password, user.passwordHash);

    if (DEBUG_AUTH) {
      console.debug('[admin-auth] Password check:', valid ? 'match' : 'no match');
    }

    if (valid) {
      // Update last login
      await db.update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));

      if (DEBUG_AUTH) {
        console.debug('[admin-auth] Login success: userId=', user.id);
      }

      return { valid: true, userId: user.id };
    }

    return { valid: false };
  } catch (error) {
    console.error('[admin-auth] Auth error:', error);
    return { valid: false };
  }
}

/** Check if user is authenticated via cookie */
export async function checkAdminAuth(request: Request): Promise<{ valid: boolean; userId?: string; user?: typeof users.$inferSelect; debug?: string }> {
  const cookieHeader = request.headers.get('cookie');
  const session = verifySessionCookie(cookieHeader);
  
  if (DEBUG_AUTH && session.debug) {
    console.debug('[checkAdminAuth] Session check failed:', session.debug);
  }
  
  if (!session.valid || !session.userId) {
    return { valid: false, debug: session.debug };
  }

  // Verify user still exists and is active
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!user || !user.isActive) {
      if (DEBUG_AUTH) console.debug('[checkAdminAuth] User not found or inactive');
      return { valid: false, debug: 'user_not_found_or_inactive' };
    }

    return { valid: true, userId: user.id, user };
  } catch (error) {
    console.error('Auth check error:', error);
    return { valid: false, debug: 'database_error' };
  }
}

/** Dev-only: return a short reason why auth failed (for 401 debugging) */
export function getAdminAuthFailureReason(request: Request): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return 'no_cookie';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match?.[1]?.trim()) return 'no_admin_session_cookie';
  const raw = match[1].trim();
  const parts = raw.split('.');
  if (parts.length !== 3) return 'bad_cookie_format';
  const [, timestamp, signature] = parts;
  const age = Date.now() - parseInt(timestamp, 10);
  if (age < 0 || age > SESSION_MAX_AGE_MS) return 'session_expired';
  try {
    const data = `${parts[0]}.${timestamp}`;
    const expected = sign(data);
    const valid = timingSafeEqual(Buffer.from(signature, 'base64url'), Buffer.from(expected, 'base64url'));
    return valid ? null : 'invalid_signature';
  } catch {
    return 'invalid_signature';
  }
}

/** Require admin auth for API routes */
export async function requireAdminAuth(request: Request): Promise<Response | null> {
  const auth = await checkAdminAuth(request);
  if (!auth.valid) {
    return new Response('Unauthorized', { 
      status: 401, 
      headers: { 'WWW-Authenticate': 'Bearer realm="Admin"' } 
    });
  }
  return null;
}

/** Get user by email */
export async function getUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email),
  });
}

/** Update user password */
export async function updateUserPassword(userId: string, newPasswordHash: string) {
  return db.update(users)
    .set({ 
      passwordHash: newPasswordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
