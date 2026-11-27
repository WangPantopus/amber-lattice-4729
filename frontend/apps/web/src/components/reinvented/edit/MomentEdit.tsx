'use client';

// The 15-minute edit (Pulse, reinvented; coord/CONTRACT.md §3): the author changes a Moment's caption, its stamps and
// who sees it for 15 minutes after it went out. It opens from the viewer's Moment options while `pulse_reinvented` is
// on for the person and the server still says `editable_until`, and it is drawn as the Studio is (board B2): the
// picture as it was posted fills the frame, the stamps sit on it, and one bar at the bottom holds who sees it and Save.
// The stamps' values stay the ones the server kept when the Moment was posted; only where they sit changes.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Clock3, X } from 'lucide-react';
import { patch } from '@pantopus/api/client';
import type { Audience, Moment } from '@pantopus/api/endpoints/moments';
import { useDialogFocusTrap } from '@/lib/useDialogFocusTrap';
import { colors, messageOf } from '@/components/moments/momentState';
import StampLayer, { STAMP_TINT, StampIcon } from '../stamps/StampLayer';
import { safeBox, STAMP_KINDS, stampLabel, type PlacedStamp, type ShownStamp, type StampKind } from '../stamps/stampTypes';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import { isRouteGone, markServerBehind } from '../serverBehind';
import { afterEdit } from './saved';
import { loopOf, useSpanLoop } from '../loop/loop';
import '../studio/studio.css';
import './edit.css';

export type EditableMoment = Moment & {
  stamps?: ShownStamp[];
  editable_until?: string | null;
  edited_at?: string | null;
  /** Every kind's kept value on one's own Moment while it may change (CONTRACT §3, #4946); null where none was kept. */
  stamp_choices?: Partial<Record<StampKind, unknown>> | null;
};

const placements = (list: readonly PlacedStamp[]) =>
  list.map(({ kind, x, y, scale, rotation }) => ({ kind, x, y, scale, rotation }));
const same = (a: readonly PlacedStamp[], b: readonly PlacedStamp[]) =>
  JSON.stringify(placements(a)) === JSON.stringify(placements(b));

/** The picture as the viewer draws it: centred and fitted in the 9:16 frame, so a stamp sits where it was placed. */
function usePictureBox(art: React.RefObject<HTMLDivElement | null>, natural: { w: number; h: number } | null) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const el = art.current;
    if (!el) return;
    const measure = () => {
      const bw = el.clientWidth,
        bh = el.clientHeight;
      const nw = natural?.w || 9,
        nh = natural?.h || 16;
      if (!bw || !bh) return setBox(null);
      const scale = Math.min(bw / nw, bh / nh);
      const width = nw * scale,
        height = nh * scale;
      setBox({ left: (bw - width) / 2, top: (bh - height) / 2, width, height });
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [art, natural?.w, natural?.h]);
  return box;
}

/** A wide window frames the picture as the Studio does there (studio.css `[data-wide]`). */
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

