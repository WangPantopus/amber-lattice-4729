'use client';

// The Studio (Pulse, reinvented, phase 0 step 7 on the web): today's Moment composer redrawn as one full-screen
// canvas. The picture fills the frame, the tools sit on the right, and one bar at the bottom says who sees it, how long
// it stays and where, with Post. Everything today's Post settings hold is in the drawer the pill opens. It is shown
// only while the `pulse_reinvented` switch is on for the person (MomentComposerEntry); off, today's composer opens,
// unchanged. It posts the same Moment as today's composer, with the same rules and the same requests. The words on it
// are the ones the lead set for all three apps (coord/QUESTIONS.md, 2026-11-26 23:36).

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { geo, moments } from '@pantopus/api';
import type { Audience, Background, Hours, Location, NewMoment } from '@pantopus/api/endpoints/moments';
import type { MomentChatDraft } from '@pantopus/types';
import {
  ArrowRight,
  Camera,
  ChevronDown,
  Clock3,
  Crop,
  ImagePlus,
  LocateFixed,
  MapPin,
  RotateCw,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { readCaptureMetadata, type CaptureMetadata } from '@/components/feed/composer/mediaLocation';
import { useDialogFocusTrap } from '@/lib/useDialogFocusTrap';
import MomentCamera, { type CameraCapture } from '@/components/moments/MomentCamera';
import { blankArt, inks } from '@/components/moments/momentArtwork';
import {
  colors,
  deviceFix,
  distance,
  gpsLocation,
  messageOf,
  PIN_REVIEW_DISTANCE_M,
  recentFix,
  type DeviceFix,
} from '@/components/moments/momentState';
import { prepareMedia } from '@/components/moments/momentMedia';
import { discardJob, keepJob, pendingJobs, postJob, type Job } from '@/components/moments/momentOutbox';
import StudioPicture, { type StudioTool } from './StudioPicture';
import './studio.css';

const PlacePreview = dynamic(() => import('@/components/moments/MomentPlacePreview'), { ssr: false });
const fallback = { max_seconds: 30, max_parts: 1, max_bytes: 50 * 1024 * 1024 };
const inkNames = ['White', 'Black', 'Yellow', 'Red', 'Blue', 'Green'];
const pens = [0.006, 0.012, 0.024];
// At home the place line reads "Area · <town>"; the first time only, one line under it says why (design §4).
const HOME_NOTE_KEY = 'pantopus.studio.homeAreaNoteSeen';
type Placement = 'exact' | 'area' | 'place' | 'none';

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(min-width: 1000px)');
    const read = () => setWide(q.matches);
    read();
    q.addEventListener('change', read);
    return () => q.removeEventListener('change', read);
  }, []);
  return wide;
}

function Chip({ on, children, ...rest }: { on: boolean; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="st-chip" aria-pressed={on} {...rest}>
      {children}
    </button>
  );
}

