// Server only: the profile with sources as a signed-out visitor gets it, read while the page renders.
//
// Signed-out reads of /api/profile-page share the public previews' limit per visitor, so this read carries the
// visitor's own address with the edge secret, as the web's rewrites and first content do (lib/server/firstContent.ts).
// Never kept in a fetch cache: a part switched off must leave the page at once.
import { cache } from 'react';
import { headers } from 'next/headers';
import type { ProfilePage } from '@pantopus/api';
import { normalizePublicProfileIdentifier, type PublicFetchResult } from '@/lib/publicShare';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

/** The visitor's address and the edge secret, for a read made on the visitor's behalf. */
export function visitorHeaders(forwardedFor: string | null | undefined): Record<string, string> {
  const edgeSecret = process.env.EDGE_PROXY_SECRET;
  const address = forwardedFor?.split(',')[0]?.trim();
  return edgeSecret ? { 'x-pantopus-edge': edgeSecret, ...(address ? { 'x-forwarded-for': address } : {}) } : {};
}

export const fetchSignedOutProfilePage = cache(async (username: string): Promise<PublicFetchResult<ProfilePage>> => {
  const identifier = normalizePublicProfileIdentifier(username);
  if (!identifier) return { data: null, status: 404 };
  let forwardedFor: string | null = null;
  try {
    forwardedFor = (await headers()).get('x-forwarded-for');
  } catch {
    forwardedFor = null; // outside a request (a build): no visitor to speak for
  }
  try {
    const response = await fetch(`${API_BASE}/api/profile-page/${encodeURIComponent(identifier)}`, {
      cache: 'no-store',
      headers: { accept: 'application/json', ...visitorHeaders(forwardedFor) },
    });
    if (!response.ok) return { data: null, status: response.status };
    return { data: (await response.json()) as ProfilePage, status: response.status };
  } catch {
    return { data: null, status: 500 };
  }
});
