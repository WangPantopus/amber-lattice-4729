'use client';

// Echoes and curiosity twins (Pulse, reinvented, phase 4; coord/CONTRACT.md §9e; the founder's decision 11): "You and 2
// others caught tonight's sunset at Lacamas Lake." The founder's four rules hold on the server: opt-in, public places
// only, never at home, and names only when both people say yes. Nothing is pushed: the reader sees today's echoes in My
// Atlas, and in the evening in Pulse too. Someone who hasn't chosen to take part sees nothing, and nothing is read.

import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { get } from '@pantopus/api/client';
import './echoes.css';

interface Echo {
  moment_id: string;
  kind: 'sunset' | 'convergence' | 'place';
  place: string | null;
  others: number;
  names: string[];
  line: string;
}
interface Twin {
  card: string;
  count: number;
  others: number;
  names: string[];
  line: string;
}

/** The reader's own `echoes` choice (CONTRACT 9e), read with the other Pulse settings. */
export function useEchoesChoice(enabled: boolean) {
  return useQuery({
    queryKey: ['reinvented', 'settings'],
    queryFn: ({ signal }) => get<{ echoes?: 'off' | 'on' | 'names' }>('/api/reinvented/settings', undefined, { signal }),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export default function Echoes({ account, onOpen }: { account: string; onOpen?(momentId: string): void }) {
  const choice = useEchoesChoice(true).data?.echoes;
  const taking = choice === 'on' || choice === 'names';
  const echoes = useQuery({
    queryKey: ['reinvented', 'echoes', account],
    enabled: taking,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => get<{ echoes: Echo[]; twins: Twin[] }>('/api/reinvented/echoes', {}, { signal }),
  });
  const e = echoes.data;
  if (!taking || !e || (!e.echoes.length && !e.twins.length)) return null;
  return (
    <section className="ec-echoes" aria-labelledby="ec-title">
      <h2 id="ec-title">
        <Sparkles size={16} aria-hidden="true" />
        Echoes today
      </h2>
      <ul>
        {e.echoes.map((x) => (
          <li key={`e:${x.moment_id}:${x.kind}`}>
            {onOpen ? (
              <button type="button" onClick={() => onOpen(x.moment_id)}>
                {x.line}
              </button>
            ) : (
              <span>{x.line}</span>
            )}
          </li>
        ))}
        {e.twins.map((t) => (
          <li key={`t:${t.card}`}>
            <span>{t.line}</span>
          </li>
        ))}
      </ul>
      <small>Only people who chose Echoes are counted. Names show only when both of you chose to show them.</small>
    </section>
  );
}
