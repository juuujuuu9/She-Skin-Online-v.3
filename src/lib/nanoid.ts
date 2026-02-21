/**
 * NanoID - URL-friendly unique IDs
 * 
 * Using a custom implementation for zero dependencies.
 * 21 characters, URL-safe alphabet.
 */

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const alphabetLength = alphabet.length;

/**
 * Generate a cryptographically secure random ID
 * Default length: 21 characters (similar to nanoid)
 */
export function nanoid(length: number = 21): string {
  const bytes = new Uint8Array(length);
  
  // Use crypto.getRandomValues if available (browser/Node)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for older environments
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  
  let id = '';
  for (let i = 0; i < length; i++) {
    id += alphabet[bytes[i] % alphabetLength];
  }
  
  return id;
}

/**
 * Generate a short ID (12 characters)
 * Good for URLs that need to be concise
 */
export function shortId(): string {
  return nanoid(12);
}

/**
 * Generate a long ID (32 characters)
 * Good for tokens or when collision resistance is critical
 */
export function longId(): string {
  return nanoid(32);
}
