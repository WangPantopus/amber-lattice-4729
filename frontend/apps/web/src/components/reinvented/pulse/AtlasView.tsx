'use client';

// My Atlas (Pulse, reinvented, phase 1, board B7, the "My Atlas" side): private to its author, every Moment they took
// since the switch came on for them, by date here and on the map behind, each with "Delete for good"
// (GET /api/reinvented/atlas, DELETE /api/reinvented/atlas/:id, coord/CONTRACT.md §6e). Nobody else ever sees it.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { colors } from '@/components/moments/momentState';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import { useBackWhenMissing } from '../serverBehind';
import { deleteForGood, readAtlas, type AtlasPage, type ListMoment, type Point } from './listApi';
import AtlasSearch from './AtlasSearch';
import Cabinet from '../cabinet/Cabinet';
import PosterView, { posterYear } from '../cabinet/Poster';
import { useMe } from '@/lib/me';
import { WentBecauseOfYou } from '../strands/Strands';

const dayWords = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
const timeWords = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function Picture({ m, large = false }: { m: ListMoment; large?: boolean }) {
  const src = m.kind === 'video' ? m.poster_url : m.kind === 'photo' ? m.media_url : null;
  if (src) return <img src={src} alt={large ? m.caption || 'Your Moment' : ''} loading="lazy" />;
  return (
    <span className="rp-atlas-card-text" style={{ background: colors[m.background || 'teal'] }}>
      {m.text}
    </span>
  );
}

