'use client';

// The one Pulse tab as it opens (Pulse, reinvented, phase 1, board B1), shown only while `pulse_reinvented` is on for the
// person (PulsePick); today's Pulse is untouched beside it. A list laid over a live map: the list rests at three heights
// (the middle, how it opens; List, full; Map, full with the list tucked down), pulled by its handle or set by the
// switch. At desktop width the list and the map sit side by side. One request draws the first screen
// (GET /api/reinvented/list, coord/CONTRACT.md §6a).

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ChevronDown, LocateFixed, Plus } from 'lucide-react';
import * as api from '@pantopus/api';
import type { Post } from '@pantopus/api';
import { useMe } from '@/lib/me';
import { useMyHomeCenter } from '@/lib/myHomes';
import { reactedPostPatch, serverReactionPatch } from '@/components/feed/PostReactions';
import { studioViewer } from '../viewer/studioViewer';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import { CHIP_WORDS, isChip, readAtlasBox, readList, readMap, readStrip, type Box, type ListMoment, type Chip, type ListItem, type ListPage, type MapTime, type Point, type Reach } from './listApi';
import MomentRow from './MomentRow';
import PostRow from './PostRow';
import { itemPoint, type FlyTarget } from './PulseMap';
import { PeekDeck, TimeRow } from './MapDeck';
import { keptPins, pinsOf, roundBox, type Pin } from './pins';
import AtlasView, { AtlasItem, dropFromAtlas } from './AtlasView';
import AliveStrip from './AliveStrip';
import ReachDial from './ReachDial';
import '@/components/moments/moments.css';
import './pulse.css';

const PulseMap = dynamic(() => import('./PulseMap'), { ssr: false, loading: () => <div className="rp-map" /> });
const MomentViewer = dynamic(() => import('@/components/moments/MomentViewer'), { ssr: false });
// One camera for everything (phase 1 piece 11): + opens the Studio, where a Moment or, with "+ Ask / Kind", a post is made.
const Composer = dynamic(() => import('../MomentComposerEntry'), { ssr: false });

type Height = 'middle' | 'list' | 'map';
const UP: Record<Height, Height> = { map: 'middle', middle: 'list', list: 'list' };
const DOWN: Record<Height, Height> = { list: 'middle', middle: 'map', map: 'map' };

const REACH_NAMES: Record<Reach, string> = { close: 'Close circle', around: 'Around me' };

type ListData = InfiniteData<ListPage, string | null>;

