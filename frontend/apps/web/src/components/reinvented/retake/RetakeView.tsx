'use client';

// Retake (Pulse, reinvented, phase 3; coord/CONTRACT.md §8e; board B13): stand where someone stood. A Retake is its first
// Moment and the frames people added from the same spot; it stays. Here a reader drags through the frames by date and
// season, and, standing there, adds their own (the Studio shows the first picture as a ghost to line up with).

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@pantopus/api/client';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { MomentFace } from '@/components/moments/MomentFace';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import './retake.css';

type Person = Moment['author'];

/** A Moment's Retake as the server answers it (switch on), or null. */
export interface RetakeInfo {
  start_id: string;
  title: string;
  started_by: Person;
  started_at: string;
  frames: number;
  people: number;
  is_start: boolean;
}
export function retakeOf(m: Moment | null | undefined): RetakeInfo | null {
  const r = (m as (Moment & { retake?: RetakeInfo | null }) | null | undefined)?.retake;
  return r && typeof r.start_id === 'string' ? r : null;
}

export interface RetakeFrame {
  id: string;
  author: Person;
  at: string;
  date_label: string;
  weather: string | null;
  season: 'winter' | 'spring' | 'summer' | 'fall';
  thumb_url: string | null;
  media_url: string | null;
}

interface Retake {
  start_id: string;
  title: string;
  place_label: string | null;
  started_by: Person;
  started_at: string;
  frames: RetakeFrame[];
  want_to_go: number;
  can_add: boolean;
}

const SEASON: Record<RetakeFrame['season'], string> = { winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' };

export function useRetake(id: string | null) {
  return useQuery({
    queryKey: ['reinvented', 'retake', id],
    queryFn: ({ signal }) => get<{ retake: Retake }>(`/api/reinvented/retakes/${encodeURIComponent(id!)}`, {}, { signal }),
    enabled: !!id,
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
}

/** Over Pulse: the Retake's frames, oldest first, dragged through with one slider; "Add your frame" where allowed. */
export default function RetakeView({
  id,
  onClose,
  onAdd,
}: {
  id: string;
  onClose(): void;
  onAdd(start: { id: string; title: string; ghost: string | null }): void;
}) {
  const reread = useRereadSwitch();
  const retake = useRetake(id);
  useEffect(() => {
    if (retake.error && isSwitchedOff(retake.error)) void reread();
  }, [retake.error, reread]);
  const r = retake.data?.retake;
  const [at, setAt] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    box.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const frames = r?.frames || [];
  const i = Math.min(frames.length - 1, Math.max(0, at ?? frames.length - 1));
  const frame = frames[i];
  return (
    <div className="rt-scrim" data-covers-shell="" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="rt-box" role="dialog" aria-modal="true" aria-label={r ? `Retake: ${r.title}` : 'Retake'} tabIndex={-1}>
        <header className="rt-head">
          <div>
            <p className="rt-kicker">Retake</p>
            <h2>{r?.title || '…'}</h2>
            {r && (
              <p className="rt-sub">
                {[r.place_label, `started by ${r.started_by?.name || 'someone'}`, `${frames.length} ${frames.length === 1 ? 'frame' : 'frames'}`].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <button type="button" className="rt-close" aria-label="Close" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        {retake.isPending ? (
          <p className="rt-note">Loading…</p>
        ) : retake.isError ? (
          <p className="rt-note">This Retake couldn’t load.</p>
        ) : frame ? (
          <>
            <div className="rt-frame">
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed picture of the frame */}
              {frame.media_url || frame.thumb_url ? <img src={frame.media_url || frame.thumb_url || ''} alt={`${frame.date_label}, ${frame.author?.name || 'someone'}`} /> : null}
              <span className="rt-tag">
                {frame.date_label} · {SEASON[frame.season] || frame.season}
                {frame.weather ? ` · ${frame.weather}` : ''}
              </span>
            </div>
            <div className="rt-by">
              <MomentFace author={frame.author} />
              <span>
                <strong>{frame.author?.name}</strong> {i === 0 ? 'took the first picture' : 'stood here too'}
              </span>
            </div>
            {frames.length > 1 && (
              <label className="rt-scrub">
                <span>
                  Frame {i + 1} of {frames.length}
                </span>
                <input
                  type="range"
                  min={0}
                  max={frames.length - 1}
                  step={1}
                  value={i}
                  onChange={(e) => setAt(Number(e.target.value))}
                  aria-valuetext={`${frames[i].date_label}, ${SEASON[frames[i].season] || frames[i].season}`}
                />
                <span className="rt-ends" aria-hidden="true">
                  <span>{frames[0].date_label}</span>
                  <span>{frames[frames.length - 1].date_label}</span>
                </span>
              </label>
            )}
            <div className="rt-actions">
              {r!.want_to_go > 0 && <span className="rt-note">{r!.want_to_go} want to go</span>}
              {r!.can_add ? (
                <button
                  type="button"
                  className="rt-add"
                  onClick={() => onAdd({ id: r!.start_id, title: r!.title, ghost: frames[0]?.media_url || frames[0]?.thumb_url || null })}
                >
                  Add your frame
                </button>
              ) : (
                <span className="rt-note">Stand where the first picture was taken to add a frame.</span>
              )}
            </div>
          </>
        ) : (
          <p className="rt-note">No frames you can see yet.</p>
        )}
      </div>
    </div>
  );
}
