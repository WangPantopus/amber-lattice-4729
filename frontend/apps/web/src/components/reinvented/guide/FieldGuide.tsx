'use client';

// The reader's field guide (Pulse, reinvented, phase 2; coord/CONTRACT.md §7f, §7g): the field cards they collected and
// the steps they saved, as words only (never a picture or a sound), kept after the post ends. Private to its owner.
// Only while `pulse_reinvented` is on for the person; otherwise the page says it isn't on.

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { del, get } from '@pantopus/api/client';
import { useReinventedOn } from '../pulse/useReinventedOn';

interface GuideCard {
  post_id: string;
  dot_id: string;
  collected_at: string;
  open: boolean;
  card: { name: string | null; scientific: string | null; why: string; source: { title: string; url: string } | null; caution: string | null };
}
interface GuideDeck {
  deck_id: string;
  first_moment_id: string;
  saved_at: string;
  open: boolean;
  steps: { index: number; caption: string | null; words: string | null }[];
}
interface Page {
  cards: GuideCard[];
  decks?: GuideDeck[];
  next_cursor: string | null;
}

const KEY = ['reinvented', 'field-guide'];

function web(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export default function FieldGuide() {
  const on = useReinventedOn();
  const guide = useInfiniteQuery({
    queryKey: KEY,
    queryFn: ({ pageParam, signal }) => get<Page>('/api/reinvented/field-guide', pageParam ? { cursor: pageParam } : {}, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: on,
  });
  const [busy, setBusy] = useState<string | null>(null);
  if (!on)
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center text-app-secondary">
        <p>Your field guide isn’t on for you right now.</p>
      </div>
    );
  const pages = guide.data?.pages || [];
  const cards = pages.flatMap((p) => p.cards);
  const decks = pages[0]?.decks || [];
  async function letGo(id: string, path: string) {
    setBusy(id);
    try {
      await del(path);
      await guide.refetch();
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-app">Your field guide</h1>
        <p className="text-sm text-app-secondary">
          Things you collected from others’ photos, and steps you saved. Only you see it. Names are likely, never sure.
        </p>
      </header>
      {guide.isPending && <p className="text-app-secondary">Loading…</p>}
      {guide.isError && <p className="text-app-secondary">Your field guide couldn’t load. Try again.</p>}
      {!guide.isPending && !guide.isError && !cards.length && !decks.length && (
        <div className="bg-surface rounded-xl border border-app p-6 text-app-secondary">
          Nothing here yet. Tap a dot on a thing in someone’s photo, then Collect its card.
        </div>
      )}
      {cards.length > 0 && (
        <section aria-labelledby="fg-cards" className="space-y-3">
          <h2 id="fg-cards" className="text-lg font-semibold text-app">
            Things
          </h2>
          {cards.map((c) => {
            const href = c.card.source ? web(c.card.source.url) : null;
            return (
              <article key={`${c.post_id}:${c.dot_id}`} className="bg-surface rounded-xl border border-app p-4 space-y-2">
                <p className="font-semibold text-app">
                  {c.card.name ? `Likely ${c.card.name}` : 'Not sure what this is'}
                  {c.card.scientific && <em className="font-normal text-app-secondary"> {c.card.scientific}</em>}
                </p>
                <p className="text-sm text-app">{c.card.why}</p>
                {c.card.caution && <p className="text-sm font-semibold rounded-lg px-3 py-2 bg-amber-100 text-amber-900">{c.card.caution}</p>}
                {c.card.source &&
                  (href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline">
                      {c.card.source.title} <ExternalLink className="w-4 h-4" aria-hidden="true" />
                    </a>
                  ) : (
                    <p className="text-sm text-app-secondary">{c.card.source.title}</p>
                  ))}
                <div className="flex items-center justify-between text-xs text-app-secondary">
                  <span>
                    Collected {new Date(c.collected_at).toLocaleDateString()} · {c.open ? 'the photo is still up' : 'the photo is gone; the words stay'}
                  </span>
                  <button
                    type="button"
                    className="text-red-600 font-semibold hover:underline disabled:opacity-50"
                    disabled={busy === c.dot_id + c.post_id}
                    onClick={() => void letGo(c.dot_id + c.post_id, `/api/reinvented/dots/${encodeURIComponent(c.post_id)}/${encodeURIComponent(c.dot_id)}/collect`)}
                  >
                    Let it go
                  </button>
                </div>
              </article>
            );
          })}
          {guide.hasNextPage && (
            <button type="button" className="text-sm font-semibold text-primary-600" disabled={guide.isFetchingNextPage} onClick={() => void guide.fetchNextPage()}>
              More
            </button>
          )}
        </section>
      )}
      {decks.length > 0 && (
        <section aria-labelledby="fg-decks" className="space-y-3">
          <h2 id="fg-decks" className="text-lg font-semibold text-app">
            Steps
          </h2>
          {decks.map((d) => (
            <article key={d.deck_id} className="bg-surface rounded-xl border border-app p-4 space-y-2">
              <ol className="list-decimal pl-5 space-y-1 text-sm text-app">
                {d.steps.map((s) => (
                  <li key={s.index}>
                    {s.caption || 'A step'}
                    {s.words && <span className="block text-app-secondary">“{s.words}”</span>}
                  </li>
                ))}
              </ol>
              <div className="flex items-center justify-between text-xs text-app-secondary">
                <span>Saved {new Date(d.saved_at).toLocaleDateString()}</span>
                <button
                  type="button"
                  className="text-red-600 font-semibold hover:underline disabled:opacity-50"
                  disabled={busy === d.deck_id}
                  onClick={() => void letGo(d.deck_id, `/api/reinvented/moments/${encodeURIComponent(d.first_moment_id)}/deck/save`)}
                >
                  Let it go
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
