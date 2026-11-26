/**
 * Validates that a user-supplied URL uses an explicit http: or https: scheme.
 * Rejects javascript:, data:, vbscript:, file:, and malformed URLs.
 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
