/**
 * Extracts the client IP appended by the nearest trusted edge proxy rather than
 * a client-spoofable leftmost X-Forwarded-For entry.
 *
 * Vercel sets `x-vercel-forwarded-for` and `x-real-ip` directly from the
 * connecting peer; standard reverse proxies append the peer IP to the right of
 * `x-forwarded-for`.
 */
export function extractClientIpFromForwardedFor(forwardedFor: string | null | undefined): string | null {
  if (!forwardedFor) return null;
  const hops = forwardedFor
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops.length > 0 ? hops[hops.length - 1] : null;
}

export function extractTrustedClientIp(headers: Pick<Headers, 'get'>): string | null {
  const vercelIp = extractClientIpFromForwardedFor(headers.get('x-vercel-forwarded-for'));
  if (vercelIp) return vercelIp;
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return extractClientIpFromForwardedFor(headers.get('x-forwarded-for'));
}