export default function ReinventedPulse() {
  const router = useRouter();
  const client = useQueryClient();
  const reread = useRereadSwitch();
  const me = useMe();
  const account = me.data?.id ?? null;
  const home = useMyHomeCenter();
  const [reach, setReach] = useState<Reach>('around');
  const [chip, setChip] = useState<Chip>('all');
  const [height, setHeight] = useState<Height>('middle');
  const [point, setPoint] = useState<Point | null>(null);
  const [locating, setLocating] = useState<'idle' | 'busy' | 'refused'>('idle');
  const [viewing, setViewing] = useState<{ id: string; ids: string[] } | null>(null);
  const [time, setTime] = useState<MapTime>('live');
  const [box, setBox] = useState<Box | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Pulse, or My Atlas (the switch's third choice): the person's own kept Moments in the list's place and on the map.
  const [view, setView] = useState<'pulse' | 'atlas'>('pulse');
  const [atlasItem, setAtlasItem] = useState<ListMoment | null>(null);
  const [fly, setFly] = useState<FlyTarget | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const closeDial = useCallback(() => setScopeOpen(false), []);
  const [miles, setMiles] = useState(25);
  const [toast, setToast] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  // At desktop width the list sits beside the map (pulse.css), so it covers none of it.
  const [sideBySide, setSideBySide] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)');
    const read = () => setSideBySide(wide.matches);
    read();
    wide.addEventListener('change', read);
    return () => wide.removeEventListener('change', read);
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const key = useMemo(() => ['reinvented', 'list', account, reach, reach === 'around' ? miles : null, chip, point?.latitude ?? null, point?.longitude ?? null] as const, [account, reach, miles, chip, point]);
  const list = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => readList({ reach, miles, chip, cursor: pageParam, point }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: !!account,
    staleTime: 30_000,
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
  // The switch went off between two reads: read it again, and PulsePick puts today's Pulse back.
  useEffect(() => {
    if (list.error && isSwitchedOff(list.error)) void reread();
  }, [list.error, reread]);

  // The map's own read for the box in view and the time row's choice (CONTRACT §6b); it follows the list's first page.
  const map = useQuery({
    queryKey: ['reinvented', 'map', account, time, box],
    queryFn: ({ signal }) => readMap(box!, time, signal),
    enabled: !!account && !!box && view === 'pulse',
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
  useEffect(() => {
    if (map.error && isSwitchedOff(map.error)) void reread();
  }, [map.error, reread]);
  const atlasMap = useQuery({
    queryKey: ['reinvented', 'atlas-box', account, box],
    queryFn: ({ signal }) => readAtlasBox(box!, signal),
    enabled: !!account && !!box && view === 'atlas',
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
  const pins = useMemo(() => (view === 'atlas' ? keptPins(atlasMap.data?.moments) : pinsOf(map.data)), [view, atlasMap.data, map.data]);
  // Alive right now (CONTRACT §6c), over the list; it follows the list's first page like the map.
  const strip = useQuery({
    queryKey: ['reinvented', 'strip', account, point?.latitude ?? null, point?.longitude ?? null],
    queryFn: ({ signal }) => readStrip(point, signal),
    enabled: !!account,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
  useEffect(() => {
    if (strip.error && isSwitchedOff(strip.error)) void reread();
  }, [strip.error, reread]);
  // A box with no height (the map laid out before the sheet settles, at phone width) is never read: the server answers
  // 400 to it.
  const onBox = useCallback((b: Box) => {
    const r = roundBox(b);
    if (r.north > r.south && r.east > r.west) setBox(r);
  }, []);

  const pages = list.data?.pages;
  const first = pages?.[0];
  const items = useMemo(() => pages?.flatMap((p) => p.items) ?? [], [pages]);
  const last = pages?.[pages.length - 1];
  // The chips this reach and place have something for, as the first page names them; kept while another chip loads.
  const [chips, setChips] = useState<Chip[]>(['all']);
  useEffect(() => {
    if (first?.chips) setChips(first.chips.filter(isChip));
  }, [first?.chips]);
  const bandLabels = useMemo(() => new Map((first?.bands || []).map((b) => [b.band, b.label])), [first?.bands]);

  // More as the list nears its end.
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return undefined;
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scroller.current, rootMargin: '600px 0px' },
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  // A new reach or chip starts the list from its top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [reach, chip]);

  // ── Posts: today's card, its answers patched into this list's pages ──
  const patchPost = useCallback(
    (id: string, patch: (p: Post) => Partial<Post>) =>
      client.setQueriesData<ListData>({ queryKey: ['reinvented', 'list'] }, (old) =>
        old && {
          ...old,
          pages: old.pages.map((pg) => ({
            ...pg,
            items: pg.items.map((it) => (it.type === 'post' && it.post.id === id ? { ...it, post: { ...it.post, ...patch(it.post) } } : it)),
          })),
        },
      ),
    [client],
  );
  const dropItem = useCallback(
    (id: string) =>
      client.setQueriesData<ListData>({ queryKey: ['reinvented', 'list'] }, (old) =>
        old && { ...old, pages: old.pages.map((pg) => ({ ...pg, items: pg.items.filter((it) => it.id !== id) })) },
      ),
    [client],
  );
  const postOf = useCallback((id: string) => items.find((it): it is Extract<ListItem, { type: 'post' }> => it.type === 'post' && it.post.id === id)?.post, [items]);
  const busy = useCallback(async (id: string, work: () => Promise<void>) => {
    setBusyIds((s) => new Set(s).add(id));
    try {
      await work();
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }, []);
  const openPost = useCallback((id: string) => router.push(`/app/feed/post/${encodeURIComponent(id)}`), [router]);
  const card = {
    currentUserId: account ?? undefined,
    surface: reach === 'close' ? 'connections' : 'place',
    showToast: setToast,
    onComment: openPost,
    onOpenDetail: openPost,
    onLike: (id: string) => {
      const before = postOf(id);
      if (!before || busyIds.has(id)) return;
      const liked = !before.userHasLiked;
      patchPost(id, (p) => ({ userHasLiked: liked, like_count: Math.max(0, (p.like_count ?? 0) + (liked ? 1 : -1)) }));
      void busy(id, async () => {
        try {
          const res = await api.posts.toggleLike(id, liked);
          patchPost(id, () => ({ userHasLiked: res.liked, like_count: res.likeCount }));
        } catch {
          patchPost(id, () => ({ userHasLiked: before.userHasLiked, like_count: before.like_count }));
          setToast('Couldn’t save that. Try again.');
        }
      });
    },
    onReact: (id: string, reaction: string | null) => {
      const before = postOf(id);
      if (!before || busyIds.has(id)) return;
      patchPost(id, (p) => reactedPostPatch(p, reaction));
      void busy(id, async () => {
        try {
          const res = await api.posts.setReaction(id, reaction);
          patchPost(id, (p) => serverReactionPatch(res, p.reactions));
        } catch {
          patchPost(id, () => ({ reactions: before.reactions, userReaction: before.userReaction, userHasLiked: before.userHasLiked, like_count: before.like_count }));
          setToast('Couldn’t update your reaction. Try again.');
        }
      });
    },
    onSave: (id: string) => {
      const before = postOf(id);
      if (!before) return;
      const saved = !before.userHasSaved;
      patchPost(id, () => ({ userHasSaved: saved }));
      api.posts.toggleSave(id, saved).catch(() => {
        patchPost(id, () => ({ userHasSaved: before.userHasSaved }));
        setToast('Couldn’t save that. Try again.');
      });
    },
    onDelete: (id: string) => {
      api.posts
        .deletePost(id)
        .then(() => dropItem(id))
        .catch(() => setToast('Couldn’t delete the post. Try again.'));
    },
    onHide: (id: string) => {
      api.posts
        .hidePost(id)
        .then(() => {
          dropItem(id);
          setToast('Post hidden.');
        })
        .catch(() => setToast('Couldn’t hide the post. Try again.'));
    },
    onSolved: (id: string) => patchPost(id, () => ({ state: 'solved' }) as Partial<Post>),
  };

  // ── Moments ──
  const momentIds = useMemo(() => items.filter((it) => it.type === 'moment').map((it) => it.id), [items]);
  const openMoment = useCallback((id: string) => setViewing({ id, ids: momentIds.includes(id) ? momentIds : [id] }), [momentIds]);
  const flyTo = useCallback((p: Point) => {
    setFly({ ...p, serial: Date.now() });
    setHeight((h) => (h === 'list' ? 'middle' : h));
  }, []);

  // ── The map's pins and the peek deck ──
  const openPin = useCallback(
    (pin: Pin) => {
      if (pin.type === 'kept') setAtlasItem(pin.moment);
      else if (pin.type === 'ring') {
        const ids = pin.ring.moments.map((m) => m.id);
        if (!ids.length) return;
        const start = pin.ring.moments.find((m) => !m.seen)?.id || ids[0];
        setViewing({ id: start, ids });
      } else if (pin.type === 'mark') openPost(pin.mark.post.id);
      else router.push(`/app/plans/${encodeURIComponent(pin.ticket.id)}`);
    },
    [openPost, router],
  );
  // At the Map height a pin chosen on the map brings its card up (a second tap opens it); elsewhere a tap opens it.
  const onPick = useCallback(
    (key: string) => {
      const pin = pins.find((p) => p.key === key);
      if (!pin) return;
      if (height === 'map' && selected !== key) setSelected(key);
      else openPin(pin);
    },
    [pins, height, selected, openPin],
  );
  const onDeckSelect = useCallback(
    (key: string) => {
      setSelected(key);
      const pin = pins.find((p) => p.key === key);
      if (pin) setFly({ ...pin.point, serial: Date.now(), keepZoom: true });
    },
    [pins],
  );

  // ── The list's three heights: pulled by the handle, or set by the switch ──
  const pull = useRef<{ y: number; moved: boolean } | null>(null);
  const onHandleDown = (e: ReactPointerEvent) => {
    pull.current = { y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandleUp = (e: ReactPointerEvent) => {
    const start = pull.current;
    pull.current = null;
    if (!start) return;
    const dy = e.clientY - start.y;
    if (dy < -36) setHeight((h) => UP[h]);
    else if (dy > 36) setHeight((h) => DOWN[h]);
    else setHeight((h) => (h === 'middle' ? 'list' : 'middle'));
  };
  const pick = (to: 'list' | 'map') => {
    if (view === 'atlas') {
      setView('pulse');
      setSelected(null);
      return setHeight(to === 'map' ? 'map' : 'middle');
    }
    setHeight((h) => (h === to ? 'middle' : to));
  };
  const toAtlas = () => {
    setSelected(null);
    setView((v) => (v === 'atlas' ? 'pulse' : 'atlas'));
    setHeight((h) => (h === 'map' ? 'middle' : h));
  };

  const locate = () => {
    if (!navigator.geolocation) return setLocating('refused');
    setLocating('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating('idle');
        setPoint({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => setLocating('refused'),
      { maximumAge: 60_000, timeout: 15_000 },
    );
  };

  const placeName = reach === 'close' ? 'Your circle' : first?.place?.label || (first?.needs_place ? 'No place yet' : 'Near you');
  const fitKey = `${reach}|${miles}|${chip}|${point?.latitude ?? ''}|${point?.longitude ?? ''}|${list.dataUpdatedAt ? 'read' : ''}`;
  const fallback = point ?? (home ? { latitude: home.lat, longitude: home.lng } : null);
  let prevBand: string | null = null;

  const head = (
    <header className="rp-head">
      <div className="rp-scope-wrap">
        <button
          type="button"
          className="rp-scope"
          aria-haspopup="dialog"
          aria-expanded={scopeOpen}
          onClick={() => setScopeOpen((o) => !o)}
        >
          <span className="rp-scope-dot" aria-hidden />
          <strong>{placeName}</strong>
          <span className="rp-scope-reach">{reach === 'around' && miles < 25 ? `${REACH_NAMES.around} · ${miles} mi` : REACH_NAMES[reach]}</span>
          <ChevronDown size={16} aria-hidden />
        </button>
        {scopeOpen && (
          <ReachDial
            reach={reach}
            miles={miles}
            place={first?.place?.label ?? null}
            onReach={(r) => {
              if (r !== reach) setChip('all');
              setReach(r);
            }}
            onMiles={setMiles}
            onClose={closeDial}
          />
        )}
      </div>

      <div className="rp-switch" role="group" aria-label="List or map">
        <button type="button" aria-pressed={view === 'pulse' && height !== 'map'} data-lit={(view === 'pulse' && height !== 'map') || undefined} onClick={() => pick('list')}>
          List
        </button>
        <button type="button" aria-pressed={view === 'pulse' && height !== 'list'} data-lit={(view === 'pulse' && height !== 'list') || undefined} onClick={() => pick('map')}>
          Map
        </button>
        <button type="button" aria-pressed={view === 'atlas'} data-lit={view === 'atlas' || undefined} onClick={toAtlas}>
          Atlas
        </button>
      </div>

      {view === 'pulse' && chips.length > 1 && (
        <div className="rp-chips" role="group" aria-label="Show">
          {chips.map((c) => (
            <button key={c} type="button" aria-pressed={chip === c} onClick={() => setChip(c)}>
              {CHIP_WORDS[c]}
            </button>
          ))}
        </div>
      )}
    </header>
  );

  return (
    <div className="rp-board" data-height={height}>
      <div className="rp-map-layer" aria-hidden={height === 'list' || undefined}>
        <PulseMap
          pins={pins}
          listItems={first?.items ?? []}
          fitKey={fitKey}
          fallback={fallback}
          layoutKey={`${height}|${sideBySide}`}
          flyTo={fly}
          selected={selected}
          onBox={onBox}
          onPick={onPick}
        />
      </div>
      {height === 'map' && <div className="rp-map-top">{head}</div>}
      {sideBySide && height === 'middle' && (
        <div className="rp-map-time">
          <TimeRow time={time} onTime={setTime} />
        </div>
      )}

      <section className="rp-sheet" aria-label="Pulse">
        <div
          className="rp-handle"
          role="button"
          tabIndex={0}
          aria-label={height === 'list' ? 'Show the map' : 'Show more of the list'}
          onPointerDown={onHandleDown}
          onPointerUp={onHandleUp}
          onPointerCancel={() => (pull.current = null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setHeight((h) => (h === 'middle' ? 'list' : 'middle'));
            } else if (e.key === 'ArrowUp') setHeight((h) => UP[h]);
            else if (e.key === 'ArrowDown') setHeight((h) => DOWN[h]);
          }}
        >
          <span />
        </div>

        {height !== 'map' && head}

        {height === 'map' && (
          <div className="rp-map-bottom">
            <TimeRow time={time} onTime={setTime} />
            {map.isError && !isSwitchedOff(map.error) ? (
              <p className="rp-deck-empty">The map couldn’t load. Move it to try again.</p>
            ) : map.data ? (
              <PeekDeck pins={pins} selected={selected} now={now} onSelect={onDeckSelect} onOpen={openPin} />
            ) : (
              <p className="rp-deck-empty">Loading the map…</p>
            )}
          </div>
        )}
        <div ref={scroller} className="rp-list" aria-busy={list.isFetching || undefined} aria-hidden={height === 'map' || undefined}>
          {view === 'atlas' && account ? (
            <AtlasView account={account} onOpen={setAtlasItem} />
          ) : list.isPending ? (
            <div className="rp-skeleton" role="status" aria-label="Loading Pulse">
              <span />
              <span />
              <span />
            </div>
          ) : list.isError && !isSwitchedOff(list.error) ? (
            <div className="rp-empty">
              <p>Pulse couldn’t load.</p>
              <button type="button" className="rp-button" onClick={() => void list.refetch()}>
                Try again
              </button>
            </div>
          ) : first?.needs_place ? (
            <div className="rp-empty">
              <p>Pulse shows what’s around a place. Share where you are, or add your home on Place.</p>
              <div className="rp-empty-actions">
                <button type="button" className="rp-button" onClick={locate} disabled={locating === 'busy'}>
                  <LocateFixed size={16} aria-hidden />
                  {locating === 'busy' ? 'Finding you…' : 'Use my location'}
                </button>
                <button type="button" className="rp-button rp-button-quiet" onClick={() => router.push('/app/place')}>
                  Go to Place
                </button>
              </div>
              {locating === 'refused' && <p className="rp-muted">Your browser didn’t share your location. You can allow it in its settings.</p>}
            </div>
          ) : (
            <>
              {strip.data && (chip === 'all' || chip === 'live') && (
                <AliveStrip
                  strip={strip.data}
                  bandLabel={(b) => (b ? bandLabels.get(b) || null : null)}
                  now={now}
                  onMoments={(ids, start) => setViewing({ id: start, ids })}
                  onPlan={(t) => router.push(`/app/plans/${encodeURIComponent(t.id)}`)}
                />
              )}
              {items.length === 0 && (
                <div className="rp-empty">
                  <p>
                    {chip !== 'all'
                      ? `Nothing under ${CHIP_WORDS[chip]} ${reach === 'close' ? 'from your circle' : 'around you'} right now.`
                      : reach === 'close'
                        ? 'Nothing from your circle right now. Their Moments and posts show here as they share them.'
                        : 'Nothing around you right now. Post the first Moment, or ask something.'}
                  </p>
                  {chip !== 'all' && (
                    <button type="button" className="rp-button" onClick={() => setChip('all')}>
                      Show all
                    </button>
                  )}
                </div>
              )}
              <ol className="rp-items">
                {items.map((item) => {
                  const label = item.band ? bandLabels.get(item.band) || null : null;
                  const line = reach === 'around' && item.band && item.band !== prevBand ? label : null;
                  prevBand = item.band;
                  return (
                    <li key={`${item.type}:${item.id}`}>
                      {line && (
                        <p className="rp-band" role="separator">
                          <span>{line}</span>
                        </p>
                      )}
                      {item.type === 'moment' ? (
                        <MomentRow moment={item.moment} bandLabel={label} now={now} onOpen={openMoment} onPlace={flyTo} />
                      ) : (
                        <PostRow
                          post={item.post}
                          point={itemPoint(item)}
                          onPlace={flyTo}
                          card={{ ...card, isLiking: busyIds.has(item.post.id) }}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
              <div ref={sentinel} className="rp-sentinel" />
              {isFetchingNextPage && <p className="rp-muted rp-center">Loading more…</p>}
              {!hasNextPage && last?.end && <p className="rp-end">{last.end}</p>}
            </>
          )}
        </div>
      </section>

      {!creating && (
        <button type="button" className="rp-create" aria-label="Create" title="Create" onClick={() => setCreating(true)}>
          <Plus size={24} strokeWidth={2.6} aria-hidden />
        </button>
      )}
      {creating && account && (
        <Composer
          account={account}
          onClose={() => setCreating(false)}
          onDone={(msg) => {
            setCreating(false);
            setToast(msg);
            void client.invalidateQueries({ queryKey: ['reinvented'] });
          }}
        />
      )}

      {toast && (
        <div className="rp-toast" role="status">
          {toast}
        </div>
      )}

      {atlasItem && account && (
        <AtlasItem
          moment={atlasItem}
          account={account}
          onClose={() => setAtlasItem(null)}
          onDeleted={(id) => {
            setAtlasItem(null);
            dropFromAtlas(client, id);
            dropItem(id);
            setToast('Deleted for good.');
          }}
        />
      )}
      {viewing && account && (
        <MomentViewer
          key={viewing.id}
          id={viewing.id}
          account={account}
          ids={viewing.ids}
          wide={false}
          onClose={() => setViewing(null)}
          onSelect={(id) => setViewing((v) => (v ? { ...v, id } : v))}
          onSeen={() => undefined}
          onWatchedPlace={() => undefined}
          onRemove={(id) => {
            setViewing(null);
            dropItem(id);
          }}
          onPlace={(p) => {
            setViewing(null);
            flyTo(p);
          }}
          studio={studioViewer}
        />
      )}
    </div>
  );
}
