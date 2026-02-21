/**
 * Rate Limiting Utilities
 * 
 * Prevents brute force attacks and abuse
 */

// In-memory store (use Redis in production)
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, RateLimitRecord>();

/**
 * Check if request is within rate limit
 * @param identifier - Unique identifier (IP, userId, etc.)
 * @param maxAttempts - Maximum allowed attempts
 * @param windowMs - Time window in milliseconds
 * @returns { allowed: boolean; remaining: number; resetAt: number }
 */
export function checkRateLimit(
  identifier: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000 // 15 minutes
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = attempts.get(identifier);
  
  // Clean up expired records periodically
  if (Math.random() < 0.01) { // 1% chance per request
    cleanupExpiredRecords(now);
  }
  
  if (!record || now > record.resetAt) {
    // New window
    const resetAt = now + windowMs;
    attempts.set(identifier, { count: 1, resetAt });
    return { 
      allowed: true, 
      remaining: maxAttempts - 1, 
      resetAt 
    };
  }
  
  if (record.count >= maxAttempts) {
    // Rate limit exceeded
    return { 
      allowed: false, 
      remaining: 0, 
      resetAt: record.resetAt 
    };
  }
  
  // Increment and allow
  record.count++;
  return { 
    allowed: true, 
    remaining: maxAttempts - record.count, 
    resetAt: record.resetAt 
  };
}

/**
 * Reset rate limit for an identifier
 */
export function resetRateLimit(identifier: string): void {
  attempts.delete(identifier);
}

/**
 * Get current rate limit status without incrementing
 */
export function getRateLimitStatus(
  identifier: string,
  maxAttempts = 5
): { remaining: number; resetAt: number | null } {
  const now = Date.now();
  const record = attempts.get(identifier);
  
  if (!record || now > record.resetAt) {
    return { remaining: maxAttempts, resetAt: null };
  }
  
  return { 
    remaining: Math.max(0, maxAttempts - record.count), 
    resetAt: record.resetAt 
  };
}

/**
 * Clean up expired rate limit records
 */
function cleanupExpiredRecords(now: number): void {
  for (const [key, record] of attempts.entries()) {
    if (now > record.resetAt) {
      attempts.delete(key);
    }
  }
}

// Admin-specific rate limiters
export const ADMIN_RATE_LIMITS = {
  // Login: 5 attempts per 15 minutes
  login: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },
  
  // Password reset: 3 attempts per hour
  passwordReset: { maxAttempts: 3, windowMs: 60 * 60 * 1000 },
  
  // API mutations: 100 per minute
  apiMutation: { maxAttempts: 100, windowMs: 60 * 1000 },
  
  // Uploads: 20 per minute
  upload: { maxAttempts: 20, windowMs: 60 * 1000 },
  
  // General API: 300 per minute
  apiGeneral: { maxAttempts: 300, windowMs: 60 * 1000 },
};

/**
 * Get client identifier from request
 * Uses IP address + user agent hash for uniqueness
 */
export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // Simple hash of IP + user agent
  const hash = `${ip}:${userAgent}`.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  return `${ip}:${hash}`;
}