/** One kept Moment, larger, with "Delete for good". */
export function AtlasItem({ moment: m, account, onClose, onDeleted }: { moment: ListMoment; account: string; onClose(): void; onDeleted(id: string): void }) {
  const reread = useRereadSwitch();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    box.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteForGood(m.id);
      onDeleted(m.id);
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
      const err = e as { code?: string; message?: string };
      setError(err.code === 'MOMENT_HELD' ? err.message || 'This Moment is being reviewed. You can delete it for good once the review is done.' : 'Couldn’t delete it. Try again.');
      setBusy(false);
      setAsking(false);
    }
  };
  return (
    <div className="rp-atlas-scrim" data-covers-shell="" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={box} className="rp-atlas-item" role="dialog" aria-modal="true" aria-label="Your Moment" tabIndex={-1} data-account={account}>
        <div className="rp-atlas-item-picture">
          <Picture m={m} large />
        </div>
        <div className="rp-atlas-item-words">
          <strong>{dayWords(m.created_at)}</strong>
          <span>{[timeWords(m.created_at), m.place_label].filter(Boolean).join(' · ')}</span>
          {m.caption && <p>{m.caption}</p>}
          <span className="rp-muted">Only you see your Atlas.</span>
        </div>
        {error && <p className="rp-atlas-error" role="alert">{error}</p>}
        {asking ? (
          <div className="rp-atlas-ask" role="alertdialog" aria-label="Delete for good?">
            <p>Delete this Moment for good? Its picture is removed now and can’t come back.</p>
            <div className="rp-empty-actions">
              <button type="button" className="rp-button rp-button-danger" onClick={remove} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete for good'}
              </button>
              <button type="button" className="rp-button rp-button-quiet" onClick={() => setAsking(false)} disabled={busy}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <div className="rp-empty-actions">
            <button type="button" className="rp-button rp-button-quiet" onClick={onClose}>
              Close
            </button>
            <button type="button" className="rp-button rp-button-danger" onClick={() => setAsking(true)}>
              Delete for good
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** My Atlas by date, in the list's place. */
export default function AtlasView({
  account,
  constellations,
  onOpen,
  onFound,
  onPlace,
}: {
  account: string;
  /** Curiosity constellations near the reader (CONTRACT 9c), drawn under the search while it isn't showing results. */
  constellations?: React.ReactNode;
  onOpen(m: ListMoment): void;
  /** A Moment Atlas search found (CONTRACT 9b): the reader's own opens as in My Atlas, another person's in the viewer. */
  onFound(m: ListMoment): void;
  /** Jump to a result's pin. */
  onPlace(p: Point): void;
}) {
  const reread = useRereadSwitch();
  // Atlas search's results show in place of the days while there are some.
  const [searching, setSearching] = useState(false);
  // The yearly poster (CONTRACT 9d), opened from My Atlas.
  const [poster, setPoster] = useState(false);
  const me = useMe().data;
  const atlas = useInfiniteQuery({
    queryKey: ['reinvented', 'atlas', account],
    queryFn: ({ pageParam, signal }) => readAtlas(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
  useEffect(() => {
    if (atlas.error && isSwitchedOff(atlas.error)) void reread();
  }, [atlas.error, reread]);
  useBackWhenMissing(atlas.error);
  const days = useMemo(() => {
    const out: { day: string; moments: ListMoment[] }[] = [];
    for (const m of atlas.data?.pages.flatMap((p) => p.moments) ?? []) {
      const day = dayWords(m.created_at);
      if (out[out.length - 1]?.day === day) out[out.length - 1].moments.push(m);
      else out.push({ day, moments: [m] });
    }
    return out;
  }, [atlas.data]);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = atlas;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return undefined;
    const watch = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && !isFetchingNextPage && void fetchNextPage(), { rootMargin: '400px 0px' });
    watch.observe(el);
    return () => watch.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, days.length]);

  if (atlas.isPending)
    return (
      <div className="rp-skeleton" role="status" aria-label="Loading your Atlas">
        <span />
      </div>
    );
  if (atlas.isError && !isSwitchedOff(atlas.error))
    return (
      <div className="rp-empty">
        <p>Your Atlas couldn’t load.</p>
        <button type="button" className="rp-button" onClick={() => void atlas.refetch()}>
          Try again
        </button>
      </div>
    );
  return (
    <div className="rp-atlas">
      <AtlasSearch account={account} onMoment={onFound} onPlace={onPlace} onSearching={setSearching} />
      {!searching && (
        <p className="rp-atlas-note">My Atlas: every Moment you take is kept here for you alone, after it fades for everyone else.</p>
      )}
      {!searching && <Cabinet personId={account} viewerId={account} own />}
      {!searching && (
        <button type="button" className="cb-poster-open" onClick={() => setPoster(true)}>
          <span>Your {posterYear()} poster</span>
          <small>Only you see it</small>
        </button>
      )}
      {poster && <PosterView account={account} name={(me as { firstName?: string; name?: string } | undefined)?.firstName || 'My'} onClose={() => setPoster(false)} />}
      {!searching && constellations}
      {!searching && <WentBecauseOfYou />}
      {!searching && !days.length && <p className="rp-empty">Nothing here yet. The Moments you post from now on are kept here.</p>}
      {!searching && days.map((d) => (
        <section key={d.day} aria-label={d.day}>
          <h3 className="rp-atlas-day">{d.day}</h3>
          <div className="rp-atlas-grid">
            {d.moments.map((m) => (
              <button key={m.id} type="button" className="rp-atlas-card" onClick={() => onOpen(m)} aria-label={`${timeWords(m.created_at)}${m.place_label ? `, ${m.place_label}` : ''}${m.caption ? `: ${m.caption}` : ''}`}>
                <Picture m={m} />
                <span className="rp-atlas-card-time">{timeWords(m.created_at)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {!searching && <div ref={sentinel} className="rp-sentinel" />}
      {!searching && isFetchingNextPage && <p className="rp-muted rp-center">Loading more…</p>}
    </div>
  );
}

/** Takes a Moment deleted for good out of every Atlas page held. */
export function dropFromAtlas(client: ReturnType<typeof useQueryClient>, id: string) {
  client.setQueriesData<InfiniteData<AtlasPage>>({ queryKey: ['reinvented', 'atlas'] }, (old) =>
    old && { ...old, pages: old.pages.map((p) => ({ ...p, moments: p.moments.filter((m) => m.id !== id) })) },
  );
  client.setQueriesData<AtlasPage>({ queryKey: ['reinvented', 'atlas-box'] }, (old) => old && { ...old, moments: old.moments.filter((m) => m.id !== id) });
}
