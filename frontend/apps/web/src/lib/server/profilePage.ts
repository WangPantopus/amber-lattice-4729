// Server only: the profile with sources as a signed-out visitor gets it, read while the page renders.
//
// Signed-out reads of /api/profile-page share the public previews' limit per visitor, so this read carries the
// visitor's own address with the edge secret, as the web's rewrites and first content do (lib/server/firstContent.ts).
// Never kept in a fetch cache: a part switched off must leave the page at once.
import { cache } from 'react';
import { headers } from 'next/headers';
import type { ProfilePage } from '@pantopus/api';
import { PROFILE_PARTS, PROFILE_PARTS_HEADER } from '@pantopus/api/endpoints/profileParts';
import { normalizePublicProfileIdentifier, type PublicFetchResult } from '@/lib/publicShare';
import { extractClientIpFromForwardedFor, extractTrustedClientIp } from './clientIp';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

/** The visitor's address and the edge secret, for a read made on the visitor's behalf. */
export function visitorHeaders(forwardedFor: string | null | undefined, trustedIp?: string | null): Record<string, string> {
  const edgeSecret = process.env.EDGE_PROXY_SECRET;
  const address = trustedIp?.trim() || extractClientIpFromForwardedFor(forwardedFor);
  return edgeSecret ? { 'x-pantopus-edge': edgeSecret, ...(address ? { 'x-forwarded-for': address } : {}) } : {};
}

/** A link for one purpose's key as it rides in the address (long, random, URL-safe), or null. */
export function linkKey(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(value) ? value : null;
}

export const fetchSignedOutProfilePage = cache(async (username: string): Promise<PublicFetchResult<ProfilePage>> => {
  const identifier = normalizePublicProfileIdentifier(username);
  if (!identifier) return { data: null, status: 404 };
  return readSignedOut(`/api/profile-page/${encodeURIComponent(identifier)}`);
});

/** A link for one purpose (GET /api/profile-page/:username/v/:key): never listed, never needs sign-in. */
export const fetchLinkPage = cache(async (username: string, key: string): Promise<PublicFetchResult<ProfilePage>> => {
  const identifier = normalizePublicProfileIdentifier(username);
  if (!identifier || !linkKey(key)) return { data: null, status: 404 };
  return readSignedOut(`/api/profile-page/${encodeURIComponent(identifier)}/v/${encodeURIComponent(key)}`);
});

async function readSignedOut(path: string): Promise<PublicFetchResult<ProfilePage>> {
  let forwardedFor: string | null = null;
  let trustedIp: string | null = null;
  try {
    const requestHeaders = await headers();
    forwardedFor = requestHeaders.get('x-forwarded-for');
    trustedIp = extractTrustedClientIp(requestHeaders);
  } catch {
    forwardedFor = null; // outside a request (a build): no visitor to speak for
    trustedIp = null;
  }
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
      headers: { accept: 'application/json', [PROFILE_PARTS_HEADER]: PROFILE_PARTS, ...visitorHeaders(forwardedFor, trustedIp) },
    });
    if (!response.ok) return { data: null, status: response.status };
    return { data: (await response.json()) as ProfilePage, status: response.status };
  } catch {
    return { data: null, status: 500 };
  }
}