export default function Studio({
  account,
  draft = null,
  onClose,
  onDone,
}: {
  account: string;
  draft?: MomentChatDraft | null;
  onClose(): void;
  onDone(msg: string): void;
}) {
  const wide = useWide();
  const [files, setFiles] = useState<File[]>([]),
    [index, setIndex] = useState(0),
    [mode, setMode] = useState<'none' | 'text' | 'media'>(draft?.kind === 'text' ? 'text' : 'none');
  const file = mode === 'media' ? files[index] : undefined;
  const [camera, setCamera] = useState(false),
    [capture, setCapture] = useState<CameraCapture | null>(null);
  const [art, setArt] = useState(blankArt),
    [text, setText] = useState(draft?.kind === 'text' ? draft.text || '' : ''),
    [caption, setCaption] = useState(''),
    [bg, setBg] = useState<Background>(draft?.kind === 'text' && draft.background ? draft.background : 'teal');
  const draftCaption = useRef(draft?.kind === 'photo' ? draft.caption || '' : '');
  const [hours, setHours] = useState<Hours>(draft?.hours ?? 24),
    [audience, setAudience] = useState<Audience>(draft?.audience ?? 'nearby'),
    [placement, setPlacement] = useState<Placement>('exact');
  const [fix, setFix] = useState<DeviceFix | null>(null),
    [meta, setMeta] = useState<CaptureMetadata | null>(null),
    [reading, setReading] = useState(false);
  const [locating, setLocating] = useState(false),
    [locError, setLocError] = useState('');
  const [venue, setVenue] = useState(''),
    [venueTerm, setVenueTerm] = useState(''),
    [search, setSearch] = useState('');
  const [height, setHeight] = useState(false),
    [weather, setWeather] = useState(false),
    [later, setLater] = useState('');
  const [adult, setAdult] = useState(false),
    [homeAck, setHomeAck] = useState(false),
    [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [jobs, setJobs] = useState<Job[]>([]),
    [recovered, setRecovered] = useState(false);
  const [tool, setTool] = useState<StudioTool>(null),
    [ink, setInk] = useState(inks[0]),
    [pen, setPen] = useState(pens[1]);
  const [drawerOpen, setDrawerOpen] = useState(false),
    [discarding, setDiscarding] = useState(false),
    [askedPost, setAskedPost] = useState(false),
    [homeNote, setHomeNote] = useState(false);
  const drawer = drawerOpen || wide;
  const handle = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement>(null),
    drawerRef = useRef<HTMLElement>(null),
    textInput = useRef<HTMLInputElement>(null),
    mounted = useRef(true),
    submitting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      mounted.current = false;
      handle.current?.abort();
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void pendingJobs(account)
      .then((j) => {
        if (active) setJobs(j);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setRecovered(true);
      });
    return () => {
      active = false;
    };
  }, [account]);
  const locate = useCallback(async () => {
    setLocating(true);
    setLocError('');
    try {
      const f = await deviceFix(0);
      if (mounted.current) setFix(f);
    } catch (e) {
      if (mounted.current) setLocError(messageOf(e, 'Location unavailable'));
    } finally {
      if (mounted.current) setLocating(false);
    }
  }, []);
  useEffect(() => {
    if (!recovered || jobs.length || !navigator.permissions) return;
    let active = true;
    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((s) => {
        if (active && s.state === 'granted') void locate();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [locate, recovered, jobs.length]);
  useEffect(() => {
    let active = true;
    setMeta(null);
    setReading(!!file);
    setArt(blankArt());
    setTool(null);
    setCaption(file ? draftCaption.current : '');
    if (file) draftCaption.current = '';
    setVenue('');
    setHeight(false);
    setWeather(false);
    setHomeAck(false);
    if (file)
      void readCaptureMetadata(file).then((m) => {
        if (active) {
          setMeta(m);
          setReading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [file]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (tool === 'text') textInput.current?.focus();
  }, [tool]);
  const fromAlbum =
    file && capture?.file !== file && meta?.capturedAt && meta.latitude != null && meta.longitude != null ? meta : null;
  const point =
    placement === 'none'
      ? null
      : fromAlbum
        ? { latitude: fromAlbum.latitude!, longitude: fromAlbum.longitude! }
        : fix
          ? { latitude: fix.coords.latitude, longitude: fix.coords.longitude }
          : null;
  const marked = !!(
    file &&
    capture?.file === file &&
    capture.position &&
    point &&
    now - capture.at <= 600000 &&
    distance(point, capture.position.coords) <= 150
  );
  const preview = useQuery({
    queryKey: ['moments', 'preview', account, point?.latitude, point?.longitude, marked],
    queryFn: ({ signal }) => moments.preview(point, marked, signal),
    retry: 1,
    staleTime: 60000,
  });
  const p = preview.data;
  useEffect(() => {
    if (p?.adult_confirmed) setAdult(true);
  }, [p?.adult_confirmed]);
  async function confirmAge() {
    if (busy) return;
    setBusy('Confirming…');
    setError('');
    try {
      await moments.confirmAdult();
      if (mounted.current) {
        setAdult(true);
        void preview.refetch();
      }
    } catch (e) {
      if (mounted.current) setError(messageOf(e, 'Couldn’t confirm eligibility.'));
    } finally {
      if (mounted.current) setBusy('');
    }
  }
  const limits = useQuery({
    queryKey: ['moments', 'limits', account],
    queryFn: moments.limits,
    staleTime: 60000,
    retry: false,
  });
  const area = placement === 'area' || !!(p?.sky && p.at_home),
    noPlace = placement === 'none';
  const attested = !!p?.adult_confirmed || adult;
  const live = marked && !p?.at_home && !area && !noPlace;
  const altitude = fromAlbum ? fromAlbum.altitude : fix?.coords.altitude;
  const canHeight = point && p?.can_show_height && altitude != null && (!area || p.sky);
  const homeWarning = point && p?.at_home && !p.sky && !area;
  useEffect(() => {
    const t = setTimeout(() => setSearch(venueTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [venueTerm]);
  const venues = useQuery({
    queryKey: ['moments', 'venues', account, point?.latitude, point?.longitude, search],
    enabled: placement === 'place' && !!point,
    queryFn: ({ signal }) =>
      search.length >= 2 ? geo.searchPlaces(search, point, signal) : geo.nearbyPlaces(point!.latitude, point!.longitude, signal),
    retry: false,
    staleTime: 30000,
  });
  const pickedVenue = venues.data?.places.find((v) => v.place_id === venue);
  const shownPoint = area
    ? p?.area
    : placement === 'place' && pickedVenue
      ? { latitude: pickedVenue.center.lat, longitude: pickedVenue.center.lng }
      : point;
  const nearby =
    venues.data?.places.filter(
      (v) =>
        v.place_id?.startsWith('osm:') &&
        point &&
        distance(point, { latitude: v.center.lat, longitude: v.center.lng }) <= (p?.pick_within_m || 0),
    ) || [];
  // At home with the Sky on, the Moment shows as the area: say why the first time only.
  useEffect(() => {
    if (!(p?.at_home && p.sky) || noPlace || mode === 'none') return;
    try {
      if (localStorage.getItem(HOME_NOTE_KEY)) return;
      localStorage.setItem(HOME_NOTE_KEY, '1');
    } catch {
      /* private window: say it each time */
    }
    setHomeNote(true);
  }, [p?.at_home, p?.sky, noPlace, mode]);

  function choose(items: File[]) {
    const valid = items.filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/') || /\.(heic|heif|mov|mp4)$/i.test(f.name),
    );
    if (!valid.length) {
      setError('Choose a photo or video.');
      return;
    }
    setError('');
    setCapture(null);
    setFiles(valid);
    setIndex(0);
    setMode('media');
  }
  async function deliver(job: Job, signal: AbortSignal) {
    const result = await postJob(job, signal, (s) => {
      if (mounted.current) setBusy(s);
    });
    if (!mounted.current) return;
    setJobs((old) => old.filter((j) => j.id !== job.id));
    const state = result.find((m) => m.state !== 'live')?.state;
    const msg =
      state === 'scheduled'
        ? 'Moment scheduled.'
        : state === 'held'
          ? 'This Moment is on hold.'
          : state === 'checking'
            ? 'Media received. Your Moment is being checked.'
            : state === 'ended'
              ? 'This Moment has ended.'
              : 'Moment shared.';
    if (file && index + 1 < files.length) {
      setIndex((i) => i + 1);
      setBusy('');
      setError(msg + ' Review the next item.');
    } else onDone(msg);
  }
  async function submit(retry?: Job) {
    if (submitting.current) return;
    submitting.current = true;
    const controller = new AbortController();
    handle.current = controller;
    setBusy('Preparing…');
    setError('');
    try {
      if (retry) {
        await deliver(retry, controller.signal);
        return;
      }
      if (!p || !attested) throw new Error('Confirm you are 18 or older to post.');
      if (!noPlace && !point) throw new Error('Choose Use my location, or select No location.');
      if (noPlace && p.has_connections === false) throw new Error('A Moment without a location needs a connection.');
      if (homeWarning && !homeAck) throw new Error('Confirm the pin at your home, or choose Show area.');
      const kind =
        mode === 'text'
          ? 'text'
          : file && (file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name))
            ? 'video'
            : 'photo';
      const prepared = file
        ? await prepareMedia(file, art, limits.data?.video || fallback, controller.signal, (f) =>
            setBusy('Preparing video · ' + Math.round(f * 100) + '%'),
          )
        : [];
      controller.signal.throwIfAborted();
      let gps = fix;
      if (!noPlace && !fromAlbum && gps && !recentFix(gps.timestamp)) {
        setBusy('Updating your location…');
        const newFix = await deviceFix(0, controller.signal);
        controller.signal.throwIfAborted();
        setFix(newFix);
        if (distance(gps.coords, newFix.coords) > PIN_REVIEW_DISTANCE_M) {
          setHomeAck(false);
          setVenue('');
          setHeight(false);
          setWeather(false);
          throw new Error('Your location changed. Review the updated pin and share again.');
        }
        gps = newFix;
      }
      const loc: Location = noPlace
        ? { source: 'none' }
        : fromAlbum
          ? { source: 'capture', latitude: fromAlbum.latitude!, longitude: fromAlbum.longitude!, taken_at: fromAlbum.capturedAt! }
          : gpsLocation(gps!);
      const count = Math.max(1, prepared.length),
        series = crypto.randomUUID();
      const job: Job = {
        id: crypto.randomUUID(),
        account,
        created: Date.now(),
        parts: Array.from({ length: count }, (_, i) => {
          const body: NewMoment = {
            client_request_id: crypto.randomUUID(),
            kind,
            hours,
            audience: noPlace ? 'connections' : audience,
            location: loc,
            ...(kind === 'text'
              ? { text: text.trim(), background: bg }
              : caption.trim() && i === 0
                ? { caption: caption.trim() }
                : {}),
            ...(file && capture?.file !== file && meta?.capturedAt ? { taken_at: meta.capturedAt } : {}),
            ...(area && !noPlace ? { show_area: true } : {}),
            ...(placement === 'place' && !area
              ? {
                  pin: 'place' as const,
                  ...(venue.startsWith('osm:') ? { venue_id: venue } : venue ? { place_key: venue } : {}),
                }
              : {}),
            ...(later && p.share_later?.some((choice) => choice.key === later) ? { share_later: later } : {}),
            ...(height && canHeight && altitude != null
              ? {
                  altitude: {
                    meters: altitude,
                    accuracy_m: fromAlbum ? null : gps?.coords.altitudeAccuracy,
                    speed_mps: fromAlbum ? null : gps?.coords.speed,
                  },
                }
              : {}),
            ...(live &&
            capture &&
            Date.now() - capture.at <= 600000 &&
            gps &&
            capture.position &&
            distance(gps.coords, capture.position.coords) <= 150
              ? { taken_here: true, show_weather: weather }
              : {}),
            ...(count > 1 ? { series: { id: series, index: i + 1, count } } : {}),
          };
          return { body, media: prepared[i] };
        }),
      };
      try {
        await keepJob(job);
      } catch (e) {
        if (!(e instanceof DOMException)) throw e;
        job.memoryOnly = true;
        if (mounted.current) setError('Browser storage is full or unavailable. Keep this tab open until sharing finishes.');
      }
      if (mounted.current) setJobs((old) => [...old, job]);
      await deliver(job, controller.signal);
    } catch (e) {
      if (mounted.current) setError(messageOf(e, 'Couldn’t share. Try again.'));
    } finally {
      if (mounted.current) setBusy('');
      submitting.current = false;
      handle.current = null;
    }
  }
  // Post: a setting that still needs the person opens the drawer at it, with the reason, instead of failing. The reason
  // stays only while it still holds (today's composer's words).
  const blocker =
    !noPlace && !point
      ? 'Choose Use my location, or select No location.'
      : noPlace && p?.has_connections === false
        ? 'A Moment without a location needs a connection.'
        : homeWarning && !homeAck
          ? 'Confirm the pin at your home, or choose Show area.'
          : '';
  function tryPost() {
    if (!blocker) return void submit();
    setError('');
    setAskedPost(true);
    setDrawerOpen(true);
    requestAnimationFrame(() => drawerRef.current?.focus({ preventScroll: true }));
  }
  function dismiss() {
    handle.current?.abort();
    onClose();
  }
  // Something would be lost by going back: a picture, words on it or a drawing, a caption, the words of a card.
  const unsaved = mode === 'media' ? !!file : mode === 'text' && !!text.trim();
  function backToStart() {
    setDiscarding(false);
    setAskedPost(false);
    setTool(null);
    setDrawerOpen(false);
    setFiles([]);
    setIndex(0);
    setCapture(null);
    setArt(blankArt());
    setCaption('');
    setText('');
    setMode('none');
    setError('');
  }
  // The X: from a picture or words, back to the start (asking first when something would be lost); from the start,
  // out of the Studio. While posting it leaves as today's composer does: the upload stays in the outbox to resume.
  function closeOrBack() {
    if (busy || mode === 'none') dismiss();
    else if (unsaved) setDiscarding(true);
    else backToStart();
  }
  const trap = useDialogFocusTrap<HTMLDivElement>(() => {
    if (discarding) setDiscarding(false);
    else if (tool) setTool(null);
    else if (drawerOpen && !wide) setDrawerOpen(false);
    else if (camera) setCamera(false);
    else closeOrBack();
  });

  const placeName =
    placement === 'place'
      ? (venue && (p?.places.find((v) => v.key === venue)?.label || nearby.find((v) => v.place_id === venue)?.name)) ||
        p?.place?.label
      : area
        ? p?.area?.label || p?.area_label
        : p?.place_label;
  const placeLine = noPlace
    ? 'No location · friends only'
    : !point
      ? 'Choose your location'
      : (area ? 'Area · ' : '') +
        (placeName || (preview.isPending ? 'Finding place…' : 'Selected location'));
  const laterChoice = later ? p?.share_later?.find((v) => v.key === later) : undefined;
  const timeLine = laterChoice
    ? 'Shares at ' +
      new Date(laterChoice.at)
        .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        .replace(/\s?AM$/, ' am')
        .replace(/\s?PM$/, ' pm')
    : `Fades in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const who = noPlace || audience === 'connections' ? 'friends' : 'nearby';
  const content = mode === 'text' ? !!text.trim() : !!file;
  const ready = recovered && !busy && !reading && attested && !!p && content;
  const gate = jobs.length > 0 || !attested;
  const composing = !gate && !camera && mode !== 'none';

  const settings = (
    <section
      className="st-drawer"
      ref={drawerRef}
      tabIndex={-1}
      aria-label="Post settings"
      data-wide={wide || undefined}
    >
      <header>
        <h2>Post settings</h2>
        {!wide && (
          <button type="button" className="st-done" onClick={() => setDrawerOpen(false)}>
            Done
          </button>
        )}
      </header>
      <fieldset disabled={!!busy}>
        <div className="st-group" role="group" aria-label="Where it shows">
          <span className="st-label">
            <MapPin size={15} aria-hidden="true" />
            Where it shows
          </span>
          <div className="st-chips">
            <Chip
              on={placement === 'exact'}
              onClick={() => {
                setPlacement('exact');
                setVenue('');
                setHomeAck(false);
              }}
            >
              {p?.at_home && p.sky ? 'Area around home' : fromAlbum ? 'Where this was taken' : 'Where I am'}
            </Chip>
            <Chip
              on={placement === 'area'}
              onClick={() => {
                setPlacement('area');
                setVenue('');
                setHomeAck(false);
              }}
            >
              Show the area
            </Chip>
            {p && !p.at_home && (p.can_pin || p.places?.some((v) => v.key.startsWith('v_'))) && (
              <Chip
                on={placement === 'place'}
                onClick={() => {
                  setPlacement('place');
                  setVenue('');
                  setHomeAck(false);
                }}
              >
                Pin it at a place
              </Chip>
            )}
            <Chip
              on={placement === 'none'}
              onClick={() => {
                setPlacement('none');
                setVenue('');
                setHomeAck(false);
              }}
            >
              No location
            </Chip>
          </div>
          {!noPlace && (
            <div className="st-where">
              <div>
                <strong>{placeLine}</strong>
                <small>
                  {area
                    ? 'Only the area is shown.'
                    : point
                      ? 'A pin appears at this location.'
                      : 'Allow a location fix to place your Moment on the map.'}
                </small>
              </div>
              {!fromAlbum && (
                <button
                  type="button"
                  aria-label="Use my location"
                  title="Use my location"
                  disabled={locating}
                  onClick={() => void locate()}
                >
                  <LocateFixed size={19} />
                </button>
              )}
            </div>
          )}
          {!noPlace && locError && <small role="status">{locError}</small>}
          {point && p && shownPoint && (
            <div className="st-map">
              <PlacePreview point={shownPoint} radius={area ? p.area?.radius_m : undefined} />
            </div>
          )}
          {noPlace && (
            <p className="st-note">
              {p?.has_connections === false
                ? 'Add a connection to share without a location.'
                : 'Only your friends see it. It won’t appear on the map.'}
            </p>
          )}
          {placement === 'place' && (
            <>
              <label className="st-field">
                Place nearby
                <input value={venueTerm} onChange={(e) => setVenueTerm(e.target.value)} placeholder="Search places nearby" />
              </label>
              <select aria-label="Pin location" value={venue} onChange={(e) => setVenue(e.target.value)}>
                <option value="">{p?.place?.label || 'Suggested place'}</option>
                {p?.places
                  .filter((v) => v.key.startsWith('v_'))
                  .map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.label}
                    </option>
                  ))}
                {nearby.map((v) => (
                  <option key={v.place_id} value={v.place_id!}>
                    {v.name}
                  </option>
                ))}
              </select>
              {venues.data?.attribution && <small>{venues.data.attribution}</small>}
            </>
          )}
          {homeWarning && (
            <label className="st-check">
              <input type="checkbox" checked={homeAck} onChange={(e) => setHomeAck(e.target.checked)} />
              This is my home. People will see the pin on it.
            </label>
          )}
          {canHeight && (
            <label className="st-check">
              <input type="checkbox" checked={height} onChange={(e) => setHeight(e.target.checked)} />
              Show height
            </label>
          )}
          {live && (
            <div className="st-note">
              Live from here
              {p?.weather && (
                <label className="st-check">
                  <input type="checkbox" checked={weather} onChange={(e) => setWeather(e.target.checked)} />
                  Show weather · {p.weather.temp_f}°F
                </label>
              )}
            </div>
          )}
        </div>
        <div className="st-group" role="group" aria-label="How long">
          <span className="st-label">
            <Clock3 size={15} aria-hidden="true" />
            How long
          </span>
          <div className="st-chips">
            {([1, 6, 24, 48] as const).map((h) => (
              <Chip key={h} on={hours === h} onClick={() => setHours(h)}>
                {h} {h === 1 ? 'hour' : 'hours'}
              </Chip>
            ))}
          </div>
        </div>
        {!!p?.share_later?.length && (
          <div className="st-group" role="group" aria-label="When it shares">
            <span className="st-label">When it shares</span>
            <div className="st-chips">
              <Chip on={!later} onClick={() => setLater('')}>
                Now
              </Chip>
              {p.share_later.map((v) => (
                <Chip key={v.key} on={later === v.key} onClick={() => setLater(v.key)}>
                  {v.label} · {new Date(v.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </fieldset>
      {preview.isError && (
        <button type="button" className="st-linkish" onClick={() => void preview.refetch()}>
          Retry post settings
        </button>
      )}
    </section>
  );

  const stage = (
    <div
      ref={trap}
      className="st-studio"
      role="dialog"
      aria-modal="true"
      aria-label="Create Moment"
      data-wide={wide || undefined}
      data-drawer={(drawer && composing) || undefined}
    >
      <div className="st-stage">
        <div
          className="st-frame"
          data-tool={tool || undefined}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!busy && !gate) choose([...e.dataTransfer.files]);
          }}
        >
          <div className="st-art" style={mode === 'text' && !camera && !gate ? { background: colors[bg] } : undefined}>
            {camera ? (
              <MomentCamera
                maxSeconds={(limits.data?.video.max_seconds || 30) * (limits.data?.video.max_parts || 1)}
                onClose={() => setCamera(false)}
                onCapture={(c) => {
                  choose([c.file]);
                  setCapture(c);
                  if (c.position) setFix(c.position);
                  setCamera(false);
                }}
              />
            ) : gate ? null : mode === 'media' && file ? (
              <StudioPicture file={file} art={art} onChange={setArt} tool={tool} ink={ink} pen={pen} />
            ) : mode === 'text' ? (
              <div className="st-words">
                <textarea
                  aria-label="Your words"
                  maxLength={200}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="What’s happening here?"
                />
                <small>{text.length}/200</small>
              </div>
            ) : null}
          </div>
          {!camera && <div className="st-shade-top" aria-hidden="true" />}
          {!camera && <div className="st-shade-bottom" aria-hidden="true" />}

          {!camera && (
            <div className="st-top">
              <button
                type="button"
                className="st-round"
                aria-label={mode === 'none' ? 'Close without posting' : 'Back to the camera'}
                onClick={closeOrBack}
              >
                <X size={20} strokeWidth={2.4} />
              </button>
              {composing && files.length > 1 && file && (
                <span className="st-count">
                  {index + 1} of {files.length}
                </span>
              )}
            </div>
          )}

          {composing && mode === 'media' && file && (
            <div className="st-rail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
              <div className="st-tool">
                <span aria-hidden="true">Text</span>
                <button
                  type="button"
                  className="st-round st-aa"
                  aria-label="Text"
                  aria-pressed={tool === 'text'}
                  onClick={() => setTool(tool === 'text' ? null : 'text')}
                >
                  Aa
                </button>
              </div>
              <div className="st-tool">
                <span aria-hidden="true">Draw</span>
                <button
                  type="button"
                  className="st-round"
                  aria-label="Draw"
                  aria-pressed={tool === 'draw'}
                  onClick={() => setTool(tool === 'draw' ? null : 'draw')}
                >
                  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 17c3-7 5 3 8-3s4-9 10-6" />
                  </svg>
                </button>
              </div>
              <div className="st-tool">
                <span aria-hidden="true">Resize</span>
                <button
                  type="button"
                  className="st-round"
                  aria-label="Resize"
                  aria-pressed={tool === 'resize'}
                  onClick={() => setTool(tool === 'resize' ? null : 'resize')}
                >
                  <Crop size={21} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {composing && tool && (
            <div
              className="st-toolpanel"
              role="group"
              aria-label={tool === 'text' ? 'Words on the picture' : tool === 'draw' ? 'Draw' : 'Resize'}
            >
              {tool === 'resize' && (
                <>
                  <small className="st-hint">Drag the picture to move it.</small>
                  <div className="st-picture-row">
                    <label className="st-field">
                      Zoom
                      <input
                        type="range"
                        min=".5"
                        max="3"
                        step=".05"
                        value={art.zoom}
                        onChange={(e) => setArt({ ...art, zoom: Number(e.target.value) })}
                      />
                    </label>
                    <button
                      type="button"
                      className="st-chip"
                      onClick={() => setArt({ ...art, rotation: (art.rotation + 90) % 360 })}
                    >
                      <RotateCw size={15} aria-hidden="true" />
                      Turn
                    </button>
                  </div>
                </>
              )}
              {tool === 'text' && (
                <>
                  <input
                    ref={textInput}
                    aria-label="Words on the picture"
                    placeholder="Write on the picture"
                    maxLength={120}
                    value={art.text}
                    onChange={(e) => setArt({ ...art, text: e.target.value })}
                  />
                  <label className="st-field">
                    Size
                    <input
                      type="range"
                      min=".04"
                      max=".15"
                      step=".005"
                      value={art.size}
                      onChange={(e) => setArt({ ...art, size: Number(e.target.value) })}
                    />
                  </label>
                </>
              )}
              {tool !== 'resize' && (
              <div className="st-inks">
                {inks.map((v, i) => (
                  <button
                    type="button"
                    key={v}
                    aria-label={inkNames[i]}
                    style={{ background: v }}
                    aria-pressed={v === (tool === 'draw' ? ink : art.color)}
                    onClick={() => (tool === 'draw' ? setInk(v) : setArt({ ...art, color: v }))}
                  />
                ))}
              </div>
              )}
              {tool === 'draw' && (
                <div className="st-pens">
                  {pens.map((v, i) => (
                    <button
                      type="button"
                      key={v}
                      aria-label={['Fine pen', 'Medium pen', 'Thick pen'][i]}
                      aria-pressed={v === pen}
                      onClick={() => setPen(v)}
                    >
                      <i style={{ width: 4 + i * 3, height: 4 + i * 3 }} />
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={!art.strokes.length}
                    onClick={() => setArt({ ...art, strokes: art.strokes.slice(0, -1) })}
                  >
                    <Undo2 size={15} aria-hidden="true" />
                    Undo
                  </button>
                </div>
              )}
              <button type="button" className="st-done" onClick={() => setTool(null)}>
                Done
              </button>
            </div>
          )}

          {gate && !camera && (
            <div className="st-panel">
              {jobs.length > 0 ? (
                <>
                  <h3>Pending Moments</h3>
                  <p>Continue sharing the original Moment or discard the pending upload.</p>
                  {jobs.map((j) => (
                    <div className="st-pending" key={j.id}>
                      <strong>{j.parts[0].body.text || j.parts[0].body.caption || j.parts[0].body.kind + ' Moment'}</strong>
                      <small>{new Date(j.created).toLocaleString()}</small>
                      <div>
                        <button type="button" className="st-chip" disabled={!!busy} onClick={() => void submit(j)}>
                          Continue sharing
                        </button>
                        <button
                          type="button"
                          className="st-chip"
                          disabled={!!busy}
                          onClick={() =>
                            void (j.memoryOnly ? Promise.resolve() : discardJob(j.id))
                              .then(() => setJobs((v) => v.filter((x) => x.id !== j.id)))
                              .catch((e) => setError(messageOf(e, 'Couldn’t discard.')))
                          }
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              ) : preview.isError ? (
                <>
                  <h3>Post settings couldn’t load</h3>
                  <button type="button" className="st-chip" onClick={() => void preview.refetch()}>
                    Try again
                  </button>
                </>
              ) : !p ? (
                <p role="status">Opening the Studio…</p>
              ) : (
                <>
                  <h3>Share your first Moment</h3>
                  <p>You must be 18 or older to post Moments.</p>
                  <button type="button" className="st-post" disabled={!!busy} onClick={() => void confirmAge()}>
                    {busy || 'I am 18 or older'}
                  </button>
                  <button type="button" className="st-linkish" onClick={dismiss}>
                    Back to Moments
                  </button>
                </>
              )}
              {(busy || error) && (
                <p className="st-status" role={error ? 'alert' : 'status'}>
                  {busy || error}
                </p>
              )}
            </div>
          )}

          {discarding && (
            <div className="st-panel" role="alertdialog" aria-modal="true" aria-labelledby="st-discard-title">
              <h3 id="st-discard-title">Discard this Moment?</h3>
              <div className="st-pending-actions">
                <button type="button" className="st-chip" autoFocus onClick={() => setDiscarding(false)}>
                  Keep
                </button>
                <button type="button" className="st-post" onClick={backToStart}>
                  Discard
                </button>
              </div>
            </div>
          )}

          {!gate && !camera && mode === 'none' && (
            <div className="st-start">
              <p>Take a photo or a video, pick from your library, or write a few words.</p>
              <small>You can also drop a photo here.</small>
            </div>
          )}

          {!gate && !camera && (
            <div className="st-foot">
              {(busy || error || (askedPost && blocker)) && (
                <p className="st-status" role={busy ? 'status' : 'alert'}>
                  {busy || error || blocker}
                </p>
              )}
              {mode === 'none' ? (
                <div className="st-dock" role="group" aria-label="Start with">
                  <button type="button" onClick={() => setCamera(true)}>
                    <Camera aria-hidden="true" />
                    Camera
                  </button>
                  <button type="button" onClick={() => input.current?.click()}>
                    <ImagePlus aria-hidden="true" />
                    Library
                  </button>
                  <button type="button" onClick={() => setMode('text')}>
                    <Type aria-hidden="true" />
                    Words
                  </button>
                </div>
              ) : (
                <>
                  {mode === 'media' && file && !tool && (
                    <input
                      className="st-caption"
                      aria-label="Caption"
                      maxLength={100}
                      value={caption}
                      disabled={!!busy}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Add a caption"
                    />
                  )}
                  {mode === 'text' && (
                    <div className="st-swatches" role="group" aria-label="Background">
                      {(Object.keys(colors) as Background[]).map((k) => (
                        <button
                          type="button"
                          key={k}
                          aria-label={k + ' background'}
                          aria-pressed={bg === k}
                          onClick={() => setBg(k)}
                          style={{ background: colors[k] }}
                        />
                      ))}
                    </div>
                  )}
                  <div className="st-bar">
                    <div className="st-who" role="group" aria-label="Who sees it">
                      <Chip on={who === 'nearby'} disabled={noPlace || !!busy} onClick={() => setAudience('nearby')}>
                        Nearby
                      </Chip>
                      <Chip on={who === 'friends'} disabled={!!busy} onClick={() => setAudience('connections')}>
                        Friends
                      </Chip>
                    </div>
                    <div className="st-row">
                      <button
                        type="button"
                        className="st-when"
                        aria-label={`${timeLine}, ${placeLine}. Change`}
                        aria-expanded={drawer}
                        disabled={!!busy}
                        onClick={() => {
                          if (wide) drawerRef.current?.focus();
                          else setDrawerOpen((v) => !v);
                        }}
                      >
                        <Clock3 size={20} aria-hidden="true" />
                        <span>
                          <strong>{timeLine}</strong>
                          <small>{placeLine}</small>
                        </span>
                        <ChevronDown size={14} strokeWidth={2.6} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="st-post"
                        disabled={!ready}
                        onClick={tryPost}
                      >
                        {busy ? '…' : 'Post'}
                        {!busy && <ArrowRight size={17} strokeWidth={2.6} aria-hidden="true" />}
                      </button>
                    </div>
                    {/* At home without the Sky the pin sits on the home: today's warning, every time, until confirmed
                        in the drawer. With the Sky (or Show the area) the first time only says why only the area shows. */}
                    {homeWarning && !homeAck ? (
                      <p className="st-why">This is your home. People will see the pin on it.</p>
                    ) : (
                      homeNote && area && !noPlace && <p className="st-why">Only the area is shown.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <input
            hidden
            ref={input}
            type="file"
            accept="image/*,video/*,.heic,.heif,.mov"
            multiple
            onChange={(e) => {
              choose(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
        </div>
        {composing && drawer && (
          <>
            {!wide && <div className="st-scrim" aria-hidden="true" onClick={() => setDrawerOpen(false)} />}
            {settings}
          </>
        )}
      </div>
    </div>
  );
  return createPortal(stage, document.body);
}
