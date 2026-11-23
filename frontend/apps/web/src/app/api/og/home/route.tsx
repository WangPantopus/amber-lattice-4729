// ============================================================
// /api/og/home — the homepage's share card.
//
// The background is a still of the homepage's own sky at the hero (public/home/og-earth.jpg: the real NASA Earth
// with its city lights, its thin blue rim and the stars, captured from the page with no words on it), with the hero's
// words over it. Rendered once at build time: nothing in it depends on the request.
//
// The headline stays in the card's default face: the page's Newsreader ships only as WOFF2, which the card renderer
// (Satori) cannot read.
// ============================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { markDataUri } from '../_mark';

export const dynamic = 'force-static';

export async function GET() {
  const earth = await readFile(join(process.cwd(), 'public/home/og-earth.jpg'));
  const background = `data:image/jpeg;base64,${earth.toString('base64')}`;
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
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 92, letterSpacing: -2.5, lineHeight: 1, marginTop: 48 }}>
            <span>Real people.</span>
            <span>Real places.</span>
            <span style={{ color: '#FFC867' }}>Right now.</span>
          </div>
          <div style={{ fontSize: 28, color: '#C9CEE2', marginTop: 28, maxWidth: 520, lineHeight: 1.3 }}>
            Real life, connected. Free to look, no account needed.
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
