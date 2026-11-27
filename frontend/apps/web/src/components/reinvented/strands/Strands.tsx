'use client';

// Strands (Pulse, reinvented, phase 3; coord/CONTRACT.md §8c): "Dana went because of your Moment." Told to the first
// person only, between people only, never shown to anyone else, and never about a person without their own act (their
// Want to go, then their own post from there; a frame added to a Retake; a pass). The first person reads theirs in
// their private Atlas; the follower sees the strands they're in, and takes one back, beside their own choice in Settings.

import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { del, get, post } from '@pantopus/api/client';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { MomentFace } from '@/components/moments/MomentFace';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import './strands.css';

type Person = Moment['author'];

export interface StrandGroup {
  kind?: 'went' | 'retake' | 'passed';
  source: { id: string; type: 'moment' | 'post'; caption: string | null };
  day: string;
  count: number;
  people: Person[];
  label: string;
  unseen: boolean;
  items: { id: string; follower: Person; follower_post_id: string | null; at: string }[];
}

interface Page {
  strands: StrandGroup[];
  unseen_count?: number;
  next_cursor: string | null;
}

export interface MyStrand {
  id: string;
  kind: 'went' | 'retake' | 'passed';
  source_post_id: string;
  author: Person;
  follower_post_id: string | null;
  at: string;
}

const KEY = ['reinvented', 'strands'];
const MINE = ['reinvented', 'strands', 'mine'];

const dayWords = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, new Date(Date.now() - 86_400_000))) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
};

const openSource = (router: ReturnType<typeof useRouter>, s: StrandGroup['source']) =>
  router.push(s.type === 'moment' ? `/app/moments/${encodeURIComponent(s.id)}` : `/app/feed/post/${encodeURIComponent(s.id)}`);

/** At the top of My Atlas: the strands the person's posts started, newest first; seen once they're on screen. */
export function WentBecauseOfYou() {
  const router = useRouter();
  const client = useQueryClient();
  const reread = useRereadSwitch();
  const list = useInfiniteQuery({
    queryKey: KEY,
    queryFn: ({ pageParam, signal }) => get<Page>('/api/reinvented/strands', pageParam ? { cursor: pageParam } : {}, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
  useEffect(() => {
    if (list.error && isSwitchedOff(list.error)) void reread();
  }, [list.error, reread]);
  const groups = list.data?.pages.flatMap((p) => p.strands) ?? [];
  const unseen = groups.filter((g) => g.unseen).flatMap((g) => g.items.map((i) => i.id));
  // Once the new ones have been on screen a moment, they're seen (the dot goes; the strands stay).
  const marking = useRef('');
  useEffect(() => {
    const ids = unseen.join(',');
    if (!ids || marking.current === ids) return;
    const t = window.setTimeout(() => {
      marking.current = ids;
      void post('/api/reinvented/strands/seen', { ids: ids.split(',') })
        .then(() =>
          client.setQueryData<InfiniteData<Page>>(KEY, (old) =>
            old ? { ...old, pages: old.pages.map((p) => ({ ...p, unseen_count: 0, strands: p.strands.map((g) => ({ ...g, unseen: false })) })) } : old,
          ),
        )
        .catch(() => {
          marking.current = '';
        });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [unseen.join(','), client]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!groups.length) return null;
  let lastDay = '';
  return (
    <section className="sd-went" aria-label="Went because of you">
      <h3>
        Went because of you
        {unseen.length > 0 && <span className="sd-new">{unseen.length} new</span>}
      </h3>
      <p className="sd-note">Only you see these. Nobody else is told.</p>
      <ol>
        {groups.map((g) => {
          const day = g.day !== lastDay ? g.day : '';
          lastDay = g.day;
          return (
            <li key={`${g.source.id}:${g.day}:${g.kind || 'went'}`}>
              {day && <p className="sd-day">{dayWords(day)}</p>}
              <button type="button" className="sd-group" data-unseen={g.unseen || undefined} onClick={() => openSource(router, g.source)}>
                <span className="sd-faces" aria-hidden="true">
                  {g.people.slice(0, 3).map((p) => (
                    <MomentFace key={p.id} author={p} />
                  ))}
                </span>
                <span className="sd-words">
                  <strong>{g.label}</strong>
                  {g.source.caption && <span>{g.source.caption}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {list.hasNextPage && (
        <button type="button" className="sd-more" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          {list.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </button>
      )}
    </section>
  );
}

const kindWords: Record<MyStrand['kind'], string> = {
  went: 'You went because of',
  retake: 'You added to the Retake of',
  passed: 'You carried on a post by',
};

/** In Settings, under the person's choice: the strands they're in, each one theirs to take back. */
export function StrandsImIn() {
  const client = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: MINE,
    queryFn: ({ pageParam, signal }) =>
      get<{ strands: MyStrand[]; next_cursor: string | null }>('/api/reinvented/strands', { side: 'mine', ...(pageParam ? { cursor: pageParam } : {}) }, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    retry: false,
  });
  const items = list.data?.pages.flatMap((p) => p.strands) ?? [];
  async function takeBack(id: string) {
    await del(`/api/reinvented/strands/${encodeURIComponent(id)}`);
    client.setQueryData<InfiniteData<{ strands: MyStrand[]; next_cursor: string | null }>>(MINE, (old) =>
      old ? { ...old, pages: old.pages.map((p) => ({ ...p, strands: p.strands.filter((s) => s.id !== id) })) } : old,
    );
  }
  if (!items.length) return null;
  return (
    <div className="mt-2 border-t border-app pt-3">
      <p className="text-sm font-medium text-app">Strands you’re in</p>
      <p className="text-sm text-app-secondary mb-2">Take one back and that person no longer sees it.</p>
      <ul className="space-y-2">
        {items.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-app-secondary">
              {kindWords[s.kind] || kindWords.went} {s.author?.name || 'someone'} · {new Date(s.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
            <button type="button" className="text-primary-600 font-medium hover:underline" onClick={() => void takeBack(s.id).catch(() => {})}>
              Take back
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
