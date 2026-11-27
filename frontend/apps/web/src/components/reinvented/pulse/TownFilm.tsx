'use client';

// "Tonight in <town>" (Pulse, reinvented, phase 3; coord/CONTRACT.md §8k; board B12): from 8 pm until 4 am, the town's
// film of that day's Moments, only where a town has enough (the server's rule: 8 Moments by 4 people, each shared with
// people nearby, still live or kept by its author). The place is the list's own (the reader's shared point, else their
// home's centre) and goes in the body of POST /api/reinvented/town-film, never an address. The server keeps nothing.
// A tap plays the film in the Moment viewer, oldest first.

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clapperboard, Play } from 'lucide-react';
import { post } from '@pantopus/api/client';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import type { Point } from './listApi';
import './townFilm.css';

interface Film {
  town: string | null;
  date: string;
  count: number;
  people: number;
  moments: Moment[];
}

// The label the server gives a place it can't name (momentPlace's FALLBACK_LABEL): then the card says "around you".
const UNNAMED = 'Nearby';

export default function TownFilm({ account, place, onPlay }: { account: string; place: Point | null; onPlay(ids: string[], start: string): void }) {
  const reread = useRereadSwitch();
  const film = useQuery({
    // About 1 km in the key; the exact point goes only in the body.
    queryKey: ['reinvented', 'town-film', account, place ? Math.round(place.latitude * 100) : null, place ? Math.round(place.longitude * 100) : null],
    enabled: !!place,
    retry: false,
    staleTime: 10 * 60_000,
    // It opens at 8 pm: a page left open finds it then.
    refetchInterval: 15 * 60_000,
    queryFn: ({ signal }) => post<{ film: Film | null }>('/api/reinvented/town-film', { latitude: place!.latitude, longitude: place!.longitude }, { signal }),
  });
  useEffect(() => {
    if (isSwitchedOff(film.error)) void reread();
  }, [film.error, reread]);

  const f = film.data?.film;
  const ids = f?.moments.map((m) => m.id) || [];
  if (!f || !ids.length) return null;
  const town = f.town && f.town !== UNNAMED ? f.town : null;
  const cover = f.moments.map((m) => (m.kind === 'video' ? m.poster_url : m.kind === 'photo' ? m.media_url : null)).find(Boolean);
  const title = town ? `Tonight in ${town}` : 'Tonight around you';
  return (
    <button type="button" className="tf-card" onClick={() => onPlay(ids, ids[0])} aria-label={`${title}: play ${f.count} Moments from today`}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- a signed picture of the film's first Moment
        <img src={cover} alt="" />
      ) : (
        <span className="tf-cover" aria-hidden="true">
          <Clapperboard size={22} />
        </span>
      )}
      <span className="tf-words">
        <strong>{title}</strong>
        <small>
          {f.count} Moments by {f.people} people today
        </small>
      </span>
      <span className="tf-play" aria-hidden="true">
        <Play size={18} fill="currentColor" />
      </span>
    </button>
  );
}
