'use client';

// Pins on the photo (Pulse, reinvented, phase 3; coord/CONTRACT.md §8b): where a Moment's replies are shown (8a), a reader
// drops a reaction or a short voice bubble on a spot in its picture. A pin is a reply, so removing and reporting are
// the replies' own; one toggle hides every pin on the reader's own screen. Cutouts are made on the phones (the web
// can't lift one); the web shows them. Today's screens and the apps in the stores see the pin as a plain reply.
//
// Two parts share one small store per Moment: the pins, drawn on the picture itself (PinLayer, inside the viewer's
// picture box), and the controls with the pin's card (PinControls, over the viewer's stage, clear of its own bars).

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Mic, Pin as PinIcon, Square, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post } from '@pantopus/api/client';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { useMe } from '@/lib/me';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import { repliesOf, type RepliesInfo } from '../replies/Replies';
import { SIGNALS, SIGNAL_WORDS, SignalIcon, isSignal } from '../viewer/signals';
import { canRecord, useRecorder } from '../sound/record';
import './pins.css';

export interface Pin {
  id: string;
  kind: 'reaction' | 'voice' | 'cutout';
  x: number;
  y: number;
  emoji: string | null;
  signal: string | null;
  audio_url: string | null;
  duration_ms: number | null;
  image_url: string | null;
  text: string | null;
  checking: boolean;
  author: Moment['author'] | null;
  mine: boolean;
  can_remove: boolean;
}

const HIDE_KEY = 'pantopus.pins.hidden';
const REASONS: [string, string][] = [
  ['spam', 'Spam'],
  ['harassment', 'Harassment'],
  ['inappropriate', 'Inappropriate content'],
  ['misinformation', 'Misinformation'],
  ['safety', 'Safety concern'],
  ['other', 'Other'],
];

// ── The shared store: per Moment, whether a pin is being dropped, the spot chosen, the pin opened; and, for every
// Moment, whether the reader hid pins on their screen.
interface PinUi {
  dropping: boolean;
  spot: { x: number; y: number } | null;
  open: string | null;
  hidden: boolean;
}
const states = new Map<string, Omit<PinUi, 'hidden'>>();
const listeners = new Set<() => void>();
let hiddenAll: boolean | null = null;
const snapshots = new Map<string, string>();
function readHidden() {
  if (hiddenAll == null)
    try {
      hiddenAll = localStorage.getItem(HIDE_KEY) === '1';
    } catch {
      hiddenAll = false;
    }
  return hiddenAll;
}
function snapshot(id: string): string {
  const s = { ...(states.get(id) || { dropping: false, spot: null, open: null }), hidden: readHidden() };
  const next = JSON.stringify(s);
  // The same string while nothing changed, so React sees no change.
  if (snapshots.get(id) !== next) snapshots.set(id, next);
  return snapshots.get(id)!;
}
function setUi(id: string, patch: Partial<Omit<PinUi, 'hidden'>>) {
  states.set(id, { ...(states.get(id) || { dropping: false, spot: null, open: null }), ...patch });
  listeners.forEach((l) => l());
}
function setHidden(next: boolean) {
  hiddenAll = next;
  try {
    localStorage.setItem(HIDE_KEY, next ? '1' : '0');
  } catch {
    /* this screen only */
  }
  listeners.forEach((l) => l());
}
function usePinUi(id: string): PinUi {
  const raw = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot(id),
    () => '{"dropping":false,"spot":null,"open":null,"hidden":false}',
  );
  return JSON.parse(raw) as PinUi;
}

/** The viewer holds still while a pin is being dropped or one is open. */
export function holdsForPins(m: Moment): boolean {
  const s = states.get(m.id);
  return !!s && (s.dropping || !!s.spot || !!s.open);
}

/** Whether pins can be on this Moment for this reader (replies shown), so the viewer measures the picture for them. */
export function hasPins(m: Moment): boolean {
  return !!repliesOf(m)?.shown;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const stop = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
};

