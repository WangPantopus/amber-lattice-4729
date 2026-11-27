'use client';

// The cabinet profile (Pulse, reinvented, phase 4; coord/CONTRACT.md §9d; board B8; DESIGN "a cabinet of curiosities"):
// places stood, heights climbed, field specimens collected, questions helped, strands sparked and canvases added to.
// Numbers about what a person did, never who follows them: no follower count and no view count, anywhere. The server
// decides who may read it: the person themself, and the people they know unless they turned it off. Anyone else gets
// 404, and this draws nothing. With the switch off the server answers 403, and nothing is drawn either.

import { useQuery } from '@tanstack/react-query';
import { BookOpen, Footprints, HandHelping, Image as ImageIcon, Mountain, Sparkles } from 'lucide-react';
import { get } from '@pantopus/api/client';
import type { Author } from '@pantopus/api/endpoints/moments';
import { useKnownOn } from '../pulse/useReinventedOn';
import './cabinet.css';

export interface Numbers {
  places_stood: number;
  highest_ft: number | null;
  specimens: number;
  questions_helped: number;
  strands_sparked: number;
  canvases: number;
}
interface CabinetAnswer extends Numbers {
  user: Author;
  since: string | null;
  shown_to?: string;
}

/** The six shelves, from a person's numbers; a shelf with nothing on it is left out. */
export function Shelves({ numbers }: { numbers: Numbers }) {
  const shelves = [
    numbers.places_stood > 0 && { icon: <Footprints size={18} />, big: numbers.places_stood.toLocaleString('en-US'), words: numbers.places_stood === 1 ? 'place stood' : 'places stood' },
    numbers.highest_ft != null && { icon: <Mountain size={18} />, big: `${numbers.highest_ft.toLocaleString('en-US')} ft`, words: 'highest shown' },
    numbers.specimens > 0 && { icon: <BookOpen size={18} />, big: numbers.specimens.toLocaleString('en-US'), words: numbers.specimens === 1 ? 'field specimen' : 'field specimens' },
    numbers.questions_helped > 0 && { icon: <HandHelping size={18} />, big: numbers.questions_helped.toLocaleString('en-US'), words: numbers.questions_helped === 1 ? 'question helped' : 'questions helped' },
    numbers.strands_sparked > 0 && { icon: <Sparkles size={18} />, big: numbers.strands_sparked.toLocaleString('en-US'), words: numbers.strands_sparked === 1 ? 'strand sparked' : 'strands sparked' },
    numbers.canvases > 0 && { icon: <ImageIcon size={18} />, big: numbers.canvases.toLocaleString('en-US'), words: numbers.canvases === 1 ? 'canvas added to' : 'canvases added to' },
  ].filter(Boolean) as { icon: React.ReactNode; big: string; words: string }[];
  if (!shelves.length) return <p className="cb-empty">Nothing on the shelves yet. Moments, answers and Retakes fill them.</p>;
  return (
    <ul className="cb-shelves">
      {shelves.map((s) => (
        <li key={s.words}>
          <span className="cb-icon" aria-hidden="true">
            {s.icon}
          </span>
          <strong>{s.big}</strong>
          <small>{s.words}</small>
        </li>
      ))}
    </ul>
  );
}

function sinceWords(day: string | null) {
  if (!day) return null;
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : `Since ${d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`;
}

interface Props {
  personId: string;
  /** The signed-in reader; null when signed out. */
  viewerId: string | null;
  enabled?: boolean;
  own?: boolean;
}

/**
 * A person's cabinet, for their profile or the reader's own Atlas. Nothing at all unless the server lets the reader see
 * it. When it may not show (signed out, blocked, a preview) nothing of it runs, not even a hook, so a public profile
 * sends exactly what it sends today.
 */
export default function Cabinet(props: Props) {
  if (props.enabled === false || !props.personId || !props.viewerId) return null;
  return <CabinetShown {...props} />;
}

function CabinetShown({ personId, viewerId, own = false }: Props) {
  // Only while the switch is on for the reader, as this device knows it: no switch read and no "my profile" of its own.
  const on = useKnownOn(viewerId);
  const cabinet = useQuery({
    queryKey: ['reinvented', 'cabinet', personId],
    enabled: on,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => get<{ cabinet: CabinetAnswer }>(`/api/reinvented/cabinet/${encodeURIComponent(personId)}`, {}, { signal }),
  });
  const c = cabinet.data?.cabinet;
  if (!c) return null;
  const since = sinceWords(c.since);
  return (
    <section className="cb-cabinet" aria-labelledby={`cb-${personId}`}>
      <header>
        <h2 id={`cb-${personId}`}>{own ? 'Your cabinet' : `${c.user.first_name || c.user.name}’s cabinet`}</h2>
        {since && <small>{since}</small>}
      </header>
      <Shelves numbers={c} />
      {own && (
        <p className="cb-note">
          {c.shown_to === 'people_you_know' ? 'People you know can see your cabinet. You can turn that off in Settings.' : 'Only you see your cabinet.'}
        </p>
      )}
    </section>
  );
}

