'use client';

// Finding guess-the-spot Moments (Pulse, reinvented, step 8; coord/CONTRACT.md §5d): the map answer's `guess_spots`
// as a list for the area in view, never as marks on the map, and today's spot for the town. `guess_spots` comes only
// to a reader whose switch is on, so for everyone else this draws nothing and asks the server nothing.

import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { get } from '@pantopus/api/client';
import type { Author, Kind, MapResult, Point } from '@pantopus/api/endpoints/moments';
import { timeAgo } from '@/components/moments/momentState';
import { useBackWhenMissing } from '../serverBehind';
import './spots.css';

interface Spot {
  moment_id: string;
  author: Author;
  kind: Kind;
  thumb_url: string | null;
  created_at: string;
  expires_at: string;
  guessed: boolean;
  daily: boolean;
}
interface Daily {
  moment_id: string;
  town: string | null;
  day: string;
  guessed: boolean;
}

export default function GuessSpots({
  result,
  center,
  onOpen,
}: {
  result: MapResult | undefined;
  center: Point;
  onOpen(ids: string[], opener: HTMLButtonElement, start?: string): void;
}) {
  const spots = (result as (MapResult & { guess_spots?: Spot[] }) | undefined)?.guess_spots;
  const on = Array.isArray(spots);
  // Today's spot for the town around the map's middle (one per town per day, the same for everyone).
  const lat = Math.round(center.latitude * 100) / 100,
    lng = Math.round(center.longitude * 100) / 100;
  const daily = useQuery({
    queryKey: ['moments', 'daily-spot', lat, lng],
    enabled: on,
    queryFn: ({ signal }) => get<{ daily_spot: Daily | null }>('/api/moments/daily-spot', { latitude: lat, longitude: lng }, { signal }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  // An older server has no today's spot (it reads the path as one Moment's id and answers 404).
  useBackWhenMissing(daily.error);
  if (!on) return null;
  const today = daily.data?.daily_spot || null;
  const list = [...spots].sort((a, b) => Number(b.daily) - Number(a.daily));
  const todayElsewhere = today && !list.some((s) => s.moment_id === today.moment_id) ? today : null;
  if (!list.length && !todayElsewhere) return null;
  const ids = [...(todayElsewhere ? [todayElsewhere.moment_id] : []), ...list.map((s) => s.moment_id)];
  return (
    <section className="mo-people gs-list" aria-label="Guess the spot">
      <div className="mo-list-heading">
        <h3>Guess the spot</h3>
      </div>
      {todayElsewhere && (
        <button className="mo-person" onClick={(e) => onOpen(ids, e.currentTarget, todayElsewhere.moment_id)}>
          <span className="gs-thumb" aria-hidden="true">
            <MapPin size={18} />
          </span>
          <span>
            <strong>Today&apos;s spot{todayElsewhere.town ? ` · ${todayElsewhere.town}` : ''}</strong>
            <small>{todayElsewhere.guessed ? 'Guessed' : 'Where is this?'}</small>
          </span>
        </button>
      )}
      {list.map((s) => (
        <button key={s.moment_id} className="mo-person" onClick={(e) => onOpen(ids, e.currentTarget, s.moment_id)}>
          {s.thumb_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- the Moment's own signed thumbnail
            <img className="gs-thumb" src={s.thumb_url} alt="" />
          ) : (
            <span className="gs-thumb" aria-hidden="true">
              <MapPin size={18} />
            </span>
          )}
          <span>
            <strong>{s.daily ? "Today's spot" : 'Where is this?'}</strong>
            <small>
              {[s.author.name, timeAgo(s.created_at), s.guessed ? 'Guessed' : ''].filter(Boolean).join(' · ')}
            </small>
          </span>
        </button>
      ))}
    </section>
  );
}
