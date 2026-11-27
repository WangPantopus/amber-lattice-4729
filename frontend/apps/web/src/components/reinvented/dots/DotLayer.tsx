'use client';

// Dots over a Moment's picture in the viewer (Pulse, reinvented, phase 2; coord/CONTRACT.md §7c, §7d, §7f). A dot
// sits where its author put it; a tap opens what it holds beside it. A thing's field card always says "Likely", never
// calls a wild plant safe to eat, links its source, and can be kept in the reader's field guide ("Collect") or
// corrected ("Not right?"). The author can remove any of their dots. While a dot is open the viewer holds still.

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookmarkCheck, BookmarkPlus, ExternalLink, Star, Volume2, X } from 'lucide-react';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { useMe } from '@/lib/me';
import { messageOf } from '@/components/moments/momentState';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import { isRouteGone, markServerBehind } from '../serverBehind';
import { cardRefusal, collectCard, correctCard, openCard, removeDot, type Dot, type FieldCard } from './dotTypes';
import './dots.css';

type DotMoment = Moment & { dots?: Dot[] };

// The Moment whose dot is open: the viewer reads it through `holds` on its next tick.
let openOn: string | null = null;

export function holdsForDots(m: Moment): boolean {
  return openOn === m.id;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Drawn as a link only for a web address (http or https); anything else shows as plain words. */
function webUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function Outlink({ url, title }: { url: string; title: string }) {
  const href = webUrl(url);
  const words = (
    <span>
      <strong>{title}</strong>
      <small>{host(url)}</small>
    </span>
  );
  return href ? (
    <a className="dt-link" href={href} target="_blank" rel="noopener noreferrer nofollow">
      {words}
      <ExternalLink aria-hidden="true" />
    </a>
  ) : (
    <div className="dt-link">{words}</div>
  );
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function DotLayer({ moment }: { moment: Moment }) {
  const dots = ((moment as DotMoment).dots || []);
  const account = useMe().data?.id;
  const own = !!account && moment.author?.id === account;
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    openOn = open ? moment.id : null;
    return () => {
      if (openOn === moment.id) openOn = null;
    };
  }, [open, moment.id]);
  if (!dots.length) return null;
  const shown = dots.find((d) => d.id === open) || null;
  return (
    <div
      className="dt-layer"
      // Taps on the dots and their cards stay here: they never step or pause the viewer.
      onPointerDown={(e) => e.target !== e.currentTarget && e.stopPropagation()}
      onPointerUp={(e) => e.target !== e.currentTarget && e.stopPropagation()}
      onClick={(e) => e.target !== e.currentTarget && e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {shown?.kind === 'thing' && (
        <span
          className="dt-box"
          aria-hidden="true"
          style={{ left: `${shown.box.x * 100}%`, top: `${shown.box.y * 100}%`, width: `${shown.box.w * 100}%`, height: `${shown.box.h * 100}%` }}
        />
      )}
      {dots.map((d) => (
        <button
          key={d.id}
          type="button"
          className="dt-dot"
          data-kind={d.kind}
          aria-expanded={open === d.id}
          aria-label={d.kind === 'whisper' ? 'A whisper' : d.kind === 'thing' ? `What is this${d.label ? `: ${d.label}` : ''}?` : d.kind === 'rating' ? `${d.label}: ${d.stars} of 5` : d.kind === 'link' ? d.title || host(d.url) : 'A note'}
          style={{ left: `${clamp01(d.x) * 100}%`, top: `${clamp01(d.y) * 100}%` }}
          onClick={() => setOpen(open === d.id ? null : d.id)}
        />
      ))}
      {shown && (
        <div className="dt-pop" data-side={shown.y > 0.55 ? 'above' : 'below'} style={{ ['--x' as string]: `${clamp01(shown.x) * 100}%`, top: `${clamp01(shown.y) * 100}%` }}>
          <button type="button" className="dt-close" aria-label="Close" onClick={() => setOpen(null)}>
            <X aria-hidden="true" />
          </button>
          <DotBody key={shown.id} moment={moment} dot={shown} />
          {own && <RemoveDot moment={moment} dot={shown} onDone={() => setOpen(null)} />}
        </div>
      )}
    </div>
  );
}

function DotBody({ moment, dot }: { moment: Moment; dot: Dot }) {
  switch (dot.kind) {
    case 'note':
      return <p className="dt-text">{dot.text}</p>;
    case 'rating':
      return (
        <div className="dt-rating">
          <strong>{dot.label}</strong>
          <span aria-label={`${dot.stars} of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} aria-hidden="true" data-on={n <= dot.stars || undefined} />
            ))}
          </span>
        </div>
      );
    case 'link':
      return (
        <Outlink url={dot.url} title={dot.title || host(dot.url)} />
      );
    case 'thing':
      return <Thing moment={moment} dot={dot} />;
    case 'whisper':
      return <Whisper dot={dot} />;
    default:
      return null;
  }
}

function Thing({ moment, dot }: { moment: Moment; dot: Extract<Dot, { kind: 'thing' }> }) {
  const client = useQueryClient();
  const reread = useRereadSwitch();
  const account = useMe().data?.id;
  const [card, setCard] = useState<FieldCard | null>(dot.card),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [fixing, setFixing] = useState(false),
    [name, setName] = useState(''),
    [note, setNote] = useState('');
  const key = ['moments', 'watch', account, moment.id];
  async function run(work: () => Promise<{ card: FieldCard } | unknown>, keepFixing = false) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const answer = (await work()) as { card?: FieldCard } | undefined;
      if (answer?.card) setCard(answer.card);
      if (!keepFixing) setFixing(false);
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (isSwitchedOff(e)) void reread();
      else if (isRouteGone(e) && code !== 'PLAY_NOT_FOUND') markServerBehind();
      else if (code === 'MOMENT_ENDED' || code === 'PLAY_NOT_FOUND') void client.invalidateQueries({ queryKey: key });
      else setError(cardRefusal(code) || messageOf(e, 'Couldn’t do that. Try again.'));
    } finally {
      setBusy(false);
    }
  }
  // Opening a thing reads its card: a kept one shows at once and is read again (no model call) for this reader's own
  // "Collect" and correction, which the Moment's copy doesn't carry; without one, the first tap makes it.
  useEffect(() => {
    void run(() => openCard(moment.id, dot.id));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!card)
    return (
      <div className="dt-card">
        <p className="dt-text">{dot.label ? `Maybe ${dot.label}` : 'Something in the photo'}</p>
        <p className="dt-small" role={error ? 'alert' : 'status'}>
          {error || (busy ? 'Naming it…' : '')}
        </p>
        {error && !busy && !/off for/.test(error) && (
          <button type="button" className="dt-button" onClick={() => void run(() => openCard(moment.id, dot.id))}>
            Try again
          </button>
        )}
      </div>
    );
  return (
    <div className="dt-card">
      {card.name ? (
        <p className="dt-name">
          Likely {card.name}
          {card.scientific && <em> {card.scientific}</em>}
        </p>
      ) : (
        <p className="dt-name">Not sure what this is</p>
      )}
      <p className="dt-text">{card.why}</p>
      {card.caution && <p className="dt-caution">{card.caution}</p>}
      {card.source && (
        <Outlink url={card.source.url} title={card.source.title} />
      )}
      <p className="dt-small">
        Named by {card.named_by}. It can be wrong.
        {card.corrections > 0 && ` ${card.corrections} ${card.corrections === 1 ? 'person says' : 'people say'} it’s something else.`}
      </p>
      {fixing ? (
        <form
          className="dt-fix"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void run(() => correctCard(moment.id, dot.id, name.trim(), note.trim()));
          }}
        >
          <input value={name} maxLength={60} placeholder="What it is" aria-label="What it is" onChange={(e) => setName(e.target.value)} />
          <input value={note} maxLength={140} placeholder="How you know (optional)" aria-label="How you know" onChange={(e) => setNote(e.target.value)} />
          <div className="dt-row">
            <button type="button" className="dt-button dt-quiet" onClick={() => setFixing(false)}>
              Cancel
            </button>
            <button type="submit" className="dt-button" disabled={busy || !name.trim()}>
              Send
            </button>
          </div>
        </form>
      ) : (
        <div className="dt-row">
          {card.name && (
            <button
              type="button"
              className="dt-button"
              aria-pressed={!!card.collected}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (card.collected) {
                    await collectCard(moment.id, dot.id, false);
                    return { card: { ...card, collected: false } };
                  }
                  return collectCard(moment.id, dot.id, true);
                })
              }
            >
              {card.collected ? <BookmarkCheck aria-hidden="true" /> : <BookmarkPlus aria-hidden="true" />}
              {card.collected ? 'In your field guide' : 'Collect'}
            </button>
          )}
          <button
            type="button"
            className="dt-button dt-quiet"
            onClick={() => {
              setName(card.my_correction?.name || '');
              setNote(card.my_correction?.note || '');
              setFixing(true);
            }}
          >
            {card.my_correction ? `You said: ${card.my_correction.name}` : 'Not right?'}
          </button>
        </div>
      )}
      {error && (
        <p className="dt-small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function RemoveDot({ moment, dot, onDone }: { moment: Moment; dot: Dot; onDone(): void }) {
  const client = useQueryClient();
  const account = useMe().data?.id;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <button
        type="button"
        className="dt-remove"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await removeDot(moment.id, dot.id);
            await client.invalidateQueries({ queryKey: ['moments', 'watch', account, moment.id] });
            onDone();
          } catch (e) {
            setError(messageOf(e, 'Couldn’t remove it. Try again.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        Remove this dot
      </button>
      {error && (
        <p className="dt-small" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** A three-second voice whisper (§7e): played as the dot opens, again on a tap. */
function Whisper({ dot }: { dot: Extract<Dot, { kind: 'whisper' }> }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<'idle' | 'playing' | 'blocked'>('idle');
  const play = () => {
    const el = audio.current;
    if (!el) return;
    el.currentTime = 0;
    el.play().then(
      () => setState('playing'),
      () => setState('blocked'),
    );
  };
  useEffect(() => {
    if (dot.audio_url) play();
  }, [dot.audio_url]);
  if (!dot.audio_url) return <p className="dt-text">A whisper, not ready yet.</p>;
  return (
    <div className="dt-card">
      <audio ref={audio} src={dot.audio_url} preload="auto" onEnded={() => setState('idle')} onPause={() => setState((s) => (s === 'playing' ? 'idle' : s))} />
      <p className="dt-text">A whisper{dot.duration_ms ? ` · ${Math.max(1, Math.round(dot.duration_ms / 1000))} s` : ''}</p>
      <button type="button" className="dt-button" onClick={play}>
        <Volume2 aria-hidden="true" />
        {state === 'playing' ? 'Playing…' : state === 'blocked' ? 'Tap to hear' : 'Hear it again'}
      </button>
    </div>
  );
}
