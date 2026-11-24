// ============================================================
// /api/og/page?path=<path> — the share picture of a public page (/about, /start, a pillar or a guide page).
//
// The homepage's share card with the page's own words: the same still of the night sky (public/home/og-earth.jpg),
// the mark, the page's heading and one line under it. The words come from src/lib/site (shareCards.ts and the
// `share` of each pillar and guide page); a path with no card there is a 404, so no other words can be drawn.
//
// A query, not a path segment: next.config.js rewrites /api/:path* to the backend before Next tries a dynamic route,
// so /api/og/page/[...path] would never be reached.
// ============================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { shareCards } from '@/lib/site/shareCards';
import { markDataUri } from '../_mark';

export async function GET(request: NextRequest) {
  const card = shareCards()[request.nextUrl.searchParams.get('path') || ''];
  if (!card) return new Response('Not found', { status: 404 });
  const earth = await readFile(join(process.cwd(), 'public/home/og-earth.jpg'));
  const background = `data:image/jpeg;base64,${earth.toString('base64')}`;
  const size = card.heading.length > 30 ? 72 : 88;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={background} width={1200} height={630} alt="" style={{ position: 'absolute', top: 0, left: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', padding: 64, color: '#F4F1E8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markDataUri(44)} width={44} height={44} alt="" />
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.6 }}>Pantopus</div>
          </div>
          <div style={{ display: 'flex', fontSize: size, letterSpacing: -2, lineHeight: 1.05, marginTop: 48, maxWidth: 620 }}>
            {card.heading}
          </div>
          {card.line ? (
            <div style={{ fontSize: 30, color: '#C9CEE2', marginTop: 28, maxWidth: 540, lineHeight: 1.3 }}>{card.line}</div>
          ) : null}
        </div>
      </div>
    ),
    // The words change only with a release: kept a day by browsers and a week by the CDN.
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800' } },
  );
}
