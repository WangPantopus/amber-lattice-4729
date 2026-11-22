export type XY = { x: number; y: number };
export interface Stroke {
  color: string;
  width: number;
  points: XY[];
}
export interface Artwork {
  strokes: Stroke[];
  text: string;
  color: string;
  size: number;
  textAt: XY;
  zoom: number;
  rotation: number;
  offset: XY;
}
export const blankArt = (): Artwork => ({
  strokes: [],
  text: '',
  color: '#ffffff',
  size: 0.075,
  textAt: { x: 0.5, y: 0.5 },
  zoom: 1,
  rotation: 0,
  offset: { x: 0, y: 0 },
});
export const edited = (a: Artwork) =>
  !!(a.strokes.length || a.text.trim() || a.zoom !== 1 || a.rotation || a.offset.x || a.offset.y);
export const inks = ['#ffffff', '#15191e', '#ffd52a', '#ef5350', '#38bdf8', '#36c68a'];
type Context = CanvasRenderingContext2D;
export function paintMedia(ctx: Context, source: CanvasImageSource, sw: number, sh: number, a: Artwork) {
  const w = ctx.canvas.width,
    h = ctx.canvas.height;
  ctx.fillStyle = '#152025';
  ctx.fillRect(0, 0, w, h);
  const side = a.rotation % 180 !== 0;
  const scale = Math.min(w / (side ? sh : sw), h / (side ? sw : sh)) * a.zoom;
  ctx.save();
  ctx.translate(w * (0.5 + a.offset.x), h * (0.5 + a.offset.y));
  ctx.rotate((a.rotation * Math.PI) / 180);
  ctx.drawImage(source, (-sw * scale) / 2, (-sh * scale) / 2, sw * scale, sh * scale);
  ctx.restore();
  paintOverlay(ctx, a);
}
export function paintOverlay(ctx: Context, a: Artwork) {
  const w = ctx.canvas.width,
    h = ctx.canvas.height;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of a.strokes) {
    if (!stroke.points.length) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * w;
    ctx.beginPath();
    const first = stroke.points[0];
    ctx.moveTo(first.x * w, first.y * h);
    if (stroke.points.length === 1) ctx.lineTo(first.x * w + 0.01, first.y * h);
    for (const p of stroke.points.slice(1)) ctx.lineTo(p.x * w, p.y * h);
    ctx.stroke();
  }
  if (!a.text.trim()) return;
  const px = w * a.size;
  ctx.save();
  ctx.font = '700 ' + px + 'px system-ui, sans-serif';
  ctx.fillStyle = a.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.65)';
  ctx.shadowBlur = px * 0.13;
  const lines: string[] = [];
  for (const paragraph of a.text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > w * 0.88) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  lines.forEach((line, i) =>
    ctx.fillText(line, a.textAt.x * w, a.textAt.y * h + (i - (lines.length - 1) / 2) * px * 1.17, w * 0.92),
  );
  ctx.restore();
}
export function canvasOf(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser couldn’t open the media editor.');
  return { canvas, ctx };
}
export function jpeg(canvas: HTMLCanvasElement, quality = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Couldn’t save this image.'))),
      'image/jpeg',
      quality,
    ),
  );
}
