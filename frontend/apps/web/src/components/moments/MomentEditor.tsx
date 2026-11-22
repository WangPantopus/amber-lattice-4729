'use client';

import { useEffect, useRef, useState } from 'react';
import { Move, Pencil, RotateCw, Type, Undo2 } from 'lucide-react';
import { inks, paintOverlay, type Artwork, type XY } from './momentArtwork';

interface Props {
  file: File;
  art: Artwork;
  onChange(a: Artwork): void;
}
export default function MomentEditor({ file, art, onChange }: Props) {
  const [url, setUrl] = useState(''),
    [tool, setTool] = useState<'move' | 'draw' | 'text'>('move'),
    [ink, setInk] = useState(inks[0]);
  const [pen, setPen] = useState(0.012),
    [unreadable, setUnreadable] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    frame = useRef<HTMLDivElement>(null),
    drag = useRef<{ from: XY; original: Artwork } | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number }>({ w: 9, h: 16 });
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
  const point = (e: React.PointerEvent): XY => {
    const b = frame.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)),
      y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)),
    };
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
    <div className="mo-art-editor">
      <div className="mo-art-frame" ref={frame}>
        {url &&
          (file.type.startsWith('video/') ? (
            <video
              style={style}
              src={url}
              muted
              playsInline
              autoPlay
              loop
              onLoadedMetadata={(e) =>
                setDimensions({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })
              }
              onError={() => setUnreadable(true)}
            />
          ) : (
            <img
              src={url}
              style={style}
              alt="Photo being edited"
              onLoad={(e) =>
                setDimensions({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
              }
              onError={() => setUnreadable(true)}
            />
          ))}
        {unreadable && <span className="mo-preview-unavailable">Preview unavailable for this file</span>}
        <canvas
          ref={canvas}
          width={720}
          height={1280}
          aria-label={
            tool === 'draw'
              ? 'Draw on your Moment'
              : tool === 'text'
                ? 'Drag to position your text'
                : 'Drag to reposition the image'
          }
          onPointerDown={(e) => {
            const p = point(e);
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { original: art, from: p };
            if (tool === 'draw')
              onChange({ ...art, strokes: [...art.strokes, { width: pen, color: ink, points: [p] }] });
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const p = point(e),
              { original, from } = drag.current;
            if (tool === 'draw') {
              const stroke = art.strokes.at(-1);
              if (stroke)
                onChange({
                  ...art,
                  strokes: [...art.strokes.slice(0, -1), { ...stroke, points: [...stroke.points, p] }],
                });
            } else if (tool === 'text')
              onChange({
                ...art,
                textAt: {
                  x: Math.max(0, Math.min(1, original.textAt.x + p.x - from.x)),
                  y: Math.max(0, Math.min(1, original.textAt.y + p.y - from.y)),
                },
              });
            else
              onChange({
                ...art,
                offset: { x: original.offset.x + p.x - from.x, y: original.offset.y + p.y - from.y },
              });
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        />
      </div>
      <div className="mo-editor-tools">
        {(
          [
            ['move', Move, 'Position'],
            ['text', Type, 'Text'],
            ['draw', Pencil, 'Draw'],
          ] as const
        ).map(([key, Icon, label]) => (
          <button key={key} type="button" aria-pressed={tool === key} onClick={() => setTool(key)}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
      {tool === 'text' && (
        <>
          <input
            aria-label="Text overlay"
            placeholder="Write on your Moment"
            maxLength={120}
            value={art.text}
            onChange={(e) => onChange({ ...art, text: e.target.value })}
          />
          <label>
            Text size
            <input
              type="range"
              min=".04"
              max=".15"
              step=".005"
              value={art.size}
              onChange={(e) => onChange({ ...art, size: Number(e.target.value) })}
            />
          </label>
        </>
      )}
      {tool !== 'move' && (
        <div className="mo-swatches">
          {inks.map((v, i) => (
            <button
              type="button"
              key={v}
              aria-label={['White', 'Black', 'Yellow', 'Red', 'Blue', 'Green'][i]}
              style={{ background: v }}
              aria-pressed={v === (tool === 'draw' ? ink : art.color)}
              onClick={() => (tool === 'draw' ? setInk(v) : onChange({ ...art, color: v }))}
            />
          ))}
        </div>
      )}
      {tool === 'draw' && (
        <div className="mo-editor-tools">
          {[0.006, 0.012, 0.024].map((v, i) => (
            <button
              type="button"
              aria-label={['Fine pen', 'Medium pen', 'Thick pen'][i]}
              aria-pressed={v === pen}
              onClick={() => setPen(v)}
              key={v}
            >
              <i
                style={{
                  height: 4 + i * 3,
                  width: 4 + i * 3,
                  borderRadius: '50%',
                  background: 'currentColor',
                }}
              />
            </button>
          ))}
          <button
            type="button"
            disabled={!art.strokes.length}
            onClick={() => onChange({ ...art, strokes: art.strokes.slice(0, -1) })}
          >
            <Undo2 size={15} />
            Undo
          </button>
        </div>
      )}
      {tool === 'move' && (
        <div className="mo-editor-tools">
          <label>
            Zoom
            <input
              type="range"
              min=".5"
              max="3"
              step=".05"
              value={art.zoom}
              onChange={(e) => onChange({ ...art, zoom: Number(e.target.value) })}
            />
          </label>
          <button type="button" onClick={() => onChange({ ...art, rotation: (art.rotation + 90) % 360 })}>
            <RotateCw size={15} />
            Rotate
          </button>
        </div>
      )}
    </div>
  );
}
