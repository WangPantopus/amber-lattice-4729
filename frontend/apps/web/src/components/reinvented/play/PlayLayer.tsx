'use client';

// Playable items over a Moment's picture in the viewer (Pulse, reinvented, phase 2; coord/CONTRACT.md §7b; boards B5
// and B9). Each sits where its author placed it, sized as a share of the picture's width like a stamp, so it lands on
// the same part of the picture everywhere. A reader answers; the author sees the results instead of the controls.
// Taps and keys inside an item stay in it: they never step or pause the viewer.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { useMe } from '@/lib/me';
import { messageOf } from '@/components/moments/momentState';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import { isRouteGone, markServerBehind } from '../serverBehind';
import { answerPlay, readAnswers, readPlay, removeAnswer, takeBackPlay, waitingItems, type PlayAnswer, type PlayFace, type PlayItem } from './playTypes';
import './play.css';

type PlayMoment = Moment & { play?: PlayItem[] };

/** The viewer holds still while the reader has an item left to answer (the author never: theirs are closed to them). */
export function holdsForPlay(m: Moment): boolean {
  const play = (m as PlayMoment).play;
  // A before and after holds too: the reader compares at their own pace and goes on when they choose.
  return waitingItems(play).length > 0 || fogged.has(m.id) || (m.kind === 'photo' && !!play?.some((p) => p.kind === 'before_after'));
}

// Moments whose fog the reader hasn't wiped yet: the viewer holds still on them.
const fogged = new Set<string>();

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A post's items (a Pulse post made in the Studio) have no viewer cache: they are kept here and read again after a change. */
interface Local {
  set(items: PlayItem[]): void;
  items: PlayItem[];
}

