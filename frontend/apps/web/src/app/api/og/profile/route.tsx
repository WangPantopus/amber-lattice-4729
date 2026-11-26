// ============================================================
// /api/og/profile?u=<username>[&k=<key>] — a profile with sources' link picture (SPEC phase 1): 1200 x 630, the portrait in its
// rings, the name, the headline, and Says only while that part reaches anyone with the link. Drawn from the page a
// signed-out visitor gets (GET /api/profile-page/:username), so a part that is off is absent here too, with no gap.
// Nothing is stored.
// ============================================================

import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import type { ProfilePage } from '@pantopus/api';
import { PROFILE_PARTS, PROFILE_PARTS_HEADER } from '@pantopus/api/endpoints/profileParts';
import { MARK_SIZE, headerMarkShapes, shapesToSvg } from '@/components/profile/sources/rings';
import { pageSaysLine } from '@/components/profile/sources/share';
import { isPantopusMediaUrl } from '@/lib/media-hosts';
import { personColor, personInitials } from '@/lib/personColor';
import { howText } from '@/components/profile/sources/inks';
import { markDataUri } from '../_mark';
import { extractTrustedClientIp } from '@/lib/server/clientIp';

export const runtime = 'edge';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** The portrait as a data URI (a picture that can't be read draws the initials instead). */
async function portraitData(url: string | null | undefined): Promise<string | null> {
  // Only Pantopus's own storage (and the local stack while developing): never a fetch to anywhere else.
  const local = process.env.NODE_ENV !== 'production' && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url || '');
  if (!url || !(isPantopusMediaUrl(url) || local)) return null;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/^image\/(png|jpe?g|webp|gif)/i.test(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 4 * 1024 * 1024) return null;
    return `data:${type.split(';')[0]};base64,${toBase64(bytes)}`;
  } catch {
    return null;
  }
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export async function GET(req: NextRequest) {
  const username = (req.nextUrl.searchParams.get('u') || '').trim().replace(/^@+/, '').slice(0, 64);
  // A link for one purpose: the picture follows that link's parts.
  const rawKey = req.nextUrl.searchParams.get('k');
  const key = rawKey && /^[A-Za-z0-9_-]{32,64}$/.test(rawKey) ? rawKey : null;
  if (rawKey && !key) return new Response('Not found', { status: 404 });
  let page: ProfilePage | null = null;
  if (username) {
    try {
      // For whoever fetched the picture (a link-preview crawler): their address with the edge secret, so signed-out
      // reads keep each visitor's own limit (as the page's read does).
      const edgeSecret = process.env.EDGE_PROXY_SECRET;
      const address = extractTrustedClientIp(req.headers);
      const path = `/api/profile-page/${encodeURIComponent(username)}${key ? `/v/${encodeURIComponent(key)}` : ''}`;
      const res = await fetch(`${API_BASE}${path}`, {
        // `x-pantopus-share-card`: a picture for a link preview, not someone opening the page (a link for one purpose
        // counts opens; the server need not count this read).
        headers: { accept: 'application/json', 'x-pantopus-share-card': '1', [PROFILE_PARTS_HEADER]: PROFILE_PARTS, ...(edgeSecret ? { 'x-pantopus-edge': edgeSecret, ...(address ? { 'x-forwarded-for': address } : {}) } : {}) },
        cache: 'no-store',
      });
      if (res.ok) page = (await res.json()) as ProfilePage;
    } catch {
      page = null;
    }
  }
  if (!page || page.v !== 1 || !page.header?.rings) return new Response('Not found', { status: 404 });

  const header = page.header;
  const name = clip(header.name?.trim() || 'Pantopus member', 40);
  const says = pageSaysLine(page);
  const markSize = 420;
  const portraitSize = Math.round((80 / MARK_SIZE) * markSize);
  const rings = `data:image/svg+xml;base64,${toBase64(new TextEncoder().encode(shapesToSvg(headerMarkShapes(header.rings), MARK_SIZE)))}`;
  const portrait = await portraitData(header.portrait_url);
  const link = `pantopus.com/${header.username || username}`;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', background: '#f6f7f9', padding: '0 72px 0 56px', fontFamily: 'Helvetica, Arial, sans-serif', color: '#111827' }}>
        <div style={{ display: 'flex', position: 'relative', width: markSize, height: markSize, flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={rings} width={markSize} height={markSize} />
          {portrait ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={portrait} width={portraitSize} height={portraitSize} style={{ position: 'absolute', left: (markSize - portraitSize) / 2, top: (markSize - portraitSize) / 2, borderRadius: portraitSize / 2, objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', left: (markSize - portraitSize) / 2, top: (markSize - portraitSize) / 2, width: portraitSize, height: portraitSize, borderRadius: portraitSize / 2, background: personColor(header.user_id), color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(portraitSize * 0.36), fontWeight: 700 }}>
              {personInitials(name)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginLeft: 56 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5 }}>{name}</div>
          {header.headline ? <div style={{ fontSize: 32, color: '#4e5563', marginTop: 14, lineHeight: 1.25 }}>{clip(header.headline, 70)}</div> : null}
          {says ? (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34 }}>
              <div style={{ fontSize: 34, fontStyle: 'italic', lineHeight: 1.3, color: '#111827', fontFamily: 'Georgia, serif' }}>{clip(says.text, 120)}</div>
              <div style={{ fontSize: 20, color: '#5f6775', marginTop: 10 }}>{howText('said', says.how)}</div>
            </div>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 44 }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={markDataUri(40)} width={40} height={40} />
            <div style={{ fontSize: 24, color: '#4e5563', marginLeft: 14 }}>{link}</div>
          </div>
        </div>
      </div>
    ),
    // Crawlers keep a picture for a while: the page's link changes `v` whenever what the picture shows changes.
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
