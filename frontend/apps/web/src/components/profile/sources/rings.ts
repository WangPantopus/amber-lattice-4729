// The rings of a profile with sources (SPEC section 2): one ring a year, January at the top, drawn from the server's
// month strings (0 none, 1 said, 2 signed, 3 seen). Thick where a month is seen, thin where signed, dotted where said.
// The geometry is the design's own (design-src/gen/make_assets.py: header_mark, full_chart), drawn as plain shapes so
// the page, the printed page and the link picture draw the same rings.
import type { ProfileInk, ProfileLane, ProfileRings } from '@pantopus/api';

export type MonthInk = ProfileInk | null;
/** Twelve months a year, January first. */
export type YearRow = MonthInk[];
export type Grid = Map<number, YearRow>;

const RANK: Record<string, number> = { seen: 3, signed: 2, said: 1 };
const INK_OF: Record<string, MonthInk> = { '3': 'seen', '2': 'signed', '1': 'said' };

/** "Now" on the rings: the year, the month (0 to 11) and how far through that month. */
export interface RingNow { year: number; month: number; frac: number }

export function parseNow(value: string | null | undefined, fallback = new Date()): RingNow {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(value) : null;
  if (match) {
    const year = Number(match[1]);
    const month = Math.min(11, Math.max(0, Number(match[2]) - 1));
    const day = match[3] ? Number(match[3]) : 15;
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return { year, month, frac: Math.min(1, Math.max(0, day / days)) };
  }
  const days = new Date(fallback.getFullYear(), fallback.getMonth() + 1, 0).getDate();
  return { year: fallback.getFullYear(), month: fallback.getMonth(), frac: fallback.getDate() / days };
}

/** One lane's strings as a grid from `from` to the year of `now` (missing years are empty). */
export function laneGrid(rows: string[] | null | undefined, from: number, now: RingNow): Grid {
  const grid: Grid = new Map();
  const last = Math.max(now.year, from + Math.max(0, (rows?.length ?? 1) - 1));
  for (let year = from; year <= last && year <= now.year; year += 1) {
    const text = rows?.[year - from] ?? '';
    const row: YearRow = [];
    for (let m = 0; m < 12; m += 1) row.push(INK_OF[text.charAt(m)] ?? null);
    grid.set(year, row);
  }
  return grid;
}

function stronger(a: MonthInk, b: MonthInk): MonthInk {
  return (RANK[a ?? ''] ?? 0) >= (RANK[b ?? ''] ?? 0) ? a : b;
}

/** The strongest ink per month across lanes (the mark around a portrait). */
export function mergeGrids(grids: Grid[]): Grid {
  const out: Grid = new Map();
  for (const grid of grids) {
    for (const [year, row] of grid) {
      const prev = out.get(year) ?? Array(12).fill(null);
      out.set(year, prev.map((ink, m) => stronger(ink, row[m])));
    }
  }
  return new Map([...out.entries()].sort((a, b) => a[0] - b[0]));
}

export const LANES: ProfileLane[] = ['home', 'work', 'others'];

/** The lanes the rings carry (a lane whose part is off is absent). */
export function presentLanes(rings: ProfileRings): ProfileLane[] {
  return LANES.filter((lane) => Array.isArray(rings[lane]));
}

export function ringsGrids(rings: ProfileRings, now = parseNow(rings.now)): Partial<Record<ProfileLane, Grid>> {
  const out: Partial<Record<ProfileLane, Grid>> = {};
  for (const lane of presentLanes(rings)) out[lane] = laneGrid(rings[lane], rings.from, now);
  return out;
}

/** Runs of the same ink in a year: [startMonth, endMonth, ink]. `lastFrac` trims the growing edge. */
export function runs(row: YearRow, lastFrac?: number): Array<[number, number, ProfileInk]> {
  const out: Array<[number, number, ProfileInk]> = [];
  let i = 0;
  while (i < 12) {
    const ink = row[i];
    if (!ink) { i += 1; continue; }
    let j = i;
    while (j < 12 && row[j] === ink) j += 1;
    out.push([i, j, ink]);
    i = j;
  }
  if (lastFrac != null && out.length > 0) out[out.length - 1][1] = Math.min(out[out.length - 1][1], lastFrac);
  return out.filter(([m0, m1]) => m1 > m0);
}

// ── Drawing ─────────────────────────────────────────────────

