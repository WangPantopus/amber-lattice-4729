'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { geo, moments } from '@pantopus/api';
import type { Audience, Background, Hours, Location, NewMoment } from '@pantopus/api/endpoints/moments';
import { Camera, Check, Clock3, ImagePlus, LocateFixed, MapPin, Type, Users, X } from 'lucide-react';
import { readCaptureMetadata, type CaptureMetadata } from '@/components/feed/composer/mediaLocation';
import MomentDialog from './MomentDialog';
import MomentEditor from './MomentEditor';
import MomentCamera, { type CameraCapture } from './MomentCamera';
import { blankArt } from './momentArtwork';
import {
  colors,
  deviceFix,
  distance,
  gpsLocation,
  messageOf,
  PIN_REVIEW_DISTANCE_M,
  recentFix,
  type DeviceFix,
} from './momentState';
import { prepareMedia } from './momentMedia';
import { discardJob, keepJob, pendingJobs, postJob, type Job } from './momentOutbox';

const PlacePreview = dynamic(() => import('./MomentPlacePreview'), { ssr: false });
const fallback = { max_seconds: 30, max_parts: 1, max_bytes: 50 * 1024 * 1024 };
type Placement = 'exact' | 'area' | 'place' | 'none';
export default function MomentComposer({
  account,
  onClose,
  onDone,
}: {
  account: string;
  onClose(): void;
  onDone(msg: string): void;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [index, setIndex] = useState(0),
    [mode, setMode] = useState<'text' | 'media'>('text');
  const file = mode === 'media' ? files[index] : undefined;
  const [camera, setCamera] = useState(false),
    [capture, setCapture] = useState<CameraCapture | null>(null);
  const [art, setArt] = useState(blankArt),
    [text, setText] = useState(''),
    [caption, setCaption] = useState(''),
    [bg, setBg] = useState<Background>('teal');
  const [hours, setHours] = useState<Hours>(24),
    [audience, setAudience] = useState<Audience>('nearby'),
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
  const handle = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement>(null),
    mounted = useRef(true),
    submitting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      handle.current?.abort();
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
    setCaption('');
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
  const fromAlbum =
    file && capture?.file !== file && meta?.capturedAt && meta.latitude != null && meta.longitude != null
      ? meta
      : null;
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
      search.length >= 2
        ? geo.searchPlaces(search, point, signal)
        : geo.nearbyPlaces(point!.latitude, point!.longitude, signal),
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
  function choose(items: File[]) {
    const valid = items.filter(
      (f) =>
        f.type.startsWith('image/') || f.type.startsWith('video/') || /\.(heic|heif|mov|mp4)$/i.test(f.name),
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
      if (noPlace && p.has_connections === false)
        throw new Error('A Moment without a location needs a connection.');
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
          ? {
              source: 'capture',
              latitude: fromAlbum.latitude!,
              longitude: fromAlbum.longitude!,
              taken_at: fromAlbum.capturedAt!,
            }
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
        if (mounted.current)
          setError('Browser storage is full or unavailable. Keep this tab open until sharing finishes.');
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
  function dismiss() {
    handle.current?.abort();
    onClose();
  }
  return (
    <MomentDialog label="Create Moment" className="mo-compose-dialog" onClose={dismiss}>
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
      ) : (
        <>
          <header className="mo-compose-title">
            <div>
              <h2>Create Moment</h2>
              {files.length > 1 && file && (
                <small>
                  Review {index + 1} of {files.length}
                </small>
              )}
            </div>
            <button className="mo-icon" onClick={dismiss} aria-label="Close composer">
              <X />
            </button>
          </header>
          {jobs.length > 0 ? (
            <div className="mo-recovery">
              <h3>Pending Moments</h3>
              <p>Continue sharing the original Moment or discard the pending upload.</p>
              {jobs.map((j) => (
                <div className="mo-pending" key={j.id}>
                  <strong>
                    {j.parts[0].body.text || j.parts[0].body.caption || j.parts[0].body.kind + ' Moment'}
                  </strong>
                  <small>{new Date(j.created).toLocaleString()}</small>
                  <div className="mo-editor-tools">
                    <button disabled={!!busy} onClick={() => void submit(j)}>
                      Continue sharing
                    </button>
                    <button
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
              {(busy || error) && <p role="status">{busy || error}</p>}
            </div>
          ) : !attested ? (
            <div className="mo-age-gate">
              {preview.isError ? (
                <>
                  <h3>Post settings couldn’t load</h3>
                  <button className="mo-link" onClick={() => void preview.refetch()}>
                    Try again
                  </button>
                </>
              ) : !p ? (
                <p role="status">Opening post settings…</p>
              ) : (
                <>
                  <h3>Share your first Moment</h3>
                  <p>You must be 18 or older to post Moments.</p>
                  <button className="mo-primary" disabled={!!busy} onClick={() => void confirmAge()}>
                    {busy || 'I am 18 or older'}
                  </button>
                  <button className="mo-link" onClick={dismiss}>
                    Back to Moments
                  </button>
                </>
              )}
              {error && (
                <p className="mo-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="mo-compose-grid">
              <section
                className="mo-compose-art"
                aria-label="Moment content"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!busy) choose([...e.dataTransfer.files]);
                }}
              >
                <div className="mo-editor-tools mo-mode">
                  <button disabled={!!busy} aria-pressed={mode === 'text'} onClick={() => setMode('text')}>
                    <Type />
                    Text
                  </button>
                  <button
                    disabled={!!busy}
                    aria-pressed={mode === 'media'}
                    onClick={() => input.current?.click()}
                  >
                    <ImagePlus />
                    Library
                  </button>
                  <button disabled={!!busy} onClick={() => setCamera(true)}>
                    <Camera />
                    Camera
                  </button>
                </div>
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
                {mode === 'text' ? (
                  <>
                    <div className="mo-text-preview" style={{ background: colors[bg] }}>
                      <textarea
                        aria-label="Moment text"
                        maxLength={200}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="What’s happening here?"
                      />
                    </div>
                    <div className="mo-art-footer">
                      <div className="mo-swatches">
                        {(Object.keys(colors) as Background[]).map((k) => (
                          <button
                            key={k}
                            aria-label={k + ' background'}
                            aria-pressed={bg === k}
                            onClick={() => setBg(k)}
                            style={{ background: colors[k] }}
                          >
                            {bg === k && <Check size={15} />}
                          </button>
                        ))}
                      </div>
                      <small>{text.length}/200</small>
                    </div>
                  </>
                ) : (
                  file && <MomentEditor file={file} art={art} onChange={setArt} />
                )}
              </section>
              <section className="mo-post-settings" aria-label="Post settings">
                <fieldset disabled={!!busy}>
                  <legend>Post settings</legend>
                  {file && (
                    <label>
                      Caption <small>{caption.length}/100</small>
                      <input
                        maxLength={100}
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder="Add a caption"
                      />
                    </label>
                  )}
                  <label>
                    <span>
                      <MapPin />
                      Location
                    </span>
                    <select
                      value={placement}
                      onChange={(e) => {
                        setPlacement(e.target.value as Placement);
                        setVenue('');
                        setHomeAck(false);
                      }}
                    >
                      <option value="exact">
                        {p?.at_home && p.sky
                          ? 'Area around home'
                          : fromAlbum
                            ? 'Where this was taken'
                            : 'Where I am'}
                      </option>
                      <option value="area">Show area</option>
                      {p && !p.at_home && (p.can_pin || p.places?.some((v) => v.key.startsWith('v_'))) && (
                        <option value="place">Pin it at a place</option>
                      )}
                      <option value="none">No location</option>
                    </select>
                  </label>
                  {point && p && shownPoint && (
                    <PlacePreview point={shownPoint} radius={area ? p.area?.radius_m : undefined} />
                  )}
                  {!noPlace && (
                    <div className="mo-location-detail">
                      <MapPin size={18} />
                      <div>
                        <strong>
                          {point
                            ? (area
                                ? p?.area?.label || p?.area_label
                                : placement === 'place'
                                  ? p?.place?.label
                                  : p?.place_label) ||
                              (preview.isPending ? 'Finding place…' : 'Selected location')
                            : 'Choose your location'}
                        </strong>
                        <small>
                          {noPlace
                            ? ''
                            : area
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
                  {noPlace && (
                    <p className="mo-detail">
                      {p?.has_connections === false
                        ? 'Add a connection to share without a location.'
                        : 'Only your connections see it. It won’t appear on the map.'}
                    </p>
                  )}
                  {placement === 'place' && (
                    <>
                      <label>
                        Nearby place
                        <input
                          value={venueTerm}
                          onChange={(e) => setVenueTerm(e.target.value)}
                          placeholder="Search nearby places"
                        />
                      </label>
                      <select
                        aria-label="Pin location"
                        value={venue}
                        onChange={(e) => setVenue(e.target.value)}
                      >
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
                    <label className="mo-check">
                      <input
                        type="checkbox"
                        checked={homeAck}
                        onChange={(e) => setHomeAck(e.target.checked)}
                      />
                      This is my home. People will see the pin on it.
                    </label>
                  )}
                  {canHeight && (
                    <label className="mo-check">
                      <input type="checkbox" checked={height} onChange={(e) => setHeight(e.target.checked)} />
                      Show height
                    </label>
                  )}
                  {live && (
                    <p className="mo-detail">
                      Live from here
                      {p?.weather && (
                        <label className="mo-check">
                          <input
                            type="checkbox"
                            checked={weather}
                            onChange={(e) => setWeather(e.target.checked)}
                          />
                          Show weather · {p.weather.temp_f}°F
                        </label>
                      )}
                    </p>
                  )}
                  <label>
                    <span>
                      <Users />
                      Who sees it
                    </span>
                    <select
                      value={noPlace ? 'connections' : audience}
                      disabled={noPlace}
                      onChange={(e) => setAudience(e.target.value as Audience)}
                    >
                      <option value="nearby">Everyone nearby</option>
                      <option value="connections">My connections</option>
                    </select>
                  </label>
                  <div className="mo-field">
                    <span>
                      <Clock3 />
                      How long
                    </span>
                    <div className="mo-duration">
                      {([1, 6, 24, 48] as const).map((h) => (
                        <button key={h} onClick={() => setHours(h)} aria-pressed={hours === h}>
                          {h}h
                        </button>
                      ))}
                    </div>
                  </div>
                  {!!p?.share_later?.length && (
                    <label>
                      Share time
                      <select value={later} onChange={(e) => setLater(e.target.value)}>
                        <option value="">Share now</option>
                        {p.share_later.map((v) => (
                          <option key={v.key} value={v.key}>
                            {v.label} ·{' '}
                            {new Date(v.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </fieldset>
                {preview.isError && (
                  <button className="mo-link" onClick={() => void preview.refetch()}>
                    Retry post settings
                  </button>
                )}
                {error && (
                  <p className="mo-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="mo-primary mo-post"
                  disabled={
                    !recovered ||
                    !!busy ||
                    reading ||
                    !attested ||
                    !p ||
                    (!point && !noPlace) ||
                    (noPlace && p.has_connections === false) ||
                    (!!homeWarning && !homeAck) ||
                    (mode === 'text' ? !text.trim() : !file)
                  }
                  onClick={() => void submit()}
                >
                  {busy || (later ? 'Schedule Moment' : 'Share Moment')}
                </button>
              </section>
            </div>
          )}
        </>
      )}
    </MomentDialog>
  );
}
