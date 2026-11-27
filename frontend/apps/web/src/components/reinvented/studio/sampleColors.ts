// "Colours sampled from the photo" (design, the Studio's Aa): up to five colours the picture is mostly made of, offered
// beside today's six inks for words and drawing. Read from the picture as the Studio shows it, on this device only.

type RGB = [number, number, number];

const hex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const parse = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const far = (a: RGB, b: RGB, min: number) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) >= min;
function saturation([r, g, b]: RGB) {
  const hi = Math.max(r, g, b),
    lo = Math.min(r, g, b);
  return hi === 0 ? 0 : (hi - lo) / hi;
}

/**
 * The picture's main colours, most telling first: pixels are grouped into coarse colour boxes, each box's average is a
 * candidate, and a candidate counts by how much of the picture it covers, a little more when it is vivid. Colours too
 * close to one already picked, or to an ink already offered, are left out. Nothing when the picture can't be read.
 */
export function sampleColors(source: CanvasImageSource, width: number, height: number, inks: readonly string[], count = 5) {
  if (!width || !height) return [];
  const w = 48,
    h = Math.max(1, Math.round((48 * height) / width));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(source, 0, 0, w, h);
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return [];
  }
  const boxes = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5);
    const box = boxes.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    box.n++;
    box.r += data[i];
    box.g += data[i + 1];
    box.b += data[i + 2];
    boxes.set(key, box);
  }
  const candidates = [...boxes.values()]
    .map((b) => ({ rgb: [b.r / b.n, b.g / b.n, b.b / b.n] as RGB, n: b.n }))
    .map((c) => ({ ...c, score: c.n * (0.6 + saturation(c.rgb)) }))
    .sort((a, b) => b.score - a.score);
  const taken = inks.map(parse);
  const picked: RGB[] = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    if (taken.every((t) => far(t, c.rgb, 48)) && picked.every((p) => far(p, c.rgb, 56))) picked.push(c.rgb);
  }
  return picked.map(hex);
}