/** A shape the page draws as SVG and the link picture serializes. Colours are roles, resolved by the caller. */
export type RingShape =
  | { type: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number; dash?: string }
  | { type: 'path'; d: string; stroke: string; strokeWidth: number; dash?: string; cap?: 'round' | 'butt'; opacity?: number; fill?: string }
  | { type: 'text'; x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end'; fill: string; size: number; weight: number };

/** Colour roles: the page maps them to theme variables, the link picture to the light theme's values. */
export type RingRole = 'ink' | 'guide' | 'plate' | 'now' | 'band' | 'tick' | 'label' | 'hub' | ProfileLane;

const n2 = (x: number) => Number(x.toFixed(2));

function pt(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arc(cx: number, cy: number, r: number, m0: number, m1: number, start = -90, sweep = 360): string {
  if (m1 - m0 >= 11.999 && sweep >= 359.9) {
    return `M ${n2(cx)} ${n2(cy - r)} A ${n2(r)} ${n2(r)} 0 1 1 ${n2(cx - 0.01)} ${n2(cy - r)}`;
  }
  const a0 = start + (sweep * m0) / 12;
  const a1 = start + (sweep * m1) / 12;
  const [x0, y0] = pt(cx, cy, r, a0);
  const [x1, y1] = pt(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${n2(x0)} ${n2(y0)} A ${n2(r)} ${n2(r)} 0 ${large} 1 ${n2(x1)} ${n2(y1)}`;
}

function inkPath(d: string, ink: ProfileInk, color: string, seenW: number, thinW: number, opacity = 1): RingShape {
  if (ink === 'seen') return { type: 'path', d, stroke: color, strokeWidth: n2(seenW), cap: 'butt', opacity };
  if (ink === 'signed') return { type: 'path', d, stroke: color, strokeWidth: n2(thinW), opacity };
  return { type: 'path', d, stroke: color, strokeWidth: n2(thinW * 1.15), cap: 'round', dash: `0.1 ${n2(thinW * 2.7)}`, opacity };
}

export const MARK_SIZE = 176;

/** The mark around a portrait: one line a year in the text colour, the strongest ink per month. 176 × 176. */
export function headerMarkShapes(rings: ProfileRings): RingShape[] {
  const now = parseNow(rings.now);
  // The mark is the person's, not a part: every lane the read carries.
  const grids = Object.values(ringsGrids(rings, now)) as Grid[];
  const grid = grids.length > 0 ? mergeGrids(grids) : laneGrid([], rings.from, now);
  const size = MARK_SIZE;
  const c = size / 2;
  const rIn = 47;
  const rOut = 83;
  const years = [...grid.keys()];
  const n = years.length;
  const pitch = n > 1 ? Math.min(5.6, (rOut - rIn) / (n - 1)) : 0;
  const seenW = n > 1 ? Math.min(2.6, Math.max(1.7, pitch * 0.62)) : 2.6;
  const thinW = Math.min(1.2, seenW * 0.5);
  const shapes: RingShape[] = [{ type: 'circle', cx: c, cy: c, r: c - 1, fill: 'plate' }];
  let nowPoint = null as [number, number] | null;
  for (const [i, year] of years.entries()) {
    const r = rIn + i * pitch;
    shapes.push({ type: 'circle', cx: c, cy: c, r: n2(r), stroke: 'guide', strokeWidth: 0.8 });
    const growing = year === now.year ? now.month + now.frac : undefined;
    for (const [m0, m1, ink] of runs(grid.get(year) ?? Array(12).fill(null), growing)) shapes.push(inkPath(arc(c, c, r, m0, m1), ink, 'ink', seenW, thinW));
    if (year === now.year) nowPoint = pt(c, c, r, -90 + 30 * (now.month + now.frac));
  }
  if (nowPoint != null) {
    const [x, y] = nowPoint;
    shapes.push({ type: 'circle', cx: n2(x), cy: n2(y), r: 3.6, fill: 'now', stroke: 'plate', strokeWidth: 1.6 });
  }
  return shapes;
}

export const CHART_SIZE = 384;

/** The Record chart: three lines a year (home inside, work, with others outside), from the lanes the read carries. */
export function fullChartShapes(rings: ProfileRings): RingShape[] {
  const now = parseNow(rings.now);
  const grids = ringsGrids(rings, now);
  const lanes = presentLanes(rings);
  const anyGrid = (lanes.length > 0 ? grids[lanes[0]] : null) ?? laneGrid([], rings.from, now);
  const years = [...anyGrid.keys()];
  const size = CHART_SIZE;
  const c = size / 2;
  const n = Math.max(1, years.length);
  const r0 = 30;
  const r1 = 160;
  const ypitch = (r1 - r0) / n;
  const lpitch = ypitch * 0.27;
  const band = lpitch * 2 + 3;
  const shapes: RingShape[] = [];
  for (const [i] of years.entries()) {
    const rc = r0 + i * ypitch + lpitch + 1.2;
    shapes.push({ type: 'circle', cx: c, cy: c, r: n2(rc), stroke: 'band', strokeWidth: n2(band) });
  }
  for (let m = 0; m < 12; m += 1) {
    const [x0, y0] = pt(c, c, r1 + 3, -90 + 30 * m);
    const [x1, y1] = pt(c, c, r1 + (m % 3 === 0 ? 8 : 6), -90 + 30 * m);
    shapes.push({ type: 'path', d: `M ${n2(x0)} ${n2(y0)} L ${n2(x1)} ${n2(y1)}`, stroke: 'tick', strokeWidth: 1 });
  }
  const labels: Array<[string, number, 'start' | 'middle' | 'end', number, number]> = [
    ['Jan', -90, 'middle', 0, -4], ['Apr', 0, 'start', 3, 3.5], ['Jul', 90, 'middle', 0, 11], ['Oct', 180, 'end', -3, 3.5],
  ];
  for (const [label, deg, anchor, dx, dy] of labels) {
    const [x, y] = pt(c, c, r1 + 9, deg);
    shapes.push({ type: 'text', x: n2(x + dx), y: n2(y + dy), text: label, anchor, fill: 'label', size: 10, weight: 600 });
  }
  let nowR = null as number | null;
  for (const [i, year] of years.entries()) {
    for (const [li, lane] of LANES.entries()) {
      const r = r0 + i * ypitch + 1.2 + li * lpitch;
      if (year === now.year) nowR = r;
      const grid = grids[lane];
      if (!grid) continue;
      const growing = year === now.year ? now.month + now.frac : undefined;
      for (const [m0, m1, ink] of runs(grid.get(year) ?? Array(12).fill(null), growing)) {
        shapes.push(inkPath(arc(c, c, r, m0, m1), ink, lane, 2.9, 1.5));
      }
    }
  }
  if (nowR != null) {
    const [x, y] = pt(c, c, nowR + 4.5, -90 + 30 * (now.month + now.frac));
    shapes.push({ type: 'circle', cx: n2(x), cy: n2(y), r: 3.6, fill: 'now', stroke: 'plate', strokeWidth: 1.6 });
  }
  shapes.push({ type: 'circle', cx: c, cy: c, r: r0 - 7, fill: 'hub' });
  shapes.push({ type: 'text', x: c, y: c + 3.5, text: String(years[0] ?? rings.from), anchor: 'middle', fill: 'label', size: 10, weight: 700 });
  return shapes;
}

export const FAN_W = 358;
export const FAN_H = 206;

/** A piece's dot on the work fan: its month (YYYY-MM), its ink, and whether it is pinned. */
export interface FanDot { month: string; ink: ProfileInk; pinned?: boolean }

/** The work rings opened flat (board 7): each year a half band, months left to right, a dot per piece. 358 × 206. */
export function workFanShapes(work: { from: number; now: string; months: string[] }, dots: FanDot[]): RingShape[] {
  const now = parseNow(work.now);
  const grid = laneGrid(work.months, work.from, now);
  const years = [...grid.keys()];
  const n = Math.max(1, years.length);
  const cx = FAN_W / 2;
  const cy = 184;
  const r0 = 26;
  const r1 = 172;
  const pitch = (r1 - r0) / n;
  const shapes: RingShape[] = [];
  for (const [i] of years.entries()) {
    const r = r0 + i * pitch + pitch / 2;
    shapes.push({ type: 'path', d: arc(cx, cy, r, 0, 12, 180, 180), stroke: 'band', strokeWidth: n2(Math.max(0.5, pitch - 2.2)) });
  }
  for (const [i, year] of years.entries()) {
    const r = r0 + i * pitch + pitch / 2;
    const growing = year === now.year ? now.month + now.frac : undefined;
    for (const [m0, m1, ink] of runs(grid.get(year) ?? Array(12).fill(null), growing)) {
      shapes.push(inkPath(arc(cx, cy, r, m0, m1, 180, 180), ink, 'work', 3, 1.3));
    }
  }
  for (const dot of dots) {
    const match = /^(\d{4})-(\d{2})/.exec(dot.month || '');
    if (!match) continue;
    const i = years.indexOf(Number(match[1]));
    if (i < 0) continue;
    const m = Math.min(11, Math.max(0, Number(match[2]) - 1));
    const r = r0 + i * pitch + pitch / 2;
    const [x, y] = pt(cx, cy, r, 180 + 15 * (m + 0.5));
    const rr = dot.pinned ? 4.4 : 3.3;
    if (dot.ink === 'seen') shapes.push({ type: 'circle', cx: n2(x), cy: n2(y), r: rr, fill: 'work', stroke: 'plate', strokeWidth: 1.4 });
    else if (dot.ink === 'signed') {
      shapes.push({ type: 'circle', cx: n2(x), cy: n2(y), r: rr, fill: 'plate', stroke: 'work', strokeWidth: 1.6 });
      shapes.push({ type: 'circle', cx: n2(x), cy: n2(y), r: n2(rr * 0.36), fill: 'work' });
    } else {
      shapes.push({ type: 'circle', cx: n2(x), cy: n2(y), r: rr, fill: 'plate', stroke: 'work', strokeWidth: 1.3, dash: '1.4 1.6' });
    }
  }
  shapes.push({ type: 'path', d: `M ${n2(cx - r1 - 4)} ${cy} L ${n2(cx + r1 + 4)} ${cy}`, stroke: 'guide', strokeWidth: 1 });
  const marks = years.length > 2 ? [years[0], years[Math.floor(years.length / 2)], years[years.length - 1]] : years;
  for (const year of [...new Set(marks)]) {
    const i = years.indexOf(year);
    const r = r0 + i * pitch + pitch / 2;
    shapes.push({ type: 'text', x: n2(cx + r), y: cy + 14, text: String(year), anchor: 'middle', fill: 'label', size: 10, weight: 600 });
  }
  shapes.push({ type: 'text', x: n2(cx - r1), y: cy + 14, text: 'Jan', anchor: 'start', fill: 'label', size: 10, weight: 600 });
  return shapes;
}

// ── Facts for words ────────────────────────────────────────

/** The first month with anything on record, as months since year 0, or null when nothing is. */
function firstMonth(grids: Grid[]): number | null {
  let first: number | null = null;
  for (const grid of grids) {
    for (const [year, row] of grid) {
      const m = row.findIndex(Boolean);
      if (m >= 0) {
        const at = year * 12 + m;
        if (first == null || at < first) first = at;
      }
    }
  }
  return first;
}

/** Years on record and whether anything is seen: what the ring on an avatar draws (board 6). */
export function markFacts(rings: ProfileRings): { years: number; seen: boolean; any: boolean } {
  const now = parseNow(rings.now);
  const grids = Object.values(ringsGrids(rings, now)) as Grid[];
  const first = firstMonth(grids);
  const seen = grids.some((grid) => [...grid.values()].some((row) => row.includes('seen')));
  if (first == null) return { years: 0, seen, any: false };
  const months = now.year * 12 + now.month - first;
  return { years: Math.max(0, months / 12), seen, any: true };
}

/** The avatar ring's width in px (DECISIONS 2026-11-23, profile-web): <1 year 1, <5 years 2.5, else 4. */
export function avatarRingWidth(years: number): number {
  if (years < 1) return 1;
  if (years < 5) return 2.5;
  return 4;
}

// ── Serializing (the link picture) ─────────────────────────

const LIGHT: Record<RingRole, string> = {
  ink: '#111827', guide: '#e5e7eb', plate: '#ffffff', now: '#0284c7', band: '#eef0f3', tick: '#9ca3af', label: '#5f6775',
  hub: '#f3f4f6', home: '#15803d', work: '#7c3aed', others: '#0369a1',
};

function colour(value: string | undefined, palette: Record<string, string>): string {
  if (!value) return 'none';
  return palette[value] ?? value;
}

/** The shapes as a standalone SVG document in the light theme (for the link picture). */
export function shapesToSvg(shapes: RingShape[], size: number, palette: Record<string, string> = LIGHT): string {
  const body = shapes.map((s) => {
    if (s.type === 'circle') {
      return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${colour(s.fill, palette)}"${s.stroke ? ` stroke="${colour(s.stroke, palette)}" stroke-width="${s.strokeWidth ?? 1}"` : ''}${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}${s.opacity != null && s.opacity < 1 ? ` opacity="${s.opacity}"` : ''}/>`;
    }
    if (s.type === 'path') {
      return `<path d="${s.d}" fill="${s.fill ? colour(s.fill, palette) : 'none'}" stroke="${colour(s.stroke, palette)}" stroke-width="${s.strokeWidth}"${s.cap ? ` stroke-linecap="${s.cap}"` : ''}${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}${s.opacity != null && s.opacity < 1 ? ` opacity="${s.opacity}"` : ''}/>`;
    }
    return `<text x="${s.x}" y="${s.y}" text-anchor="${s.anchor}" font-family="system-ui, sans-serif" font-size="${s.size}" font-weight="${s.weight}" fill="${colour(s.fill, palette)}">${s.text}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${body}</svg>`;
}
