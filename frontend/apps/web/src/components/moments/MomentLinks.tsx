'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { moments } from '@pantopus/api';
import type { ChatMomentQuote } from '@pantopus/types';
import type { Ring, Moment } from '@pantopus/api/endpoints/moments';
import { CircleDashed, Play } from 'lucide-react';
import { useMe } from '@/lib/me';
import { useMomentsAccess } from './useMomentsAccess';
import { colors } from './momentState';

// Pulse and Messages can mount many faces at once. Each signed-in query client shares one batch per paint.
function batched<T>(max: number, read: (ids: string[]) => Promise<T[]>, key: (item: T) => string) {
  type Waiter = { id: string; resolve: (item: T | null) => void; reject: (e: unknown) => void };
  const clients = new WeakMap<QueryClient, Waiter[]>();
  return (client: QueryClient, id: string) =>
    new Promise<T | null>((resolve, reject) => {
      const waiting = clients.get(client);
      if (waiting) {
        waiting.push({ id, resolve, reject });
        return;
      }
      const rows = [{ id, resolve, reject }];
      clients.set(client, rows);
      setTimeout(() => {
        clients.delete(client);
        const ids = [...new Set(rows.map((r) => r.id))];
        for (let i = 0; i < ids.length; i += max) {
          const group = ids.slice(i, i + max),
            members = rows.filter((r) => group.includes(r.id));
          void read(group).then(
            (items) => {
              const byId = new Map(items.map((v) => [key(v), v]));
              members.forEach((r) => r.resolve(byId.get(r.id) || null));
            },
            (e) => members.forEach((r) => r.reject(e)),
          );
        }
      }, 16);
    });
}
const authorRing = batched<Ring>(
  100,
  async (ids) => (await moments.people(ids)).rings,
  (item) => item.author.id,
);
const quoted = batched<Moment>(
  40,
  async (ids) => (await moments.batch(ids)).moments,
  (item) => item.id,
);
function useBefore(deadline: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!(deadline > Date.now())) return;
    const timer = setTimeout(() => setNow(Date.now()), deadline - Date.now() + 10);
    return () => clearTimeout(timer);
  }, [deadline]);
  return deadline > Math.max(now, Date.now());
}

export function MomentAvatar({
  id,
  name,
  children,
  fallback,
}: {
  id?: string | null;
  name?: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const client = useQueryClient(),
    on = useMomentsAccess().data?.enabled;
  const account = useMe({ enabled: !!on }).data?.id;
  const q = useQuery({
    queryKey: ['moments', 'face', account, id],
    queryFn: () => authorRing(client, id!),
    enabled: !!on && !!account && !!id,
    staleTime: 30000,
    refetchInterval: 60000,
    retry: false,
    refetchOnWindowFocus: 'always',
  });
  const ring = q.isError ? null : q.data;
  const until = Math.max(0, ...(ring?.moments.map((m) => Date.parse(m.expires_at)) || [])),
    before = useBefore(until);
  if (!on || !before || !ring || typeof window === 'undefined') return <>{fallback ?? children}</>;
  return (
    <Link
      href={
        '/app/moments?person=' +
        encodeURIComponent(id!) +
        '&returnTo=' +
        encodeURIComponent(window.location.pathname)
      }
      className={
        'inline-flex shrink-0 rounded-full ring-[3px] ring-offset-2 ring-offset-app-surface ' +
        (ring.unseen_count ? 'ring-teal-500' : 'ring-slate-400')
      }
      aria-label={'Watch ' + (name || ring.author.name) + '’s Moments'}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}
export function MomentQuote({
  quote,
  own,
}: {
  quote: Pick<ChatMomentQuote, 'id'> & { ended?: boolean };
  own: boolean;
}) {
  const client = useQueryClient(),
    on = useMomentsAccess().data?.enabled;
  const account = useMe({ enabled: !!on }).data?.id;
  const q = useQuery({
    queryKey: ['moments', 'quote', account, quote.id],
    queryFn: () => quoted(client, quote.id),
    enabled: !!on && !!account && !quote.ended,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30000,
    refetchOnWindowFocus: 'always',
    retry: false,
  });
  const m = on && !q.isError && !quote.ended && q.data?.state === 'live' ? q.data : null,
    before = useBefore(Date.parse(m?.expires_at || ''));
  if (!on) return null;
  const label = own ? 'You replied to a Moment' : 'Replied to your Moment';
  if (!m || !before)
    return (
      <div className="mb-1 flex items-center gap-2 rounded-xl border border-app bg-surface-muted px-3 py-2 text-xs text-app-muted">
        <CircleDashed size={16} />
        {label} · {q.isFetching ? 'Loading…' : q.isError ? 'Unavailable' : 'Ended'}
      </div>
    );
  const picture = m.poster_url || (m.kind === 'photo' ? m.media_url : null);
  return (
    <Link
      href={'/app/moments/' + m.id + '?returnTo=' + encodeURIComponent(window.location.pathname)}
      className="mb-1 flex max-w-64 items-center gap-2.5 rounded-xl border border-app bg-surface-muted p-2 text-app hover-bg-app"
    >
      <span
        className="grid h-12 w-10 shrink-0 place-items-center overflow-hidden rounded-md text-white"
        style={{ background: colors[m.background || 'teal'] }}
      >
        {picture ? (
          <img src={picture} alt="" className="h-full w-full object-cover" />
        ) : m.kind === 'video' ? (
          <Play size={14} />
        ) : (
          <strong>Aa</strong>
        )}
      </span>
      <span className="min-w-0">
        <strong className="block text-xs">{label}</strong>
        <span className="line-clamp-2 text-xs text-app-muted">{m.text || m.caption || 'Watch Moment'}</span>
      </span>
    </Link>
  );
}
export const inboxMomentLabel = (q: { from_me: boolean }) =>
  q.from_me ? 'You replied to a Moment' : 'Replied to your Moment';
