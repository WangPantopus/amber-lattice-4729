'use client';

import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { plans } from '@pantopus/api';
import { kindColors, KindGlyph } from '@/components/plans/planKind';
import { detailPath, planTime, secondaryClass, usePlansArea } from '@/components/plans/PlansWorkspace';

function Row({ card, status }: { card: plans.Card; status?: string }) {
  return (
    <li>
      <Link
        href={detailPath(card.id)}
        className="flex items-center gap-3 rounded-xl py-3 hover-bg-app focus-visible:ring-2"
      >
        <span
          style={kindColors(card.kind)}
          className="rounded-xl bg-[var(--plan-cs)] p-2.5 text-[var(--plan-c)]"
        >
          <KindGlyph kind={card.kind} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{card.title}</span>
          <span className="block text-sm text-app-secondary">{planTime(card)}</span>
          <span className="block text-xs text-app-muted">
            {status ||
              [card.area.label, card.is_full ? 'Waitlist' : card.spots_left + ' spots left']
                .filter(Boolean)
                .join(' · ')}
          </span>
        </span>
        <ChevronRight size={16} className="text-app-muted" />
      </Link>
    </li>
  );
}

const groups = {
  hosting: 'You’re hosting',
  going: 'You’re going',
  asked: 'Requested',
  waitlisted: 'Waitlisted',
  invited: 'Invited',
  recent: 'Recent',
} as const;

export default function PlansList() {
  const { point, time, kind } = usePlansArea();
  const mine = useQuery({
    queryKey: ['plans', 'mine'],
    queryFn: plans.mine,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30_000,
  });
  const nearby = useInfiniteQuery({
    queryKey: ['plans', 'nearby', point, time, kind],
    enabled: !!point,
    queryFn: ({ pageParam }) => plans.nearby(point!, time, kind, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    gcTime: 0,
    staleTime: 0,
  });
  const ids = new Set<string>();
  const yours = (Object.keys(groups) as (keyof typeof groups)[]).flatMap((group) => {
    const rows = mine.isError ? [] : (mine.data?.[group] ?? []);
    return rows
      .filter((card) => {
        if ((kind && card.kind !== kind) || ids.has(card.id)) return false;
        ids.add(card.id);
        return true;
      })
      .map((card) => ({ card, status: groups[group] }));
  });
  const cards = nearby.isError
    ? []
    : (nearby.data?.pages.flatMap((page) => page.items).filter((card) => !ids.has(card.id)) ?? []);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold">Yours</h2>
        {mine.isLoading ? (
          <p role="status">Loading your plans…</p>
        ) : mine.isError ? (
          <button className={secondaryClass} onClick={() => void mine.refetch()}>
            Retry your plans
          </button>
        ) : yours.length ? (
          <ul className="divide-y divide-app">
            {yours.map(({ card, status }) => (
              <Row key={card.id} card={card} status={status} />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-app-muted">Plans you host or join will appear here.</p>
        )}
      </section>
      <section>
        <h2 className="text-lg font-semibold">Nearby plans</h2>
        {!point ? (
          <p className="mt-1 text-sm text-app-muted">Choose an area to browse nearby.</p>
        ) : nearby.isLoading ? (
          <p role="status">Finding plans…</p>
        ) : nearby.isError ? (
          <button className={secondaryClass} onClick={() => void nearby.refetch()}>
            Retry nearby plans
          </button>
        ) : cards.length ? (
          <ul className="divide-y divide-app">
            {cards.map((card) => (
              <Row key={card.id} card={card} />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-app-muted">No other plans nearby for this time and kind.</p>
        )}
        {nearby.hasNextPage && (
          <button
            className={secondaryClass}
            disabled={nearby.isFetchingNextPage}
            onClick={() => void nearby.fetchNextPage()}
          >
            Show more plans
          </button>
        )}
      </section>
    </div>
  );
}
