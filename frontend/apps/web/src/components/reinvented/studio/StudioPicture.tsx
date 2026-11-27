'use client';

import { useEffect, useRef, useState } from 'react';
import { paintOverlay, type Artwork, type XY } from '@/components/moments/momentArtwork';

export type StudioTool = 'text' | 'draw' | 'resize' | null;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The picture in the Studio: the photo or video fills the 9:16 frame that is posted (the same frame, artwork and
 * drawing rules as today's MomentEditor, so what is seen is what goes out). With Resize (or no tool) dragging moves the
 * picture and the wheel or two fingers zoom it; with Text the drag moves the words; with Draw it draws.
 */
export default function StudioPicture({
  file,
  art,
  onChange,
  tool,
  ink,
  pen,
  onPicture,
}: {
  file: File;
  art: Artwork;
  onChange(a: Artwork): void;
  tool: StudioTool;
  ink: string;
  pen: number;
  /** The picture as it loaded (a video once its first frame is in), for reading its colours. */
  onPicture?(el: HTMLImageElement | HTMLVideoElement, width: number, height: number): void;
}) {
  const [url, setUrl] = useState(''),
    [unreadable, setUnreadable] = useState(false),
    [dimensions, setDimensions] = useState<{ w: number; h: number }>({ w: 9, h: 16 });
  const canvas = useRef<HTMLCanvasElement>(null),
    frame = useRef<HTMLDivElement>(null),
    drag = useRef<{ from: XY; original: Artwork } | null>(null),
    fingers = useRef(new Map<number, XY>()),
    pinch = useRef<{ span: number; zoom: number } | null>(null),
    fitted = useRef('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    setUnreadable(false);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 720, 1280);
      paintOverlay(ctx, art);
    }
  }, [art]);
  const point = (e: { clientX: number; clientY: number }): XY => {
    const b = frame.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - b.left) / b.width, 0, 1), y: clamp((e.clientY - b.top) / b.height, 0, 1) };
  };
  const span = () => {
    const [a, b] = [...fingers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  // "After a shot the picture fills the screen" (B2): a tall picture (a phone's own shot) opens filling the frame, the
  // little that falls outside cropped as it is posted; a wide or square one opens whole, as today. Resize changes it.
  const measured = (w: number, h: number) => {
    setDimensions({ w, h });
    if (!w || !h || fitted.current === url) return;
    fitted.current = url;
    const cover = Math.max(9 / w, 16 / h) / Math.min(9 / w, 16 / h);
    if (cover > 1 && cover <= 1.35 && art.zoom === 1 && !art.rotation && !art.offset.x && !art.offset.y)
      onChange({ ...art, zoom: cover });
  };
  const side = art.rotation % 180 !== 0;
  const scale =
    Math.min(9 / (side ? dimensions.h : dimensions.w), 16 / (side ? dimensions.w : dimensions.h)) * art.zoom;
  const style = {
    width: ((dimensions.w * scale) / 9) * 100 + '%',
    height: ((dimensions.h * scale) / 16) * 100 + '%',
    left: 50 + 100 * art.offset.x + '%',
    top: 50 + 100 * art.offset.y + '%',
    transform: 'translate(-50%, -50%) rotate(' + art.rotation + 'deg)',
  };
  return (
    <div className="st-picture" ref={frame}>
      {url &&
        (file.type.startsWith('video/') ? (
          <video
            style={style}
            src={url}
            muted
            playsInline
            autoPlay
            loop
            onLoadedMetadata={(e) => measured(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
            onLoadedData={(e) => onPicture?.(e.currentTarget, e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
            onError={() => setUnreadable(true)}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL of the file being posted
          <img
            src={url}
            style={style}
            alt="Your photo"
            onLoad={(e) => {
              measured(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
              onPicture?.(e.currentTarget, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
            }}
            onError={() => setUnreadable(true)}
          />
        ))}
      {unreadable && <span className="st-unreadable">Preview unavailable for this file</span>}
      <canvas
        ref={canvas}
        width={720}
        height={1280}
        aria-label={
          tool === 'draw'
            ? 'Draw on your Moment'
            : tool === 'text'
              ? 'Drag to move your words'
              : 'Drag to move the picture'
        }
        onWheel={(e) => {
          if (tool === 'text' || tool === 'draw') return;
          onChange({ ...art, zoom: clamp(art.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 0.5, 3) });
        }}
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* a pointer that is already gone: nothing to follow */
          }
          fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if ((!tool || tool === 'resize') && fingers.current.size === 2) {
            drag.current = null;
            pinch.current = { span: span(), zoom: art.zoom };
            return;
          }
          const p = point(e);
          drag.current = { original: art, from: p };
          if (tool === 'draw') onChange({ ...art, strokes: [...art.strokes, { width: pen, color: ink, points: [p] }] });
        }}
        onPointerMove={(e) => {
          if (fingers.current.has(e.pointerId)) fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinch.current) {
            const now = span();
            if (now && pinch.current.span) onChange({ ...art, zoom: clamp((pinch.current.zoom * now) / pinch.current.span, 0.5, 3) });
            return;
          }
          if (!drag.current) return;
          const p = point(e),
            { original, from } = drag.current;
          if (tool === 'draw') {
            const stroke = art.strokes.at(-1);
            if (stroke)
              onChange({ ...art, strokes: [...art.strokes.slice(0, -1), { ...stroke, points: [...stroke.points, p] }] });
          } else if (tool === 'text')
            onChange({
              ...art,
              textAt: {
                x: clamp(original.textAt.x + p.x - from.x, 0, 1),
                y: clamp(original.textAt.y + p.y - from.y, 0, 1),
              },
            });
          else onChange({ ...art, offset: { x: original.offset.x + p.x - from.x, y: original.offset.y + p.y - from.y } });
        }}
        onLostPointerCapture={(e) => {
          fingers.current.delete(e.pointerId);
          if (fingers.current.size < 2) pinch.current = null;
          drag.current = null;
        }}
      />
    </div>
  );
}
