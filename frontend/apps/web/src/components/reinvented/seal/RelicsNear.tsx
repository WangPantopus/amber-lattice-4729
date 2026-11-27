'use client';

// Relics near you (Pulse, reinvented, phase 3; coord/CONTRACT.md §8g): Moments left to open at a place. Until opened
// they are listed nowhere; a place relic is found only here, near where the reader is now, and opens for a reader who
// stands within 100 m of it, whole for them alone, each time they are there. Only the browser's own position is used
// (never the home), in the body of POST /api/reinvented/seals/near and /seals/:id/open, never in an address, and kept
// only in this page's memory. The section shows only when something is near.

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LocateFixed, Lock, Unlock, X } from 'lucide-react';
import { post } from '@pantopus/api/client';
import type { Author, Moment } from '@pantopus/api/endpoints/moments';
import { MomentFace } from '@/components/moments/MomentFace';
import { colors } from '@/components/moments/momentState';
import { useHere } from '../eyeson/EyesOnNear';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import '../eyeson/eyeson.css';
import './seal.css';

interface Relic {
  id: string;
  author: Author | null;
  left_at: string;
  hint: string | null;
  here: boolean;
}

function day(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The opened relic, whole for this reader while they stand there. */
function Opened({ moment, onClose }: { moment: Moment; onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const src = moment.kind === 'video' ? moment.poster_url : moment.kind === 'photo' ? moment.media_url : null;
  return (
    <div className="sl-open-scrim" data-covers-shell="" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sl-open-box" role="dialog" aria-modal="true" aria-label="An opened relic">
        <header>
          <span>
            <Unlock size={16} aria-hidden="true" /> Opened where it was left
          </span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- the relic's own signed picture
          <img src={src} alt="" />
        ) : (
          <p className="sl-open-text" style={{ background: colors[moment.background || 'teal'] }}>
            {moment.text}
          </p>
        )}
        {moment.caption && <p className="sl-open-caption">{moment.caption}</p>}
        <small>
          Left by {moment.author?.name || 'someone'} · {day(moment.created_at)}
        </small>
      </div>
    </div>
  );
}

export default function RelicsNear({ account, point, offer }: { account: string; point: { latitude: number; longitude: number } | null; offer: boolean }) {
  const reread = useRereadSwitch();
  const { here, finding, find } = useHere(point);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState<Moment | null>(null);
  const near = useQuery({
    queryKey: ['reinvented', 'relics-near', account, here ? Math.round(here.latitude * 1e3) : null, here ? Math.round(here.longitude * 1e3) : null],
    enabled: !!here,
    retry: false,
    staleTime: 60_000,
    queryFn: ({ signal }) => post<{ relics: Relic[] }>('/api/reinvented/seals/near', { latitude: here!.latitude, longitude: here!.longitude }, { signal }),
  });
  useEffect(() => {
    if (isSwitchedOff(near.error)) void reread();
  }, [near.error, reread]);

  async function open(id: string) {
    if (!here || opening) return;
    setOpening(id);
    setError('');
    try {
      const res = await post<{ moment: Moment }>(`/api/reinvented/seals/${encodeURIComponent(id)}/open`, { latitude: here.latitude, longitude: here.longitude });
      setOpened(res.moment);
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
      const code = (e as { code?: string } | null)?.code;
      setError(code === 'SEAL_NOT_HERE' ? 'Stand where it was left to open it.' : 'It couldn’t open. Try again.');
    } finally {
      setOpening(null);
    }
  }

  const relics = near.data?.relics || [];
  if (relics.length)
    return (
      <section className="eo-near" aria-label="Relics near you">
        <h2 className="eo-title">
          <Lock size={15} aria-hidden="true" />
          Relics near you
        </h2>
        <ul className="eo-list">
          {relics.map((r) => (
            <li key={r.id} className="eo-ask">
              {r.author && <MomentFace author={r.author} />}
              <div className="eo-body">
                <strong>{r.author?.name ? `${r.author.name} left something here` : 'Something was left here'}</strong>
                <small>{[r.hint, `left ${day(r.left_at)}`, r.here ? 'you’re there' : 'within 300 m'].filter(Boolean).join(' · ')}</small>
                {r.here ? (
                  <button type="button" className="eo-answer" onClick={() => void open(r.id)} disabled={opening === r.id}>
                    <Unlock size={15} aria-hidden="true" />
                    {opening === r.id ? 'Opening…' : 'Open it'}
                  </button>
                ) : (
                  <small>Walk to where it was left to open it.</small>
                )}
              </div>
            </li>
          ))}
        </ul>
        {error && (
          <small className="hw-error" role="alert">
            {error}
          </small>
        )}
        {opened && <Opened moment={opened} onClose={() => setOpened(null)} />}
      </section>
    );
  if (!offer || here) return null;
  return (
    <section className="eo-near eo-offer" aria-label="Relics near you">
      <p>
        <Lock size={15} aria-hidden="true" />
        <span>Relics near you: Moments left to open where you stand.</span>
      </p>
      <button type="button" className="eo-answer" onClick={find} disabled={finding === 'busy'}>
        <LocateFixed size={15} aria-hidden="true" />
        {finding === 'busy' ? 'Finding you…' : 'Use my location'}
      </button>
      {finding === 'refused' && <small>Your browser didn’t share your location. You can allow it in its settings.</small>}
    </section>
  );
}
