// ============================================================
// The homepage's drawn night: the stars and the town with its one lit window.
//
// Ported from the approved sample (2026-11-18) as it is. Everything comes from one seeded generator, made in the same
// order as the sample, so every visit draws the same stars, hills and street. `u` is the camera's scale: 0 the window,
// 1 the home, 2 the street, 3 the town, 4 the Earth close, 5 the Earth far. The town draws from 0 to about 3.8 and the
// Earth (globe.ts) from about 3.2 to 5.
// ============================================================

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

interface Star { x: number; y: number; r: number; p: number; s: number; b: number }
interface Light { x: number; y: number; s: number; b: number; p: number; c: number }
interface Ridge { pts: Array<[number, number]>; lights: Light[]; col: string }
type StreetItem =
  | { t: 'apt'; x: number; w: boolean[] }
  | { t: 'house'; x: number; s: number; w: boolean[]; flip: boolean }
  | { t: 'tree'; x: number; s: number };
interface Outskirt { x: number; w: number; h: number; lit: boolean; p: number }

export interface Scene {
  stars: Star[];
  ridges: Ridge[];
  street: StreetItem[];
  outskirts: Outskirt[];
}

/** What a frame needs to know. */
export interface View {
  W: number;
  H: number;
  /** The canvases' device-pixel ratio. */
  d: number;
  narrow: boolean;
  u: number;
  t: number;
  reduced: boolean;
}

const RIDGE_COLORS = ['#0f1736', '#131c42', '#17224d', '#1b2858', '#1f2d62'];
const LIGHT = ['255,200,103', '160,212,255', '255,226,170'];
const groundY = (x: number) => 7 * Math.sin(x / 640 + 1) + 4 * Math.sin(x / 210);

export function makeScene(): Scene {
  let seed = 20261118;
  const rnd = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const stars = Array.from({ length: 340 }, () => ({ x: rnd(), y: rnd(), r: rnd() * 1.15 + 0.3, p: rnd() * 6.28, s: rnd() * 1.4 + 0.5, b: rnd() * 0.7 + 0.3 }));

  const ridges: Ridge[] = [];
  for (let i = 0; i < 5; i++) {
    const base = -(250 + i * 430), A = 110 + i * 55, f1 = 2600 + i * 900, f2 = 900 + i * 300, p1 = rnd() * 6, p2 = rnd() * 6;
    const yAt = (x: number) => base + A * Math.sin(x / f1 + p1) + A * 0.35 * Math.sin(x / f2 + p2);
    const pts: Array<[number, number]> = [];
    for (let x = -22000; x <= 22000; x += 250) pts.push([x, yAt(x)]);
    const centers = Array.from({ length: 7 }, () => (rnd() - 0.5) * 34000);
    const lights = Array.from({ length: 560 }, () => {
      const c = centers[Math.floor(rnd() * centers.length)], g = (rnd() + rnd() + rnd() - 1.5) * 2400, x = clamp(c + g, -21500, 21500);
      return { x, y: yAt(x) + 14 + rnd() * rnd() * 360, s: 3 + rnd() * 4, b: 0.45 + rnd() * 0.55, p: rnd() * 6.28, c: rnd() < 0.1 ? 1 : rnd() < 0.5 ? 2 : 0 };
    });
    ridges.push({ pts, lights, col: RIDGE_COLORS[i] });
  }
  ridges.reverse(); // far ones first

  const street: StreetItem[] = [];
  for (let k = -9; k <= 9; k++) {
    if (k === 0) continue;
    const x = k * 215 + (rnd() - 0.5) * 30;
    if (k === 3) street.push({ t: 'apt', x, w: Array.from({ length: 28 }, () => rnd() < 0.62) });
    else street.push({ t: 'house', x, s: 0.82 + rnd() * 0.3, w: [rnd() < 0.7, rnd() < 0.55, rnd() < 0.5], flip: rnd() < 0.5 });
    if (rnd() < 0.6) street.push({ t: 'tree', x: x + 105, s: 0.7 + rnd() * 0.6 });
  }
  const outskirts = Array.from({ length: 150 }, () => {
    const x = (rnd() < 0.5 ? -1 : 1) * (2050 + rnd() * rnd() * 9000);
    return { x, w: 60 + rnd() * 70, h: 46 + rnd() * 60, lit: rnd() < 0.78, p: rnd() * 6.28 };
  });
  return { stars, ridges, street, outskirts };
}