function errorWords(e: unknown): string {
  const err = e as { code?: string; statusCode?: number; message?: string };
  if (['PIN_LIMIT', 'PINS_FULL', 'REPLIES_CLOSED', 'MOMENT_ENDED', 'PIN_PICTURE_REFUSED', 'PIN_INVALID', 'MEDIA_TOO_LARGE'].includes(err.code || '') && err.message)
    return err.message;
  if (err.statusCode === 429) return 'That’s a lot at once. Try again in a moment.';
  return 'Couldn’t do that. Try again.';
}

function usePins(moment: Moment) {
  const reread = useRereadSwitch();
  const info = repliesOf(moment);
  const pins = useQuery({
    queryKey: ['reinvented', 'pins', moment.id],
    queryFn: ({ signal }) => get<{ pins: Pin[] }>(`/api/reinvented/moments/${encodeURIComponent(moment.id)}/pins`, {}, { signal }),
    enabled: !!info?.shown && (info.pins > 0 || info.can_reply),
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
  useEffect(() => {
    if (pins.error && isSwitchedOff(pins.error)) void reread();
  }, [pins.error, reread]);
  return pins.data?.pins || [];
}

// One voice plays at a time.
let playing: HTMLAudioElement | null = null;
function hear(pin: Pin) {
  if (!pin.audio_url) return;
  playing?.pause();
  playing = new Audio(pin.audio_url);
  void playing.play().catch(() => {});
}

function PinFace({ pin }: { pin: Pin }) {
  if (pin.kind === 'cutout')
    return pin.checking || !pin.image_url ? (
      <span className="pn-checking">Checking…</span>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- a signed link to the cutout
      <img className="pn-cutout" src={pin.image_url} alt={pin.author?.name ? `${pin.author.name}’s cutout` : 'A cutout'} />
    );
  if (pin.kind === 'voice')
    return (
      <span className="pn-voice">
        <Mic aria-hidden="true" />
        {pin.duration_ms ? `${Math.max(1, Math.round(pin.duration_ms / 1000))}s` : ''}
      </span>
    );
  return isSignal(pin.signal) ? <SignalIcon signal={pin.signal} size={20} /> : <span className="pn-emoji">{pin.emoji}</span>;
}

/** On the picture (inside the viewer's picture box): the pins, and the spot being chosen. */
export default function PinLayer({ moment }: { moment: Moment }) {
  const info = repliesOf(moment);
  const ui = usePinUi(moment.id);
  const list = usePins(moment);
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => () => setUi(moment.id, { dropping: false, spot: null, open: null }), [moment.id]);
  if (!info?.shown) return null;
  return (
    <div ref={layer} className="pn-layer">
      {ui.dropping && !ui.spot && (
        <button
          type="button"
          className="pn-catch"
          aria-label="Choose a spot on the picture for your pin"
          {...stop}
          onClick={(e) => {
            e.stopPropagation();
            const b = layer.current!.getBoundingClientRect();
            setUi(moment.id, {
              spot: { x: Math.round(clamp01((e.clientX - b.left) / b.width) * 1e4) / 1e4, y: Math.round(clamp01((e.clientY - b.top) / b.height) * 1e4) / 1e4 },
            });
          }}
        />
      )}
      {!ui.hidden &&
        list.map((pin) => (
          <button
            key={pin.id}
            type="button"
            className="pn-pin"
            data-kind={pin.kind}
            data-mine={pin.mine || undefined}
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
            aria-label={`${pin.author?.name || 'Someone'}’s ${pin.kind === 'voice' ? 'voice' : pin.kind === 'cutout' ? 'cutout' : 'reaction'}`}
            aria-expanded={ui.open === pin.id}
            {...stop}
            onClick={(e) => {
              e.stopPropagation();
              if (pin.kind === 'voice') hear(pin);
              setUi(moment.id, { open: ui.open === pin.id ? null : pin.id, dropping: false, spot: null });
            }}
          >
            <PinFace pin={pin} />
          </button>
        ))}
      {ui.spot && (
        <span className="pn-spot" style={{ left: `${ui.spot.x * 100}%`, top: `${ui.spot.y * 100}%` }} aria-hidden="true">
          <PinIcon />
        </span>
      )}
    </div>
  );
}

/** Over the viewer's stage, under the replies: hide or show pins, drop one, and the card for a spot or a pin. */
export function PinControls({ moment }: { moment: Moment }) {
  const client = useQueryClient();
  const reread = useRereadSwitch();
  const account = useMe().data?.id;
  const info = repliesOf(moment);
  const ui = usePinUi(moment.id);
  const list = usePins(moment);
  const rec = useRecorder('whisper');
  const [busy, setBusy] = useState(false),
    [reporting, setReporting] = useState(false),
    [error, setError] = useState(''),
    [note, setNote] = useState('');
  if (!info?.shown) return null;
  const key = ['reinvented', 'pins', moment.id];
  const counts = (by: Partial<RepliesInfo>) =>
    client.setQueryData<{ moment: Moment }>(['moments', 'watch', account, moment.id], (old) => {
      const r = old && repliesOf(old.moment);
      return old && r
        ? { ...old, moment: { ...old.moment, replies: { ...r, count: Math.max(0, r.count + (by.count || 0)), pins: Math.max(0, r.pins + (by.pins || 0)) } } as Moment }
        : old;
    });
  async function drop(body: { kind: 'reaction'; signal: string } | { kind: 'voice'; blob: Blob; ms: number }) {
    const spot = ui.spot;
    if (!spot || busy) return;
    setBusy(true);
    setError('');
    try {
      const path = `/api/reinvented/moments/${encodeURIComponent(moment.id)}/pins`;
      let answer: { pin: Pin };
      if (body.kind === 'reaction') answer = await post<{ pin: Pin }>(path, { kind: 'reaction', x: spot.x, y: spot.y, signal: body.signal });
      else {
        const data = new FormData();
        data.append('kind', 'voice');
        data.append('x', String(spot.x));
        data.append('y', String(spot.y));
        data.append('duration_ms', String(Math.max(1, Math.round(body.ms))));
        data.append('file', body.blob, body.blob.type.includes('ogg') ? 'pin.ogg' : 'pin.webm');
        answer = await post<{ pin: Pin }>(path, data, { timeout: 60_000 });
      }
      client.setQueryData<{ pins: Pin[] }>(key, (old) => ({ pins: [...(old?.pins || []), answer.pin] }));
      counts({ count: 1, pins: 1 });
      setUi(moment.id, { dropping: false, spot: null });
      if (ui.hidden) setHidden(false);
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
      setError(errorWords(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(pin: Pin) {
    setError('');
    try {
      await del(`/api/reinvented/moments/${encodeURIComponent(moment.id)}/replies/${encodeURIComponent(pin.id)}`);
      client.setQueryData<{ pins: Pin[] }>(key, (old) => ({ pins: (old?.pins || []).filter((p) => p.id !== pin.id) }));
      void client.invalidateQueries({ queryKey: ['reinvented', 'replies', moment.id] });
      counts({ count: -1, pins: -1 });
      setUi(moment.id, { open: null });
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
      setError(errorWords(e));
    }
  }
  async function report(pin: Pin, reason: string) {
    setError('');
    try {
      await post(`/api/reinvented/moments/${encodeURIComponent(moment.id)}/replies/${encodeURIComponent(pin.id)}/report`, { reason });
      setReporting(false);
      setUi(moment.id, { open: null });
      setNote('Reported. We’ll review it.');
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
      setError(errorWords(e));
    }
  }
  const chosen = list.find((p) => p.id === ui.open) || null;
  const close = () => {
    setUi(moment.id, { dropping: false, spot: null, open: null });
    setReporting(false);
    setError('');
    setNote('');
  };
  return (
    <>
      <div className="pn-bar" {...stop}>
        {info.can_reply && (
          <button
            type="button"
            className="pn-chip"
            aria-pressed={ui.dropping}
            onClick={() => {
              setError('');
              setNote('');
              setUi(moment.id, { dropping: !ui.dropping, spot: null, open: null });
            }}
          >
            <PinIcon aria-hidden="true" />
            {ui.dropping ? 'Cancel' : 'Drop a pin'}
          </button>
        )}
        {list.length > 0 && (
          <button type="button" className="pn-chip" aria-pressed={ui.hidden} onClick={() => setHidden(!ui.hidden)}>
            {ui.hidden ? `Show pins (${list.length})` : 'Hide pins'}
          </button>
        )}
        {ui.dropping && !ui.spot && <span className="pn-hint">Tap a spot on the picture</span>}
      </div>
      {(ui.spot || chosen || error || note) && (
        <section className="pn-card" aria-label={ui.spot ? 'Drop a pin' : 'Pin'} {...stop} onKeyDown={(e) => e.stopPropagation()}>
          <button type="button" className="pn-close" aria-label="Close" onClick={close}>
            <X aria-hidden="true" />
          </button>
          {ui.spot ? (
            <>
              <p className="pn-title">Drop a pin here</p>
              <div className="pn-signals" role="group" aria-label="A reaction">
                {SIGNALS.map((s) => (
                  <button key={s} type="button" disabled={busy} onClick={() => void drop({ kind: 'reaction', signal: s })} aria-label={SIGNAL_WORDS[s]} title={SIGNAL_WORDS[s]}>
                    <SignalIcon signal={s} size={20} />
                  </button>
                ))}
              </div>
              {canRecord() &&
                (rec.state === 'recording' ? (
                  <button type="button" className="pn-button" onClick={() => rec.stop()}>
                    <Square aria-hidden="true" /> Stop
                  </button>
                ) : rec.result ? (
                  <div className="pn-row">
                    <audio src={rec.result.url} controls aria-label="Hear it back" />
                    <button
                      type="button"
                      className="pn-button pn-strong"
                      disabled={busy}
                      onClick={() => rec.result && void drop({ kind: 'voice', blob: rec.result.blob, ms: rec.result.ms })}
                    >
                      {busy ? 'Dropping…' : 'Drop this voice'}
                    </button>
                  </div>
                ) : (
                  <button type="button" className="pn-button" disabled={busy || rec.state === 'asking'} onClick={() => void rec.start()}>
                    <Mic aria-hidden="true" /> A voice bubble (3 seconds)
                  </button>
                ))}
              {rec.error && <p className="pn-error">{rec.error}</p>}
            </>
          ) : chosen ? (
            <>
              <p className="pn-title">
                {chosen.author?.name || 'Someone'}
                {chosen.kind === 'voice' && chosen.text ? `: “${chosen.text}”` : ''}
              </p>
              {reporting ? (
                <div className="pn-reasons" role="group" aria-label="Why are you reporting this pin?">
                  {REASONS.map(([value, label]) => (
                    <button key={value} type="button" onClick={() => void report(chosen, value)}>
                      {label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setReporting(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="pn-row">
                  {chosen.kind === 'voice' && (
                    <button type="button" className="pn-button" onClick={() => hear(chosen)}>
                      Play
                    </button>
                  )}
                  {chosen.can_remove && (
                    <button type="button" className="pn-button" onClick={() => void remove(chosen)}>
                      Remove
                    </button>
                  )}
                  {!chosen.mine && (
                    <button type="button" className="pn-button" onClick={() => setReporting(true)}>
                      Report
                    </button>
                  )}
                </div>
              )}
            </>
          ) : note ? (
            <p className="pn-note" role="status">
              {note}
            </p>
          ) : null}
          {error && (
            <p className="pn-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </>
  );
}
