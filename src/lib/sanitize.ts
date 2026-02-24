/**
 * HTML sanitization utilities to prevent XSS attacks
 * Use these when setting innerHTML with user-provided content
 */

/**
 * Escape HTML special characters to prevent XSS
 * Converts &, <, >, ", and ' to their HTML entity equivalents
 */
export function escapeHtml(text: string): string {
  if (!text || typeof text !== 'string') return '';

  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return text.replace(/[&<>"']/g, (match) => htmlEntities[match]);
}

/**
 * Sanitize a URL to prevent javascript: and data: injection
 * Only allows http:, https:, mailto:, tel:, and relative URLs
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';

  const trimmed = url.trim();

  // Allow relative URLs (start with / or ./ or ../)
  if (/^\//.test(trimmed) || /^\.\.?\//.test(trimmed)) {
    return trimmed;
  }

  // Allow specific safe protocols
  const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
  const lower = trimmed.toLowerCase();

  for (const protocol of safeProtocols) {
    if (lower.startsWith(protocol)) {
      return trimmed;
    }
  }

  // Block javascript:, data:, vbscript:, etc.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    console.warn('Blocked potentially unsafe URL:', trimmed);
    return '';
  }

  // Default: treat as relative URL
  return trimmed;
}

/**
 * Create a safe HTML string by escaping all interpolated values
 * Usage: safeHtml`<div>${userInput}</div>`
 */
export function safeHtml(
  strings: TemplateStringsArray,
  ...values: (string | number | null | undefined)[]
): string {
  let result = '';

  for (let i = 0; i < strings.length; i++) {
    result += strings[i];

    if (i < values.length) {
      const value = values[i];
      if (value !== null && value !== undefined) {
        result += escapeHtml(String(value));
      }
    }
  }

  return result;
}

/**
 * Strip all HTML tags from text, returning plain text
 * Useful for displaying excerpts or search results
 */
export function stripHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';

  // Create a temporary DOM element to parse HTML
  if (typeof document !== 'undefined') {
    const tmp = document.createElement('div');
    tmp.textContent = html; // Use textContent to avoid HTML parsing
    return tmp.textContent;
  }

  // Server-side fallback: regex strip
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Validate that a string doesn't contain HTML/script tags
 * Returns true if safe (no HTML), false if unsafe
 */
export function isPlainText(text: string): boolean {
  if (!text || typeof text !== 'string') return true;

  // Check for common HTML/script patterns
  const dangerousPatterns = [
    /<script/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /javascript:/i,
    /on\w+\s*=/i, // event handlers like onclick=
  ];

  return !dangerousPatterns.some((pattern) => pattern.test(text));
}

/**
 * Sanitize file names to prevent path traversal
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') return 'unnamed';

  // Remove path traversal characters
  return filename
    .replace(/[\/\\]/g, '_') // Replace / and \ with _
    .replace(/\.\./g, '_') // Replace .. with _
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace other special chars
    .substring(0, 255); // Limit length
}
