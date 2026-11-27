'use client';

// Replies people can see on a Moment (Pulse, reinvented, phase 3; coord/CONTRACT.md §8a; founder's decision 3). On a
// Friends Moment replies show under it; on a Nearby Moment only if its author chose so; never on a made-up-name Moment;
// and only while the switch is on for the Moment's author. Today's private reply to chat stays exactly as it is. The
// replies are Pulse replies, with Pulse's own report and remove.

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { del, get, post } from '@pantopus/api/client';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { MomentFace } from '@/components/moments/MomentFace';
import { useMe } from '@/lib/me';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import './replies.css';

export interface RepliesInfo {
  shown: boolean;
  count: number;
  pins: number;
  can_reply: boolean;
}

export interface Reply {
  id: string;
  text: string;
  at: string;
  author: Moment['author'];
  mine: boolean;
  can_remove: boolean;
}

interface Page {
  replies: Reply[];
  next_cursor: string | null;
}

/** The Moment's replies as the server answers them (switch on), or null. */
export function repliesOf(m: Moment | null | undefined): RepliesInfo | null {
  const r = (m as (Moment & { replies?: RepliesInfo | null }) | null | undefined)?.replies;
  return r && typeof r.shown === 'boolean' ? r : null;
}

// Moments whose replies are open on the reader's screen: the viewer holds still while they read or write.
const reading = new Set<string>();
export function holdsForReplies(m: Moment): boolean {
  return reading.has(m.id);
}

const REASONS: [string, string][] = [
  ['spam', 'Spam'],
  ['harassment', 'Harassment'],
  ['inappropriate', 'Inappropriate content'],
  ['misinformation', 'Misinformation'],
  ['safety', 'Safety concern'],
  ['other', 'Other'],
];

const when = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return mins < 1 ? 'now' : mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
};

function errorWords(e: unknown): string {
  const err = e as { code?: string; statusCode?: number; status?: number; message?: string };
  const status = err.statusCode ?? err.status;
  if (err.code === 'REPLIES_CLOSED') return 'Replies are closed on this Moment.';
  if (err.code === 'MOMENT_ENDED' || status === 410) return 'This Moment has ended.';
  if (status === 429) return 'That’s a lot of replies at once. Try again in a moment.';
  return err.message && status && status < 500 ? err.message : 'Couldn’t do that. Try again.';
}

