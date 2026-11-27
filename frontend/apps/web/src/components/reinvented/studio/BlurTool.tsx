'use client';

// Blur before posting (Pulse, reinvented, phase 2, PHASE-2 piece 3): faces of people who didn't ask to be in it,
// licence plates, house numbers and mail labels. The phones find them; the web can't, so the person drags a box over
// each by hand (PHASE-2: "where a phone or the web cannot do it, the person does it by hand"). The boxes show blurred
// while composing, and the blur is drawn into the photo itself before it is posted, so nobody can take it off.

import { useRef, useState } from 'react';
import { X } from 'lucide-react';

/** A box on the photo, 0 to 1 from its top left. */
export interface BlurBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Over the Studio's picture: drag to add a box (when active); each box shows blurred and can be taken off. */
export function BlurLayer({ boxes, active, onChange }: { boxes: BlurBox[]; active: boolean; onChange(next: BlurBox[]): void }) {
  const layer = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<BlurBox | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  // The box being drawn, also kept here so letting go always reads the latest one.
  const drawing = useRef<BlurBox | null>(null);
  // Positions are on the photo itself, as drawn inside the stage (the stage's <img>).
  const photoRect = () => layer.current?.parentElement?.querySelector('img')?.getBoundingClientRect() || null;
  const at = (e: React.PointerEvent) => {
    const r = photoRect();
    if (!r) return null;
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };
  if (!boxes.length && !active) return null;
  // The layer covers the stage; boxes are drawn in the photo's own box inside it.
  const r = photoRect(),
    s = layer.current?.getBoundingClientRect();
  const frame = r && s ? { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height } : null;
  const place = (b: BlurBox) =>
    frame
      ? { left: frame.left + b.x * frame.width, top: frame.top + b.y * frame.height, width: b.w * frame.width, height: b.h * frame.height }
      : { display: 'none' };
  return (
    <div
      ref={layer}
      className="st-blur-layer"
      data-active={active || undefined}
      onPointerDown={(e) => {
        if (!active || e.target !== e.currentTarget) return;
        const p = at(e);
        if (!p) return;
        start.current = p;
        drawing.current = { ...p, w: 0, h: 0 };
        setDraft(drawing.current);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // A pointer the browser doesn't know (some pens): the box still follows it while over the picture.
        }
      }}
      onPointerMove={(e) => {
        const p0 = start.current,
          p = p0 && at(e);
        if (!p0 || !p) return;
        drawing.current = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
        setDraft(drawing.current);
      }}
      onPointerUp={() => {
        const box = drawing.current;
        if (box && box.w > 0.02 && box.h > 0.02) onChange([...boxes, box]);
        start.current = null;
        drawing.current = null;
        setDraft(null);
      }}
    >
      {boxes.map((b, i) => (
        <span key={i} className="st-blur-box" style={place(b)}>
          {active && (
            <button type="button" aria-label="Take this blur off" onClick={() => onChange(boxes.filter((_, j) => j !== i))}>
              <X aria-hidden="true" />
            </button>
          )}
        </span>
      ))}
      {draft && <span className="st-blur-box st-blur-draft" style={place(draft)} />}
    </div>
  );
}

/** The photo with each box blurred into it, as a new file of the same kind; the original is left as it was. */
export async function blurInto(file: File, boxes: BlurBox[]): Promise<File> {
  if (!boxes.length) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth,
      h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const radius = Math.max(12, Math.round(Math.max(w, h) / 45));
    for (const b of boxes) {
      const x = Math.round(b.x * w),
        y = Math.round(b.y * h),
        bw = Math.max(1, Math.round(b.w * w)),
        bh = Math.max(1, Math.round(b.h * h));
      // Twice over, with the box's own pixels only, so the blur can't be read back from its edges.
      for (let pass = 0; pass < 2; pass++) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, bw, bh);
        ctx.clip();
        ctx.filter = `blur(${radius}px)`;
        ctx.drawImage(canvas, 0, 0);
        ctx.restore();
      }
    }
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blur'))), 'image/jpeg', 0.92));
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } finally {
    URL.revokeObjectURL(url);
  }
}
