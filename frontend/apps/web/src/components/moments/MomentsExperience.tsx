'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { geo, location, moments } from '@pantopus/api';
import type { Box, MapResult, Point, Ring } from '@pantopus/api/endpoints/moments';
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  CircleDashed,
  Clock3,
  Compass,
  Layers3,
  LocateFixed,
  MapPin,
  Mountain,
  Play,
  Plus,
  Radio,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { safeRedirectPath } from '@pantopus/ui-utils';
import { useMe } from '@/lib/me';
import GuidanceScreen from '@/components/guidance/GuidanceScreen';
import { useMomentsAccess } from './useMomentsAccess';
import type { MapTarget } from './MomentsMap';
import { MomentFace } from './MomentFace';
import MomentDialog from './MomentDialog';
import {
  deviceFix,
  messageOf,
  openingZoom,
  peopleInView,
  readViewport,
  timeAgo,
  visibleRings,
  world,
} from './momentState';

const MomentsMap = dynamic(() => import('./MomentsMap'), { ssr: false });
const Viewer = dynamic(() => import('./MomentViewer'), { ssr: false });
const Composer = dynamic(() => import('./MomentComposer'), { ssr: false });
const base = '/app/moments';
const initial = { latitude: 18, longitude: 0, zoom: 2, serial: 0 };
const noRings: Ring[] = [];
const times = [
  [0, 'All times'],
  [30, 'Last 30 minutes'],
  [60, 'Last hour'],
  [1440, 'Last 24 hours'],
] as const;
function equalBox(a: Box, b: Box) {
  return (
    a.zoom === b.zoom &&
    (['south', 'north', 'west', 'east'] as const).every((k) => Math.abs(a[k] - b[k]) < 0.000001)
  );
}
function AreaPicker({
  center,
  onPick,
  onLocate,
  onClose,
}: {
  center: Point;
  onPick(p: Point, name: string): void;
  onLocate(): void;
  onClose(): void;
}) {
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQ(term.trim()), 300);
    return () => clearTimeout(timer);
  }, [term]);
  const places = useQuery({
    queryKey: ['moments', 'places', q, center.latitude, center.longitude],
    queryFn: ({ signal }) => geo.searchPlaces(q, center, signal),
    enabled: q.length >= 2,
    retry: false,
  });
  return (
    <MomentDialog label="Choose an area" onClose={onClose}>
      <div className="mo-panel">
        <div className="mo-title-row">
          <h2>Choose an area</h2>
          <button className="mo-icon" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <label className="mo-search">
          <Search size={18} />
          <input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search for a city or place"
            aria-label="Find a place"
          />
        </label>
        <button className="mo-action" onClick={onLocate}>
          <LocateFixed /> Use my location
        </button>
        {q.length >= 2 &&
          (places.isPending ? (
            <p>Searching…</p>
          ) : places.isError ? (
            <p>Places couldn’t load. Try again or move the map.</p>
          ) : places.data?.places.length ? (
            places.data.places.map((p, i) => (
              <button
                className="mo-place-result"
                key={p.place_id || i}
                onClick={() => onPick({ latitude: p.center.lat, longitude: p.center.lng }, p.name)}
              >
                <MapPin />
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.address || p.full_address}</small>
                </span>
              </button>
            ))
          ) : (
            <p>No matching places.</p>
          ))}
      </div>
    </MomentDialog>
  );
}
function People({
  title,
  rings,
  center,
  onPlay,
}: {
  title: string;
  rings: Ring[];
  center: Point;
  onPlay(rings: Ring[]): void;
}) {
  const people = peopleInView(rings, center);
  if (!people.length) return null;
  return (
    <section className="mo-people">
      <div className="mo-list-heading">
        <h3>{title}</h3>
        <button onClick={() => onPlay(people.flat())}>
          <Play size={13} fill="currentColor" />
          Play all
        </button>
      </div>
      {people.map((group) => {
        const r = group[0],
          count = group.reduce((sum, x) => sum + x.moments.length, 0),
          fresh = group.some((x) => x.unseen_count > 0);
        return (
          <button className="mo-person" key={r.author.id} onClick={() => onPlay(group)}>
            <MomentFace author={r.author} fresh={fresh} segments={count} />
            <span>
              <strong>{r.mine ? 'Your Moments' : r.author.name}</strong>
              <small>
                {[
                  r.place_label,
                  timeAgo(
                    group.reduce((newest, x) => (x.newest_at > newest ? x.newest_at : newest), r.newest_at),
                  ),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            </span>
            <span className="mo-person-count">
              {count}
              {fresh && <i />}
            </span>
          </button>
        );
      })}
    </section>
  );
}

function Board({ account }: { account: string }) {
  const path = usePathname() || base,
    router = useRouter(),
    params = useSearchParams();
  const id = path.slice(base.length + 1).split('/')[0] || '';
  const person = params?.get('person') || '';
  const [target, setTarget] = useState<MapTarget>(initial),
    [box, setBox] = useState<Box>(world);
  const [areaName, setAreaName] = useState('Explore the map'),
    [areaOpen, setAreaOpen] = useState(false);
  const [editor, setEditor] = useState(false),
    [note, setNote] = useState('');
  const [focus, setFocus] = useState<{ rings: string[]; title: string; previous: MapTarget } | null>(null);
  const [time, setTime] = useState(0),
    [live, setLive] = useState(false),
    [elevation, setElevation] = useState(true);
  const [legend, setLegend] = useState(false),
    [now, setNow] = useState(Date.now);
  const [expanded, setExpanded] = useState(false);
  const [wide, setWide] = useState(false),
    [queue, setQueue] = useState<string[]>([]);
  const returnPath = useRef<string | null>(null);
  const back = params?.get('returnTo');
  if (back) returnPath.current = /^\/[a-zA-Z0-9_]{3,30}$/.test(back) ? back : safeRedirectPath(back, base);
  const ownedHistory = useRef(false),
    initialized = useRef(false);
  const byHand = useRef(false),
    framed = useRef(false),
    watchedAt = useRef<Point | null>(null);
  const client = useQueryClient();
  const viewing = useQuery({
    queryKey: ['moments', 'initial-area', account],
    queryFn: location.getLocation,
    staleTime: 60_000,
    retry: false,
  });
  const map = useQuery({
    queryKey: ['moments', 'map', account, box],
    queryFn: ({ signal }) => readViewport(box, signal),
    staleTime: 8000,
    gcTime: 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
    retry: false,
  });
  const move = useCallback(
    (p: Point, zoom = 14) => setTarget((prev) => ({ ...p, zoom, serial: prev.serial + 1 })),
    [],
  );
  const locate = useCallback(async () => {
    initialized.current = true;
    setNote('Finding your location…');
    try {
      const { coords } = await deviceFix();
      move({ latitude: coords.latitude, longitude: coords.longitude });
      setFocus(null);
      setAreaName('Current location');
      setNote('');
    } catch (e) {
      setNote(messageOf(e, 'Location unavailable'));
    }
  }, [move]);
  useEffect(() => {
    const mq = matchMedia('(min-width: 1000px)'),
      change = () => setWide(mq.matches);
    change();
    mq.addEventListener('change', change);
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      mq.removeEventListener('change', change);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (initialized.current || !viewing.isFetched) return;
    initialized.current = true;
    const v = viewing.data?.viewingLocation || viewing.data?.homes[0];
    if (v && Number.isFinite(v.latitude) && Number.isFinite(v.longitude)) {
      move({ latitude: v.latitude, longitude: v.longitude });
      setAreaName(('label' in v ? v.label : v.city) || 'Your area');
    } else if (navigator.permissions) {
      void navigator.permissions
        .query({ name: 'geolocation' })
        .then((result) => {
          if (result.state === 'granted') void locate();
        })
        .catch(() => {});
    }
  }, [viewing.data, viewing.isFetched, move, locate]);
  const center = {
    latitude: (box.north + box.south) / 2,
    longitude: (((box.east + box.west) / 2 + 540) % 360) - 180,
  };
  const displayArea =
    box.zoom <= 4
      ? 'The world'
      : Math.abs(center.latitude - target.latitude) > (box.north - box.south) * 0.45 ||
          Math.abs(center.longitude - target.longitude) > (box.east - box.west) * 0.45
        ? 'Map area'
        : areaName;
  const data = map.isError ? undefined : map.data;
  const pins = useMemo(
    () => visibleRings(data?.rings || noRings, now, time, live),
    [data?.rings, now, time, live],
  );
  const unplaced = useMemo(
    () => visibleRings(data?.unplaced || noRings, now, time, live),
    [data?.unplaced, now, time, live],
  );
  const focused = focus ? pins.filter((r) => focus.rings.includes(r.id)) : pins;
  const mine = useQuery({
    queryKey: ['moments', 'mine', account],
    queryFn: moments.mine,
    staleTime: 15000,
    refetchInterval: 30000,
    retry: false,
  });
  const pending = mine.isError
    ? []
    : mine.data?.moments.filter((m) => ['uploading', 'held', 'checking'].includes(m.state)) || [];
  useEffect(() => {
    if (
      framed.current ||
      byHand.current ||
      !initialized.current ||
      box.zoom < 10 ||
      Math.abs(center.latitude - target.latitude) > 0.01 ||
      Math.abs(center.longitude - target.longitude) > 0.02 ||
      !map.isSuccess ||
      id ||
      focus
    )
      return;
    const controller = new AbortController();
    void openingZoom(target, box, controller.signal)
      .then((zoom) => {
        if (controller.signal.aborted || byHand.current) return;
        framed.current = true;
        if (zoom < box.zoom) move(target, zoom);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [box, center.latitude, center.longitude, focus, id, map.isSuccess, move, target]);
  const onWatchedPlace = useCallback((point: Point | null) => {
    watchedAt.current = point;
  }, []);
  const actions = useCallback(() => {
    void client.invalidateQueries({ queryKey: ['moments'] });
  }, [client]);
  const close = useCallback(() => {
    const p = watchedAt.current;
    watchedAt.current = null;
    if (
      p &&
      !focus &&
      !returnPath.current &&
      (p.latitude < box.south || p.latitude > box.north || p.longitude < box.west || p.longitude > box.east)
    )
      move(p);
    if (ownedHistory.current) {
      ownedHistory.current = false;
      window.history.back();
    } else router.replace(returnPath.current || base, { scroll: false });
  }, [router, box, focus, move]);
  const select = useCallback(
    (next: string) => window.history.replaceState(null, '', base + '/' + encodeURIComponent(next)),
    [],
  );
  const open = useCallback(
    (ids: string[], start?: string) => {
      if (!ids.length) return;
      setQueue([...new Set(ids)]);
      ownedHistory.current = !id || ownedHistory.current;
      window.history[id ? 'replaceState' : 'pushState'](
        null,
        '',
        base + '/' + encodeURIComponent(start || ids[0]),
      );
    },
    [id],
  );
  const play = (rings: Ring[]) => {
    const entries = rings.flatMap((r) => r.moments);
    open(
      entries.map((m) => m.id),
      entries.find((m) => !m.seen)?.id,
    );
  };
  const who = useQuery({
    queryKey: ['moments', 'author', account, person],
    queryFn: () => moments.people([person]),
    enabled: !!person && !id,
    retry: false,
  });
  useEffect(() => {
    if (!person || id || !who.isFetched) return;
    const entries = who.data?.rings.flatMap((r) => r.moments) || [];
    if (!entries.length) {
      setNote('No Moments available from this person.');
      router.replace(base, { scroll: false });
      return;
    }
    setQueue(entries.map((m) => m.id));
    select((entries.find((m) => !m.seen) || entries[0]).id);
  }, [person, id, who.isFetched, who.data, select, router]);
  const ids = useMemo(() => (queue.includes(id) ? queue : [id]), [id, queue]);
  const seen = useCallback(
    (seenId: string) => {
      client.setQueriesData<MapResult>({ queryKey: ['moments', 'map', account] }, (old) => {
        if (!old) return old;
        const update = (row: Ring) => {
          const items = row.moments.map((m) => (m.id === seenId ? { ...m, seen: true } : m));
          return { ...row, moments: items, unseen_count: items.filter((m) => !m.seen).length };
        };
        return { ...old, rings: old.rings.map(update), unplaced: old.unplaced.map(update) };
      });
      void client.invalidateQueries({ queryKey: ['moments', 'unseen'] });
      void client.invalidateQueries({ queryKey: ['moments', 'face', account] });
    },
    [client, account],
  );
  const remove = useCallback(
    (removed: string, author?: string) => {
      close();
      client.setQueriesData<MapResult>({ queryKey: ['moments', 'map', account] }, (old) => {
        if (!old) return old;
        const keep = (r: Ring) => r.author.id !== author && r.moments.some((m) => m.id !== removed);
        const prune = (r: Ring) => ({
          ...r,
          moments: r.moments.filter((m) => m.id !== removed),
          preview: r.preview?.moment_id === removed ? null : r.preview,
        });
        return {
          ...old,
          rings: old.rings.filter(keep).map(prune),
          unplaced: old.unplaced.filter(keep).map(prune),
          scheduled: old.scheduled?.filter((m) => m.id !== removed),
        };
      });
      client.setQueryData(['moments', 'quote', account, removed], null);
      if (author) client.setQueryData(['moments', 'face', account, author], null);
      actions();
    },
    [account, client, close, actions],
  );
  const bounds = useCallback((next: Box) => setBox((old) => (equalBox(old, next) ? old : next)), []);
  const empty = !focused.length && !unplaced.length,
    filtered = !!time || live;
  const scheduled = data?.scheduled || [];
  const viewer = id && (
    <Viewer
      key={id}
      account={account}
      id={id}
      ids={ids}
      wide={wide}
      onClose={close}
      onSelect={select}
      onSeen={seen}
      onRemove={remove}
      onWatchedPlace={onWatchedPlace}
      onPlace={(p) => {
        close();
        move(p, 16);
      }}
    />
  );
  return (
    <div className="mo-board">
      {!id && !editor && data && <GuidanceScreen name="moments" />}
      <header className="mo-toolbar">
        <button className="mo-area" onClick={() => setAreaOpen(true)} title={displayArea} aria-haspopup="dialog">
          <MapPin size={16} />
          <span>{displayArea}</span>
          <ChevronDown size={14} />
        </button>
        <button className="mo-primary" onClick={() => setEditor(true)}>
          <Plus size={19} /> Create Moment
        </button>
      </header>
      <div className={'mo-workspace' + (expanded ? ' mo-expanded' : '')}>
        <section aria-label="Explore Moments" className="mo-map-wrap">
          <MomentsMap
            target={target}
            rings={pins}
            focused={focus?.rings || []}
            elevation={elevation && !!data?.heights_on}
            float={!!data?.float_on}
            sun={data?.sun}
            onGesture={() => {
              initialized.current = true;
              byHand.current = true;
            }}
            onBounds={bounds}
            onOpen={(r) => play([r])}
            onLocate={() => void locate()}
            onCluster={(rings, p, zoom) => {
              byHand.current = true;
              setFocus((old) => ({
                rings: rings.map((r) => r.id),
                title: rings[0].place_label || 'This spot',
                previous: old?.previous || { ...center, zoom: box.zoom, serial: 0 },
              }));
              move(p, zoom);
            }}
          />
          <div className="mo-filters">
            <div className="mo-chip mo-time">
              <Clock3 size={15} />
              <select
                aria-label="Filter Moments by time"
                value={time}
                onChange={(e) => setTime(Number(e.target.value))}
              >
                {times.map(([n, label]) => (
                  <option key={n} value={n}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </div>
            <button className="mo-chip" aria-pressed={live} onClick={() => setLive((v) => !v)}>
              <Radio size={15} />
              Live now
            </button>
            {data?.heights_on && (
              <button
                className="mo-chip"
                aria-pressed={elevation}
                onClick={() => {
                  setElevation((v) => !v);
                  setLegend(false);
                }}
              >
                <Mountain size={16} />
                Elevation
              </button>
            )}
            {data?.heights_on && elevation && (
              <button
                className="mo-chip mo-legend-button"
                aria-label="Elevation colors"
                aria-expanded={legend}
                onClick={() => setLegend((v) => !v)}
              >
                <span className="mo-dots" />
                <ChevronDown size={12} />
              </button>
            )}
          </div>
          {elevation && legend && data?.heights_on && (
            <div className="mo-legend">
              <button aria-label="Close elevation key" onClick={() => setLegend(false)}>
                <X size={14} />
              </button>
              <strong>Elevation in feet</strong>
              <div className="mo-key-bands">
                {['0 ft', '500', '2,000', '6,000', 'Flying'].map((t, i) => (
                  <span
                    key={t}
                    style={{ borderColor: ['#16a34a', '#84b91c', '#d99213', '#c94872', '#287fbe'][i] }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              {data.sun && (
                <small>
                  <Sun size={13} />
                  {data.sun.elevation_deg > 0
                    ? new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : 'After sunset'}
                </small>
              )}
            </div>
          )}
          {focus && (
            <button
              className="mo-back mo-chip"
              onClick={() => {
                move(focus.previous, focus.previous.zoom);
                setFocus(null);
              }}
            >
              <ArrowLeft size={15} />
              Back to area
            </button>
          )}
        </section>
        <aside className="mo-rail" aria-label="Moments in view">
          {wide && viewer ? (
            viewer
          ) : (
            <>
              <div className="mo-rail-title">
                <span className="mo-rail-symbol">
                  <Layers3 size={19} />
                </span>
                <h2>{focus ? focus.title : 'In this view'}</h2>
                <button
                  className="mo-tray-toggle"
                  aria-expanded={expanded}
                  aria-label={expanded ? 'Collapse Moments list' : 'Expand Moments list'}
                  onClick={() => setExpanded((v) => !v)}
                >
                  <ChevronDown size={18} />
                </button>
              </div>
              {map.isPending ? (
                <div className="mo-empty" role="status">
                  <CircleDashed className="mo-spin" />
                  <p>Finding Moments…</p>
                </div>
              ) : map.isError ? (
                <div className="mo-empty">
                  <Compass />
                  <h3>Moments couldn’t load</h3>
                  <button className="mo-link" onClick={() => void map.refetch()}>
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  <People
                    title={focus ? 'At this spot' : 'On the map'}
                    rings={focused}
                    center={center}
                    onPlay={play}
                  />
                  {!focus && <People title="Not on the map" rings={unplaced} center={center} onPlay={play} />}
                  {(focus ? !focused.length : empty) && (
                    <div className="mo-empty">
                      <span className="mo-empty-icon">
                        <CircleDashed />
                      </span>
                      <h3>
                        {filtered
                          ? 'No matching Moments'
                          : box.east - box.west > 5
                            ? 'Explore an area'
                            : 'No Moments here yet'}
                      </h3>
                      <p>
                        {filtered
                          ? 'Try a different time or turn off Live now.'
                          : box.east - box.west > 5
                            ? 'Zoom in or choose a place to see what people are sharing.'
                            : 'Share a glimpse of this place, or move the map to explore.'}
                      </p>
                      <button
                        className="mo-link"
                        onClick={() => {
                          if (filtered) {
                            setTime(0);
                            setLive(false);
                          } else if (box.east - box.west > 5) setAreaOpen(true);
                          else setEditor(true);
                        }}
                      >
                        {filtered
                          ? 'Clear filters'
                          : box.east - box.west > 5
                            ? 'Choose an area'
                            : 'Create a Moment'}
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                  )}
                  {pending.length > 0 && (
                    <section className="mo-people">
                      <h3>Your pending Moments</h3>
                      {pending.map((m) => (
                        <button key={m.id} className="mo-person" onClick={() => open([m.id])}>
                          <Clock3 />
                          <span>
                            <strong>{m.caption || m.kind + ' Moment'}</strong>
                            <small>
                              {m.state === 'held'
                                ? 'On hold'
                                : m.state === 'checking'
                                  ? 'Checking media'
                                  : 'Awaiting upload'}
                            </small>
                          </span>
                        </button>
                      ))}
                    </section>
                  )}
                  {scheduled.length > 0 && (
                    <section className="mo-people">
                      <h3>Sharing later</h3>
                      {scheduled.map((m) => (
                        <button key={m.id} className="mo-person" onClick={() => open([m.id])}>
                          <Clock3 />
                          <span>
                            <strong>{m.text || m.caption || 'Your Moment'}</strong>
                            <small>{m.share_at && new Date(m.share_at).toLocaleString()}</small>
                          </span>
                        </button>
                      ))}
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </aside>
      </div>
      {!wide && viewer}
      {note && (
        <div className="mo-toast" role="status">
          {note}
          <button onClick={() => setNote('')} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
      {areaOpen && (
        <AreaPicker
          center={center}
          onClose={() => setAreaOpen(false)}
          onLocate={() => {
            setAreaOpen(false);
            void locate();
          }}
          onPick={(p, name) => {
            initialized.current = true;
            byHand.current = true;
            move(p);
            setFocus(null);
            setAreaName(name);
            setAreaOpen(false);
          }}
        />
      )}
      {editor && (
        <Composer
          account={account}
          onClose={() => setEditor(false)}
          onDone={(msg) => {
            setEditor(false);
            setNote(msg);
            actions();
          }}
        />
      )}
    </div>
  );
}
export default function MomentsExperience() {
  const flag = useMomentsAccess(),
    me = useMe();
  if (flag.isPending || me.isPending)
    return (
      <div className="mo-gate" role="status">
        Opening Moments…
      </div>
    );
  if (flag.isError || me.isError)
    return (
      <div className="mo-gate">
        <h1>Moments couldn’t load</h1>
        <button
          className="mo-link"
          onClick={() => {
            void flag.refetch();
            void me.refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  if (!flag.data?.enabled || !me.data?.id)
    return (
      <div className="mo-gate">
        <CircleDashed />
        <h1>Moments isn’t available for this account</h1>
        <Link href="/app/place">Back to Place</Link>
      </div>
    );
  return <Board key={me.data.id} account={me.data.id} />;
}
