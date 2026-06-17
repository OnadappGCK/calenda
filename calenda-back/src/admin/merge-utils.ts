/**
 * Shared utilities for merge services.
 */

/**
 * Normalizes and validates a raw phone string captured from HTML or text.
 * Strips URL-encoding, spaces, dots, and dashes.
 * Returns empty string if the result has fewer than 8 digits.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return '';
  // Decode URL-encoded characters (%20, %2B, etc.)
  let s = raw;
  try { s = decodeURIComponent(raw.replace(/\+/g, ' ')); } catch { /* ignore */ }
  // Keep digits, +, and leading 0
  const cleaned = s.replace(/[\s.\-\u00a0]/g, '').trim();
  const digits = cleaned.replace(/[^0-9]/g, '');
  // Require at least 8 digits to be a plausible phone number
  if (digits.length < 8) return '';
  return cleaned;
}
