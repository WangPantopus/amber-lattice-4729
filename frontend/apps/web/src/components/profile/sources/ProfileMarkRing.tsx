'use client';

// The ring an avatar wears anywhere in the app (board 6, CONTRACT section 7): the outer ring of the person's mark,
// thicker with years on record and dotted until something is Seen. Read one screenful at a time: every avatar asking
// within a frame shares one GET /api/profile-page/marks (at most 100 ids), and nothing waits for it, so the rings
// appear when it answers. On everywhere; a 404 (the server's switch is off, an older server)
// stops the asking until the page is loaded again.
import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as api from '@pantopus/api';
import type { ProfileMark } from '@pantopus/api';
import { launchFeatures } from '@/lib/featureFlags';
import { avatarRingWidth } from './rings';

const MAX_IDS = 100;
let unavailable = false;

type Waiter = { id: string; resolve: (mark: ProfileMark | null) => void; reject: (e: unknown) => void };
const waiting = new WeakMap<QueryClient, Waiter[]>();

/** One read for every avatar that asks within the same frame (as the Moments ring's faces are read). */
function readMark(client: QueryClient, id: string): Promise<ProfileMark | null> {
  return new Promise((resolve, reject) => {
    const queue = waiting.get(client);
    if (queue) { queue.push({ id, resolve, reject }); return; }
    const rows: Waiter[] = [{ id, resolve, reject }];
    waiting.set(client, rows);
    setTimeout(() => {
      waiting.delete(client);
      const ids = [...new Set(rows.map((r) => r.id))];
      for (let i = 0; i < ids.length; i += MAX_IDS) {
        const group = ids.slice(i, i + MAX_IDS);
        const members = rows.filter((r) => group.includes(r.id));
        // Started inside a promise: any failure, even a missing read, leaves the avatars without a ring.
        Promise.resolve().then(() => api.profilePage.getMarks(group)).then(
          ({ marks }) => {
            const byId = new Map((marks || []).map((m) => [m.user_id, m]));
            members.forEach((r) => r.resolve(byId.get(r.id) ?? null));
          },
          (err: { statusCode?: number } | null) => {
            if (err?.statusCode === 404) unavailable = true;
            members.forEach((r) => r.reject(err));
          },
        );
      }
    }, 16);
  });
}

/** Whole years from `since` (YYYY-MM) to this month. */
function yearsSince(since: string): number {
  const match = /^(\d{4})-(\d{2})/.exec(since || '');
  if (!match) return 0;
  const now = new Date();
  const months = (now.getFullYear() - Number(match[1])) * 12 + (now.getMonth() - (Number(match[2]) - 1));
  return Math.max(0, months / 12);
}

/** This person's mark for the signed-in viewer, or null (none, not yet known, or the switch off). */
export function useProfileMark(id: string | null | undefined, enabled = true): ProfileMark | null {
  const client = useQueryClient();
  const on = enabled && launchFeatures.profileSources && !unavailable && typeof window !== 'undefined'
    && typeof api.getAuthToken === 'function' && Boolean(api.getAuthToken());
  // Whose answer it is: the browser's session marker (it changes on sign-in, sign-out and account switches), so an
  // avatar never asks for the account and never shows another session's answer.
  const account = on ? (typeof api.authSessionMarker === 'function' ? api.authSessionMarker() : 'session') : null;
  const query = useQuery({
    queryKey: ['profile-mark', account, id],
    queryFn: () => readMark(client, id!),
    enabled: on && Boolean(id),
    // "Keep an answer a minute at most" (contract 7).
    staleTime: 60_000,
    gcTime: 60_000,
    retry: false,
  });
  return query.isError ? null : query.data ?? null;
}

/** The ring's width and gap for this mark on an avatar this wide (board 6 is drawn at 40 px; smaller ones narrow). */
export function markRing(mark: ProfileMark, avatarPx: number): { width: number; gap: number; style: 'solid' | 'dotted' } {
  const scale = Math.min(1, Math.max(0.5, avatarPx / 40));
  const width = mark.seen ? avatarRingWidth(yearsSince(mark.since)) : 1.5;
  return { width: Math.max(1, width * scale), gap: 2 * scale, style: mark.seen ? 'solid' : 'dotted' };
}

/**
 * The mark's outer ring drawn around whatever avatar it wraps, without taking any room, so a list never shifts when
 * the rings arrive. It hugs the picture; a Moments ring sits just beyond it.
 */
export function MarkOverlay({ mark, avatarPx }: { mark: ProfileMark; avatarPx: number }) {
  const { width, gap, style } = markRing(mark, avatarPx);
  const css: CSSProperties = {
    inset: -(gap + width),
    borderWidth: width,
    borderStyle: style,
    borderColor: style === 'solid' ? 'rgb(var(--app-text))' : 'rgb(var(--app-text-muted))',
  };
  return <span aria-hidden="true" data-profile-mark="" className="pointer-events-none absolute rounded-full" style={css} />;
}

/** A callback ref that keeps the wrapped avatar's drawn width, for the ring's width at that size. */
export function useAvatarWidth(): [(el: HTMLElement | null) => void, number] {
  const [width, setWidth] = useState(40);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const measure = () => { const w = el.getBoundingClientRect().width; if (w > 0) setWidth(Math.round(w)); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(measure);
    observer.current.observe(el);
  }, []);
  return [ref, width];
}
