'use client';

// Curiosity constellations near you (Pulse, reinvented, phase 4; coord/CONTRACT.md §9c; DESIGN "Atlas"): nearby Retake
// challenges, sky archives, field specimens and solved local answers, each newest first, only what the reader may
// already open. The place is the list's own (the reader's shared point, else their home's centre). It goes in the body of
// POST /api/reinvented/constellations, never an address, and the server keeps nothing. Shown in My Atlas.

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Camera, CheckCircle2, MapPin, Sunset } from 'lucide-react';
import { post } from '@pantopus/api/client';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import type { Point } from './listApi';
import './places.css';

interface At extends Point {
  id: string;
  at?: string;
}
interface Retake extends At {
  title: string;
  frames: number;
}
interface Sky extends At {
  kind: string;
  title: string;
  pieces: number;
  day?: string;
}
interface Specimen extends At {
  type: 'moment' | 'post';
  names: string[];
}
interface Answer extends At {
  question: string;
  answers: number;
}
interface Answered {
  retakes: Retake[];
  skies: Sky[];
  specimens: Specimen[];
  answers: Answer[];
}

export interface ConstellationActions {
  onRetake(id: string): void;
  onSky(id: string): void;
  onMoment(id: string): void;
  onPost(id: string): void;
  onPlace(p: Point): void;
}

function Row({ icon, title, meta, onOpen, point, onPlace }: { icon: React.ReactNode; title: string; meta: string; onOpen(): void; point: Point; onPlace(p: Point): void }) {
  return (
    <li className="cs-item">
      <button type="button" className="cs-open" onClick={onOpen}>
        <span className="cs-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="cs-words">
          <strong>{title}</strong>
          <small>{meta}</small>
        </span>
      </button>
      <button type="button" className="cs-pin" aria-label="Show it on the map" onClick={() => onPlace(point)}>
        <MapPin size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

const pt = (a: At): Point => ({ latitude: a.latitude, longitude: a.longitude });
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export default function Constellations({ account, place, ...act }: { account: string; place: Point | null } & ConstellationActions) {
  const reread = useRereadSwitch();
  const near = useQuery({
    // About 1 km in the key; the exact point goes only in the body.
    queryKey: ['reinvented', 'constellations', account, place ? Math.round(place.latitude * 100) : null, place ? Math.round(place.longitude * 100) : null],
    enabled: !!place,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => post<Answered>('/api/reinvented/constellations', { latitude: place!.latitude, longitude: place!.longitude }, { signal }),
  });
  useEffect(() => {
    if (isSwitchedOff(near.error)) void reread();
  }, [near.error, reread]);
  const d = near.data;
  if (!d) return null;
  const total = d.retakes.length + d.skies.length + d.specimens.length + d.answers.length;
  if (!total) return null;
  return (
    <section className="cs-near" aria-labelledby="cs-near-title">
      <h2 id="cs-near-title">Curious things near you</h2>
      {d.retakes.length > 0 && (
        <div className="cs-group">
          <h3>Retake challenges</h3>
          <ul>
            {d.retakes.map((r) => (
              <Row key={r.id} icon={<Camera size={16} />} title={r.title} meta={`Stand where they stood · ${n(r.frames, 'frame', 'frames')}`} onOpen={() => act.onRetake(r.id)} point={pt(r)} onPlace={act.onPlace} />
            ))}
          </ul>
        </div>
      )}
      {d.skies.length > 0 && (
        <div className="cs-group">
          <h3>Sky archives</h3>
          <ul>
            {d.skies.map((s) => (
              <Row key={s.id} icon={<Sunset size={16} />} title={s.title} meta={[n(s.pieces, 'piece', 'pieces'), s.day].filter(Boolean).join(' · ')} onOpen={() => act.onSky(s.id)} point={pt(s)} onPlace={act.onPlace} />
            ))}
          </ul>
        </div>
      )}
      {d.specimens.length > 0 && (
        <div className="cs-group">
          <h3>Field specimens</h3>
          <ul>
            {d.specimens.map((s) => (
              <Row
                key={`${s.type}:${s.id}`}
                icon={<BookOpen size={16} />}
                title={s.names.slice(0, 3).join(', ') || 'A field card'}
                meta={s.type === 'moment' ? 'On a Moment' : 'On a post'}
                onOpen={() => (s.type === 'moment' ? act.onMoment(s.id) : act.onPost(s.id))}
                point={pt(s)}
                onPlace={act.onPlace}
              />
            ))}
          </ul>
        </div>
      )}
      {d.answers.length > 0 && (
        <div className="cs-group">
          <h3>Answered nearby</h3>
          <ul>
            {d.answers.map((a) => (
              <Row key={a.id} icon={<CheckCircle2 size={16} />} title={a.question} meta={n(a.answers, 'answer', 'answers')} onOpen={() => act.onPost(a.id)} point={pt(a)} onPlace={act.onPlace} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
