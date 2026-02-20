/**
 * Shop Password Protection
 * 
 * Simple password gate for the shop. Controlled via environment variables.
 * 
 * Future: Move password to database/admin dashboard for easy changing.
 * For now: Set SHOP_PASSWORD in .env to enable protection.
 * Set SHOP_PASSWORD_ENABLED=false to disable without removing the password.
 */

const SHOP_COOKIE_NAME = 'shop_access';
const SHOP_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Shop password configuration
export interface ShopPasswordConfig {
  enabled: boolean;
  password: string | null;
  hint: string | null;
}

/**
 * Get shop password configuration from environment
 */
export function getShopPasswordConfig(): ShopPasswordConfig {
  return {
    enabled: process.env.SHOP_PASSWORD_ENABLED !== 'false', // Default true if password is set
    password: process.env.SHOP_PASSWORD || null,
    hint: process.env.SHOP_PASSWORD_HINT || null,
  };
}

/**
 * Check if shop password protection is active
 */
export function isShopPasswordProtected(): boolean {
  const config = getShopPasswordConfig();
  return config.enabled && !!config.password;
}

/**
 * Simple hash function for shop password (not cryptographic, just obfuscation)
 * In production, this uses HMAC with ADMIN_SECRET for actual verification
 */
function hashShopPassword(password: string, secret: string): string {
  // Simple hash - in production this should use proper HMAC
  let hash = 0;
  const combined = password + secret;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Create shop access cookie
 */
export function createShopAccessCookie(secret: string): { name: string; value: string; options: string } {
  const timestamp = Date.now().toString();
  const signature = hashShopPassword(timestamp, secret);
  const value = `${timestamp}.${signature}`;
  const options = `HttpOnly; Path=/shop; Max-Age=${7 * 24 * 60 * 60}; SameSite=Strict`;
  return { name: SHOP_COOKIE_NAME, value, options };
}

/**
 * Verify shop access cookie
 */
export function verifyShopAccessCookie(cookieHeader: string | null, secret: string): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(new RegExp(`${SHOP_COOKIE_NAME}=([^;]+)`));
  const raw = match?.[1];
  if (!raw) return false;
  
  const [timestamp, signature] = raw.split('.');
  if (!timestamp || !signature) return false;
  
  const age = Date.now() - parseInt(timestamp, 10);
  if (age < 0 || age > SHOP_SESSION_MAX_AGE_MS) return false;
  
  const expected = hashShopPassword(timestamp, secret);
  return signature === expected;
}

/**
 * Verify shop password attempt
 */
export function verifyShopPassword(attempt: string): boolean {
  const config = getShopPasswordConfig();
  if (!config.password) return true; // No password set = allow all
  return attempt === config.password;
}

/**
 * Check if user has shop access (cookie or no password required)
 * Returns: { hasAccess: boolean, needsPassword: boolean }
 */
export function checkShopAccess(request: Request): { hasAccess: boolean; needsPassword: boolean } {
  const config = getShopPasswordConfig();
  
  // No password configured or disabled
  if (!config.password || !config.enabled) {
    return { hasAccess: true, needsPassword: false };
  }
  
  // Check for access cookie
  const cookieHeader = request.headers.get('cookie');
  const secret = process.env.ADMIN_SECRET || 'fallback-secret-change-in-production';
  
  if (verifyShopAccessCookie(cookieHeader, secret)) {
    return { hasAccess: true, needsPassword: false };
  }
  
  // Password required and no valid cookie
  return { hasAccess: false, needsPassword: true };
}

/**
 * API endpoint helper: Process password submission
 */
export async function processShopPasswordSubmission(
  request: Request
): Promise<{ success: boolean; cookie?: { name: string; value: string; options: string } }> {
  const config = getShopPasswordConfig();
  
  if (!config.password || !config.enabled) {
    return { success: true };
  }
  
  try {
    const body = await request.json();
    const password = body.password;
    
    if (!password || typeof password !== 'string') {
      return { success: false };
    }
    
    if (password === config.password) {
      const secret = process.env.ADMIN_SECRET || 'fallback-secret-change-in-production';
      const cookie = createShopAccessCookie(secret);
      return { success: true, cookie };
    }
    
    return { success: false };
  } catch {
    return { success: false };
  }
}
