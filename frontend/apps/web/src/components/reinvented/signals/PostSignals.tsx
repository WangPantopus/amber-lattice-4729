'use client';

// The five signals on Pulse posts (Pulse, reinvented; coord/CONTRACT.md §4): Learned, Want to go, Smile, Same, Helpful,
// in the emoji's place on a post's card and on its own page. The server adds `userSignal` and `signals` to a post only
// for a reader whose switch is on, so a post that carries them draws these and every other post draws today's emoji:
// knowing which costs no request. One signal per person, the same reaction as an emoji (choosing one replaces it).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Smile } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { post as send } from '@pantopus/api/client';
import { isSignal, SIGNALS, SIGNAL_WORDS, SignalIcon, type Signal } from '../viewer/signals';
import { isSwitchedOff } from '../switchOff';

export interface SignalCount {
  signal: Signal;
  count: number;
}
interface Signals {
  userSignal: Signal | null;
  signals: SignalCount[];
}
/** A post as the server sends it to a reader with the switch on. */
type SignalPost = { id: string; userSignal?: string | null; signals?: { signal: string; count: number }[] };

/** True when the server sent this post's signals: the reader's switch is on. */
export function hasSignals(post: unknown): boolean {
  return Array.isArray((post as SignalPost | null)?.signals);
}

const tidy = (p: SignalPost): Signals => ({
  userSignal: isSignal(p.userSignal) ? p.userSignal : null,
  signals: (p.signals || []).filter((s): s is SignalCount => isSignal(s.signal) && s.count > 0),
});

/** Each signal's count after the viewer moves from `from` to `to`, to show at once. */
function moved(list: SignalCount[], from: Signal | null, to: Signal | null): SignalCount[] {
  const counts = new Map<Signal, number>(list.map((s) => [s.signal, s.count]));
  if (from) counts.set(from, Math.max(0, (counts.get(from) || 0) - 1));
  if (to) counts.set(to, (counts.get(to) || 0) + 1);
  return SIGNALS.filter((s) => (counts.get(s) || 0) > 0)
    .map((s) => ({ signal: s, count: counts.get(s)! }))
    .sort((a, b) => b.count - a.count || SIGNALS.indexOf(a.signal) - SIGNALS.indexOf(b.signal));
}

/**
 * The post's signals as shown: the server's, or what the viewer just chose until the next read of the post brings it.
 * Choosing the viewer's own signal again takes it away.
 */
function useSignals(post: SignalPost) {
  const client = useQueryClient();
  const [mine, setMine] = useState<Signals | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  // A fresh read of the post replaces what was shown since.
  useEffect(() => setMine(null), [post.userSignal, post.signals]);
  const shown = mine || tidy(post);
  const choose = useCallback(
    async (s: Signal) => {
      if (pending) return;
      const before = shown;
      const to = before.userSignal === s ? null : s;
      setMine({ userSignal: to, signals: moved(before.signals, before.userSignal, to) });
      setPending(true);
      setError('');
      try {
        const answer = await send<{ signal: string | null; signals?: { signal: string; count: number }[] }>(
          `/api/posts/${encodeURIComponent(post.id)}/like`,
          { signal: to },
        );
        setMine((now) => ({
          userSignal: isSignal(answer.signal) ? answer.signal : null,
          signals: answer.signals ? tidy({ id: post.id, signals: answer.signals }).signals : now?.signals || before.signals,
        }));
      } catch (e) {
        setMine(before);
        // The switch went off: read the posts again, and they come back as today's, with emoji.
        if (isSwitchedOff(e))
          void client.invalidateQueries({
            predicate: (q) => /feed|post|pulse/i.test(JSON.stringify(q.queryKey)),
          });
        else setError(e instanceof Error && e.message ? e.message : 'Couldn’t send that. Try again.');
      } finally {
        setPending(false);
      }
    },
    [client, pending, post.id, shown],
  );
  return { shown, choose, pending, error };
}

const chosen = 'text-sky-600 bg-sky-50 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-300';