export function drawStars(sx: CanvasRenderingContext2D, scene: Scene, v: View) {
  const { W, H, d, u, t, reduced } = v;
  sx.setTransform(d, 0, 0, d, 0, 0);
  sx.clearRect(0, 0, W, H);
  const lift = (5 - u) * 14, fade = lerp(0.5, 1, sstep(2.5, 4, u));
  sx.fillStyle = '#fff';
  for (const s of scene.stars) {
    const y = (s.y * H * 1.1 - lift * (0.4 + s.b)) % (H * 1.1);
    sx.globalAlpha = s.b * fade * (reduced ? 0.85 : 0.62 + 0.38 * Math.sin(t * s.s + s.p));
    sx.beginPath();
    sx.arc(s.x * W, y < 0 ? y + H * 1.1 : y, s.r, 0, 6.283);
    sx.fill();
  }
  sx.globalAlpha = 1;
}

export function drawTown(cx: CanvasRenderingContext2D, scene: Scene, v: View, alpha: number) {
  const { W, H, d, narrow, u, t, reduced } = v;
  cx.setTransform(d, 0, 0, d, 0, 0);
  cx.clearRect(0, 0, W, H);
  if (alpha <= 0.01) return;
  const ax = narrow ? 0.5 : 0.66;
  const K = [(narrow ? 0.5 : 0.21) * W / 26, Math.min((narrow ? 0.62 : 0.27) * W, 0.42 * H) / 140, W / (narrow ? 900 : 1500), W / (narrow ? 9000 : 14000), W / 420000];
  const i = clamp(Math.floor(u), 0, 3), f = clamp(u - i, 0, 1);
  const k = Math.exp(lerp(Math.log(K[i]), Math.log(K[i + 1]), f));
  const FY = [-48, -62, -52, -700, -900], AY = narrow ? [0.27, 0.34, 0.42, 0.4, 0.36] : [0.47, 0.62, 0.7, 0.6, 0.52];
  const Fx = lerp(31, 0, sstep(0, 1, u)), Fy = lerp(FY[i], FY[i + 1], f * f * (3 - 2 * f));
  const Ax = ax * W, Ay = lerp(AY[i], AY[i + 1], f) * H;
  const X = (x: number) => Ax + (x - Fx) * k, Y = (y: number) => Ay + (y - Fy) * k;
  const x0 = Fx - Ax / k, x1 = Fx + (W - Ax) / k;
  cx.globalAlpha = alpha;

  // far hills with their lit windows
  for (const r of scene.ridges) {
    cx.fillStyle = r.col;
    cx.beginPath();
    let started = false;
    let lastX = 0;
    for (const [x, y] of r.pts) {
      if (x < x0 - 300 || x > x1 + 300) continue;
      if (!started) {
        cx.moveTo(X(x), H + 2);
        cx.lineTo(X(x), Y(y));
        started = true;
      } else cx.lineTo(X(x), Y(y));
      lastX = x;
    }
    if (started) {
      cx.lineTo(X(lastX), H + 2);
      cx.closePath();
      cx.fill();
    }
    const sz0 = k < 0.5 ? 1.6 : 0;
    for (const l of r.lights) {
      if (l.x < x0 || l.x > x1) continue;
      const py = Y(l.y);
      if (py < -4 || py > H + 4) continue;
      const sz = Math.max(l.s * k, sz0, 1.1), tw = reduced ? 1 : 0.72 + 0.28 * Math.sin(t * 1.3 + l.p);
      cx.fillStyle = 'rgba(' + LIGHT[l.c] + ',' + (l.b * tw * (sz < 1.4 ? 0.85 : 1)).toFixed(3) + ')';
      cx.fillRect(X(l.x) - sz / 2, py - sz / 2, sz, sz * 0.8);
    }
  }
  // the near hill the street stands on
  cx.fillStyle = '#060913';
  cx.beginPath();
  cx.moveTo(-2, H + 2);
  const step = Math.max(40, (x1 - x0) / 120);
  for (let x = x0 - step; x <= x1 + step; x += step) cx.lineTo(X(x), Y(groundY(x)));
  cx.lineTo(W + 2, H + 2);
  cx.closePath();
  cx.fill();

  const rect = (x: number, y: number, w: number, h: number) => cx.fillRect(X(x), Y(y), w * k, h * k);
  const glow = (x: number, y: number, r: number, a: number) => {
    const g = cx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * k);
    g.addColorStop(0, 'rgba(255,200,103,' + a + ')');
    g.addColorStop(1, 'rgba(255,200,103,0)');
    cx.fillStyle = g;
    cx.fillRect(X(x) - r * k, Y(y) - r * k, 2 * r * k, 2 * r * k);
  };
  const flick = (p: number) => (reduced ? 1 : 0.86 + 0.14 * Math.sin(t * 1.1 + p));

  function drawHouse(hx: number, gy: number, s: number, lit: boolean[], home: boolean) {
    const px = (x: number) => hx + x * s, py = (y: number) => gy + y * s;
    cx.fillStyle = home ? '#080b18' : '#070a15';
    cx.beginPath();
    cx.moveTo(X(px(-70)), Y(py(4)));
    cx.lineTo(X(px(-70)), Y(py(-70)));
    cx.lineTo(X(px(0)), Y(py(-125)));
    cx.lineTo(X(px(70)), Y(py(-70)));
    cx.lineTo(X(px(70)), Y(py(4)));
    cx.closePath();
    cx.fill();
    rect(px(34), py(-128), 16 * s, 36 * s);
    if (k > 0.35) {
      cx.strokeStyle = 'rgba(150,172,255,.20)';
      cx.lineWidth = Math.max(1, 0.9 * k * s);
      cx.beginPath();
      cx.moveTo(X(px(-76)), Y(py(-66)));
      cx.lineTo(X(px(0)), Y(py(-125)));
      cx.lineTo(X(px(76)), Y(py(-66)));
      cx.stroke();
    }
    if (home && k > 1.6) {
      // clapboard, close up
      cx.strokeStyle = 'rgba(160,180,255,.035)';
      cx.lineWidth = Math.max(1, 0.5 * k);
      cx.beginPath();
      for (let y = -66; y < 4; y += 9) {
        cx.moveTo(X(-70), Y(gy + y));
        cx.lineTo(X(70), Y(gy + y));
      }
      cx.stroke();
    }
    cx.fillStyle = '#0d1126';
    rect(px(8), py(-34), 22 * s, 38 * s);
    const wins: Array<[number, number]> = [[-48, -58], [18, -58], [-48, -30]];
    wins.forEach(([wx, wy], n) => {
      const on = lit[n], isHome = home && n === 1;
      if (!on) {
        cx.fillStyle = '#10163a';
        rect(px(wx), py(wy), 26 * s, 20 * s);
        return;
      }
      if (isHome) return;
      if (k > 0.5) glow(px(wx + 13), py(wy + 10), 46 * s, 0.16);
      cx.fillStyle = 'rgba(255,200,103,' + (0.92 * flick(hx + n)).toFixed(3) + ')';
      rect(px(wx), py(wy), 26 * s, 20 * s);
      if (k > 1) {
        cx.fillStyle = '#080b18';
        rect(px(wx + 12.3), py(wy), 1.4 * s, 20 * s);
        rect(px(wx), py(wy + 9.4), 26 * s, 1.2 * s);
      }
    });
    if (!home) return;
    // the one window this page is about
    const wx = 18, wy = gy - 58, ww = 26, wh = 20, cxw = wx + ww / 2, cyw = wy + wh / 2;
    glow(cxw, cyw, lerp(95, 70, sstep(0, 2, u)), lerp(0.2, 0.34, sstep(0, 1.2, u)));
    if (k > 1.2) {
      cx.fillStyle = '#1b2247';
      rect(wx - 1.6, wy - 1.6, ww + 3.2, wh + 3.2);
      rect(wx - 3, wy + wh + 1, ww + 6, 1.8);
    }
    const g = cx.createLinearGradient(0, Y(wy), 0, Y(wy + wh));
    g.addColorStop(0, '#ffe9b0');
    g.addColorStop(1, '#ffb347');
    cx.fillStyle = g;
    rect(wx, wy, ww, wh);
    if (k > 1.2) {
      cx.fillStyle = 'rgba(255,246,214,.5)'; // curtains
      cx.beginPath();
      cx.moveTo(X(wx), Y(wy));
      cx.lineTo(X(wx + 7), Y(wy));
      cx.quadraticCurveTo(X(wx + 3), Y(wy + 9), X(wx), Y(wy + 13));
      cx.closePath();
      cx.fill();
      cx.beginPath();
      cx.moveTo(X(wx + ww), Y(wy));
      cx.lineTo(X(wx + ww - 7), Y(wy));
      cx.quadraticCurveTo(X(wx + ww - 3), Y(wy + 9), X(wx + ww), Y(wy + 13));
      cx.closePath();
      cx.fill();
      cx.fillStyle = '#1b2247'; // mullions
      rect(cxw - 0.7, wy, 1.4, wh);
      rect(wx, cyw - 0.6, ww, 1.2);
      cx.fillStyle = '#141a38'; // a plant on the sill
      cx.beginPath();
      cx.arc(X(wx + 5.2), Y(wy + wh - 3.6), 2.1 * k, 0, 6.283);
      cx.arc(X(wx + 7.2), Y(wy + wh - 4.6), 1.6 * k, 0, 6.283);
      cx.fill();
      rect(wx + 4.2, wy + wh - 2.4, 3.4, 2.4);
    }
  }

  if (k > 0.05) {
    for (const o of scene.outskirts) {
      if (o.x < x0 - 100 || o.x > x1 + 100) continue;
      const gy = groundY(o.x);
      cx.fillStyle = '#070a15';
      rect(o.x - o.w / 2, gy - o.h, o.w, o.h + 6);
      if (o.lit) {
        cx.fillStyle = 'rgba(255,200,103,' + (0.8 * flick(o.p)).toFixed(3) + ')';
        const s = Math.max(14 * k, 1.3);
        cx.fillRect(X(o.x - 12), Y(gy - o.h * 0.6), s, s * 0.8);
      }
    }
  }
  if (k > 0.12) {
    for (const o of scene.street) {
      if (o.x < x0 - 200 || o.x > x1 + 200) continue;
      const gy = groundY(o.x);
      if (o.t === 'tree') {
        cx.fillStyle = '#060912';
        rect(o.x - 4 * o.s, gy - 32 * o.s, 8 * o.s, 34 * o.s);
        cx.beginPath();
        cx.arc(X(o.x), Y(gy - 58 * o.s), 33 * o.s * k, 0, 6.283);
        cx.fill();
      } else if (o.t === 'apt') {
        cx.fillStyle = '#070a15';
        rect(o.x - 70, gy - 250, 140, 256);
        o.w.forEach((lit, n) => {
          const c = n % 4, r = Math.floor(n / 4);
          cx.fillStyle = lit ? 'rgba(255,200,103,' + (0.9 * flick(n)).toFixed(3) + ')' : '#131a36';
          rect(o.x - 56 + c * 32, gy - 232 + r * 32, 18, 16);
        });
      } else drawHouse(o.x, gy, o.s, o.w, false);
    }
    drawHouse(0, groundY(0), 1, [false, true, false], true);
  } else {
    // too far for houses: the home is one warm point
    glow(0, -60, 900, 0.16 * sstep(0.12, 0.02, k) + 0.1);
    cx.fillStyle = 'rgba(255,214,140,.95)';
    const s = Math.max(60 * k, 2.2);
    cx.fillRect(X(0) - s / 2, Y(-60) - s / 2, s, s);
  }
  cx.globalAlpha = 1;
}
