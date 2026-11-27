'use client';

// The crowd freeze (Pulse, reinvented, phase 3; coord/CONTRACT.md §8i): one scene taken from many phones at one time.
// The server finds the other Live photos and videos taken within a minute and 150 m (shared with people nearby, that
// this reader may see; three at least), ordered around the scene, and the reader scrubs around it. Nothing is stored.

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@pantopus/api/client';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { isSwitchedOff } from '../switchOff';
import './crowd.css';

export function useCrowd(id: string | null) {
  return useQuery({
    queryKey: ['reinvented', 'crowd', id],
    queryFn: ({ signal }) => get<{ crowd: { center: string; moments: Moment[] } | null }>(`/api/reinvented/crowd/${encodeURIComponent(id!)}`, {}, { signal }),
    enabled: !!id,
    staleTime: 5 * 60_000,
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
}

/** Over the screen: the scene from every phone, one slider around it. */
export default function CrowdView({ id, onClose }: { id: string; onClose(): void }) {
  const crowd = useCrowd(id);
  const moments = crowd.data?.crowd?.moments || [];
  const [at, setAt] = useState<number | null>(null);
  const i = Math.max(0, Math.min(moments.length - 1, at ?? Math.max(0, moments.findIndex((m) => m.id === (crowd.data?.crowd?.center || id)))));
  const m = moments[i];
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey, true);
    box.current?.focus();
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const src = m ? (m.kind === 'video' ? m.poster_url : m.media_url) : null;
  return (
    <div
      className="cw-scrim"
      data-covers-shell=""
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={box} className="cw-box" role="dialog" aria-modal="true" aria-label="The scene from every phone" tabIndex={-1}>
        <header className="cw-head">
          <div>
            <h2>The scene from {moments.length || '…'} phones</h2>
            <p className="cw-sub">Taken within a minute of each other, around one place.</p>
          </div>
          <button type="button" className="cw-close" aria-label="Close" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        {crowd.isPending ? (
          <p className="cw-sub">Loading…</p>
        ) : !m ? (
          <p className="cw-sub">Not enough phones caught this scene.</p>
        ) : (
          <>
            <div className="cw-frame">
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed picture of the Moment */}
              {src ? <img src={src} alt={m.caption || `${m.author?.name || 'Someone'}’s view`} /> : null}
              <span className="cw-tag">
                {m.author?.name} · {new Date(m.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <label className="cw-scrub">
              <span>Walk around it</span>
              <input type="range" min={0} max={moments.length - 1} step={1} value={i} onChange={(e) => setAt(Number(e.target.value))} aria-valuetext={`${m.author?.name}’s view`} />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

/** Over a photo or video Moment in the viewer: "Seen from 4 phones" when others caught the same scene. */
export function CrowdChip({ moment }: { moment: Moment }) {
  const [open, setOpen] = useState(false);
  const crowd = useCrowd(moment.kind === 'photo' || moment.kind === 'video' ? moment.id : null);
  const n = crowd.data?.crowd?.moments?.length || 0;
  if (n < 3) return null;
  return (
    <>
      <button
        type="button"
        className="cw-chip"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        Seen from {n} phones
      </button>
      {open && <CrowdView id={moment.id} onClose={() => setOpen(false)} />}
    </>
  );
}