/** The five signals in a bar beside the control that opened it, drawn over the page as today's emoji bar is. */
function SignalPicker({
  anchor,
  current,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  current: Signal | null;
  onPick(s: Signal): void;
  onClose(): void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const place = useCallback(() => {
    const r = anchor.getBoundingClientRect();
    if (!anchor.isConnected || r.bottom < 0 || r.top > window.innerHeight) return onClose();
    const w = bar.current?.offsetWidth ?? 0,
      h = bar.current?.offsetHeight ?? 0;
    const above = r.top - h - 8;
    setAt({ top: above >= 8 ? above : r.bottom + 8, left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8) });
  }, [anchor, onClose]);
  useLayoutEffect(place, [place]);
  useEffect(() => {
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
      anchor.focus();
    };
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!bar.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('mousedown', down);
    const buttons = bar.current?.querySelectorAll<HTMLButtonElement>('button');
    buttons?.[Math.max(0, current ? SIGNALS.indexOf(current) : 0)]?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('mousedown', down);
    };
  }, [anchor, current, onClose, place]);
  return createPortal(
    <div
      ref={bar}
      role="toolbar"
      aria-label="Signals"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const all = [...(bar.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const i = all.indexOf(document.activeElement as HTMLButtonElement);
        all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]?.focus();
        e.preventDefault();
      }}
      style={{ position: 'fixed', top: at?.top ?? -9999, left: at?.left ?? -9999, zIndex: 9999 }}
      className="flex flex-wrap items-center gap-1 p-1 max-w-[calc(100vw-16px)] bg-surface rounded-2xl shadow-lg border border-app"
    >
      {SIGNALS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          aria-pressed={current === s}
          data-testid={`pulseSignalOption_${s}`}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${
            current === s ? 'bg-sky-100 text-sky-700 ring-1 ring-sky-300 dark:bg-sky-900/40 dark:text-sky-200 dark:ring-sky-700' : 'text-app hover:bg-surface-muted'
          }`}
        >
          <SignalIcon signal={s} size={16} />
          {SIGNAL_WORDS[s]}
        </button>
      ))}
    </div>,
    document.body,
  );
}

function usePicker() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const toggle = useCallback((el: HTMLElement) => setAnchor((open) => (open ? null : el)), []);
  return { anchor, close, toggle };
}

/**
 * The card's signal, in the emoji pill's place: "React" before anyone chose one, then the most chosen signals' marks
 * (the viewer's own always among them) and how many chose one. Tinted once the viewer chose one. It opens the five.
 */
export function PostSignalPill({ post }: { post: SignalPost }) {
  const { shown, choose, pending, error } = useSignals(post);
  const picker = usePicker();
  const total = shown.signals.reduce((n, s) => n + s.count, 0);
  const mine = shown.userSignal;
  const top = shown.signals.slice(0, 3).map((s) => s.signal);
  if (mine && !top.includes(mine)) top.splice(2, 1, mine);
  const label =
    total === 0
      ? 'React'
      : `Signals, ${total}: ${shown.signals.map((s) => `${SIGNAL_WORDS[s.signal]} ${s.count}`).join(', ')}`;
  return (
    <>
      <button
        type="button"
        onClick={(e) => picker.toggle(e.currentTarget)}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-haspopup="true"
        aria-expanded={Boolean(picker.anchor)}
        aria-label={mine ? `${label}. Yours: ${SIGNAL_WORDS[mine]}` : label}
        title={error || undefined}
        data-testid={`pulseSignals_${post.id}`}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${pending ? 'opacity-60 ' : ''}${
          mine ? chosen : 'text-app-muted hover-bg-app'
        }`}
      >
        {total === 0 ? (
          <>
            <Smile className="w-4 h-4" aria-hidden="true" />
            <span>React</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-0.5" aria-hidden="true">
              {top.map((s) => (
                <SignalIcon key={s} signal={s} size={14} />
              ))}
            </span>
            <span>{total}</span>
          </>
        )}
      </button>
      {picker.anchor && (
        <SignalPicker
          anchor={picker.anchor}
          current={mine}
          onClose={picker.close}
          onPick={(s) => {
            picker.close();
            void choose(s);
          }}
        />
      )}
    </>
  );
}

/**
 * The post page's signals: all five as chips, each with how many chose it, the viewer's own tinted (board B3). A chip
 * sets that signal, or takes the viewer's own away.
 */
export function PostSignalBar({ post, className = '' }: { post: SignalPost; className?: string }) {
  const { shown, choose, pending, error } = useSignals(post);
  const count = (s: Signal) => shown.signals.find((c) => c.signal === s)?.count || 0;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Signals">
        {SIGNALS.map((s) => {
          const on = shown.userSignal === s;
          const n = count(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => void choose(s)}
              disabled={pending}
              aria-pressed={on}
              aria-label={`${SIGNAL_WORDS[s]}${n ? `, ${n}` : ''}`}
              data-testid={`pulsePostDetail-signal-${s}`}
              className={`flex items-center gap-1.5 h-8 px-2.5 rounded-full border text-xs font-semibold transition-colors ${
                pending ? 'opacity-60 ' : ''
              }${on ? `${chosen} border-sky-300 dark:border-sky-700` : 'border-app text-app-muted hover-bg-app'}`}
            >
              <SignalIcon signal={s} size={14} />
              <span>{SIGNAL_WORDS[s]}</span>
              {n > 0 && <span>{n}</span>}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
