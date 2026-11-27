'use client';

// Making playable items in the Studio (Pulse, reinvented, phase 2; coord/CONTRACT.md §7b; board B5's "Play"): the tray
// offers the six kinds, each made in a short form, and the item lands on the picture drawn exactly as readers will
// see it (the viewer's own card, closed), so the author places it knowing its size. Drag to move; smaller, larger and
// remove on its own small bar. Up to four on a post; they can't change after posting.

import { useRef, useState, type ReactNode } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { Card } from './PlayLayer';
import type { PlayItem, PlayKind } from './playTypes';
import './play.css';

export const MAX_PLAY = 4;

export const PLAY_MAKERS: { kind: PlayKind | 'dial'; label: string }[] = [
  { kind: 'poll', label: 'Poll' },
  { kind: 'slider', label: 'Slider' },
  { kind: 'dial', label: 'Spectrum dial' },
  { kind: 'board', label: 'Where do you stand' },
  { kind: 'question', label: 'Question box' },
  { kind: 'guess', label: 'Guess and reveal' },
  { kind: 'countdown', label: 'Countdown' },
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** What the server takes for an item (§7b): its placement and words, never answers or results. */
export function playWire(items: readonly PlayItem[]) {
  return items.map((item) => {
    const { mine: _mine, results: _results, open: _open, ...rest } = item as PlayItem & { mine: unknown; results: unknown; open: unknown };
    return rest;
  });
}

/** The items over the picture while composing: drawn as readers see them, moved by dragging. */
export function PlayEditLayer({ items, onChange, disabled }: { items: PlayItem[]; onChange(next: PlayItem[]): void; disabled?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const put = (id: string, patch: Partial<PlayItem>) => onChange(items.map((p) => (p.id === id ? ({ ...p, ...patch } as PlayItem) : p)));
  if (!items.length) return null;
  return (
    <div className="pl-layer" ref={box}>
      {items.map((item) => (
        <div
          key={item.id}
          className="pl-item"
          data-kind={item.kind}
          data-edit={disabled ? undefined : true}
          style={{
            left: `${item.x * 100}%`,
            top: `${item.y * 100}%`,
            ['--s' as string]: item.scale,
            transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (disabled || (e.target as HTMLElement).closest('.pl-edit-bar')) return;
            const b = box.current!.getBoundingClientRect();
            drag.current = { id: item.id, dx: (e.clientX - b.left) / b.width - item.x, dy: (e.clientY - b.top) / b.height - item.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== item.id) return;
            const b = box.current!.getBoundingClientRect();
            put(item.id, { x: clamp((e.clientX - b.left) / b.width - d.dx, 0.05, 0.95), y: clamp((e.clientY - b.top) / b.height - d.dy, 0.05, 0.95) });
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <div className="pl-preview" aria-hidden="true">
            <Card item={item} busy={false} send={async () => false} />
          </div>
          {!disabled && (
            <div className="pl-edit-bar">
              <button type="button" aria-label="Smaller" onClick={() => put(item.id, { scale: clamp(+(item.scale - 0.15).toFixed(2), 0.5, 1.6) })}>
                <Minus aria-hidden="true" />
              </button>
              <button type="button" aria-label="Larger" onClick={() => put(item.id, { scale: clamp(+(item.scale + 0.15).toFixed(2), 0.5, 1.6) })}>
                <Plus aria-hidden="true" />
              </button>
              <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((p) => p.id !== item.id))}>
                <X aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="pl-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Text({ value, set, max, placeholder }: { value: string; set(v: string): void; max: number; placeholder?: string }) {
  return <input value={value} maxLength={max} placeholder={placeholder} onChange={(e) => set(e.target.value)} />;
}

/** The form for one kind, in the tray. `onAdd` gets the item, placed in the picture's middle; null to go back. */
export function PlayMaker({ kind, taken, onAdd }: { kind: PlayKind | 'dial'; taken: readonly PlayItem[]; onAdd(item: PlayItem | null): void }) {
  const [q, setQ] = useState(''),
    [options, setOptions] = useState(['', '']),
    [a, setA] = useState(''),
    [b, setB] = useState(''),
    [c, setC] = useState(''),
    [d, setD] = useState(''),
    [mode, setMode] = useState<'choices' | 'number'>('choices'),
    [right, setRight] = useState(0),
    [min, setMin] = useState('0'),
    [max, setMax] = useState('100'),
    [unit, setUnit] = useState(''),
    [answer, setAnswer] = useState(''),
    [ends, setEnds] = useState('');
  const base = kind === 'dial' ? 'slider' : kind;
  let n = 1;
  while (taken.some((p) => p.id === `${base}-${n}`)) n++;
  const place = { id: `${base}-${n}`, x: 0.5, y: clamp(0.3 + taken.length * 0.15, 0.2, 0.8), scale: 1, rotation: 0, open: false, mine: null, results: null };
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const maxLocal = new Date(Date.now() + 30 * 86_400_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  let item: PlayItem | null = null;
  if (base === 'poll' && q.trim() && filled.length >= 2) item = { ...place, kind: 'poll', question: q.trim(), options: filled };
  if (base === 'slider' && q.trim() && a.trim() && b.trim())
    item = { ...place, kind: 'slider', question: q.trim(), left: a.trim(), right: b.trim(), look: kind === 'dial' ? 'dial' : 'slider' };
  if (base === 'board' && q.trim() && a.trim() && b.trim() && c.trim() && d.trim())
    item = { ...place, kind: 'board', question: q.trim(), x_axis: { left: a.trim(), right: b.trim() }, y_axis: { bottom: c.trim(), top: d.trim() } };
  if (base === 'question' && q.trim()) item = { ...place, kind: 'question', prompt: q.trim() };
  if (base === 'guess' && q.trim()) {
    const lo = Number(min),
      hi = Number(max),
      ans = Number(answer);
    if (mode === 'choices' && filled.length >= 2 && right < filled.length)
      item = { ...place, kind: 'guess', prompt: q.trim(), options: filled, answer: right };
    if (mode === 'number' && min !== '' && max !== '' && answer !== '' && lo < hi && ans >= lo && ans <= hi)
      item = { ...place, kind: 'guess', prompt: q.trim(), range: { min: lo, max: hi, ...(unit.trim() ? { unit: unit.trim() } : {}) }, answer: ans };
  }
  if (base === 'countdown' && q.trim() && ends && Date.parse(ends) > Date.now())
    item = { ...place, kind: 'countdown', title: q.trim(), ends_at: new Date(ends).toISOString() };

  const choices = (withRight: boolean) => (
    <>
      {options.map((o, i) => (
        <div key={i} className="pl-field-row">
          {withRight && (
            <input type="radio" name="pl-right" aria-label={`Option ${i + 1} is the answer`} checked={right === i} onChange={() => setRight(i)} />
          )}
          <input
            value={o}
            maxLength={40}
            placeholder={`Option ${i + 1}`}
            onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
          />
        </div>
      ))}
      {options.length < 4 && (
        <button type="button" className="st-chip" onClick={() => setOptions([...options, ''])}>
          Add an option
        </button>
      )}
    </>
  );
  return (
    <form
      className="pl-maker"
      onSubmit={(e) => {
        e.preventDefault();
        if (item) onAdd(item);
      }}
    >
      {(base === 'poll' || base === 'slider' || base === 'board') && (
        <Field label="Question">
          <Text value={q} set={setQ} max={100} placeholder={base === 'board' ? 'Downtown Roasters: where do you stand?' : 'Ask something'} />
        </Field>
      )}
      {(base === 'question' || base === 'guess') && (
        <Field label={base === 'guess' ? 'What to guess' : 'Your question'}>
          <Text value={q} set={setQ} max={100} placeholder={base === 'guess' ? 'How deep is the lake?' : 'Ask me anything'} />
        </Field>
      )}
      {base === 'countdown' && (
        <Field label="What it counts down to">
          <Text value={q} set={setQ} max={60} placeholder="Polar plunge" />
        </Field>
      )}
      {base === 'poll' && choices(false)}
      {base === 'slider' && (
        <div className="pl-field-row">
          <Field label="Left end">
            <Text value={a} set={setA} max={24} />
          </Field>
          <Field label="Right end">
            <Text value={b} set={setB} max={24} />
          </Field>
        </div>
      )}
      {base === 'board' && (
        <>
          <div className="pl-field-row">
            <Field label="Left">
              <Text value={a} set={setA} max={24} placeholder="Cozy" />
            </Field>
            <Field label="Right">
              <Text value={b} set={setB} max={24} placeholder="Lively" />
            </Field>
          </div>
          <div className="pl-field-row">
            <Field label="Bottom">
              <Text value={c} set={setC} max={24} placeholder="Local classic" />
            </Field>
            <Field label="Top">
              <Text value={d} set={setD} max={24} placeholder="Hidden gem" />
            </Field>
          </div>
        </>
      )}
      {base === 'guess' && (
        <>
          <div className="st-tray-stamps" role="group" aria-label="Kind of guess">
            <button type="button" aria-pressed={mode === 'choices'} onClick={() => setMode('choices')}>
              Choices
            </button>
            <button type="button" aria-pressed={mode === 'number'} onClick={() => setMode('number')}>
              A number
            </button>
          </div>
          {mode === 'choices' ? (
            <>
              <p className="st-hint">Mark the right one.</p>
              {choices(true)}
            </>
          ) : (
            <div className="pl-field-row">
              <Field label="From">
                <input type="number" value={min} onChange={(e) => setMin(e.target.value)} />
              </Field>
              <Field label="To">
                <input type="number" value={max} onChange={(e) => setMax(e.target.value)} />
              </Field>
              <Field label="Unit">
                <Text value={unit} set={setUnit} max={12} placeholder="ft" />
              </Field>
              <Field label="Answer">
                <input type="number" value={answer} onChange={(e) => setAnswer(e.target.value)} />
              </Field>
            </div>
          )}
        </>
      )}
      {base === 'countdown' && (
        <Field label="Ends">
          <input type="datetime-local" value={ends} min={nowLocal} max={maxLocal} onChange={(e) => setEnds(e.target.value)} />
        </Field>
      )}
      <div className="pl-field-row">
        <button type="button" className="st-chip" onClick={() => onAdd(null)}>
          Back
        </button>
        <button type="submit" className="st-post" disabled={!item}>
          Put it on
        </button>
      </div>
    </form>
  );
}
