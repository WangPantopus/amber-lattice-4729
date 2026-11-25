'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp } from 'lucide-react';
import * as api from '@pantopus/api';
import type { ProfileCard, ProfileCardSheet, ProfileDoorSetting, ProfileLeaveCard } from '@pantopus/api';
import { MarkOverlay, useProfileMark } from './ProfileMarkRing';
import { extractApiError } from '@/lib/auth-utils';
import { toast } from '@/components/ui/toast-store';
import { confirmStore } from '@/components/ui/confirm-store';
import Screen from './Screen';
import { CircleFace } from './CircleView';
import { card, overline } from './blocks';

/** "November 24" (or "November 24, 2025" another year) from a YYYY-MM-DD day. */
export function dayText(value: string | null | undefined): string {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (!m) return '';
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * Opens today's conversation with a person (P3.3): a door's sentence goes in the composer, unsent (`?start=`). The
 * server's refusal (today's message rules) is shown as it is.
 */
export function useOpenConversation() {
  const router = useRouter();
  const busy = useRef(false);
  return useCallback(async (userId: string, start?: string | null) => {
    if (!userId || busy.current) return;
    busy.current = true;
    try {
      await api.chat.createDirectChat(userId);
      router.push(`/app/chat/conversation/${encodeURIComponent(userId)}${start ? `?start=${encodeURIComponent(start)}` : ''}`);
    } catch (err) {
      toast.error(extractApiError(err, 'Couldn’t open the conversation. Try again.'));
    } finally {
      busy.current = false;
    }
  }, [router]);
}

/** A sheet from the bottom on a phone, a centred panel on a wider screen (board 20). Escape closes it. */
function Sheet({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    // When the opener is gone on closing ("Leave your card" became "You left a card on …"), its place takes the focus.
    const anchor = opener?.closest<HTMLElement>('[data-focus-anchor]') ?? null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); } };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
      else if (anchor?.isConnected) anchor.querySelector<HTMLElement>('button:not([disabled]), [tabindex="-1"]')?.focus();
    };
  }, [open]);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-profile-screen=""
        className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-app rounded-t-3xl sm:rounded-3xl shadow-2xl outline-none px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div aria-hidden="true" className="sm:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-app-surface-sunken" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

const CARD_MAX = 120;

type SheetRead =
  | { state: 'loading' }
  | { state: 'ready'; sheet: ProfileCardSheet }
  | { state: 'failed'; error: string; refused: boolean };

/**
 * "Leave your card for Maria" (board 20): a plain hello, with up to 120 characters if the visitor likes. The card shows
 * the visitor as the person will see them (`GET …/:username/card`, read when the sheet opens); nothing else is sent.
 * The server's refusal is shown as it is.
 */
