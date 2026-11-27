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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { geo, moments, penNames, posts as postsApi, upload } from '@pantopus/api';
import { post } from '@pantopus/api/client';
import type { Audience, Background, Hours, Location, NewMoment, Preview } from '@pantopus/api/endpoints/moments';
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
  MessageCircleQuestion,
  Plus,
  RotateCw,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { readCaptureMetadata, type CaptureMetadata } from '@/components/feed/composer/mediaLocation';
import { useDialogFocusTrap } from '@/lib/useDialogFocusTrap';
import { withFreshFix } from '@/lib/freshPostFix';
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
import PenNameSetup from '@/components/penName/PenNameSetup';
import { usePenNameMe } from '@/components/penName/penName';
import StampLayer, { STAMP_TINT, StampIcon } from '../stamps/StampLayer';
import { safeBox, STAMP_KINDS, stampLabel, type PlacedStamp, type StampKind, type StampValues } from '../stamps/stampTypes';
import { isSwitchedOff } from '../switchOff';
import StudioPicture, { type StudioTool } from './StudioPicture';
import { fontReady, TEXT_LOOKS, type TextLook } from './fonts';
import { sampleColors } from './sampleColors';
import {
  ALERT_KINDS,
  asksSomething,
  asStoredWallClock,
  CONTACT_CHOICES,
  eventTimeError,
  kindHint,
  kindName,
  kindPill,
  purposeOf,
  EXPLORE_KINDS,
  MADE_UP_NAME_KINDS,
  OWN_NAME_KINDS,
  STUDIO_KINDS,
  type StudioKind,
} from './postKinds';
import './studio.css';

