// ─────────────────────────────────────────────────────────────────────────────
// The public pages' share card, 1200 by 630: the homepage's own still of the Earth at night (public/home/og-earth.jpg,
// as /api/og/home uses), the mark, the page's eyebrow and its heading. Each page's opengraph-image.tsx and
// twitter-image.tsx call this; nothing in it depends on the request, so the cards are made once at build time.
//
// The heading stays in the card renderer's default face: Newsreader ships only as WOFF2, which Satori cannot read
// (the homepage's card says the same).
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { markDataUri } from '../../api/og/_mark';

export const SHARE_SIZE = { width: 1200, height: 630 };
export const SHARE_TYPE = 'image/png';

export interface ShareCard {
  /** Small capitals over the heading, e.g. "Place". */
  eyebrow: string;
  /** The heading, one string per line; the last line is drawn in the window's gold. */
  lines: string[];
  /** One line under the heading. */
  note?: string;
}

export async function shareImage({ eyebrow, lines, note }: ShareCard): Promise<ImageResponse> {
  const earth = await readFile(join(process.cwd(), 'public/home/og-earth.jpg'));
  const background = `data:image/jpeg;base64,${earth.toString('base64')}`;
  const size = lines.join(' ').length > 34 ? 76 : 88;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={background} width={1200} height={630} alt="" style={{ position: 'absolute', top: 0, left: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', padding: 64, color: '#F4F1E8', maxWidth: 900 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markDataUri(44)} width={44} height={44} alt="" />
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.6 }}>Pantopus</div>
          </div>
          <div style={{ fontSize: 24, letterSpacing: 4, textTransform: 'uppercase', color: '#FFC867', marginTop: 52 }}>{eyebrow}</div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: size, letterSpacing: -2.2, lineHeight: 1.02, marginTop: 18 }}>
            {lines.map((line, i) => (
              <span key={line} style={i === lines.length - 1 ? { color: '#FFC867' } : undefined}>
                {line}
              </span>
            ))}
          </div>
          {note ? <div style={{ fontSize: 28, color: '#C9CEE2', marginTop: 28, maxWidth: 620, lineHeight: 1.3 }}>{note}</div> : null}
        </div>
      </div>
    ),
    SHARE_SIZE,
  );
}
