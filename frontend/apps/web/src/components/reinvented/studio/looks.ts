// Film looks and the photostrip in the Studio (Pulse, reinvented, phase 0 step 5; the same eight looks and the same
// strip as the iPhone's MomentsStudioLooks.swift). A look is colour and tone only, over the whole picture: nothing ever
// changes a face's shape, no warping, smoothing or reshaping (founder, 2026-11-26). Both are drawn into the photo on
// this device, like every mark, so nothing changes on the server; the photo before any look is kept, so picking
// another look, or Original, starts from it again.

export type FilmLook = 'original' | 'warm' | 'cool' | 'fade' | 'chrome' | 'instant' | 'mono' | 'noir';

export const FILM_LOOKS: readonly { look: FilmLook; title: string }[] = [
  { look: 'original', title: 'Original' },
  { look: 'warm', title: 'Warm' },
  { look: 'cool', title: 'Cool' },
  { look: 'fade', title: 'Fade' },
  { look: 'chrome', title: 'Chrome' },
  { look: 'instant', title: 'Instant' },
  { look: 'mono', title: 'Mono' },
  { look: 'noir', title: 'Noir' },
];

// Each look as a few colour and tone steps: channel gains (warmth), saturation, contrast around the middle grey, and a
// lift of the blacks (a faded print).
const TONES: Record<Exclude<FilmLook, 'original'>, { gain?: [number, number, number]; sat?: number; contrast?: number; lift?: number }> = {
  warm: { gain: [1.08, 1.01, 0.86], sat: 1.05 },
  cool: { gain: [0.9, 0.99, 1.1] },
  fade: { sat: 0.72, contrast: 0.84, lift: 30 },
  chrome: { sat: 1.3, contrast: 1.12 },
  instant: { gain: [1.06, 1, 0.9], sat: 0.85, contrast: 0.9, lift: 14 },
  mono: { sat: 0 },
  noir: { sat: 0, contrast: 1.45 },
};

/** Draws `look` over the pixels in place. */
function tone(data: Uint8ClampedArray, look: Exclude<FilmLook, 'original'>) {
  const { gain = [1, 1, 1], sat = 1, contrast = 1, lift = 0 } = TONES[look];
  const keep = (255 - lift) / 255;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * gain[0],
      g = data[i + 1] * gain[1],
      b = data[i + 2] * gain[2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * sat;
    g = l + (g - l) * sat;
    b = l + (b - l) * sat;
    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;
    data[i] = lift + r * keep;
    data[i + 1] = lift + g * keep;
    data[i + 2] = lift + b * keep;
  }
}

async function decode(file: Blob) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Your browser couldn’t open the photo editor.');
  return { c, ctx };
}

const toJpeg = (c: HTMLCanvasElement, name: string) =>
  new Promise<File>((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(new File([b], name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() })) : reject(new Error('Couldn’t save this photo.'))),
      'image/jpeg',
      0.92,
    ),
  );

// The longest side a look or a strip is drawn at: as sharp as today's posted photos, and quick on a phone.
const LONGEST = 3072;

/** The photo in `look`, as a new JPEG (the photo itself for Original). */
export async function withLook(file: File, look: FilmLook): Promise<File> {
  if (look === 'original') return file;
  const img = await decode(file);
  const scale = Math.min(1, LONGEST / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale)),
    h = Math.max(1, Math.round(img.naturalHeight * scale));
  const { c, ctx } = canvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h);
  tone(pixels.data, look);
  ctx.putImageData(pixels, 0, 0);
  return toJpeg(c, file.name);
}

/** Small copies of the photo in every look, for the tray's row (data URLs, made once per photo). */
export async function lookPreviews(file: File): Promise<Record<FilmLook, string>> {
  const img = await decode(file);
  const scale = Math.min(1, 180 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale)),
    h = Math.max(1, Math.round(img.naturalHeight * scale));
  const out = {} as Record<FilmLook, string>;
  for (const { look } of FILM_LOOKS) {
    const { c, ctx } = canvas(w, h);
    ctx.drawImage(img, 0, 0, w, h);
    if (look !== 'original') {
      const pixels = ctx.getImageData(0, 0, w, h);
      tone(pixels.data, look);
      ctx.putImageData(pixels, 0, 0);
    }
    out[look] = c.toDataURL('image/jpeg', 0.8);
  }
  return out;
}

/** Photos one under the other, each cropped to 4:3 across, on a white strip with even margins (a photo-booth strip). */
export async function photostrip(files: File[]): Promise<File> {
  const width = 1080,
    margin = 36,
    frameW = width - margin * 2,
    frameH = Math.round((frameW * 3) / 4);
  const { c, ctx } = canvas(width, margin + files.length * (frameH + margin));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  for (const [i, file] of files.entries()) {
    const img = await decode(file);
    const y = margin + i * (frameH + margin);
    const scale = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight);
    const w = img.naturalWidth * scale,
      h = img.naturalHeight * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin, y, frameW, frameH);
    ctx.clip();
    ctx.drawImage(img, margin + (frameW - w) / 2, y + (frameH - h) / 2, w, h);
    ctx.restore();
  }
  return toJpeg(c, 'photostrip.jpg');
}