function useAnswer(moment: Moment, local?: Local) {
  const client = useQueryClient();
  const reread = useRereadSwitch();
  const account = useMe().data?.id;
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState<{ item: string; text: string } | null>(null);
  const key = ['moments', 'watch', account, moment.id];
  async function send(item: string, body: PlayAnswer | null) {
    if (busy) return false;
    setBusy(item);
    setError(null);
    try {
      if (body) {
        const answer = await answerPlay(moment.id, item, body);
        if (local) local.set(local.items.map((p) => (p.id === item ? answer.item : p)));
        else client.setQueryData<{ moment: PlayMoment }>(key, (old) =>
          old ? { ...old, moment: { ...old.moment, play: (old.moment.play || []).map((p) => (p.id === item ? answer.item : p)) } } : old,
        );
      } else {
        await takeBackPlay(moment.id, item);
        if (local) local.set((await readPlay(moment.id)).play);
        else await client.invalidateQueries({ queryKey: key });
      }
      return true;
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      // The switch went off, or the server is older than this website: today's viewer, which shows the plain picture.
      if (isSwitchedOff(e)) void reread();
      else if (isRouteGone(e) && code !== 'PLAY_NOT_FOUND') markServerBehind();
      else if (code === 'MOMENT_ENDED' || code === 'PLAY_NOT_FOUND') void client.invalidateQueries({ queryKey: key });
      else setError({ item, text: messageOf(e, 'Couldn’t send that. Try again.') });
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { send, busy, error };
}

/** The items over the picture: the layer fills the picture's box, as the stamps' layer does. */
export default function PlayLayer({ moment, post = false }: { moment: Moment; post?: boolean }) {
  // On a post (not a Moment in the viewer) the items live here once anyone answers.
  const [mine, setMine] = useState<PlayItem[] | null>(null);
  const play = mine ?? ((moment as PlayMoment).play || []);
  const answer = useAnswer(moment, post ? { set: setMine, items: play } : undefined);
  const account = useMe().data?.id;
  // The author reads the question box's answers and the board's notes, and may remove one (§7b, the author's side).
  const owner = account && moment.author?.id === account ? moment.id : undefined;
  // A swatch's colour being tried, per item (on this screen only; the picture is never changed).
  const [trying, setTrying] = useState<Record<string, string | null>>({});
  if (!play.length) return null;
  const fog = play.find((p) => p.kind === 'fog');
  return (
    <div className="pl-layer">
      {play.map((item) =>
        item.kind === 'swatch' && trying[item.id] ? (
          <span
            key={`tint-${item.id}`}
            className="pl-tint"
            aria-hidden="true"
            style={{
              left: `${item.box.x * 100}%`,
              top: `${item.box.y * 100}%`,
              width: `${item.box.w * 100}%`,
              height: `${item.box.h * 100}%`,
              background: trying[item.id]!,
            }}
          />
        ) : null,
      )}
      {play.filter((item) => item.kind !== 'fog' && item.kind !== 'before_after').map((item) => (
        <div
          key={item.id}
          className="pl-item"
          data-kind={item.kind}
          style={{
            left: `${clamp01(item.x) * 100}%`,
            top: `${clamp01(item.y) * 100}%`,
            ['--s' as string]: Math.min(4, Math.max(0.25, item.scale || 1)),
            transform: `translate(-50%, -50%) rotate(${item.rotation || 0}deg)`,
          }}
          // An item is the reader's to use: its taps, holds and keys never reach the viewer behind it.
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onPointerCancel={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {item.kind === 'swatch' ? (
            <Swatch item={item} trying={trying[item.id] ?? null} onTry={(c) => setTrying({ ...trying, [item.id]: c })} />
          ) : (
            <Card item={item} busy={answer.busy === item.id} send={(body) => answer.send(item.id, body)} owner={owner} />
          )}
          {answer.error?.item === item.id && (
            <p className="pl-error" role="alert">
              {answer.error.text}
            </p>
          )}
        </div>
      ))}
      {fog && <Fog momentId={moment.id} />}
    </div>
  );
}

interface CardProps<K extends PlayItem['kind']> {
  item: Extract<PlayItem, { kind: K }>;
  busy: boolean;
  send(body: PlayAnswer | null): Promise<boolean>;
}

/** One item's card. The Studio draws it with `open: false` and no results, as a preview of what readers get. */
export function Card({
  item,
  busy,
  send,
  owner,
}: {
  item: PlayItem;
  busy: boolean;
  send(body: PlayAnswer | null): Promise<boolean>;
  /** The Moment's id when the reader is its author: their answers list. */
  owner?: string;
}) {
  switch (item.kind) {
    case 'poll':
      return <Poll item={item} busy={busy} send={send} />;
    case 'slider':
      return <Slider item={item} busy={busy} send={send} />;
    case 'board':
      return (
        <>
          <Board item={item} busy={busy} send={send} />
          {owner && (item.results?.count ?? 0) > 0 && <Answers postId={owner} item={item.id} what="notes" />}
        </>
      );
    case 'question':
      return (
        <>
          <QuestionBox item={item} busy={busy} send={send} />
          {owner && (item.results?.count ?? 0) > 0 && <Answers postId={owner} item={item.id} what="answers" />}
        </>
      );
    case 'guess':
      return <Guess item={item} busy={busy} send={send} />;
    case 'countdown':
      return <Countdown item={item} />;
    case 'quote':
      return (
        <figure className="pl-card pl-quote">
          <blockquote>“{item.text}”</blockquote>
          {item.source && <figcaption>{item.source}</figcaption>}
        </figure>
      );
    case 'fog':
      // Only the Studio draws it as a card (the viewer frosts the whole picture instead).
      return (
        <div className="pl-card">
          <p className="pl-q">Fog</p>
          <p className="pl-foot">The picture opens frosted; readers wipe it clear.</p>
        </div>
      );
    case 'swatch':
      return <Swatch item={item} trying={null} onTry={() => {}} />;
    case 'before_after':
      // Only the Studio draws it as a card (readers get the curtain over the whole picture instead).
      return (
        <div className="pl-card">
          <p className="pl-q">Before and after</p>
          <p className="pl-foot">
            {item.before || 'Before'} · {item.after || 'After'}. Readers drag a curtain between your two photos.
          </p>
        </div>
      );
    default:
      return null;
  }
}

function Poll({ item, busy, send }: CardProps<'poll'>) {
  const total = item.results?.total ?? 0;
  return (
    <div className="pl-card">
      <p className="pl-q">{item.question}</p>
      <div className="pl-options" role="group" aria-label={item.question}>
        {item.options.map((o, i) => {
          const mine = item.mine?.choice === i;
          const share = item.results ? pct(item.results.counts[i] || 0, total) : null;
          return (
            <button
              key={i}
              type="button"
              className="pl-option"
              aria-pressed={mine}
              disabled={!item.open || busy}
              // Choosing one's own answer again takes it back.
              onClick={() => void send(mine ? null : { choice: i })}
            >
              {share !== null && <span className="pl-bar" style={{ width: `${share}%` }} aria-hidden="true" />}
              <span className="pl-option-words">
                {mine && <Check aria-hidden="true" />}
                {o}
              </span>
              {share !== null && <span className="pl-share">{share}%</span>}
            </button>
          );
        })}
      </div>
      {item.results && (
        <p className="pl-foot">
          {total} {total === 1 ? 'vote' : 'votes'}
          {item.open && item.mine ? ' · tap yours again to take it back' : ''}
        </p>
      )}
    </div>
  );
}

function Faces({ faces, along }: { faces: PlayFace[]; along?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      {faces.map((f, i) => {
        const name = f.mine ? 'You' : f.person?.first_name || f.person?.name || 'Someone nearby';
        const label = f.note ? `${name}: ${f.note}` : name;
        return (
          <button
            key={i}
            type="button"
            className="pl-face"
            data-mine={f.mine || undefined}
            style={{ left: `${clamp01(f.x) * 100}%`, ...(along ? {} : { bottom: `${clamp01(f.y ?? 0) * 100}%` }) }}
            aria-label={label}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(open === i ? null : i);
            }}
          >
            {f.mine ? 'You' : f.person?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- the person's own avatar
              <img src={f.person.avatar_url} alt="" />
            ) : (
              f.person?.initials || ''
            )}
            {open === i && (
              <span className="pl-tip" role="status">
                {label}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

function Slider({ item, busy, send }: CardProps<'slider'>) {
  const [value, setValue] = useState<number | null>(null);
  const shown = value ?? item.mine?.value ?? 0.5;
  const commit = () => {
    if (value === null || !item.open) return;
    void send({ value: Math.round(value * 100) / 100 }).then(() => setValue(null));
  };
  const avg = item.results?.average;
  return (
    <div className="pl-card">
      <p className="pl-q">{item.question}</p>
      <div className="pl-track" data-look={item.look}>
        {item.look === 'dial' && item.results?.faces && <Faces faces={item.results.faces.filter((f) => !f.mine)} along />}
        {typeof avg === 'number' && (
          <span className="pl-avg" style={{ left: `${clamp01(avg) * 100}%` }} title="Average">
            <span>Average</span>
          </span>
        )}
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={shown}
          disabled={!item.open || busy}
          aria-label={`${item.question} (${item.left} to ${item.right})`}
          aria-valuetext={`${Math.round(shown * 100)}% toward ${item.right}`}
          data-emoji={item.look === 'slider' && item.emoji ? item.emoji : undefined}
          onChange={(e) => setValue(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
        />
      </div>
      <div className="pl-ends">
        <span>{item.left}</span>
        <span>{item.right}</span>
      </div>
      {item.results && (
        <p className="pl-foot">
          {item.results.count} {item.results.count === 1 ? 'person' : 'people'}
          {item.open && item.mine && (
            <>
              {' · '}
              <button type="button" className="pl-link" disabled={busy} onClick={() => void send(null)}>
                Take mine back
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function Board({ item, busy, send }: CardProps<'board'>) {
  const area = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null),
    [note, setNote] = useState('');
  const faces = (item.results?.faces || []).filter((f) => !(spot && f.mine));
  const count = item.results?.count ?? 0;
  function place(e: React.MouseEvent) {
    if (!item.open || busy || !area.current) return;
    const b = area.current.getBoundingClientRect();
    setSpot({ x: clamp01((e.clientX - b.left) / b.width), y: clamp01(1 - (e.clientY - b.top) / b.height) });
    setNote((n) => n || item.mine?.note || '');
  }
  return (
    <div className="pl-card">
      <p className="pl-q">{item.question}</p>
      <div className="pl-board">
        <span className="pl-axis" data-at="top">
          {item.y_axis.top}
        </span>
        <span className="pl-axis" data-at="bottom">
          {item.y_axis.bottom}
        </span>
        <span className="pl-axis" data-at="left">
          {item.x_axis.left}
        </span>
        <span className="pl-axis" data-at="right">
          {item.x_axis.right}
        </span>
        <div ref={area} className="pl-board-area" onClick={place} aria-label={item.open ? 'Tap where you stand' : undefined}>
          <Faces faces={faces} />
          {spot && (
            <span className="pl-face" data-mine="true" style={{ left: `${spot.x * 100}%`, bottom: `${spot.y * 100}%` }}>
              You
            </span>
          )}
        </div>
      </div>
      {spot ? (
        <form
          className="pl-row"
          onSubmit={(e) => {
            e.preventDefault();
            void send({ x: Math.round(spot.x * 100) / 100, y: Math.round(spot.y * 100) / 100, ...(note.trim() ? { note: note.trim() } : {}) }).then(
              (ok) => ok && setSpot(null),
            );
          }}
        >
          <input className="pl-input" value={note} maxLength={60} placeholder="Add a line with your dot (optional)" onChange={(e) => setNote(e.target.value)} />
          <button type="submit" className="pl-send" disabled={busy}>
            Place
          </button>
          <button type="button" className="pl-round" aria-label="Cancel" onClick={() => setSpot(null)}>
            <X aria-hidden="true" />
          </button>
        </form>
      ) : (
        <p className="pl-foot">
          {count} {count === 1 ? 'person' : 'people'} placed.{' '}
          {item.open ? (item.mine ? 'Tap the board to move your dot.' : 'Tap where you stand.') : 'Tap a face to read its note.'}
          {item.open && item.mine && (
            <>
              {' '}
              <button type="button" className="pl-link" disabled={busy} onClick={() => void send(null)}>
                Take my dot off
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function QuestionBox({ item, busy, send }: CardProps<'question'>) {
  const [text, setText] = useState(''),
    [editing, setEditing] = useState(false);
  // The author: how many answered (they read them from the post's options).
  if (item.results)
    return (
      <div className="pl-card">
        <p className="pl-q">{item.prompt}</p>
        <p className="pl-foot">
          {item.results.count} {item.results.count === 1 ? 'answer' : 'answers'}. Only you see them.
        </p>
      </div>
    );
  const writing = item.open && (!item.mine || editing);
  return (
    <div className="pl-card">
      <p className="pl-q">{item.prompt}</p>
      {writing ? (
        <form
          className="pl-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void send({ text: text.trim() }).then((ok) => ok && (setEditing(false), setText('')));
          }}
        >
          <input className="pl-input" value={text} maxLength={200} placeholder="Your answer" onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="pl-send" disabled={busy || !text.trim()}>
            Send
          </button>
        </form>
      ) : item.mine ? (
        <p className="pl-mine">“{item.mine.text}”</p>
      ) : null}
      <p className="pl-foot">
        Only the person who posted this sees answers.
        {item.open && item.mine && !editing && (
          <>
            {' '}
            <button
              type="button"
              className="pl-link"
              onClick={() => {
                setText(item.mine?.text || '');
                setEditing(true);
              }}
            >
              Change
            </button>
            {' · '}
            <button type="button" className="pl-link" disabled={busy} onClick={() => void send(null)}>
              Take back
            </button>
          </>
        )}
      </p>
    </div>
  );
}

function Guess({ item, busy, send }: CardProps<'guess'>) {
  const [value, setValue] = useState('');
  const tried = !!item.mine || typeof item.answer === 'number';
  const unit = item.range?.unit ? ` ${item.range.unit}` : '';
  let body: ReactNode;
  if (item.options) {
    const results = item.results && 'counts' in item.results ? item.results : null;
    body = (
      <div className="pl-options" role="group" aria-label={item.prompt}>
        {item.options.map((o, i) => {
          const right = tried && item.answer === i;
          const share = results ? pct(results.counts[i] || 0, results.total) : null;
          return (
            <button
              key={i}
              type="button"
              className="pl-option"
              aria-pressed={item.mine?.choice === i}
              data-right={right || undefined}
              disabled={!item.open || tried || busy}
              onClick={() => void send({ choice: i })}
            >
              {share !== null && <span className="pl-bar" style={{ width: `${share}%` }} aria-hidden="true" />}
              <span className="pl-option-words">
                {right && <Check aria-hidden="true" />}
                {o}
              </span>
              {share !== null && <span className="pl-share">{share}%</span>}
            </button>
          );
        })}
      </div>
    );
  } else if (item.range) {
    const range = item.range;
    const results = item.results && 'average' in item.results ? item.results : null;
    body = tried ? (
      <p className="pl-mine">
        {typeof item.answer === 'number' && `The answer: ${item.answer}${unit}.`}
        {item.mine?.value !== undefined && ` You said ${item.mine.value}${unit}`}
        {typeof item.mine?.off_by === 'number' && (item.mine.off_by === 0 ? ', right on.' : `, off by ${item.mine.off_by}${unit}.`)}
        {results && typeof results.average === 'number' && ` Everyone: ${Math.round(results.average * 10) / 10}${unit} on average.`}
      </p>
    ) : (
      <form
        className="pl-row"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(value);
          if (value.trim() && Number.isFinite(n)) void send({ value: Math.min(range.max, Math.max(range.min, n)) });
        }}
      >
        <input
          className="pl-input"
          type="number"
          inputMode="decimal"
          min={range.min}
          max={range.max}
          value={value}
          placeholder={`${range.min} to ${range.max}${unit}`}
          disabled={!item.open}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="pl-send" disabled={busy || !item.open || !value.trim()}>
          Guess
        </button>
      </form>
    );
  }
  return (
    <div className="pl-card">
      <p className="pl-q">{item.prompt}</p>
      {body}
      <p className="pl-foot">
        {item.mine && item.options ? (item.mine.right ? 'You got it.' : 'Not this time.') : tried ? '' : 'One try. The answer shows after yours.'}
      </p>
    </div>
  );
}

function left(ms: number): string {
  if (ms <= 0) return 'Ended';
  const m = Math.floor(ms / 60_000),
    d = Math.floor(m / 1440),
    h = Math.floor((m % 1440) / 60),
    s = Math.floor((ms % 60_000) / 1000);
  if (d) return `${d}d ${h}h ${m % 60}m`;
  if (h) return `${h}h ${m % 60}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function Countdown({ item }: { item: Extract<PlayItem, { kind: 'countdown' }> }) {
  const end = Date.parse(item.ends_at);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!(end > now)) return undefined;
    const t = setTimeout(() => setNow(Date.now()), end - now > 3_600_000 ? 30_000 : 1_000);
    return () => clearTimeout(t);
  }, [end, now]);
  return (
    <div className="pl-card pl-countdown">
      <p className="pl-q">{item.title}</p>
      <p className="pl-time" aria-live="off">
        {Number.isFinite(end) ? left(end - now) : ''}
      </p>
    </div>
  );
}

/**
 * The author's side (§7b): the question box's answers, or the board's notes, newest first, each with who gave it (a
 * person the author isn't connected with still shows by name here: they answered under their own name) and Remove.
 */
function Answers({ postId, item, what }: { postId: string; item: string; what: 'answers' | 'notes' }) {
  const client = useQueryClient();
  const account = useMe().data?.id;
  const [open, setOpen] = useState(false),
    [removing, setRemoving] = useState<string | null>(null);
  const list = useInfiniteQuery({
    queryKey: ['reinvented', 'play-answers', postId, item],
    queryFn: ({ pageParam, signal }) => readAnswers(postId, item, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: open,
  });
  const rows = (list.data?.pages || []).flatMap((p) => p.answers).filter((a) => (what === 'notes' ? !!a.note : true));
  async function remove(id: string) {
    setRemoving(id);
    try {
      await removeAnswer(postId, item, id);
      await list.refetch();
      void client.invalidateQueries({ queryKey: ['moments', 'watch', account, postId] });
    } catch {
      // Left as it is; the list shows it still there.
    } finally {
      setRemoving(null);
    }
  }
  return (
    <div className="pl-card pl-answers">
      <button type="button" className="pl-link" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide' : what === 'notes' ? 'Read the notes' : 'Read the answers'}
      </button>
      {open && (
        <>
          {list.isPending && <p className="pl-foot">Loading…</p>}
          {list.isError && <p className="pl-foot">Couldn’t load them. Try again.</p>}
          {!list.isPending && !rows.length && !list.isError && <p className="pl-foot">{what === 'notes' ? 'No notes yet.' : 'No answers yet.'}</p>}
          <ul>
            {rows.map((a) => (
              <li key={a.id}>
                <span>
                  <strong>{a.person?.first_name || a.person?.name || 'Someone'}</strong> {a.text ?? a.note}
                </span>
                <button type="button" className="pl-link" disabled={removing === a.id} onClick={() => void remove(a.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {list.hasNextPage && (
            <button type="button" className="pl-link" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              More
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** A swatch's colours (§7g): tap one to try it over its area, tap again or "Original" to see the picture as it is. */
function Swatch({ item, trying, onTry }: { item: Extract<PlayItem, { kind: 'swatch' }>; trying: string | null; onTry(c: string | null): void }) {
  return (
    <div className="pl-card">
      <p className="pl-q">Try a colour</p>
      <div className="pl-swatches" role="group" aria-label="Colours to try">
        {item.colors.map((c) => (
          <button key={c} type="button" aria-label={`Try ${c}`} aria-pressed={trying === c} style={{ background: c }} onClick={() => onTry(trying === c ? null : c)} />
        ))}
      </div>
      <p className="pl-foot">
        {trying ? (
          <>
            Trying it on (not the real photo).{' '}
            <button type="button" className="pl-link" onClick={() => onTry(null)}>
              Original
            </button>
          </>
        ) : (
          'The photo stays as it is.'
        )}
      </p>
    </div>
  );
}

/**
 * Fog (§7g): the picture opens frosted and the reader wipes it clear on their own screen, by dragging (or "Clear it").
 * Drawn from the picture itself where the page can (a frosted copy over it); otherwise a frosted pane.
 */
function Fog({ momentId }: { momentId: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wiped = useRef(0);
  const [clear, setClear] = useState(false),
    [touched, setTouched] = useState(false);
  useEffect(() => {
    fogged.add(momentId);
    return () => {
      fogged.delete(momentId);
    };
  }, [momentId]);
  useEffect(() => {
    if (clear) fogged.delete(momentId);
  }, [clear, momentId]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const box = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(box.width));
    c.height = Math.max(1, Math.round(box.height));
    const ctx = c.getContext('2d')!;
    // The picture under this layer: the viewer's own <img>, or a Studio post's.
    const host = c.closest('.sv-stamps, .rp-studio-pic')?.parentElement;
    const img = host?.querySelector<HTMLImageElement>('img.mo-watch-media, .rp-studio-pic > img') || null;
    try {
      if (img && img.complete && img.naturalWidth) {
        ctx.filter = 'blur(16px)';
        ctx.drawImage(img, -20, -20, c.width + 40, c.height + 40);
        ctx.filter = 'none';
        ctx.fillStyle = 'rgba(236, 242, 247, 0.45)';
      } else ctx.fillStyle = 'rgba(214, 224, 232, 0.94)';
    } catch {
      ctx.fillStyle = 'rgba(214, 224, 232, 0.94)';
    }
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);
  function wipe(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.buttons === 0 && e.type === 'pointermove') return;
    const c = canvas.current!;
    const b = c.getBoundingClientRect();
    const ctx = c.getContext('2d')!;
    const r = Math.max(18, c.width * 0.08);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(e.clientX - b.left, e.clientY - b.top, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    setTouched(true);
    wiped.current += (Math.PI * r * r) / (c.width * c.height);
    // Most of it wiped: the rest lifts by itself.
    if (wiped.current > 0.9) setClear(true);
  }
  if (clear) return null;
  return (
    <div className="pl-fog" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <canvas ref={canvas} aria-label="Frosted: wipe it clear" onPointerDown={wipe} onPointerMove={wipe} />
      {!touched && <span className="pl-fog-hint">Wipe it clear</span>}
      <button type="button" className="pl-fog-clear" onClick={() => setClear(true)}>
        Clear it
      </button>
    </div>
  );
}
