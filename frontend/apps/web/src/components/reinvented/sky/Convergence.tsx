'use client';

// Convergences and the sky strip (Pulse, reinvented, phase 3; coord/CONTRACT.md §8h; board B14). Rarely, when the real
// world earns it (a sunset several people photographed, a first snow), a 15-minute window opens and the Live photos
// whose authors chose to join become one kept piece; each sunset leaves one band of colour in the place's sky strip.
// Never invented: the server decides by its stated rules.

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@pantopus/api/client';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import './sky.css';

export interface ConvergenceInfo {
  id: string;
  kind: 'sunset' | 'first_snow';
  title?: string;
  open?: boolean;
}
export function convergenceOf(m: Moment | null | undefined): ConvergenceInfo | null {
  const c = (m as (Moment & { convergence?: ConvergenceInfo | null }) | null | undefined)?.convergence;
  return c && typeof c.id === 'string' ? c : null;
}
export const convergenceTitle = (c: ConvergenceInfo) => c.title || (c.kind === 'first_snow' ? 'First snow' : 'Tonight’s sky');

interface Piece {
  id: string;
  kind: 'sunset' | 'first_snow';
  title: string;
  opened_at: string;
  closes_at: string;
  open: boolean;
  moments: Moment[];
  bands: string[];
}
interface SkyDays {
  days: { date: string; bands: string[]; count: number }[];
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Over Pulse: the piece's photos, oldest first, its bands, and (for a sunset) the place's sky strip of 30 days. */
export default function ConvergenceView({ id, onClose }: { id: string; onClose(): void }) {
  const reread = useRereadSwitch();
  const piece = useQuery({
    queryKey: ['reinvented', 'convergence', id],
    queryFn: ({ signal }) => get<{ convergence: Piece }>(`/api/reinvented/convergences/${encodeURIComponent(id)}`, {}, { signal }),
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
  const sunset = id.startsWith('sunset:');
  const strip = useQuery({
    queryKey: ['reinvented', 'sky-strip', id],
    queryFn: ({ signal }) => get<SkyDays>('/api/reinvented/strip/sky', { cell: id, days: 30 }, { signal }),
    enabled: sunset,
    retry: false,
  });
  useEffect(() => {
    if (piece.error && isSwitchedOff(piece.error)) void reread();
  }, [piece.error, reread]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    box.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const c = piece.data?.convergence;
  return (
    <div className="sk-scrim" data-covers-shell="" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="sk-box" role="dialog" aria-modal="true" aria-label={c?.title || 'Convergence'} tabIndex={-1}>
        <header className="sk-head">
          <div>
            <h2>{c?.title || '…'}</h2>
            {c && (
              <p className="sk-sub">
                {c.open ? `Open now · until ${hhmm(c.closes_at)}` : `${hhmm(c.opened_at)} to ${hhmm(c.closes_at)}`} · {c.moments.length}{' '}
                {c.moments.length === 1 ? 'photo' : 'photos'}
              </p>
            )}
          </div>
          <button type="button" className="sk-close" aria-label="Close" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        {piece.isPending ? (
          <p className="sk-note">Loading…</p>
        ) : piece.isError ? (
          <p className="sk-note">This couldn’t load.</p>
        ) : c ? (
          <>
            {c.bands.length > 0 && (
              <div className="sk-bands" aria-label="The colours of its sky">
                {c.bands.map((b, i) => (
                  <span key={i} style={{ background: b }} />
                ))}
              </div>
            )}
            <div className="sk-grid">
              {c.moments.map((m) => {
                const src = m.kind === 'video' ? m.poster_url : m.media_url;
                return (
                  <figure key={m.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a signed picture of the Moment */}
                    {src ? <img src={src} alt={m.caption || `${m.author?.name || 'Someone'}’s photo`} loading="lazy" /> : <span className="sk-empty" />}
                    <figcaption>{m.author?.name}</figcaption>
                  </figure>
                );
              })}
            </div>
            <p className="sk-note">Never made up: it opens only when several people take Live photos of the real sky here.</p>
            {sunset && !!strip.data?.days.length && (
              <section className="sk-strip" aria-label="The sky strip, 30 days">
                <h3>This place’s sunsets</h3>
                {strip.data.days.map((d) => (
                  <div key={d.date} className="sk-day">
                    <span>{new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    <span className="sk-day-bands">
                      {d.bands.map((b, i) => (
                        <i key={i} style={{ background: b }} />
                      ))}
                    </span>
                  </div>
                ))}
              </section>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