function msLeft(until: string | null | undefined, now: number) {
  const ms = Date.parse(until || '') - now;
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

export default function MomentEdit({
  moment,
  account,
  container,
  onClose,
}: {
  moment: EditableMoment;
  account: string;
  /** Where it is drawn: the viewer's modal dialog on a phone, else the page. */
  container: Element;
  onClose(): void;
}) {
  const client = useQueryClient();
  const reread = useRereadSwitch();
  const wide = useWide();
  // What it was when the edit opened; the server's answer replaces it once saved.
  const [original] = useState(() => ({
    caption: moment.caption || '',
    audience: moment.audience,
    stamps: (moment.stamps || []).filter((s) => STAMP_KINDS.includes(s.kind)),
  }));
  // The tray: every stamp the server kept a value for when the Moment was posted, so one not placed then can go on now.
  const values = new Map<StampKind, unknown>([
    ...STAMP_KINDS.filter((k) => moment.stamp_choices?.[k] != null).map((k) => [k, moment.stamp_choices![k]] as const),
    ...original.stamps.map((s) => [s.kind, s.value] as const),
  ]);
  const [caption, setCaption] = useState(original.caption),
    [audience, setAudience] = useState<Audience>(original.audience),
    [stamps, setStamps] = useState<PlacedStamp[]>(() => placements(original.stamps)),
    [picked, setPicked] = useState<StampKind | null>(null),
    [trayOpen, setTrayOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [discarding, setDiscarding] = useState(false),
    [wentOff, setWentOff] = useState(false),
    [now, setNow] = useState(Date.now);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(
    moment.width && moment.height ? { w: moment.width, h: moment.height } : null,
  );
  const art = useRef<HTMLDivElement>(null);
  const box = usePictureBox(art, moment.kind === 'text' ? null : natural);
  // A loop plays its part over and over here too, as the viewers show it (CONTRACT 7j; the edit leaves it as it is).
  const [clip, setClip] = useState<HTMLVideoElement | null>(null);
  useSpanLoop(clip, loopOf(moment));
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      mounted.current = false;
      clearInterval(tick);
      document.body.style.overflow = previous;
    };
  }, []);

  const left = msLeft(moment.editable_until, now);
  const open = left > 0;
  // A made-up name's Moment goes to people nearby only, and its author can't be seen (made-up-names contract).
  const underPenName = moment.author.id !== account;
  const media = moment.kind !== 'text';
  const changed = {
    caption: media && caption.trim() !== original.caption.trim(),
    audience: audience !== original.audience,
    stamps: !same(stamps, original.stamps),
  };
  const dirty = changed.caption || changed.audience || changed.stamps;
  const wet = moment.taken_here === true && Date.parse(moment.live_until || '') > now;

  async function save() {
    if (busy || !dirty || !open) return;
    setBusy(true);
    setError('');
    try {
      const answer = await patch<{ moment: EditableMoment }>(`/api/moments/${encodeURIComponent(moment.id)}`, {
        ...(changed.caption ? { caption: caption.trim() || null } : {}),
        ...(changed.audience ? { audience } : {}),
        ...(changed.stamps ? { stamps: placements(stamps) } : {}),
      });
      client.setQueryData<{ moment: EditableMoment }>(['moments', 'watch', account, moment.id], (old) =>
        old ? { ...old, moment: answer.moment } : old,
      );
      void client.invalidateQueries({ queryKey: ['moments', 'map', account] });
      void client.invalidateQueries({ queryKey: ['moments', 'mine', account] });
      afterEdit(moment.id, 'Moment updated');
      onClose();
    } catch (e) {
      if (!mounted.current) return;
      const code = (e as { code?: string } | null)?.code;
      // The switch went off: nothing changed on the Moment; the viewer goes back to today's once the switch is read.
      if (isSwitchedOff(e)) setWentOff(true);
      // A server older than this website has no edit: the same, and today's screens until it catches up.
      else if (isRouteGone(e)) {
        markServerBehind();
        setWentOff(true);
      } else if (code === 'MOMENT_EDIT_CLOSED') timeUp();
      else if (code === 'MOMENT_ENDED') {
        // The viewer reads it again and says it ended, in today's words.
        void client.invalidateQueries({ queryKey: ['moments', 'watch', account, moment.id] });
        onClose();
      } else setError(messageOf(e, 'Couldn’t save. Try again.'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  // The 15 minutes ran out (the server said so, or the clock here): nothing changed, and the edit closes.
  function timeUp() {
    afterEdit(moment.id, 'The 15 minutes are up. Your Moment stays as it was.');
    onClose();
  }
  useEffect(() => {
    if (!open && !busy && !wentOff) timeUp();
  }, [open, busy, wentOff]); // eslint-disable-line react-hooks/exhaustive-deps
  function leave() {
    if (wentOff) void reread();
    onClose();
  }
  function closeOrAsk() {
    if (busy) return;
    if (dirty && open && !wentOff) setDiscarding(true);
    else leave();
  }
  const trap = useDialogFocusTrap<HTMLDivElement>(() => {
    if (wentOff) return leave();
    if (discarding) setDiscarding(false);
    else if (trayOpen) setTrayOpen(false);
    else if (picked) setPicked(null);
    else closeOrAsk();
  });
  // A stamp from the tray: one taken off in this edit goes back where it was; a new one takes a free spot inside the
  // part every viewer shows, the postmark low on the left as in the Studio (board B2). Its value is the one kept.
  function toggleStamp(kind: StampKind) {
    setTrayOpen(false);
    if (stamps.some((s) => s.kind === kind)) {
      setStamps(stamps.filter((s) => s.kind !== kind));
      setPicked(null);
      return;
    }
    const was = original.stamps.find((s) => s.kind === kind);
    if (was) {
      setStamps([...stamps, ...placements([was])]);
      setPicked(kind);
      return;
    }
    if (!values.has(kind)) return;
    const safe = safeBox(aspect);
    const inside = ([x, y]: number[]) => [
      Math.min(safe.x + safe.width - 0.12, Math.max(safe.x + 0.12, x)),
      Math.min(safe.y + safe.height - 0.08, Math.max(safe.y + 0.08, y)),
    ];
    const slots = (
      kind === 'postmark'
        ? [[0.27, 0.66], [0.27, 0.42], [0.72, 0.66]]
        : [[0.38, 0.52], [0.38, 0.45], [0.38, 0.38], [0.38, 0.31], [0.64, 0.6], [0.64, 0.52], [0.38, 0.8]]
    ).map(inside);
    const big = (k: StampKind) => k === 'postmark' || kind === 'postmark';
    const near = (x: number, y: number) =>
      stamps.some((st) => Math.abs(st.x - x) < (big(st.kind) ? 0.25 : 0.2) && Math.abs(st.y - y) < (big(st.kind) ? 0.12 : 0.06));
    const [x, y] = slots.find(([sx, sy]) => !near(sx, sy)) || slots[0];
    setStamps([...stamps, { kind, x, y, scale: 1, rotation: kind === 'postmark' ? -9 : 0 }]);
    setPicked(kind);
  }

  const aspect = moment.kind === 'text' || !natural ? 9 / 16 : natural.w / natural.h;
  // Who sees it, as the server allows: a made-up name's Moment goes to people nearby only, one without a place to
  // friends only (lead, 2026-11-27 01:12).
  const choices: Audience[] = underPenName ? ['nearby'] : moment.no_location ? ['connections'] : ['nearby', 'connections'];
  // The line over the bar (shared words): how long it can still change.
  const minutes = Math.floor(left / 60_000);
  const changeLine =
    minutes >= 1
      ? `You can change this for ${minutes} more ${minutes === 1 ? 'minute' : 'minutes'}`
      : 'Less than a minute left to change this';
  // The pill: how long the Moment has left and the place as posted; nothing here opens the drawer.
  const shares = moment.state === 'scheduled' && moment.share_at ? new Date(moment.share_at) : null;
  const fadesIn = Math.max(0, Date.parse(moment.expires_at) - now);
  const timeLine = shares
    ? 'Shares at ' +
      shares
        .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        .replace(/\s?AM$/, ' am')
        .replace(/\s?PM$/, ' pm')
    : fadesIn >= 3_600_000
      ? `Fades in ${Math.ceil(fadesIn / 3_600_000)} hours`.replace(/^Fades in 1 hours$/, 'Fades in 1 hour')
      : `Fades in ${Math.max(1, Math.ceil(fadesIn / 60_000))} ${Math.ceil(fadesIn / 60_000) <= 1 ? 'minute' : 'minutes'}`;
  const placeLine = moment.place_label || (moment.no_location ? 'No location · friends only' : '');

  const stage = (
    <div
      ref={trap}
      className="st-studio me-edit"
      role="dialog"
      aria-modal="true"
      aria-label="Edit Moment"
      data-wide={wide || undefined}
    >
      <div className="st-stage">
        <div className="st-frame">
          <div
            ref={art}
            className="st-art"
            style={moment.kind === 'text' ? { background: colors[moment.background || 'teal'] } : undefined}
            onPointerDownCapture={(e) => {
              if (picked && !(e.target as HTMLElement).closest('.sp-stamp')) setPicked(null);
            }}
          >
            {moment.kind === 'text' ? (
              <p className="me-card">{moment.text}</p>
            ) : moment.kind === 'photo' && moment.media_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- the Moment's own signed link, as the viewer draws it
              <img
                className="me-media"
                src={moment.media_url}
                alt={moment.caption || 'Your photo'}
                onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
            ) : moment.kind === 'video' && moment.media_url ? (
              <video
                ref={setClip}
                className="me-media"
                src={moment.media_url}
                poster={moment.poster_url || undefined}
                muted
                playsInline
                autoPlay
                loop
                onLoadedMetadata={(e) => setNatural({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
              />
            ) : (
              <p className="me-card">{moment.state === 'checking' ? 'Checking media…' : 'Media unavailable'}</p>
            )}
            {box && stamps.length > 0 && (
              <div className="me-picture" style={box}>
                <StampLayer
                  stamps={stamps}
                  valueOf={(k) => values.get(k) ?? null}
                  ink={wet ? 'wet' : 'dry'}
                  selected={picked}
                  onSelect={setPicked}
                  onChange={busy || !open ? undefined : setStamps}
                  safe={safeBox(aspect)}
                />
              </div>
            )}
          </div>
          <div className="st-shade-top" aria-hidden="true" />
          <div className="st-shade-bottom" aria-hidden="true" />

          <div className="st-top">
            <button type="button" className="st-round" aria-label="Close without saving" onClick={closeOrAsk}>
              <X size={20} strokeWidth={2.4} />
            </button>
          </div>

          {values.size > 0 && open && (
            <div className="st-rail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
              <div className="st-tool">
                <span aria-hidden="true">Stamps and Play</span>
                <button
                  type="button"
                  className="st-round"
                  aria-label="Stamps and Play"
                  aria-pressed={trayOpen}
                  disabled={busy}
                  onClick={() => setTrayOpen(!trayOpen)}
                >
                  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 5h14v9l-5 5H5z" />
                    <path d="M14 19v-5h5" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {trayOpen && (
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
                <div className="st-tray-stamps">
                  {STAMP_KINDS.filter((k) => values.has(k)).map((k) => (
                    <button key={k} type="button" aria-pressed={stamps.some((s) => s.kind === k)} onClick={() => toggleStamp(k)}>
                      <StampIcon kind={k} color={STAMP_TINT[k]} size={17} />
                      {k === 'postmark' ? 'Postmark' : stampLabel(k, values.get(k))}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          <div className="st-foot">
            {(error || (busy && 'Saving…')) && (
              <p className="st-status" role={error ? 'alert' : 'status'}>
                {error || 'Saving…'}
              </p>
            )}
            {underPenName && (
              <p className="st-status">Posting as {moment.author.name}. Others can&apos;t see it&apos;s you.</p>
            )}
            {media && (
              <input
                className="st-caption"
                aria-label="Caption"
                maxLength={100}
                value={caption}
                disabled={busy || !open}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption"
              />
            )}
            <p className="st-status">{changeLine}</p>
            <div className="st-bar">
              <div className="st-who" role="group" aria-label="Who sees it">
                {choices.map((a) => (
                  <button
                    type="button"
                    key={a}
                    className="st-chip"
                    aria-pressed={audience === a}
                    disabled={busy}
                    onClick={() => setAudience(a)}
                  >
                    {a === 'nearby' ? 'Nearby' : 'Friends'}
                  </button>
                ))}
              </div>
              <div className="st-row">
                <p className="st-when me-left">
                  <Clock3 size={20} aria-hidden="true" />
                  <span>
                    <strong>{timeLine}</strong>
                    {placeLine && <small>{placeLine}</small>}
                  </span>
                </p>
                <button type="button" className="st-post" disabled={busy || !dirty || !open} onClick={() => void save()}>
                  {busy ? '…' : 'Save'}
                  {!busy && <Check size={17} strokeWidth={2.6} aria-hidden="true" />}
                </button>
              </div>
            </div>
          </div>

          {wentOff && (
            <div className="st-panel st-wentoff" role="alertdialog" aria-modal="true" aria-labelledby="me-off-title">
              <h3 id="me-off-title">This isn’t on for you right now</h3>
              <p>Your Moment stays as it was.</p>
              <button type="button" className="st-post" autoFocus onClick={leave}>
                Continue
              </button>
            </div>
          )}

          {discarding && (
            <div className="st-panel" role="alertdialog" aria-modal="true" aria-labelledby="me-discard-title">
              <h3 id="me-discard-title">Discard your changes?</h3>
              <div className="st-pending-actions">
                <button type="button" className="st-chip" autoFocus onClick={() => setDiscarding(false)}>
                  Keep
                </button>
                <button type="button" className="st-post" onClick={leave}>
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return createPortal(stage, container);
}
