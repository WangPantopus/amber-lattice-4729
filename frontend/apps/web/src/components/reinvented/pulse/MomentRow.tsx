'use client';

// A Moment that fades, in the one Pulse list (phase 1, board B1): borderless and full width, with its time left. The
// picture is cut to a square around its stamps, so the stamps its author placed stay on the part one sees.

import type { KeyboardEvent } from 'react';
import { MapPin } from 'lucide-react';
import { MomentFace } from '@/components/moments/MomentFace';
import { colors } from '@/components/moments/momentState';
import StampLayer from '../stamps/StampLayer';
import BeforeAfter, { beforeAfterOf } from '../play/BeforeAfter';
import type { PlayItem } from '../play/playTypes';
import type { StampKind } from '../stamps/stampTypes';
import { isSignal, SIGNAL_WORDS, SignalIcon } from '../viewer/signals';
import { isLiveHere, timeLeft, type ListMoment, type Point } from './listApi';

interface Props {
  moment: ListMoment;
  bandLabel: string | null;
  now: number;
  onOpen(id: string): void;
  onPlace(point: Point): void;
  /** Kept by its author ("Keep this?"): it stays, so no time left is drawn. */
  kept?: boolean;
  /** The first of a step deck's steps in the list: how many steps the deck has (§7g). */
  steps?: number;
}

/** Width over height of the picture as the server sized it (one half of a before and after); 9:16 when unknown. */
function aspectOf(m: ListMoment, paired: boolean): number {
  if (m.kind === 'text') return 9 / 16;
  return m.width && m.height && m.width > 0 && m.height > 0 ? m.width / m.height / (paired ? 2 : 1) : 9 / 16;
}

export default function MomentRow({ moment: m, bandLabel, now, onOpen, onPlace, kept = false, steps }: Props) {
  // A before and after shows both halves, split in the middle; the viewer lets the reader move the curtain.
  const pair = m.kind === 'photo' && m.media_url ? beforeAfterOf((m as ListMoment & { play?: PlayItem[] }).play) : null;
  const aspect = aspectOf(m, !!pair);
  // A tall picture shows a square of itself; a wide one shows whole.
  const shown = Math.min(1, aspect);
  const stamps = m.stamps || [];
  let centre = 0.5;
  if (stamps.length && shown < 1) {
    const ys = stamps.map((s) => s.y);
    centre = Math.min(1 - shown / 2, Math.max(shown / 2, (Math.min(...ys) + Math.max(...ys)) / 2));
  }
  const values = new Map<StampKind, unknown>(stamps.map((s) => [s.kind, s.value]));
  const live = isLiveHere(m, now);
  const left = kept ? null : timeLeft(m.expires_at, now);
  const point = !m.no_location && m.latitude != null && m.longitude != null ? { latitude: m.latitude, longitude: m.longitude } : null;
  const where = [m.place_label, bandLabel].filter(Boolean).join(' · ');
  const picture = m.kind === 'video' ? m.poster_url : m.media_url;
  const mine = isSignal(m.my_signal) ? m.my_signal : null;
  const counts = (m.signal_counts || []).filter((s) => isSignal(s.signal) && s.count > 0).slice(0, 3);
  const open = () => onOpen(m.id);
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };
  return (
    <article className="rp-moment" aria-label={`${m.author.name}’s Moment${left ? `, ${left}` : ''}`}>
      <div className="rp-moment-window" role="button" tabIndex={0} onClick={open} onKeyDown={onKey} style={{ aspectRatio: String(Math.max(1, aspect)) }}>
        <div
          className="rp-moment-picture"
          style={{
            aspectRatio: String(aspect),
            transform: `translateY(${-(centre - shown / 2) * 100}%)`,
            background: m.kind === 'text' ? colors[m.background || 'teal'] : undefined,
          }}
        >
          {m.kind === 'text' ? (
            <p className="rp-moment-text">{m.text}</p>
          ) : pair && picture ? (
            <BeforeAfter src={picture} item={pair} still />
          ) : picture ? (
            <img src={picture} alt={m.caption || `${m.author.name}’s ${m.kind === 'video' ? 'video' : 'photo'}`} loading="lazy" />
          ) : null}
          {stamps.length > 0 && (
            <div className="rp-moment-stamps">
              <StampLayer stamps={stamps} valueOf={(k) => values.get(k) ?? null} ink={live ? 'wet' : 'dry'} />
            </div>
          )}
        </div>
        <div className="rp-moment-who">
          <MomentFace author={m.author} />
          <span className="rp-moment-who-words">
            <strong>{m.author.name}</strong>
            {where && <span>{where}</span>}
          </span>
        </div>
        {steps && steps > 1 ? <span className="rp-moment-steps">{steps} steps</span> : null}
        {left && (
          <span className={`rp-moment-left${live ? ' rp-live' : ''}`}>
            {live && <span className="rp-live-dot" aria-hidden />}
            {live ? `Live · ${left}` : left}
          </span>
        )}
      </div>
      {(m.caption || mine || counts.length > 0 || point) && (
        <div className="rp-moment-foot">
          {m.caption && <p className="rp-moment-caption">{m.caption}</p>}
          <div className="rp-moment-actions">
            {counts.map((s) => (
              <span key={s.signal} className="rp-signal-count">
                <SignalIcon signal={s.signal as Parameters<typeof SignalIcon>[0]['signal']} />
                {SIGNAL_WORDS[s.signal as keyof typeof SIGNAL_WORDS]} {s.count}
              </span>
            ))}
            {mine && (
              <span className="rp-signal-count rp-signal-mine">
                <SignalIcon signal={mine} />
                {SIGNAL_WORDS[mine]}
              </span>
            )}
            {point && (
              <button type="button" className="rp-place-button" onClick={() => onPlace(point)} aria-label={`Show ${m.place_label || 'this place'} on the map`}>
                <MapPin size={15} aria-hidden />
                On the map
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