/** Under a Moment's picture in the viewer: the replies everyone who sees it can read, and a box to add one. */
function RepliesPanel({ moment, info, onClose }: { moment: Moment; info: RepliesInfo; onClose(): void }) {
  const client = useQueryClient();
  const reread = useRereadSwitch();
  const account = useMe().data?.id;
  const key = ['reinvented', 'replies', moment.id];
  const list = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) =>
      get<Page>(`/api/reinvented/moments/${encodeURIComponent(moment.id)}/replies`, pageParam ? { cursor: pageParam } : {}, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
  useEffect(() => {
    if (list.error && isSwitchedOff(list.error)) void reread();
  }, [list.error, reread]);
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reporting, setReporting] = useState<string | null>(null),
    [reported, setReported] = useState<Set<string>>(new Set());
  const box = useRef<HTMLTextAreaElement>(null);
  const replies = list.data?.pages.flatMap((p) => p.replies) ?? [];
  // The count on the Moment follows what the reader just did.
  const bump = (by: number) =>
    client.setQueryData<{ moment: Moment }>(['moments', 'watch', account, moment.id], (old) => {
      const r = old && repliesOf(old.moment);
      return old && r ? { ...old, moment: { ...old.moment, replies: { ...r, count: Math.max(0, r.count + by) } } as Moment } : old;
    });
  async function send() {
    const words = text.trim();
    if (!words || busy) return;
    setBusy(true);
    setError('');
    try {
      const { reply } = await post<{ reply: Reply }>(`/api/reinvented/moments/${encodeURIComponent(moment.id)}/replies`, { text: words });
      client.setQueryData<InfiniteData<Page>>(key, (old) =>
        old ? { ...old, pages: old.pages.map((p, i) => (i === old.pages.length - 1 ? { ...p, replies: [...p.replies, reply] } : p)) } : old,
      );
      bump(1);
      setText('');
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
      setError(errorWords(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setError('');
    try {
      await del(`/api/reinvented/moments/${encodeURIComponent(moment.id)}/replies/${encodeURIComponent(id)}`);
      client.setQueryData<InfiniteData<Page>>(key, (old) =>
        old ? { ...old, pages: old.pages.map((p) => ({ ...p, replies: p.replies.filter((r) => r.id !== id) })) } : old,
      );
      bump(-1);
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
      setError(errorWords(e));
    }
  }
  async function report(id: string, reason: string) {
    setError('');
    try {
      await post(`/api/reinvented/moments/${encodeURIComponent(moment.id)}/replies/${encodeURIComponent(id)}/report`, { reason });
      setReported(new Set([...reported, id]));
      setReporting(null);
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
      setError(errorWords(e));
    }
  }
  return (
    <section
      className="rl-panel"
      aria-label="Replies"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <header className="rl-head">
        <strong>Replies</strong>
        <span>Everyone who sees this Moment can read them.</span>
        <button type="button" className="rl-close" aria-label="Close replies" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </header>
      <ol className="rl-list">
        {list.isPending && <li className="rl-note">Loading…</li>}
        {!list.isPending && !replies.length && <li className="rl-note">No replies yet.</li>}
        {replies.map((r) => (
          <li key={r.id} className="rl-reply">
            <MomentFace author={r.author} />
            <div className="rl-words">
              <p>
                <strong>{r.author?.name || 'Someone'}</strong> <span className="rl-when">{when(r.at)}</span>
              </p>
              <p className="rl-text">{r.text}</p>
              {reporting === r.id ? (
                <div className="rl-reasons" role="group" aria-label="Why are you reporting this reply?">
                  {REASONS.map(([value, label]) => (
                    <button key={value} type="button" onClick={() => void report(r.id, value)}>
                      {label}
                    </button>
                  ))}
                  <button type="button" onClick={() => setReporting(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="rl-actions">
                  {r.can_remove && (
                    <button type="button" onClick={() => void remove(r.id)}>
                      Remove
                    </button>
                  )}
                  {!r.mine &&
                    (reported.has(r.id) ? (
                      <span className="rl-when">Reported. We’ll review it.</span>
                    ) : (
                      <button type="button" onClick={() => setReporting(r.id)}>
                        Report
                      </button>
                    ))}
                </div>
              )}
            </div>
          </li>
        ))}
        {list.hasNextPage && (
          <li>
            <button type="button" className="rl-more" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              {list.isFetchingNextPage ? 'Loading…' : 'Show more'}
            </button>
          </li>
        )}
      </ol>
      {error && (
        <p className="rl-error" role="alert">
          {error}
        </p>
      )}
      {info.can_reply ? (
        <form
          className="rl-compose"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            ref={box}
            rows={1}
            maxLength={500}
            value={text}
            placeholder="Reply for everyone who sees it"
            aria-label="Reply for everyone who sees it"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button type="submit" disabled={!text.trim() || busy}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </form>
      ) : (
        <p className="rl-note">Replies are read-only now.</p>
      )}
    </section>
  );
}

/** Over the picture: "3 replies" (or "Reply for everyone"), opening the replies. Only where replies are shown. */
export function RepliesOverPicture({ moment }: { moment: Moment }) {
  const info = repliesOf(moment);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) reading.add(moment.id);
    else reading.delete(moment.id);
    return () => {
      reading.delete(moment.id);
    };
  }, [open, moment.id]);
  if (!info?.shown) return null;
  return (
    <>
      <button
        type="button"
        className="rl-chip"
        aria-expanded={open}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <MessageCircle aria-hidden="true" />
        {info.count ? `${info.count} ${info.count === 1 ? 'reply' : 'replies'}` : info.can_reply ? 'Reply for everyone' : 'Replies'}
      </button>
      {open && <RepliesPanel moment={moment} info={info} onClose={() => setOpen(false)} />}
    </>
  );
}

/** In the author's Moment options: show replies to everyone who sees it, or hide them (they stay stored). */
export function RepliesShownEntry({ moment, close }: { moment: Moment; close(): void }) {
  const client = useQueryClient();
  const reread = useRereadSwitch();
  const account = useMe().data?.id;
  const info = repliesOf(moment);
  const [busy, setBusy] = useState(false);
  const penName = (moment.author as { kind?: string } | undefined)?.kind === 'pen_name';
  if (!info || !account || moment.author?.id !== account || penName) return null;
  async function flip() {
    if (busy || !info) return;
    setBusy(true);
    try {
      const answer = await post<{ moment: Moment }>(`/api/reinvented/moments/${encodeURIComponent(moment.id)}/replies-shown`, { shown: !info.shown });
      client.setQueryData<{ moment: Moment }>(['moments', 'watch', account, moment.id], (old) => (old ? { ...old, moment: answer.moment } : old));
      close();
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="mo-action" disabled={busy} onClick={() => void flip()}>
      <MessageCircle />
      {info.shown ? 'Hide replies from everyone' : 'Show replies to everyone who sees it'}
    </button>
  );
}