export function LeaveCardSheet({ open, onClose, firstName, username, leave, viewerId, onLeft }: {
  open: boolean;
  onClose: () => void;
  firstName: string;
  username: string;
  leave: ProfileLeaveCard | null;
  /** The visitor, for the ring their picture wears. */
  viewerId: string;
  onLeft: () => void;
}) {
  const ids = { title: useId(), words: useId() };
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  const [read, setRead] = useState<SheetRead>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // A refusal or a card already left means the page drew an old door: read the page again behind the sheet.
  const reread = useRef(onLeft);
  reread.current = onLeft;
  useEffect(() => { if (!open) { setText(''); setError(null); setLeft(false); } }, [open]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setRead({ state: 'loading' });
    Promise.resolve().then(() => api.profilePage.getCardSheet(username)).then(
      (sheet) => {
        if (!live) return;
        setRead({ state: 'ready', sheet });
        if (sheet?.left_at) reread.current();
      },
      (err: { statusCode?: number } | null) => {
        if (!live) return;
        const refused = err?.statusCode === 404;
        setRead({ state: 'failed', error: extractApiError(err, 'Couldn’t open your card. Try again.'), refused });
        if (refused) reread.current();
      },
    );
    return () => { live = false; };
  }, [open, username, attempt]);
  const sheet = read.state === 'ready' ? read.sheet : null;
  // The name others see ("Priya S."), never the private account name.
  const who = sheet?.you ?? leave?.you ?? null;
  const name = who?.name?.trim() || 'You';
  const max = sheet?.max_chars && sheet.max_chars > 0 ? sheet.max_chars : CARD_MAX;
  const leftAt = sheet?.left_at ?? null;
  const mark = useProfileMark(viewerId || null, open);
  const send = async () => {
    setBusy(true); setError(null);
    try {
      await api.profilePage.leaveCard(username, text.trim() || null);
      setLeft(true);
      onLeft();
    } catch (err) {
      setError(extractApiError(err, 'Couldn’t leave your card. Try again.'));
    }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} labelledBy={ids.title}>
      <h2 id={ids.title} className="text-[1.25rem] leading-7 font-bold text-app">Leave your card for {firstName}</h2>
      {left ? (
        <div className="mt-3 flex flex-col gap-4">
          <p role="status" className="text-[0.9375rem] leading-[1.375rem] text-app">Your card is with {firstName}. {firstName} can write back.</p>
          <button type="button" onClick={onClose} className="min-h-[3rem] w-full rounded-xl bg-primary-600 text-[1rem] font-semibold text-white hover:bg-primary-700">Done</button>
        </div>
      ) : read.state === 'failed' ? (
        <div className="mt-3 flex flex-col gap-4">
          <p role="alert" className="text-[0.9375rem] leading-[1.375rem] text-app">{read.error}</p>
          <div className={read.refused ? '' : 'grid grid-cols-2 gap-2'}>
            <button type="button" onClick={onClose} className="min-h-[3rem] w-full rounded-xl border border-app-strong bg-surface text-[1rem] font-semibold text-app hover-bg-app">{read.refused ? 'Close' : 'Not now'}</button>
            {read.refused ? null : (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="min-h-[3rem] rounded-xl bg-primary-600 text-[1rem] font-semibold text-white hover:bg-primary-700">Try again</button>
            )}
          </div>
        </div>
      ) : leftAt ? (
        <div className="mt-3 flex flex-col gap-4">
          <p role="status" className="text-[0.9375rem] leading-[1.375rem] text-app">You left a card on {dayText(leftAt)}.</p>
          <button type="button" onClick={onClose} className="min-h-[3rem] w-full rounded-xl border border-app-strong bg-surface text-[1rem] font-semibold text-app hover-bg-app">Close</button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-[0.9375rem] leading-[1.375rem] text-app-secondary">A plain hello. {firstName} finds your card and can write back. Nothing else is sent.</p>
          <div className={`${card} mt-4 px-4 py-3.5 flex flex-col gap-3`}>
            {read.state === 'loading' ? (
              // Until the visitor's card arrives, a quiet placeholder rather than "You" changing into a name.
              <div className="flex items-center gap-3 animate-pulse" aria-hidden="true">
                <span className="h-11 w-11 shrink-0 rounded-full bg-app-surface-sunken" />
                <span className="h-4 w-28 rounded bg-app-surface-sunken" />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="relative inline-flex shrink-0 rounded-full">
                  <CircleFace person={{ name, user_id: null, portrait_url: who?.portrait_url ?? null, did: null, ink: 'seen' }} size={44} />
                  {mark ? <MarkOverlay mark={mark} avatarPx={44} /> : null}
                </span>
                <div className="min-w-0">
                  <p className="text-[1rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{name}</p>
                  {who?.seen_as ? <p className="text-[0.8125rem] leading-[1.125rem] text-app-secondary [overflow-wrap:anywhere]">{who.seen_as}</p> : null}
                </div>
              </div>
            )}
            <div className="border-t border-app pt-3 flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={ids.words} className="text-[0.8125rem] text-app-secondary">A few words, if you like</label>
                <span className="text-xs text-app-muted">{text.length} of {max}</span>
              </div>
              <textarea
                id={ids.words}
                value={text}
                maxLength={max}
                rows={2}
                onChange={(e) => setText(e.target.value.replace(/\n/g, ' '))}
                className="w-full rounded-xl border border-app-strong bg-surface px-3 py-2 font-serif italic text-[1.0625rem] leading-6 text-app focus:outline focus:outline-2 focus:outline-[color:var(--color-link)] resize-none"
              />
            </div>
          </div>
          {error ? <p role="alert" className="mt-3 text-[0.875rem] leading-5 text-app-error">{error}</p> : null}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className="min-h-[3rem] rounded-xl border border-app-strong bg-surface text-[1rem] font-semibold text-app hover-bg-app">Not now</button>
            <button type="button" onClick={send} disabled={busy || read.state !== 'ready'} className="min-h-[3rem] rounded-xl bg-primary-600 text-[1rem] font-semibold text-white hover:bg-primary-700 disabled:opacity-60">{busy ? 'Leaving…' : 'Leave card'}</button>
          </div>
          <p className="mt-3 text-center text-xs leading-4 text-app-muted">Pantopus never shows who looked at a profile. A card is the only way to say you stopped by.</p>
        </>
      )}
    </Sheet>
  );
}

