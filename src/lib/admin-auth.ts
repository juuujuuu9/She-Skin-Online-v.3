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
  const options = 'HttpOnly; Path=/; Max-Age=86400; SameSite=Strict';
  return { name: COOKIE_NAME, value, options };
}

export function verifySessionCookie(cookieHeader: string | null): { valid: boolean; userId?: string } {
  if (!cookieHeader) return { valid: false };
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  let raw = match?.[1]?.trim();
  if (!raw) return { valid: false };
  try {
    if (raw.includes('%')) raw = decodeURIComponent(raw);
  } catch {
    /* leave raw as-is */
  }
  const parts = raw.split('.');
  if (parts.length !== 3) return { valid: false };
  
  const [userId, timestamp, signature] = parts;
  if (!userId || !timestamp || !signature) return { valid: false };
  
  // Check age
  const age = Date.now() - parseInt(timestamp, 10);
  if (age < 0 || age > SESSION_MAX_AGE_MS) return { valid: false };
  
  // Verify signature
  const data = `${userId}.${timestamp}`;
  const expected = sign(data);
  try {
    const valid = timingSafeEqual(Buffer.from(signature, 'base64url'), Buffer.from(expected, 'base64url'));
    return valid ? { valid: true, userId } : { valid: false };
  } catch {
    return { valid: false };
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

const DEBUG_AUTH = process.env.DEBUG_ADMIN_LOGIN === '1' || process.env.NODE_ENV === 'development';

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
export async function checkAdminAuth(request: Request): Promise<{ valid: boolean; userId?: string; user?: typeof users.$inferSelect }> {
  const cookieHeader = request.headers.get('cookie');
  const session = verifySessionCookie(cookieHeader);
  
  if (!session.valid || !session.userId) {
    return { valid: false };
  }

  // Verify user still exists and is active
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!user || !user.isActive) {
      return { valid: false };
    }

    return { valid: true, userId: user.id, user };
  } catch (error) {
    console.error('Auth check error:', error);
    return { valid: false };
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
