'use client';

// "Eyes on near you" (Pulse, reinvented, phase 3; coord/CONTRACT.md §8f): the open Eyes-on Asks near where the reader is
// now, each answerable with a Live photo taken there. Only the browser's own position is used, never the home and never
// the list's place. It goes in the body of POST /api/reinvented/eyes-on/near, never in an address, and is kept only in
// this page's memory. The section shows only when something is open nearby. Without a position it is offered only on
// the Ask chip, by the reader's own tap.

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, Eye, LocateFixed } from 'lucide-react';
import { post } from '@pantopus/api/client';
import type { Author } from '@pantopus/api/endpoints/moments';
import { MomentFace } from '@/components/moments/MomentFace';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import './eyeson.css';

/** One open Ask near the reader, as the server answers it. */
export interface NearAsk {
  id: string;
  question: string;
  place: string | null;
  author: Author | null;
  at: string;
  until: string;
  answers: number;
}

type Here = { latitude: number; longitude: number };
type Finding = 'idle' | 'busy' | 'refused';

/** The browser's position: read quietly only when the reader already allowed it, otherwise on their tap. */
export function useHere(given: Here | null) {
  const [here, setHere] = useState<Here | null>(null);
  const [finding, setFinding] = useState<Finding>('idle');
  const find = useCallback(() => {
    if (!navigator.geolocation) return setFinding('refused');
    setFinding('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setFinding('idle');
      },
      () => setFinding('refused'),
      { maximumAge: 5 * 60_000, timeout: 15_000 },
    );
  }, []);
  useEffect(() => {
    if (given || !navigator.permissions?.query) return undefined;
    let gone = false;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        if (!gone && p.state === 'granted') find();
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [given, find]);
  return { here: given ?? here, finding, find };
}

function until(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function EyesOnNear({
  account,
  point,
  offer,
  now,
  onAnswer,
}: {
  account: string;
  /** The position the reader already shared for the list ("Use my location"), if any. */
  point: Here | null;
  /** On the Ask chip: offer to look when there is no position yet. */
  offer: boolean;
  now: number;
  onAnswer(ask: { id: string; question: string }): void;
}) {
  const reread = useRereadSwitch();
  const { here, finding, find } = useHere(point);
  const near = useQuery({
    // About 100 m in the key, so a small move reads the same answer; the exact position goes only in the body.
    queryKey: ['reinvented', 'eyes-on-near', account, here ? Math.round(here.latitude * 1e3) : null, here ? Math.round(here.longitude * 1e3) : null],
    enabled: !!here,
    retry: false,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      post<{ asks: NearAsk[] }>('/api/reinvented/eyes-on/near', { latitude: here!.latitude, longitude: here!.longitude }, { signal }),
  });
  useEffect(() => {
    if (isSwitchedOff(near.error)) void reread();
  }, [near.error, reread]);

  // Others' open questions: one's own Ask isn't one to answer.
  const asks = (near.data?.asks || []).filter((a) => Date.parse(a.until) > now && a.author?.id !== account);
  if (asks.length) {
    return (
      <section className="eo-near" aria-label="Eyes on near you">
        <h2 className="eo-title">
          <Eye size={15} aria-hidden="true" />
          Eyes on near you
        </h2>
        <ul className="eo-list">
          {asks.map((a) => (
            <li key={a.id} className="eo-ask">
              {a.author && <MomentFace author={a.author} />}
              <div className="eo-body">
                <strong>{a.question}</strong>
                <small>
                  {[a.place, a.author?.name, `open until ${until(a.until)}`, a.answers ? `${a.answers} ${a.answers === 1 ? 'Live answer' : 'Live answers'}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
                <button type="button" className="eo-answer" onClick={() => onAnswer({ id: a.id, question: a.question.slice(0, 80) })}>
                  <Camera size={15} aria-hidden="true" />
                  Answer with a Live photo
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (!offer) return null;
  if (here)
    return near.data ? (
      <section className="eo-near eo-offer" aria-label="Eyes on near you">
        <p>
          <Eye size={15} aria-hidden="true" />
          <span>No open Eyes-on questions near you right now.</span>
        </p>
      </section>
    ) : null;
  return (
    <section className="eo-near eo-offer" aria-label="Eyes on near you">
      <p>
        <Eye size={15} aria-hidden="true" />
        <span>Eyes on near you: questions about places where you are now, for a Live photo from there.</span>
      </p>
      <button type="button" className="eo-answer" onClick={find} disabled={finding === 'busy'}>
        <LocateFixed size={15} aria-hidden="true" />
        {finding === 'busy' ? 'Finding you…' : 'Use my location'}
      </button>
      {finding === 'refused' && <small>Your browser didn’t share your location. You can allow it in its settings.</small>}
    </section>
  );
}