/**
 * "Cards left for you" (P3.3), the person's own page only: who left each card, as their page shows them to the person,
 * their words if any, and write back (once), remove, or block as today. Never shown to anyone else.
 */
export function CardsForYou({ title, cards, onChanged }: { title: string; cards: ProfileCard[]; onChanged: () => void }) {
  const openConversation = useOpenConversation();
  // The block's cards carry no `seen_as`; GET /me/cards fills it.
  const [full, setFull] = useState<Map<string, ProfileCard>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const ids = cards.map((c) => c.id).join(',');
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => api.profilePage.getMyCards()).then(
      (res) => { if (live) setFull(new Map((res?.cards || []).map((c) => [c.id, c]))); },
      () => {},
    );
    return () => { live = false; };
  }, [ids]);
  const run = async (id: string, fn: () => Promise<void>, failText: string) => {
    setBusy(id); setNote(null);
    try { await fn(); } catch (err) { setNote({ id, text: extractApiError(err, failText) }); }
    setBusy(null);
  };
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className={`${overline} px-1`}>{title}</h2>
      <ul className="flex flex-col gap-3">
        {cards.map((c0) => {
          const c = { ...c0, ...(full.get(c0.id) || {}) };
          const name = c.from?.name?.trim() || 'Someone on Pantopus';
          return (
            <li key={c.id} className={`${card} px-5 py-4 flex flex-col gap-3`}>
              <div className="flex items-center gap-3">
                <CircleFace person={{ name: c.from?.name ?? null, user_id: c.from?.user_id ?? null, portrait_url: c.from?.portrait_url ?? null, did: null, ink: 'seen' }} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="text-[1rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{name}</p>
                  {c.from?.seen_as ? <p className="text-[0.8125rem] leading-[1.125rem] text-app-secondary [overflow-wrap:anywhere]">{c.from.seen_as}</p> : null}
                </div>
                {c.left_at ? <span className="shrink-0 text-xs text-app-muted">{dayText(c.left_at)}</span> : null}
              </div>
              {/* The visitor's own words, in quotes under their name: never Pantopus speaking. */}
              {c.text ? <p className="font-serif italic text-[1.0625rem] leading-6 text-app [overflow-wrap:anywhere]">“{c.text}”</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                {c.written_back ? (
                  <span className="text-[0.875rem] text-app-muted">You wrote back.</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => run(c.id, async () => {
                      const res = await api.profilePage.writeBackCard(c.id);
                      const to = (res?.link as { user_id?: string } | undefined)?.user_id || c.from?.user_id;
                      if (to) await openConversation(to);
                      onChanged();
                    }, 'Couldn’t open a reply. Try again.')}
                    className="min-h-[2.75rem] px-4 rounded-xl bg-primary-600 text-[0.875rem] font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                  >
                    Write back
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy === c.id}
                  onClick={() => run(c.id, async () => {
                    const yes = await confirmStore.open({ title: 'Remove this card', description: `Remove ${name}'s card? It can't be brought back.`, confirmLabel: 'Remove', variant: 'destructive' });
                    if (!yes) return;
                    await api.profilePage.removeCard(c.id);
                    onChanged();
                  }, 'Couldn’t remove it. Try again.')}
                  className="min-h-[2.75rem] px-3.5 rounded-xl border border-app-strong bg-surface text-[0.875rem] font-semibold text-app hover-bg-app disabled:opacity-60"
                >
                  Remove
                </button>
                {c.from?.user_id ? (
                  <button
                    type="button"
                    disabled={busy === c.id}
                    onClick={() => run(c.id, async () => {
                      // Today's block, with today's words (the profile menu's Block).
                      const yes = await confirmStore.open({
                        title: 'Block user',
                        description: `Block ${name}? You won't be able to message each other or see each other's posts. They aren't notified, and you can unblock them from Settings.`,
                        confirmLabel: 'Block',
                        variant: 'destructive',
                      });
                      if (!yes) return;
                      await api.blocks.blockUser(c.from.user_id!);
                      onChanged();
                    }, 'Couldn’t block. Try again.')}
                    className="min-h-[2.75rem] px-1 text-[0.875rem] font-semibold text-app-error hover:underline disabled:opacity-60"
                  >
                    Block
                  </button>
                ) : null}
              </div>
              {note?.id === c.id ? <p role="alert" className="text-xs text-app-error">{note.text}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The fixed set of doors (P3.3) and how each sentence starts. */
const DOOR_KINDS: Array<{ key: string; start: (first: string) => string; placeholder: string; hasEnd: boolean }> = [
  { key: 'hire', start: (f) => `Hire ${f} for`, placeholder: 'carpentry and repairs', hasEnd: true },
  { key: 'ask', start: () => 'Ask about', placeholder: 'old windows and porches', hasEnd: true },
  { key: 'borrow', start: () => 'Borrow', placeholder: 'the 24-foot ladder', hasEnd: true },
  { key: 'invite', start: () => 'Invite to', placeholder: 'potlucks and work parties', hasEnd: true },
  { key: 'send_card', start: () => 'Send a card', placeholder: '', hasEnd: false },
];
const END_MAX = 60;

type DoorRow = { key: string; end: string; open_to: string };

/**
 * The person's own doors (board 1, "Doors Maria keeps open"): up to five from the fixed set, each finished in their
 * words and open to everyone on Pantopus or to connections only, in the order they stand. Saved whole (PUT /me/doors).
 */
export function DoorsEditor({ firstName, onClose, onSaved }: { firstName: string; onClose: () => void; onSaved: () => void }) {
  const baseId = useId();
  const [read, setRead] = useState<'loading' | 'failed' | 'ready'>('loading');
  const [round, setRound] = useState(0);
  const [rows, setRows] = useState<DoorRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = useRef('[]');
  useEffect(() => {
    let live = true;
    setRead('loading');
    Promise.resolve().then(() => api.profilePage.getMyDoors()).then(
      (res) => {
        if (!live) return;
        const list = (res?.doors || []).filter((d) => DOOR_KINDS.some((k) => k.key === d.key)).map((d) => ({
          key: d.key,
          end: typeof d.end === 'string' ? d.end : '',
          open_to: d.open_to === 'connections' ? 'connections' : 'anyone',
        }));
        initial.current = JSON.stringify(list);
        setRows(list);
        setRead('ready');
      },
      () => { if (live) setRead('failed'); },
    );
    return () => { live = false; };
  }, [round]);
  const changed = JSON.stringify(rows) !== initial.current;
  const close = () => {
    if (saving) return;
    if (changed && !window.confirm('Leave without saving your doors?')) return;
    onClose();
  };
  const toggle = (key: string, on: boolean) => {
    setRows((list) => (on ? (list.length >= 5 || list.some((r) => r.key === key) ? list : [...list, { key, end: '', open_to: 'anyone' }]) : list.filter((r) => r.key !== key)));
  };
  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= rows.length) return;
    const key = rows[index].key;
    setRows((list) => {
      const next = list.slice();
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
    // Keep the keyboard on the door that moved; at an end, on the button that still works.
    const button = to === 0 ? 'down' : to === rows.length - 1 ? 'up' : by < 0 ? 'up' : 'down';
    requestAnimationFrame(() => document.getElementById(`${baseId}-${key}-${button}`)?.focus());
  };
  const save = async () => {
    const missing = rows.find((r) => DOOR_KINDS.find((k) => k.key === r.key)?.hasEnd && !r.end.trim());
    if (missing) {
      setError('Finish each sentence you chose.');
      document.getElementById(`${baseId}-${missing.key}-end`)?.focus();
      return;
    }
    setSaving(true); setError(null);
    try {
      const body: ProfileDoorSetting[] = rows.map((r) => (DOOR_KINDS.find((k) => k.key === r.key)?.hasEnd
        ? { key: r.key, end: r.end.trim(), open_to: r.open_to }
        : { key: r.key, open_to: r.open_to }));
      await api.profilePage.saveDoors(body);
      onSaved();
    } catch (err) {
      setError(extractApiError(err, 'Couldn’t save your doors. Try again.'));
      setSaving(false);
    }
  };
  const chosen = new Map(rows.map((r, i) => [r.key, i]));
  const field = 'w-full min-h-[3rem] rounded-xl border border-app-strong bg-surface px-3.5 py-2.5 text-[1.0625rem] text-app placeholder:text-app-muted focus:outline focus:outline-2 focus:outline-[color:var(--color-link)]';
  const iconButton = 'w-11 h-11 rounded-full flex items-center justify-center text-app-secondary hover-bg-app disabled:opacity-40';
  return (
    <Screen
      open
      onClose={close}
      close="close"
      z="z-[60]"
      title="Your doors"
      footer={(
        <div className="flex flex-col gap-2">
          {error ? <p role="alert" className="text-[0.875rem] leading-5 text-app-error">{error}</p> : null}
          <button type="button" onClick={save} disabled={saving || read !== 'ready'} className="w-full min-h-[3rem] rounded-xl bg-primary-600 px-4 text-[1.0625rem] font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save doors'}
          </button>
        </div>
      )}
    >
      <div className="px-4 sm:px-6 py-4 flex flex-col gap-4">
        {read !== 'ready' ? (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <p role="status" className="text-[0.9375rem] text-app-secondary">{read === 'loading' ? 'Opening your doors…' : 'Couldn’t open your doors.'}</p>
            {read === 'failed' ? <button type="button" onClick={() => setRound((n) => n + 1)} className="min-h-[2.75rem] px-4 rounded-xl border border-app-strong text-[0.9375rem] font-semibold text-app hover-bg-app">Try again</button> : null}
          </div>
        ) : (
          <>
            <p className="text-[0.9375rem] leading-[1.375rem] text-app-secondary">
              Up to five ways people can reach you, each finished in your words. A door opens a message to you that starts
              with its sentence; Send a card opens the card flow. Who sees your doors is set in Share your profile.
            </p>
            <ul className="flex flex-col gap-3">
              {/* The chosen doors first, in the order they stand; the rest after, to add. */}
              {[...rows.map((r) => DOOR_KINDS.find((k) => k.key === r.key)!).filter(Boolean), ...DOOR_KINDS.filter((k) => !chosen.has(k.key))].map((kind) => {
                const at = chosen.get(kind.key);
                const row = at !== undefined ? rows[at] : null;
                const on = Boolean(row);
                const full = row && kind.hasEnd && row.end.trim() ? `${kind.start(firstName)} ${row.end.trim()}` : kind.start(firstName);
                return (
                  <li key={kind.key} className={`${card} px-4 py-3.5 flex flex-col gap-3`}>
                    <label className="flex items-center gap-3 min-h-[2.75rem] cursor-pointer">
                      <input type="checkbox" checked={on} disabled={!on && rows.length >= 5} onChange={(e) => toggle(kind.key, e.target.checked)} className="w-5 h-5 shrink-0 accent-[color:var(--color-link)]" />
                      <span className="min-w-0 flex-1 text-[1rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{full}{kind.hasEnd && !(row?.end.trim()) ? ' …' : ''}</span>
                      {on && at !== undefined ? <span className="shrink-0 text-xs text-app-muted">{at + 1} of {rows.length}</span> : null}
                    </label>
                    {row ? (
                      <>
                        {kind.hasEnd ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-baseline justify-between gap-3">
                              <label htmlFor={`${baseId}-${kind.key}-end`} className="text-[0.8125rem] text-app-secondary">{kind.start(firstName)} …</label>
                              <span className="text-xs text-app-muted">{row.end.length} of {END_MAX}</span>
                            </div>
                            <input
                              id={`${baseId}-${kind.key}-end`}
                              className={field}
                              value={row.end}
                              maxLength={END_MAX}
                              placeholder={kind.placeholder}
                              autoComplete="off"
                              onChange={(e) => { const v = e.target.value; setRows((list) => list.map((r) => (r.key === kind.key ? { ...r, end: v } : r))); }}
                            />
                          </div>
                        ) : null}
                        <div role="group" aria-label={`Who can use “${full}”`} className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-app-surface-sunken">
                          {(['anyone', 'connections'] as const).map((who) => (
                            <button
                              key={who}
                              type="button"
                              aria-pressed={row.open_to === who}
                              onClick={() => setRows((list) => list.map((r) => (r.key === kind.key ? { ...r, open_to: who } : r)))}
                              className={`min-h-[2.75rem] px-2 rounded-[0.625rem] text-[0.875rem] font-semibold ${row.open_to === who ? 'bg-surface text-app shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-app-secondary hover:text-app'}`}
                            >
                              {who === 'anyone' ? 'Everyone on Pantopus' : 'Connections only'}
                            </button>
                          ))}
                        </div>
                        {rows.length > 1 && at !== undefined ? (
                          <div className="flex items-center gap-1 -ml-2">
                            <button type="button" id={`${baseId}-${kind.key}-up`} onClick={() => move(at, -1)} disabled={at === 0} aria-label={`Move “${full}” up`} className={iconButton}><ArrowUp aria-hidden="true" className="w-5 h-5" /></button>
                            <button type="button" id={`${baseId}-${kind.key}-down`} onClick={() => move(at, 1)} disabled={at === rows.length - 1} aria-label={`Move “${full}” down`} className={iconButton}><ArrowDown aria-hidden="true" className="w-5 h-5" /></button>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Screen>
  );
}