const PlacePreview = dynamic(() => import('@/components/moments/MomentPlacePreview'), { ssr: false });
const fallback = { max_seconds: 30, max_parts: 1, max_bytes: 50 * 1024 * 1024 };
const inkNames = ['White', 'Black', 'Yellow', 'Red', 'Blue', 'Green'];
const pens = [0.006, 0.012, 0.024];
const STAMP_SAFE = safeBox();
// At home the place line reads "Area · <town>"; the first time only, one line under it says why (design §4).
const HOME_NOTE_KEY = 'pantopus.studio.homeAreaNoteSeen';
type Placement = 'exact' | 'area' | 'place' | 'none';
type PostAs = 'personal' | 'pen_name';

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
  onSwitchedOff,
}: {
  account: string;
  draft?: MomentChatDraft | null;
  onClose(): void;
  onDone(msg: string): void;
  /** The server said the switch is off for this person (CONTRACT §1): today's composer takes over with these words. */
  onSwitchedOff?(words: MomentChatDraft): void;
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
    [postAs, setPostAs] = useState<PostAs>('personal'),
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
    [pen, setPen] = useState(pens[1]),
    // Up to five colours the picture is mostly made of, beside the six inks (design: "colors sampled from the photo").
    [photoInks, setPhotoInks] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false),
    [discarding, setDiscarding] = useState(false),
    [askedPost, setAskedPost] = useState(false),
    [setupOpen, setSetupOpen] = useState(false),
    [stamps, setStamps] = useState<PlacedStamp[]>([]),
    [picked, setPicked] = useState<StampKind | null>(null),
    [trayOpen, setTrayOpen] = useState(false),
    // Guess the spot (step 8, CONTRACT §5a): others see the picture, not the place, until they guess.
    [guessSpot, setGuessSpot] = useState(false),
    [homeNote, setHomeNote] = useState(false);
  // "+ Ask / Kind" (phase 1, CONTRACT 6d): the picture or the words become one of today's Pulse posts. Each kind's own
  // details are today's composer's (what a Heads-up is about, lost or found and how to reach the author, an event's
  // times and venue).
  const [kind, setKind] = useState<StudioKind | null>(null),
    [kindMenu, setKindMenu] = useState(false),
    [askDeclined, setAskDeclined] = useState(false),
    [alertKind, setAlertKind] = useState('other'),
    [lostType, setLostType] = useState<'lost' | 'found'>('lost'),
    [contact, setContact] = useState<'dm' | 'comment' | 'phone'>('dm'),
    [phone, setPhone] = useState(''),
    [eventStart, setEventStart] = useState(''),
    [eventEnd, setEventEnd] = useState(''),
    [eventVenue, setEventVenue] = useState(''),
    // "Also show in Explore" (phase 1, CONTRACT 6f): off by default, chosen per post.
    [exploreOn, setExploreOn] = useState(false);
  const client = useQueryClient();
  // One id per post being made, so trying again after a failed photo upload never posts twice (today's composer).
  const postRequest = useRef<string | null>(null);
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
    setPhotoInks([]);
    setTool(null);
    setCaption(file ? draftCaption.current : '');
    if (file) draftCaption.current = '';
    setVenue('');
    setHeight(false);
    setWeather(false);
    setHomeAck(false);
    // Explore is chosen per post: each picture starts with it off.
    setExploreOn(false);
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
    // Today's place preview, asking also for the values the stamps would carry here (CONTRACT §2a). A server without
    // stamps drops the field and answers as today.
    queryKey: ['moments', 'preview', 'studio', account, point?.latitude, point?.longitude, marked],
    queryFn: ({ signal }) =>
      post<Preview & { stamps?: StampValues }>('/api/moments/place-preview', { ...point, weather: marked, stamps: true }, { signal }),
    retry: 1,
    staleTime: 60000,
  });
  const p = preview.data;
  // "The switch is off for you": back to today's composer with the words (the card's, or the caption).
  const handBack = () =>
    onSwitchedOff?.(
      mode === 'text'
        ? { kind: 'text', text, background: bg, hours, audience }
        : { kind: 'photo', caption: caption.trim() || null, hours, audience },
    );
  // Before going back the person is told what comes with them (lead, 2026-11-27: the words, and the photo is picked
  // again in today's composer).
  const [wentOff, setWentOff] = useState(false);
  const switchedOff = isSwitchedOff(preview.error);
  useEffect(() => {
    if (switchedOff) setWentOff(true);
  }, [switchedOff]);
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
  // The made-up name (docs/product/made-up-names/README.md, "Moments"): the person's own name for it, whether they may
  // use one, and, once picked, whether this spot has enough homes around it.
  const underPenName = postAs === 'pen_name';
  const penMe = usePenNameMe(true).data;
  const penCheck = useQuery({
    queryKey: ['pen-names', 'check', point?.latitude, point?.longitude],
    enabled: underPenName && !!point,
    queryFn: () => penNames.check(point!.latitude, point!.longitude),
    retry: false,
    staleTime: 60000,
  });
  const area = placement === 'area' || !!(p?.sky && p.at_home),
    noPlace = placement === 'none';
  const attested = !!p?.adult_confirmed || adult;
  const live = !underPenName && marked && !p?.at_home && !area && !noPlace;
  const altitude = fromAlbum ? fromAlbum.altitude : fix?.coords.altitude;
  const canHeight = !underPenName && point && p?.can_show_height && altitude != null && (!area || p.sky);
  const homeWarning = !underPenName && point && p?.at_home && !p.sky && !area;
  // Stamps (CONTRACT §2): the values the server would fill here, less what it keeps out on posting, so the tray and the
  // picture never show a stamp that won't be on the Moment. An album item isn't "now"; a Moment shared later doesn't
  // say when its author was there.
  const sv = p?.stamps;
  const albumItem = mode === 'media' && !!file && capture?.file !== file;
  const notNow = !!p?.at_home || noPlace || albumItem || !!later;
  const elevationFt =
    altitude != null && !p?.at_home && !noPlace && !underPenName && !(area && !p?.sky)
      ? Math.round((altitude * 3.28084) / (area ? 100 : 10)) * (area ? 100 : 10)
      : null;
  // A library photo that says when it was taken is stamped with that time, as the server does; otherwise now.
  const takenAt = albumItem && meta?.capturedAt ? new Date(meta.capturedAt) : null;
  const zone = sv?.time?.zone;
  const when =
    takenAt && !Number.isNaN(takenAt.getTime())
      ? {
          date_label: takenAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: zone }),
          label: takenAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone }),
        }
      : null;
  const stampValue = (kind: StampKind): unknown => {
    if (!sv && kind !== 'elevation') return null;
    switch (kind) {
      case 'postmark':
        return noPlace || !sv?.postmark
          ? null
          : {
              ...sv.postmark,
              ...(when ? { date_label: when.date_label, time_label: when.label } : {}),
              weather: notNow ? null : sv.postmark.weather,
              ...(later ? { time_label: '' } : {}),
            };
      case 'weather':
      case 'sunset':
        return notNow ? null : sv?.[kind] || null;
      case 'time':
        return later || !sv?.time ? null : when ? { ...sv.time, ...when } : sv.time;
      case 'place':
        return noPlace ? null : sv?.place || null;
      case 'home_distance':
        return noPlace || underPenName ? null : sv?.home_distance || null;
      case 'elevation':
        return elevationFt == null ? null : { altitude_ft: elevationFt, label: `${elevationFt.toLocaleString()} ft` };
    }
  };
  const kept = stamps.filter((st) => stampValue(st.kind) != null);
  // Guess the spot takes a photo or video with a place, never at home (the answer would point at it).
  const isVideo = !!file && (file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name));
  // A post is one photo or the words. Under a made-up name a post is words only, of its own four kinds, to people
  // nearby (made-up-names contract; LEAD-2 03:03), so there the Studio offers those for the words.
  const kindsOffered = underPenName ? mode === 'text' : (mode === 'media' && !!file && !isVideo && files.length === 1) || mode === 'text';
  const kindChoices = underPenName ? MADE_UP_NAME_KINDS : OWN_NAME_KINDS;
  const postKind = kindsOffered && kind && kindChoices.includes(kind) ? kind : null;
  const words = mode === 'text' ? text : caption;
  // Words that ask something offer to keep the post until it's answered (CONTRACT 6d: the app's own chip).
  const offerAsk = kindsOffered && !kind && !askDeclined && asksSomething(words);
  // A post shows at its place to people nearby, or goes to the author's connections with no place (today's composer).
  const postPlaced = !noPlace && audience !== 'connections';
  // Explore is offered only with a place, to people nearby, away from home and under one's own name; for a post, only a
  // Spot, Learning or Event (never an Ask, Heads-up or Lost and found: they stay tied to the place). Never with Guess
  // the spot, whose place is the answer. The server checks all of it again and drops it otherwise.
  const exploreOffered =
    !underPenName &&
    !noPlace &&
    audience === 'nearby' &&
    !!point &&
    !!p &&
    !p.at_home &&
    !(guessSpot && !postKind) &&
    (!postKind || EXPLORE_KINDS.includes(postKind));
  const toExplore = exploreOffered && exploreOn;
  const canGuess = !postKind && mode === 'media' && !!file && !noPlace && !!point && !p?.at_home;
  // Wet red ink while the Moment is live from here (the camera, just now, where it was taken); dried otherwise.
  const stampInk: 'wet' | 'dry' = live && !later ? 'wet' : 'dry';
  function placeStamp(kind: StampKind) {
    setTrayOpen(false);
    if (stamps.some((st) => st.kind === kind)) {
      setStamps(stamps.filter((st) => st.kind !== kind));
      setPicked(null);
      return;
    }
    // A free spot inside the part every viewer shows (safeBox), clear of the tool rail (top right) and of the stamps
    // already down; the postmark low on the left, as on board B2.
    const slots =
      kind === 'postmark'
        ? [[0.27, 0.66], [0.27, 0.42], [0.72, 0.66]]
        : [[0.38, 0.52], [0.38, 0.45], [0.38, 0.38], [0.38, 0.31], [0.64, 0.6], [0.64, 0.52], [0.38, 0.8]];
    const near = (x: number, y: number) =>
      kept.some((st) => Math.abs(st.x - x) < (st.kind === 'postmark' || kind === 'postmark' ? 0.25 : 0.2) && Math.abs(st.y - y) < (st.kind === 'postmark' || kind === 'postmark' ? 0.12 : 0.06));
    const [x, y] = slots.find(([sx, sy]) => !near(sx, sy)) || slots[0];
    setStamps([...stamps, { kind, x, y, scale: 1, rotation: kind === 'postmark' ? -9 : 0 }]);
    setPicked(kind);
  }
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

  // A text look: its font is fetched first, so the picture never shows the words in a stand-in font.
  async function pickLook(look: TextLook) {
    await fontReady(look.font, art.text);
    if (!mounted.current) return;
    setArt((a) => {
      const { font: _old, ...rest } = a;
      return look.font ? { ...rest, font: look.font } : rest;
    });
  }
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
  // Under the made-up name: people nearby only, never without a place, and no height, Live mark or weather.
  function choosePenName() {
    setPostAs('pen_name');
    setAudience('nearby');
    if (placement === 'none') setPlacement('exact');
    setHeight(false);
    setWeather(false);
    setError('');
  }
  function pickWho(who: 'nearby' | 'friends' | 'pen') {
    setError('');
    if (who !== 'pen') {
      setPostAs('personal');
      setAudience(who === 'friends' ? 'connections' : 'nearby');
    } else if (!penMe) return;
    else if (!penMe.allowed) setError(penMe.refusal?.message || 'This account can’t post under a made-up name.');
    else if (penMe.pen_name) choosePenName();
    else setSetupOpen(true);
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
    // The Studio's own upload, once kept in the outbox: taken out again if the server says the switch is off, so
    // today's composer never offers to resume a Moment it can't post.
    let made: Job | null = retry || null;
    try {
      if (retry) {
        await deliver(retry, controller.signal);
        return;
      }
      if (!p || !attested) throw new Error('Confirm you are 18 or older to post.');
      if (!noPlace && !point) throw new Error('Choose Use my location, or select No location.');
      if (noPlace && p.has_connections === false) throw new Error('A Moment without a location needs a connection.');
      if (homeWarning && !homeAck) throw new Error('Confirm the pin at your home, or choose Show area.');
      if (underPenName && penCheck.data && !penCheck.data.allowed)
        throw new Error(penCheck.data.refusal?.message || 'A made-up name can’t post from here.');
      const kind =
        mode === 'text'
          ? 'text'
          : file && (file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name))
            ? 'video'
            : 'photo';
      // The look's font is in before the words are drawn into the picture that is posted.
      if (file && art.text.trim()) await fontReady(art.font, art.text);
      const prepared = file
        ? await prepareMedia(file, art, limits.data?.video || fallback, controller.signal, (f) =>
            setBusy('Preparing video · ' + Math.round(f * 100) + '%'),
          )
        : [];
      controller.signal.throwIfAborted();
      if (underPenName && prepared.length > 1)
        throw new Error("A video posted in parts can't go out under a made-up name. Post one of up to a minute.");
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
          // `post_as`: the server's field for the made-up name (routes/moments.js), sent only when it is picked.
          // `stamps` and `elevation` (CONTRACT §2b): where each stamp sits; the server fills the values.
          const body: NewMoment & {
            post_as?: 'pen_name';
            guess?: true;
            explore?: true;
            stamps?: PlacedStamp[];
            elevation?: { meters: number; accuracy_m?: number | null; speed_mps?: number | null };
          } = {
            client_request_id: crypto.randomUUID(),
            kind,
            hours,
            audience: noPlace ? 'connections' : underPenName ? 'nearby' : audience,
            location: loc,
            ...(underPenName ? { post_as: 'pen_name' as const } : {}),
            ...(canGuess && guessSpot ? { guess: true as const } : {}),
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
            ...(toExplore ? { explore: true as const } : {}),
            ...(kept.length && i === 0
              ? { stamps: kept.map(({ kind, x, y, scale, rotation }) => ({ kind, x, y, scale, rotation })) }
              : {}),
            ...(i === 0 && kept.some((st) => st.kind === 'elevation') && altitude != null
              ? {
                  elevation: {
                    meters: altitude,
                    accuracy_m: fromAlbum ? null : gps?.coords.altitudeAccuracy,
                    speed_mps: fromAlbum ? null : gps?.coords.speed,
                  },
                }
              : {}),
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
      made = job;
      if (mounted.current) setJobs((old) => [...old, job]);
      await deliver(job, controller.signal);
    } catch (e) {
      if (isSwitchedOff(e)) {
        if (made && !made.memoryOnly) await discardJob(made.id).catch(() => {});
        if (made && mounted.current) setJobs((old) => old.filter((j) => j.id !== made!.id));
        if (mounted.current) setWentOff(true);
      }
      else if (mounted.current) setError(messageOf(e, 'Couldn’t share. Try again.'));
    } finally {
      if (mounted.current) setBusy('');
      submitting.current = false;
      handle.current = null;
    }
  }
  // A Pulse post made in the Studio (CONTRACT 6d): today's request, as today's composer sends it, with the photo (the
  // picture as drawn, words and marks in it) uploaded after it as today's composer does, and the Studio's `studio`
  // field: where each stamp sits (the server fills the values) and the height reading for the elevation stamp.
  async function submitPost(postType: StudioKind) {
    if (submitting.current) return;
    submitting.current = true;
    const controller = new AbortController();
    handle.current = controller;
    setBusy('Preparing…');
    setError('');
    let posted = false;
    try {
      let photo: File | null = null;
      if (file) {
        if (art.text.trim()) await fontReady(art.font, art.text);
        const [prepared] = await prepareMedia(file, art, limits.data?.video || fallback, controller.signal, () => {});
        photo = new File([prepared.file], 'studio.jpg', { type: prepared.file.type || 'image/jpeg' });
      }
      controller.signal.throwIfAborted();
      const at = placement === 'place' && pickedVenue ? { latitude: pickedVenue.center.lat, longitude: pickedVenue.center.lng } : point;
      const digits = phone.replace(/\D/g, '');
      postRequest.current ??= crypto.randomUUID();
      const body: Parameters<typeof postsApi.createPost>[0] & {
        studio: {
          stamps: PlacedStamp[];
          elevation?: { meters: number; accuracy_m?: number | null };
          explore?: boolean;
          taken_at?: string;
          taken_here?: boolean;
          fix?: { latitude: number; longitude: number; fix_at: string };
        };
      } = {
        clientRequestId: postRequest.current,
        content: words.trim(),
        postType,
        visibility: postPlaced ? 'neighborhood' : 'connections',
        audience: postPlaced ? 'nearby' : 'connections',
        postAs: underPenName ? 'pen_name' : 'personal',
        ...(postPlaced && at
          ? {
              latitude: at.latitude,
              longitude: at.longitude,
              ...(placeName ? { locationName: placeName } : {}),
              ...(placement === 'place' && venue.startsWith('osm:') ? { geocodePlaceId: venue } : {}),
              ...(fromAlbum
                ? { mediaLocations: [{ latitude: fromAlbum.latitude!, longitude: fromAlbum.longitude!, capturedAt: fromAlbum.capturedAt }] }
                : fix
                  ? {
                      gpsTimestamp: new Date(fix.timestamp).toISOString(),
                      gpsLatitude: fix.coords.latitude,
                      gpsLongitude: fix.coords.longitude,
                    }
                  : {}),
            }
          : {}),
        ...(postType === 'event'
          ? {
              eventDate: asStoredWallClock(eventStart),
              ...(eventEnd ? { eventEndDate: asStoredWallClock(eventEnd) } : {}),
              ...(eventVenue.trim() ? { eventVenue: eventVenue.trim() } : {}),
            }
          : {}),
        ...(postType === 'alert' ? { safetyAlertKind: alertKind as Parameters<typeof postsApi.createPost>[0]['safetyAlertKind'] } : {}),
        ...(postType === 'lost_found'
          ? { lostFoundType: lostType, contactPref: contact, ...(contact === 'phone' ? { contactPhone: digits } : {}) }
          : {}),
        purpose: purposeOf(postType),
        // Under a made-up name: no profile (today's composer leaves these out there).
        ...(underPenName ? {} : { profileVisibilityScope: 'local_context' as const, showOnProfile: true }),
        studio: {
          stamps: kept.map(({ kind: k, x, y, scale, rotation }) => ({ kind: k, x, y, scale, rotation })),
          ...(toExplore ? { explore: true } : {}),
          ...(kept.some((st) => st.kind === 'elevation') && altitude != null
            ? { elevation: { meters: altitude, accuracy_m: fromAlbum ? null : fix?.coords.altitudeAccuracy } }
            : {}),
          // When the picture was taken (CONTRACT 6d): a library photo's own time keeps "now" stamps off it; a shot the
          // camera took just now, with a fresh fix near the post's point, may keep weather and sunset. The server checks.
          ...(albumItem && meta?.capturedAt ? { taken_at: meta.capturedAt } : {}),
          ...(file && capture?.file === file && Date.now() - capture.at <= 600000 ? { taken_here: true } : {}),
          ...(fix && !albumItem
            ? { fix: { latitude: fix.coords.latitude, longitude: fix.coords.longitude, fix_at: new Date(fix.timestamp).toISOString() } }
            : {}),
        },
      };
      setBusy('Posting…');
      const res = await postsApi.createPost(await withFreshFix(body));
      const id = res.post?.id;
      if (typeof id !== 'string' || !id.trim()) throw new Error('Post could not be confirmed. Try again.');
      if (photo) {
        setBusy('Adding the photo…');
        const sent = await upload.uploadPostMedia(id, [photo]);
        if (!Array.isArray(sent?.media_urls) || !sent.media_urls.length)
          throw new Error('Post saved. The photo could not be confirmed. Try again.');
      }
      posted = true;
      postRequest.current = null;
      void client.invalidateQueries({ queryKey: ['posts', 'mine'], refetchType: 'none' });
      void client.invalidateQueries({ queryKey: ['feed'], refetchType: 'none' });
      void client.invalidateQueries({ queryKey: ['reinvented'] });
    } catch (e) {
      if (isSwitchedOff(e)) {
        postRequest.current = null;
        if (mounted.current) setWentOff(true);
      } else if (mounted.current) setError(messageOf(e, 'Couldn’t post. Try again.'));
    } finally {
      if (mounted.current) setBusy('');
      submitting.current = false;
      handle.current = null;
    }
    if (posted) onDone(`${kindName(postType)} posted to Pulse.`);
  }
  // Post: a setting that still needs the person opens the drawer at it, with the reason, instead of failing. The reason
  // stays only while it still holds (today's composer's words).
  const phoneDigits = phone.replace(/\D/g, '').length;
  const blocker =
    (postKind ? postPlaced : !noPlace) && !point
      ? 'Choose Use my location, or select No location.'
      : !postKind && noPlace && p?.has_connections === false
        ? 'A Moment without a location needs a connection.'
        : !postKind && homeWarning && !homeAck
          ? 'Confirm the pin at your home, or choose Show area.'
          : !postKind && caption.trim().length > 100
            ? 'A Moment’s caption is up to 100 characters.'
            : postKind && !words.trim()
              ? `Write what the ${kindName(postKind).toLowerCase()} is about.`
              : postKind === 'event'
                ? eventTimeError(eventStart, eventEnd) || ''
                : postKind === 'lost_found' && contact === 'phone' && (phoneDigits < 7 || phoneDigits > 15)
                  ? 'Enter a valid phone number.'
                  : '';
  function tryPost() {
    if (!blocker) return void (postKind ? submitPost(postKind) : submit());
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
  const unsaved = mode === 'media' ? !!file : mode === 'text' && (!!text.trim() || stamps.length > 0);
  function backToStart() {
    setDiscarding(false);
    setAskedPost(false);
    setTool(null);
    setTrayOpen(false);
    setStamps([]);
    setPicked(null);
    setGuessSpot(false);
    setKind(null);
    setKindMenu(false);
    setAskDeclined(false);
    setExploreOn(false);
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
    if (setupOpen) return;
    if (wentOff) return handBack();
    if (discarding) setDiscarding(false);
    else if (kindMenu) setKindMenu(false);
    else if (trayOpen) setTrayOpen(false);
    else if (picked) setPicked(null);
    else if (tool) setTool(null);
    else if (drawerOpen && !wide) setDrawerOpen(false);
    else if (camera) setCamera(false);
    else closeOrBack();
  });

  const placeName =
    placement === 'place'
      ? (venue && (p?.places.find((v) => v.key === venue)?.label || nearby.find((v) => v.place_id === venue)?.name)) ||
        p?.place?.label
      : area || underPenName
        ? p?.area?.label || p?.area_label
        : p?.place_label;
  // The pill's place line (lead, 2026-11-27 00:40): an exact pin on the home reads "Your home", with today's warning
  // under it every time; the area reads "Area · <town>".
  const placeLine = noPlace
    ? 'No location · friends only'
    : !point
      ? 'Choose your location'
      : homeWarning
        ? 'Your home'
        : (area || (underPenName && placement !== 'place')
            ? 'Area · '
            : // Under a made-up name, pinned at the place the author picked (founder 2026-11-27, via the lead).
              underPenName
              ? 'At '
              : '') + (placeName || (preview.isPending ? 'Finding place…' : 'Selected location'));
  const laterChoice = later ? p?.share_later?.find((v) => v.key === later) : undefined;
  // With Share later the pill reads "Shares at 6:40 pm" over "24 hours · <place>".
  const pillPlace = postKind
    ? postPlaced
      ? placeLine
      : 'Your connections · no place'
    : laterChoice
      ? `${hours} ${hours === 1 ? 'hour' : 'hours'} · ${placeLine}`
      : placeLine;
  // A post made here says how long it stays instead (CONTRACT 6d): "Stays until answered", "Stays in Atlas", "Until
  // claimed", "Until Saturday 11 am".
  const timeLine = postKind
    ? kindPill(postKind, eventEnd || eventStart, new Date(now))
    : laterChoice
    ? 'Shares at ' +
      new Date(laterChoice.at)
        .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        .replace(/\s?AM$/, ' am')
        .replace(/\s?PM$/, ' pm')
    : `Fades in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const who = underPenName ? 'pen' : noPlace || audience === 'connections' ? 'friends' : 'nearby';
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
        {postKind && (
          <div className="st-group st-kind-group" role="group" aria-label={kindName(postKind)}>
            <span className="st-label">
              <MessageCircleQuestion size={15} aria-hidden="true" />
              {kindName(postKind)}
            </span>
            {postKind === 'alert' && (
              <>
                <div className="st-chips">
                  {ALERT_KINDS.map(([k, label]) => (
                    <Chip key={k} on={alertKind === k} onClick={() => setAlertKind(k)}>
                      {label}
                    </Chip>
                  ))}
                </div>
                <p className="st-note">Heads-ups can’t be about crime or suspicious people. In an emergency, call 911.</p>
              </>
            )}
            {postKind === 'lost_found' && (
              <>
                <div className="st-chips">
                  <Chip on={lostType === 'lost'} onClick={() => setLostType('lost')}>
                    Lost
                  </Chip>
                  <Chip on={lostType === 'found'} onClick={() => setLostType('found')}>
                    Found
                  </Chip>
                </div>
                <span className="st-label">How should people contact you?</span>
                <div className="st-chips">
                  {CONTACT_CHOICES.map(([k, label]) => (
                    <Chip key={k} on={contact === k} onClick={() => setContact(k)}>
                      {label}
                    </Chip>
                  ))}
                </div>
                {contact === 'phone' && (
                  <label className="st-field">
                    Phone
                    <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </label>
                )}
              </>
            )}
            {postKind === 'event' && (
              <>
                <label className="st-field">
                  Starts
                  <input type="datetime-local" value={eventStart} onChange={(e) => setEventStart(e.target.value)} />
                </label>
                <label className="st-field">
                  Ends (optional)
                  <input type="datetime-local" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} />
                </label>
                <label className="st-field">
                  Venue (optional)
                  <input value={eventVenue} maxLength={200} onChange={(e) => setEventVenue(e.target.value)} placeholder="Where it is" />
                </label>
              </>
            )}
            {(postKind === 'ask_local' || postKind === 'recommendation' || postKind === 'local_update') && (
              <p className="st-note">{kindHint(postKind)}.</p>
            )}
          </div>
        )}
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
            {!underPenName && (
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
            )}
          </div>
          {!noPlace && (
            <div className="st-where">
              <div>
                <strong>{postKind && !postPlaced ? 'Your connections' : placeLine}</strong>
                <small>
                  {postKind && !postPlaced
                    ? 'A post to your connections shows no place.'
                    : underPenName
                    ? 'Under a made-up name it shows over its area, or at a public place, to people nearby.'
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
          {!postKind && homeWarning && (
            <label className="st-check">
              <input type="checkbox" checked={homeAck} onChange={(e) => setHomeAck(e.target.checked)} />
              This is my home. People will see the pin on it.
            </label>
          )}
          {!postKind && canHeight && (
            <label className="st-check">
              <input type="checkbox" checked={height} onChange={(e) => setHeight(e.target.checked)} />
              Show height
            </label>
          )}
          {!postKind && live && (
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
        {exploreOffered && (
          <div className="st-group" role="group" aria-label="Explore">
            <label className="st-check">
              <input type="checkbox" checked={exploreOn} onChange={(e) => setExploreOn(e.target.checked)} />
              Also show in Explore
            </label>
            <p className="st-note">People anywhere can see this, with its place.</p>
          </div>
        )}
        {!postKind && (
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
        )}
        {!postKind && !!p?.share_later?.length && (
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
          <div
            className="st-art"
            style={mode === 'text' && !camera && !gate ? { background: colors[bg] } : undefined}
            onPointerDownCapture={(e) => {
              if (picked && !(e.target as HTMLElement).closest('.sp-stamp')) setPicked(null);
            }}
          >
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
              <StudioPicture
                file={file}
                art={art}
                onChange={setArt}
                tool={tool}
                ink={ink}
                pen={pen}
                onPicture={(el, w, h) => setPhotoInks(sampleColors(el, w, h, inks))}
              />
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
            {composing && kept.length > 0 && (
              <StampLayer
                stamps={kept}
                valueOf={stampValue}
                ink={stampInk}
                selected={picked}
                onSelect={setPicked}
                onChange={tool || busy ? undefined : setStamps}
                safe={STAMP_SAFE}
              />
            )}
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

          {composing && (mode === 'text' || !!file) && (
            <div className="st-rail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
              {mode === 'media' && (
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
              )}
              <div className="st-tool">
                <span aria-hidden="true">Stamps and Play</span>
                <button
                  type="button"
                  className="st-round"
                  aria-label="Stamps and Play"
                  aria-pressed={trayOpen}
                  disabled={!!busy}
                  onClick={() => {
                    setTool(null);
                    setTrayOpen(!trayOpen);
                  }}
                >
                  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 5h14v9l-5 5H5z" />
                    <path d="M14 19v-5h5" />
                  </svg>
                </button>
              </div>
              {mode === 'media' && (
                <>
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
                </>
              )}
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
                    style={
                      art.font
                        ? { fontFamily: art.font.family, fontWeight: art.font.weight, fontStyle: art.font.style }
                        : undefined
                    }
                    onChange={(e) => setArt({ ...art, text: e.target.value })}
                  />
                  <div className="st-looks" role="group" aria-label="Font">
                    {TEXT_LOOKS.map((look) => (
                      <button
                        type="button"
                        key={look.name}
                        aria-pressed={(art.font?.family || '') === (look.font?.family || '')}
                        style={
                          look.font
                            ? { fontFamily: look.font.family, fontWeight: look.font.weight, fontStyle: look.font.style }
                            : undefined
                        }
                        onClick={() => void pickLook(look)}
                      >
                        {look.name}
                      </button>
                    ))}
                  </div>
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
                {photoInks.length > 0 && <span className="st-inks-from">From your photo</span>}
                {photoInks.map((v, i) => (
                  <button
                    type="button"
                    key={'photo-' + v}
                    aria-label={`Colour ${i + 1} from your photo`}
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

          {composing && trayOpen && (
            <>
              <div className="st-tray-scrim" aria-hidden="true" onClick={() => setTrayOpen(false)} />
              <section className="st-tray" aria-label="Stamps and Play">
                <header>
                  <h2>Stamps and Play</h2>
                  <button type="button" className="st-done" onClick={() => setTrayOpen(false)}>
                    Done
                  </button>
                </header>
                <p className="st-tray-head">
                  <strong>Checked by Pantopus</strong>
                  <span>Nobody can type these</span>
                </p>
                {preview.isPending && !sv ? (
                  <p className="st-hint" role="status">
                    Reading the place…
                  </p>
                ) : (
                  <div className="st-tray-stamps">
                    {STAMP_KINDS.filter((k) => stampValue(k) != null).map((k) => {
                      const on = kept.some((st) => st.kind === k);
                      return (
                        <button key={k} type="button" aria-pressed={on} onClick={() => placeStamp(k)}>
                          <StampIcon kind={k} color={STAMP_TINT[k]} size={17} />
                          {k === 'postmark' ? 'Postmark' : stampLabel(k, stampValue(k))}
                        </button>
                      );
                    })}
                    {STAMP_KINDS.every((k) => stampValue(k) == null) && (
                      <p className="st-hint">
                        {noPlace ? 'Stamps need a place. Pick where it shows in the post settings.' : 'No stamps for this place yet.'}
                      </p>
                    )}
                  </div>
                )}
                {canGuess && (
                  <>
                    <p className="st-tray-head">
                      <strong>Play</strong>
                      <span>Things people can touch</span>
                    </p>
                    <div className="st-tray-stamps st-tray-play">
                      <button
                        type="button"
                        aria-pressed={guessSpot}
                        onClick={() => {
                          setGuessSpot(!guessSpot);
                          setTrayOpen(false);
                        }}
                      >
                        <i aria-hidden="true" />
                        Guess the spot
                      </button>
                    </div>
                  </>
                )}
              </section>
            </>
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

          {wentOff && (
            <div className="st-panel st-wentoff" role="alertdialog" aria-modal="true" aria-labelledby="st-off-title">
              <h3 id="st-off-title">This isn’t on for you right now</h3>
              <p>
                {mode === 'text'
                  ? 'Your words go with you to the Moment composer.'
                  : 'Your caption goes with you to the Moment composer. Pick the photo again there.'}
              </p>
              <button type="button" className="st-post" autoFocus onClick={handBack}>
                Continue
              </button>
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
              {composing && canGuess && guessSpot && (
                <p className="st-status">Guess the spot: others see the picture, not the place, until they guess.</p>
              )}
              {composing && underPenName && penMe?.pen_name && (
                <p className="st-status">
                  Posting as {penMe.pen_name.name}. Others can&apos;t see it&apos;s you.
                  {penCheck.data?.warning ? ' ' + penCheck.data.warning : ''}
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
                      aria-label={postKind ? 'What it’s about' : 'Caption'}
                      maxLength={postKind ? 500 : 100}
                      value={caption}
                      disabled={!!busy}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder={postKind === 'ask_local' ? 'Ask something' : postKind ? 'Say what it’s about' : 'Add a caption'}
                    />
                  )}
                  {kindsOffered && !tool && (
                    <div className="st-kind-row">
                      {postKind ? (
                        <>
                          <span className="st-kind-chip">
                            {kindName(postKind)}
                            <button
                              type="button"
                              aria-label={`Keep it a Moment, not a ${kindName(postKind).toLowerCase()}`}
                              disabled={!!busy}
                              onClick={() => setKind(null)}
                            >
                              <X size={14} strokeWidth={2.6} aria-hidden="true" />
                            </button>
                          </span>
                          <span className="st-kind-hint">{kindHint(postKind)}</span>
                        </>
                      ) : (
                        <>
                          {offerAsk && (
                            <span className="st-kind-offer">
                              <button type="button" onClick={() => setKind('ask_local')}>
                                <MessageCircleQuestion size={15} aria-hidden="true" />
                                Keep until answered?
                              </button>
                              <button type="button" aria-label="No, keep it a Moment" onClick={() => setAskDeclined(true)}>
                                <X size={14} strokeWidth={2.6} aria-hidden="true" />
                              </button>
                            </span>
                          )}
                          <button
                            type="button"
                            className="st-kind-add"
                            aria-haspopup="menu"
                            aria-expanded={kindMenu}
                            disabled={!!busy}
                            onClick={() => setKindMenu((v) => !v)}
                          >
                            <Plus size={15} strokeWidth={2.6} aria-hidden="true" />
                            Ask / Kind
                          </button>
                        </>
                      )}
                      {kindMenu && !postKind && (
                        <div className="st-kind-menu" role="menu" aria-label="Make it a post that stays">
                          {STUDIO_KINDS.filter((k) => kindChoices.includes(k.kind)).map((k) => (
                            <button
                              key={k.kind}
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setKind(k.kind);
                                setKindMenu(false);
                              }}
                            >
                              <strong>{k.name}</strong>
                              <span>{k.hint}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {mode === 'text' && !postKind && (
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
                      <Chip on={who === 'nearby'} disabled={noPlace || !!busy} onClick={() => pickWho('nearby')}>
                        Nearby
                      </Chip>
                      <Chip on={who === 'friends'} disabled={!!busy} onClick={() => pickWho('friends')}>
                        Friends
                      </Chip>
                      {penMe && (
                        <Chip on={who === 'pen'} disabled={!!busy} onClick={() => pickWho('pen')}>
                          Made-up name
                        </Chip>
                      )}
                    </div>
                    <div className="st-row">
                      <button
                        type="button"
                        className="st-when"
                        data-kind={postKind || undefined}
                        aria-label={`${timeLine}, ${pillPlace}. Change`}
                        aria-expanded={drawer}
                        disabled={!!busy}
                        onClick={() => {
                          if (wide) drawerRef.current?.focus();
                          else setDrawerOpen((v) => !v);
                        }}
                      >
                        {postKind ? <MessageCircleQuestion size={20} aria-hidden="true" /> : <Clock3 size={20} aria-hidden="true" />}
                        <span>
                          <strong>{timeLine}</strong>
                          <small>{pillPlace}</small>
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
      <PenNameSetup open={setupOpen} onClose={() => setSetupOpen(false)} me={penMe} onTaken={() => choosePenName()} />
    </div>
  );
  return createPortal(stage, document.body);
}
