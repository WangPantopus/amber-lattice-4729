'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { blocks, moments, users } from '@pantopus/api';
import type { Moment, Point } from '@pantopus/api/endpoints/moments';
import { POST_REACTION_EMOJIS } from '@pantopus/ui-utils';
import { buildUserProfilePath } from '@pantopus/utils';
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Copy,
  Download,
  Ellipsis,
  Eye,
  Flag,
  LocateFixed,
  Mountain,
  Pause,
  Play,
  Radio,
  Send,
  ShieldBan,
  SmilePlus,
  Trash2,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import MomentDialog from './MomentDialog';
import { MomentFace } from './MomentFace';
import { colors, messageOf, timeAgo } from './momentState';

type Sheet = 'menu' | 'report' | 'mute' | 'block' | 'delete' | 'seen' | 'react' | null;
interface Props {
  id: string;
  account: string;
  ids: string[];
  wide: boolean;
  onClose(): void;
  onSelect(id: string): void;
  onSeen(id: string): void;
  onWatchedPlace(point: Point | null): void;
  onRemove(id: string, author?: string): void;
  onPlace(point: Point): void;
}
function Action({
  children,
  onClick,
  danger = false,
}: {
  children: ReactNode;
  onClick(): void;
  danger?: boolean;
}) {
  return (
    <button type="button" className={`mo-action ${danger ? 'mo-danger' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
const reasonLabels = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate content',
  misinformation: 'Misinformation',
  safety: 'Safety concern',
  other: 'Other',
};

export default function MomentViewer(props: Props) {
  const { id, account, onClose, onSelect, onSeen, onRemove, wide, ids } = props;
  const client = useQueryClient();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [paused, setPaused] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [holding, setHolding] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [typing, setTyping] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [room, setRoom] = useState('');
  const [reason, setReason] = useState('');
  const [reaction, setReaction] = useState<string | null | undefined>();
  const [now, setNow] = useState(Date.now);
  const video = useRef<HTMLVideoElement>(null);
  const seen = useRef(false);
  const elapsed = useRef(0);
  const gesture = useRef<{ x: number; y: number; start: number } | null>(null);
  const query = useQuery({
    queryKey: ['moments', 'watch', account, id],
    queryFn: ({ signal }) => moments.read(id, signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: 'always',
    refetchInterval: 30_000,
  });
  const detail = query.isError ? undefined : query.data?.moment;
  const ended = !!detail && (detail.state === 'ended' || Date.parse(detail.expires_at) <= now);
  const moment = ended ? undefined : detail;
  const { onWatchedPlace } = props;
  const lat = moment?.latitude,
    lng = moment?.longitude;
  useEffect(() => {
    onWatchedPlace(lat != null && lng != null ? { latitude: lat, longitude: lng } : null);
  }, [lat, lng, onWatchedPlace]);
  const own = moment?.author.id === account;
  const viewers = useQuery({
    queryKey: ['moments', 'viewers', account, id],
    queryFn: () => moments.viewers(id),
    enabled: own && sheet === 'seen',
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const index = ids.indexOf(id);
  const step = useCallback(
    (direction: number) => {
      const next = ids[index + direction];
      if (next) onSelect(next);
      else if (direction > 0) onClose();
    },
    [ids, index, onClose, onSelect],
  );
  const halt = paused || holding || typing || hidden || !!sheet || busy || mediaFailed || !!note;
  const present = !!moment && (moment.kind === 'text' || ready) && !mediaFailed;

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const visibility = () => setHidden(document.hidden);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    if (!present || seen.current || hidden || moment?.state !== 'live') return;
    seen.current = true;
    if (!own)
      void moments
        .view(id)
        .then(() => onSeen(id))
        .catch(() => {
          seen.current = false;
        });
  }, [id, present, hidden, moment?.state, own, onSeen]);
  useEffect(() => {
    const v = video.current;
    if (!v || !moment || moment.kind !== 'video' || mediaFailed) return;
    if (halt) v.pause();
    else void v.play().catch(() => setPaused(true));
  }, [halt, moment?.id, moment?.kind, ready, mediaFailed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!present || halt || moment?.kind === 'video' || moment?.state !== 'live') return;
    let last = performance.now();
    const timer = setInterval(() => {
      const at = performance.now();
      elapsed.current += at - last;
      last = at;
      setProgress(Math.min(elapsed.current / 6000, 1));
      if (elapsed.current >= 6000) {
        clearInterval(timer);
        step(1);
      }
    }, 70);
    return () => clearInterval(timer);
  }, [present, halt, step, moment?.kind, moment?.state]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))
      )
        return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (sheet) setSheet(null);
        else onClose();
      }
      if (sheet || busy) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        step(e.key === 'ArrowLeft' ? -1 : 1);
      }
      if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [sheet, busy, onClose, step]);

  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setNote('');
    try {
      await fn();
    } catch (error) {
      setNote(messageOf(error, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  };
  const closeSheet = () => {
    if (!busy) {
      setSheet(null);
      setNote('');
    }
  };
  const location = moment && !moment.no_location && moment.latitude != null && moment.longitude != null;
  const left = moment ? Math.ceil((Date.parse(moment.expires_at) - now) / 60_000) : 0;
  const statusText = query.isPending
    ? 'Opening Moment…'
    : ended || (query.error as { statusCode?: number })?.statusCode === 410
      ? 'Moment ended'
      : 'Moment unavailable';
  const activeReaction = reaction === undefined ? moment?.my_reaction : reaction;
  const section = (
    <section className="mo-view" aria-label="Moment viewer">
      {!moment ? (
        <div className="mo-watch-state">
          <button className="mo-v-close" aria-label="Close viewer" onClick={onClose}>
            <X />
          </button>
          <Eye size={32} />
          <h2>{statusText}</h2>
          {query.isError && <button onClick={() => void query.refetch()}>Try again</button>}
          <button onClick={onClose}>Back to Moments</button>
        </div>
      ) : (
        <>
          <div
            className="mo-stage"
            style={moment.kind === 'text' ? { background: colors[moment.background || 'teal'] } : undefined}
            onPointerDown={(e) => {
              gesture.current = { x: e.clientX, y: e.clientY, start: Date.now() };
              e.currentTarget.setPointerCapture(e.pointerId);
              setHolding(true);
            }}
            onPointerCancel={() => {
              gesture.current = null;
              setHolding(false);
            }}
            onPointerUp={(e) => {
              const g = gesture.current;
              gesture.current = null;
              setHolding(false);
              if (!g) return;
              const dx = e.clientX - g.x,
                dy = e.clientY - g.y;
              if (dy > 70 && dy > Math.abs(dx)) onClose();
              else if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
              else if (Date.now() - g.start < 260 && Math.abs(dy) < 12)
                step(
                  e.clientX - e.currentTarget.getBoundingClientRect().left < e.currentTarget.clientWidth / 3
                    ? -1
                    : 1,
                );
            }}
          >
            {moment.kind === 'text' ? (
              <p className="mo-card-text">{moment.text}</p>
            ) : moment.kind === 'photo' && moment.media_url ? (
              <img
                key={attempt}
                className="mo-watch-media"
                src={moment.media_url}
                alt={moment.caption || `${moment.author.name}’s photo`}
                onLoad={() => setReady(true)}
                onError={() => setMediaFailed(true)}
              />
            ) : moment.kind === 'video' && moment.media_url ? (
              <video
                className="mo-watch-media"
                ref={video}
                src={moment.media_url}
                poster={moment.poster_url || undefined}
                playsInline
                muted={muted}
                preload="auto"
                onLoadedData={() => setReady(true)}
                onError={() => setMediaFailed(true)}
                onEnded={() => step(1)}
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.duration > 0) setProgress(v.currentTime / v.duration);
                }}
              />
            ) : (
              <p>{moment.state === 'checking' ? 'Checking media…' : 'Media unavailable'}</p>
            )}
          </div>
          <div className="mo-watch-top">
            <div
              className="mo-progress"
              aria-label={`Moment ${Math.max(1, index + 1)} of ${ids.length || 1}`}
            >
              {(ids.length ? ids : [id]).map((s, i) => (
                <i key={s}>
                  <b style={{ transform: `scaleX(${i < index ? 1 : s === id ? progress : 0})` }} />
                </i>
              ))}
            </div>
            <div className="mo-watch-by">
              <MomentFace author={moment.author} />
              <div>
                <strong>
                  {own ? 'Your Moment' : moment.author.name}{' '}
                  {moment.author.verified && <BadgeCheck size={14} />}
                </strong>
                <small>
                  {[
                    moment.place_label,
                    moment.earlier
                      ? new Date(moment.created_at).toDateString() === new Date(now).toDateString()
                        ? 'Earlier today'
                        : 'Yesterday'
                      : timeAgo(moment.created_at, now),
                    left > 59 ? `${Math.ceil(left / 60)}h left` : `${left}m left`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </div>
              <button
                aria-label={paused ? 'Play Moment' : 'Pause Moment'}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? <Play /> : <Pause />}
              </button>
              <button aria-label="More options" onClick={() => setSheet('menu')}>
                <Ellipsis />
              </button>
              <button aria-label="Close viewer" onClick={onClose}>
                <X />
              </button>
            </div>
          </div>
          {mediaFailed && (
            <button
              className="mo-media-retry"
              onClick={() => {
                setAttempt((n) => n + 1);
                setMediaFailed(false);
                void query.refetch();
                video.current?.load();
              }}
            >
              Reload media
            </button>
          )}
          <div className="mo-watch-over">
            <div className="mo-pills">
              {moment.taken_here && (
                <span>
                  <Radio />
                  {Date.parse(moment.live_until || '') > now ? 'Live from here' : 'Taken here'}
                </span>
              )}
              {moment.taken_at && (
                <span>
                  Taken{' '}
                  {new Date(moment.taken_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              )}
              {moment.altitude_ft != null && (
                <span>
                  <Mountain />
                  {moment.floating ? 'About ' : ''}
                  {moment.altitude_ft.toLocaleString()} ft
                </span>
              )}
              {moment.weather && (
                <span>
                  <CloudSun />
                  {moment.weather.temp_f}°F · {moment.weather.label}
                </span>
              )}
              {moment.series && (
                <span>
                  Part {moment.series.index} of {moment.series.count}
                </span>
              )}
              {moment.state !== 'live' && (
                <span>
                  {moment.state === 'scheduled' && moment.share_at
                    ? 'Shares ' + new Date(moment.share_at).toLocaleString()
                    : moment.state}
                </span>
              )}
            </div>
            {moment.caption && <p>{moment.caption}</p>}
          </div>
          <div className="mo-watch-bottom">
            {note && (
              <div role="status" className="mo-note">
                {room && note === 'Reply sent in Messages' ? (
                  <Link className="underline" href={'/app/chat/' + encodeURIComponent(room)}>
                    {note}
                  </Link>
                ) : (
                  note
                )}
                <button onClick={() => setNote('')} aria-label="Dismiss message">
                  <X size={15} />
                </button>
              </div>
            )}
            {own ? (
              <button onClick={() => setSheet('seen')}>
                <Eye size={18} />
                {moment.viewer_count ? `Seen by ${moment.viewer_count}` : 'No views yet'}
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reply.trim()) return;
                  void act(async () => {
                    const sent = await moments.reply(id, reply.trim());
                    setRoom(sent.room_id);
                    void client.invalidateQueries({ queryKey: queryKeys.conversations() });
                    setReply('');
                    setNote('Reply sent in Messages');
                  });
                }}
              >
                {moment.author.kind !== 'pantopus' && (
                  <>
                    <input
                      aria-label={`Reply to ${moment.author.first_name}`}
                      placeholder={`Reply to ${moment.author.first_name}…`}
                      value={reply}
                      maxLength={1000}
                      disabled={busy}
                      onFocus={() => setTyping(true)}
                      onBlur={() => setTyping(false)}
                      onChange={(e) => setReply(e.target.value)}
                    />
                    {reply.trim() && (
                      <button disabled={busy} aria-label="Send private reply">
                        <Send size={18} />
                      </button>
                    )}
                  </>
                )}
                <button type="button" aria-label="React to Moment" onClick={() => setSheet('react')}>
                  {activeReaction || <SmilePlus />}
                </button>
              </form>
            )}
            {moment.kind === 'video' && (
              <button aria-label={muted ? 'Turn sound on' : 'Mute video'} onClick={() => setMuted((v) => !v)}>
                {muted ? <VolumeX /> : <Volume2 />}
              </button>
            )}
          </div>
          {sheet && (
            <div className="mo-watch-sheet">
              <div className="mo-sheet-inner" role="group" aria-label="Moment options">
                <div className="mo-sheet-title">
                  <h3>
                    {
                      {
                        menu: 'Moment options',
                        seen: 'Seen by',
                        report: 'Report Moment',
                        mute: 'Mute Moments?',
                        block: 'Block this person?',
                        delete: 'Delete this Moment?',
                        react: 'Quick reactions',
                      }[sheet]
                    }
                  </h3>
                  <button aria-label="Close options" onClick={closeSheet} disabled={busy}>
                    <X size={19} />
                  </button>
                </div>
                {sheet === 'menu' && (
                  <>
                    <Action
                      onClick={() =>
                        void act(async () => {
                          if (own) {
                            window.location.assign('/app/profile');
                            return;
                          }
                          const profile = await users.getProfileById(moment.author.id);
                          window.location.assign(buildUserProfilePath(profile.username || moment.author.id));
                        })
                      }
                    >
                      <UserRound />
                      Open profile
                    </Action>
                    {moment.state === 'live' && (
                      <Action
                        onClick={() =>
                          void act(async () => {
                            const url = new URL('/app/moments/' + moment.id, window.location.origin);
                            await navigator.clipboard.writeText(url.toString());
                            setSheet(null);
                            setNote('Moment link copied');
                          })
                        }
                      >
                        <Copy />
                        Copy link
                      </Action>
                    )}
                    {location && (
                      <Action
                        onClick={() =>
                          props.onPlace({ latitude: moment.latitude!, longitude: moment.longitude! })
                        }
                      >
                        <LocateFixed />
                        Show on map
                      </Action>
                    )}
                    {own ? (
                      <>
                        <Action
                          onClick={() =>
                            void act(async () => {
                              await saveMoment(moment);
                              setSheet(null);
                            })
                          }
                        >
                          <Download />
                          Save Moment
                        </Action>
                        <Action danger onClick={() => setSheet('delete')}>
                          <Trash2 />
                          Delete
                        </Action>
                      </>
                    ) : (
                      <>
                        <Action onClick={() => setSheet('report')}>
                          <Flag />
                          Report
                        </Action>
                        <Action onClick={() => setSheet('mute')}>
                          <VolumeX />
                          Mute these Moments
                        </Action>
                        <Action danger onClick={() => setSheet('block')}>
                          <ShieldBan />
                          Block
                        </Action>
                      </>
                    )}
                  </>
                )}
                {sheet === 'react' && (
                  <div className="mo-reactions">
                    {POST_REACTION_EMOJIS.map((r) => (
                      <button
                        key={r.id}
                        disabled={busy}
                        aria-label={r.name}
                        aria-pressed={activeReaction === r.emoji}
                        onClick={() =>
                          void act(async () => {
                            const answer = await moments.react(
                              id,
                              activeReaction === r.emoji ? null : r.emoji,
                            );
                            setReaction(answer.my_reaction);
                            setSheet(null);
                          })
                        }
                      >
                        {r.emoji}
                      </button>
                    ))}
                  </div>
                )}
                {sheet === 'seen' && (
                  <>
                    {viewers.isPending ? (
                      <p>Loading viewers…</p>
                    ) : viewers.isError ? (
                      <button onClick={() => void viewers.refetch()}>Retry viewers</button>
                    ) : viewers.data?.count ? (
                      viewers.data.viewers.map((v) => (
                        <div className="mo-seen-row" key={v.user.id}>
                          <MomentFace author={v.user} />
                          <strong>{v.user.name}</strong>
                          <small>{v.replied ? 'Replied' : timeAgo(v.viewed_at)}</small>
                          {v.reaction}
                        </div>
                      ))
                    ) : (
                      <p>No one has watched yet.</p>
                    )}
                  </>
                )}
                {sheet === 'report' && (
                  <>
                    <label>
                      Reason
                      <select value={reason} onChange={(e) => setReason(e.target.value)}>
                        <option value="">Choose a reason</option>
                        {Object.entries(reasonLabels).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="mo-primary"
                      disabled={busy || !reason}
                      onClick={() =>
                        void act(async () => {
                          await moments.report(id, reason);
                          onRemove(id);
                        })
                      }
                    >
                      Send report
                    </button>
                  </>
                )}
                {(sheet === 'mute' || sheet === 'block' || sheet === 'delete') && (
                  <>
                    <p>
                      {sheet === 'delete'
                        ? 'This Moment will leave the map for everyone.'
                        : sheet === 'mute'
                          ? `Hide Moments from ${moment.author.name}. You can undo this in Settings.`
                          : 'You will no longer see each other’s posts or be able to message each other.'}
                    </p>
                    <button
                      className="mo-primary"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          if (sheet === 'delete') await moments.remove(id);
                          else if (sheet === 'mute') await moments.mute(moment.author.id);
                          else await blocks.blockUser(moment.author.id);
                          onRemove(id, sheet === 'delete' ? undefined : moment.author.id);
                        })
                      }
                    >
                      {sheet === 'delete'
                        ? 'Delete Moment'
                        : sheet === 'mute'
                          ? 'Mute Moments'
                          : 'Block person'}
                    </button>
                  </>
                )}
                {note && <p role="status">{note}</p>}
              </div>
            </div>
          )}
        </>
      )}
      {wide && moment && !sheet && (
        <div className="mo-pager">
          <button disabled={index <= 0} aria-label="Previous Moment" onClick={() => step(-1)}>
            <ChevronLeft />
          </button>
          <button aria-label="Next Moment" onClick={() => step(1)}>
            <ChevronRight />
          </button>
        </div>
      )}
    </section>
  );
  return wide ? (
    section
  ) : (
    <MomentDialog label="Watch Moment" className="mo-watch-dialog" onClose={sheet ? closeSheet : onClose}>
      {section}
    </MomentDialog>
  );
}

async function saveMoment(moment: Moment) {
  let blob: Blob;
  if (moment.kind === 'text') {
    const c = document.createElement('canvas');
    c.width = 720;
    c.height = 1280;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('This card could not be saved.');
    const stops = colors[moment.background || 'teal'].match(/#[0-9a-f]{6}/g)!;
    const gradient = ctx.createLinearGradient(0, 0, c.width, c.height);
    gradient.addColorStop(0, stops[0]);
    gradient.addColorStop(1, stops[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px system-ui';
    const lines: string[] = [];
    let line = '';
    for (const word of (moment.text || '').split(/\s+/)) {
      if (line && ctx.measureText(line + ' ' + word).width > 625) {
        lines.push(line);
        line = '';
      }
      line = line ? line + ' ' + word : word;
    }
    lines.push(line);
    lines.forEach((s, i) => ctx.fillText(s, 360, 640 + (i - (lines.length - 1) / 2) * 56, 640));
    blob = await new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save card.')))),
    );
  } else {
    if (!moment.media_url) throw new Error('The media is unavailable.');
    const response = await fetch(moment.media_url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not download this Moment. Reopen it and try again.');
    blob = await response.blob();
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Moment.${moment.kind === 'text' ? 'png' : blob.type.split('/')[1]?.replace('quicktime', 'mov') || 'jpg'}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
