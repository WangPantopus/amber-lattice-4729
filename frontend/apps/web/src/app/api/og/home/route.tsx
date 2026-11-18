// ============================================================
// /api/og/home — the homepage's share card.
//
// The homepage's opening scene, drawn flat: stars, and the Earth at night rising from the bottom right with a thin
// blue rim and its city lights, one of them ringed (the home); beside it "Real people. Real places. Right now."
// Rendered once at build time: nothing in it depends on the request.
// ============================================================

import { ImageResponse } from 'next/og';
import { markDataUri } from '../_mark';

export const dynamic = 'force-static';

// The same seeded generator as the homepage's sky, so the card's stars and lights never change between builds.
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The Earth: a circle centred below the card's bottom-right corner, so only its upper-left limb shows.
const EARTH = { cx: 1080, cy: 800, r: 600 };

function dots(): { stars: string; lights: string } {
  const rnd = seeded(20261118);
  let stars = '';
  for (let i = 0; i < 90; i++) {
    const x = Math.round(rnd() * 1200), y = Math.round(rnd() * 630), r = (rnd() * 1.1 + 0.4).toFixed(1), o = (rnd() * 0.6 + 0.25).toFixed(2);
    const dx = x - EARTH.cx, dy = y - EARTH.cy;
    if (dx * dx + dy * dy < (EARTH.r + 30) ** 2) continue; // no stars in front of the Earth
    stars += `<circle cx="${x}" cy="${y}" r="${r}" opacity="${o}"/>`;
  }
  let lights = '';
  for (let n = 0, made = 0; made < 150 && n < 5000; n++) {
    const a = -Math.PI * (0.5 + rnd() * 0.5) - 0.15, d = EARTH.r * 0.97 * Math.sqrt(rnd());
    const x = EARTH.cx + Math.cos(a) * d, y = EARTH.cy + Math.sin(a) * d;
    const r = (0.8 + rnd() * rnd() * 2.4).toFixed(1), o = (0.45 + rnd() * 0.55).toFixed(2);
    if (y > 630 || x < 470) continue;
    lights += `<circle cx="${Math.round(x)}" cy="${Math.round(y)}" r="${r}" opacity="${o}"/>`;
    made++;
  }
  return { stars, lights };
}

const { stars, lights } = dots();

// The scene as one SVG, handed to Satori as an image: literals only, since Satori resolves no CSS variables.
const SCENE = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
<radialGradient id="e" cx="0.32" cy="0.22" r="0.9"><stop offset="0" stop-color="#14203f"/><stop offset="0.55" stop-color="#0a1128"/><stop offset="1" stop-color="#05070f"/></radialGradient>
<radialGradient id="a" cx="0.5" cy="0.5" r="0.5"><stop offset="0.9" stop-color="#5cc8ff" stop-opacity="0"/><stop offset="0.965" stop-color="#5c9dff" stop-opacity="0.55"/><stop offset="1" stop-color="#5cc8ff" stop-opacity="0"/></radialGradient>
<radialGradient id="h" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff0cd"/><stop offset="0.3" stop-color="#ffc867" stop-opacity="0.9"/><stop offset="1" stop-color="#ffc867" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1200" height="630" fill="#04060d"/>
<g fill="#ffffff">${stars}</g>
<circle cx="${EARTH.cx}" cy="${EARTH.cy}" r="${EARTH.r + 26}" fill="url(#a)"/>
<circle cx="${EARTH.cx}" cy="${EARTH.cy}" r="${EARTH.r}" fill="url(#e)"/>
<g fill="#ffc867">${lights}</g>
<circle cx="770" cy="372" r="18" fill="url(#h)"/>
<circle cx="770" cy="372" r="13" fill="none" stroke="#ffc867" stroke-width="1.6" opacity="0.8"/>
</svg>`;

export async function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'Georgia, serif' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/svg+xml;utf8,${encodeURIComponent(SCENE)}`} width={1200} height={630} alt="" style={{ position: 'absolute', top: 0, left: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', padding: 64, color: '#F4F1E8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'Helvetica, Arial, sans-serif' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markDataUri(44)} width={44} height={44} alt="" />
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.6 }}>Pantopus</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 92, letterSpacing: -2.5, lineHeight: 1, marginTop: 48 }}>
            <span>Real people.</span>
            <span>Real places.</span>
            <span style={{ color: '#FFC867' }}>Right now.</span>
          </div>
          <div style={{ fontSize: 28, color: '#C9CEE2', marginTop: 28, maxWidth: 560, lineHeight: 1.3, fontFamily: 'Helvetica, Arial, sans-serif' }}>
            Real life, connected. Free to look, no account needed.
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
