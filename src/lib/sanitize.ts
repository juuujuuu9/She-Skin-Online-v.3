/**
 * HTML Sanitization Utilities
 *
 * Provides safe HTML encoding and sanitization to prevent XSS attacks.
 * All user-controlled content should be sanitized before being inserted into the DOM.
 */

/**
 * Escape HTML special characters to prevent XSS attacks.
 * Converts <, >, ", ', and & to their HTML entity equivalents.
 */
export function escapeHtml(text: string | number | null | undefined): string {
  if (text === null || text === undefined) {
    return '';
  }

  const str = String(text);

  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize an object by escaping all string values recursively.
 * Useful for sanitizing API response data before rendering.
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized = {} as T;

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      (sanitized as any)[key] = escapeHtml(value);
    } else if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        (sanitized as any)[key] = value.map(item =>
          typeof item === 'string' ? escapeHtml(item) :
          typeof item === 'object' ? sanitizeObject(item) :
          item
        );
      } else {
        (sanitized as any)[key] = sanitizeObject(value);
      }
    } else {
      (sanitized as any)[key] = value;
    }
  }

  return sanitized;
}

/**
 * Create a safe HTML string for text content that will be inserted via innerHTML.
 * This wraps the escaped text in a span for direct insertion.
 */
export function safeText(text: string | number | null | undefined): string {
  return escapeHtml(text);
}

/**
 * Validate that a string only contains safe characters for a specific context.
 * Use for URL attributes, CSS values, etc.
 */
export function isSafeUrl(url: string): boolean {
  // Only allow http:, https:, and relative URLs
  const allowedProtocols = /^((https?:)?\/\/|[\/\.])/i;
  return allowedProtocols.test(url);
}

/**
 * Sanitize a URL for safe use in href or src attributes.
 * Returns empty string if the URL is potentially unsafe.
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return '';

  const trimmed = url.trim();

  // Reject javascript: and data: protocols
  const dangerousProtocols = /^(javascript|data|vbscript|file):/i;
  if (dangerousProtocols.test(trimmed)) {
    console.warn('[Sanitize] Blocked potentially dangerous URL:', trimmed);
    return '';
  }

  return trimmed;
}
