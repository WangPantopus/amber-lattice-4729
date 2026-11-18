// ============================================================
// Guidance cards: what this browser remembers for one account (GUIDE SPEC §2).
//
// - "Seen": recorded here the moment a card closes, so a reload never shows it again,
//   then sent to POST /api/users/guidance/shown. A send that fails is kept and retried
//   quietly. The server's record wins: every profile load merges it in, keeping only the
//   closes this browser hasn't delivered yet.
// - App opens: a page load, or coming back after 30 minutes in the background. Pointers
//   start on the second; all but the tab cards are one per app open.
// - Visits to each tab screen, kept on this device.
// Local storage can be missing (a private window, blocked site data): everything still
// works for the page's lifetime from memory.
// ============================================================

import * as api from '@pantopus/api';
import type { GuidanceSeenEntry, GuidanceState } from '@pantopus/types';
import { setProfileGuidance } from './profileGuidance';

export type GuidanceScreenName = 'place' | 'today' | 'mail' | 'pulse' | 'messages';

interface LocalRecord {
  seen: Record<string, GuidanceSeenEntry>;
  /** One entry per close the server hasn't confirmed yet, oldest first. */
  pending: string[];
  visits: Partial<Record<GuidanceScreenName, number>>;
  opens: number;
}

const KEY_PREFIX = 'pantopus_guidance:';
/** Coming back after this long in the background is a new app open. */
export const APP_OPEN_GAP_MS = 30 * 60 * 1000;

const memory = new Map<string, LocalRecord>();

function empty(): LocalRecord {
  return { seen: {}, pending: [], visits: {}, opens: 0 };
}

function read(userId: string): LocalRecord {
  const kept = memory.get(userId);
  if (kept) return kept;
  let record = empty();
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + userId);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalRecord>;
      record = {
        seen: parsed.seen && typeof parsed.seen === 'object' ? parsed.seen : {},
        pending: Array.isArray(parsed.pending) ? parsed.pending.filter((id) => typeof id === 'string') : [],
        visits: parsed.visits && typeof parsed.visits === 'object' ? parsed.visits : {},
        opens: Number.isFinite(parsed.opens) ? Number(parsed.opens) : 0,
      };
    }
  } catch { /* nothing kept, or unreadable: start fresh */ }
  memory.set(userId, record);
  return record;
}

function write(userId: string, record: LocalRecord): void {
  memory.set(userId, record);
  try { window.localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(record)); } catch { /* memory only */ }
}

export function isSeen(userId: string, cardId: string): boolean {
  return (read(userId).seen[cardId]?.times ?? 0) > 0;
}

export function seenEntry(userId: string, cardId: string): GuidanceSeenEntry | undefined {
  return read(userId).seen[cardId];
}

export function allSeen(userId: string): Record<string, GuidanceSeenEntry> {
  return read(userId).seen;
}

/** The server's record wins; closes this browser hasn't delivered yet stay seen. */
export function mergeServerSeen(userId: string, server: GuidanceState | undefined | null): void {
  if (!server || !server.seen || typeof server.seen !== 'object') return;
  const record = read(userId);
  const seen: Record<string, GuidanceSeenEntry> = { ...server.seen };
  for (const id of record.pending) {
    if (!seen[id]) seen[id] = record.seen[id] ?? { times: 1, last_at: new Date().toISOString() };
  }
  write(userId, { ...record, seen });
}

// ── Sending ────────────────────────────────────────────────────

let sending = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const RETRY_MS = 60_000;

function statusOf(error: unknown): number | undefined {
  const e = error as { statusCode?: number; status?: number; response?: { status?: number } } | null;
  return e?.statusCode ?? e?.status ?? e?.response?.status;
}

/** Sends the closes this browser hasn't delivered, one after another. Quiet: failures wait for a retry. */
export async function flushPending(userId: string): Promise<void> {
  if (sending) return;
  sending = true;
  try {
    for (;;) {
      const record = read(userId);
      const cardId = record.pending[0];
      if (!cardId) break;
      try {
        const { guidance } = await api.users.recordGuidanceShown(cardId);
        const now = read(userId);
        write(userId, { ...now, pending: now.pending.slice(1) });
        if (guidance) {
          mergeServerSeen(userId, guidance);
          setProfileGuidance(userId, guidance);
        }
      } catch (error) {
        const status = statusOf(error);
        // The switch is off (404) or the id isn't one the server knows (400): it will never land.
        if (status === 400 || status === 404) {
          const now = read(userId);
          write(userId, { ...now, pending: now.pending.slice(1) });
          continue;
        }
        if (!retryTimer) {
          retryTimer = setTimeout(() => { retryTimer = null; void flushPending(userId); }, RETRY_MS);
        }
        break;
      }
    }
  } finally {
    sending = false;
  }
}

/** A card closed: it counts as seen, here at once and on the server as soon as it can. */
export function recordSeen(userId: string, cardId: string): void {
  const record = read(userId);
  const prior = record.seen[cardId];
  write(userId, {
    ...record,
    seen: { ...record.seen, [cardId]: { times: (prior?.times ?? 0) + 1, last_at: new Date().toISOString() } },
    pending: [...record.pending, cardId],
  });
  void flushPending(userId);
}

// ── App opens and visits ───────────────────────────────────────

let openCountedFor: string | null = null;
let currentOpen = 0;
let hiddenAt: number | null = null;
/** The one non-tab card this app open may show has shown. */
let shownThisOpen = false;

function countOpen(userId: string): void {
  const record = read(userId);
  const opens = record.opens + 1;
  write(userId, { ...record, opens });
  currentOpen = opens;
  shownThisOpen = false;
}

/** Counts this page load as an app open, once per account. */
export function startAppOpen(userId: string): void {
  if (openCountedFor === userId) return;
  openCountedFor = userId;
  countOpen(userId);
}

/** Back from the background after 30 minutes: a new app open. */
export function noteVisibility(userId: string, visible: boolean): void {
  if (!visible) { hiddenAt = Date.now(); return; }
  if (hiddenAt != null && Date.now() - hiddenAt >= APP_OPEN_GAP_MS) countOpen(userId);
  hiddenAt = null;
}

/** Which app open this is for the account on this device (1 = the first). */
export function appOpenNumber(): number {
  return currentOpen;
}

export function oneShownThisOpen(): boolean {
  return shownThisOpen;
}

export function markShownThisOpen(): void {
  shownThisOpen = true;
}

/** Counts a visit to a tab screen and answers its number (1 = the first). */
export function countVisit(userId: string, screen: GuidanceScreenName): number {
  const record = read(userId);
  const n = (record.visits[screen] ?? 0) + 1;
  write(userId, { ...record, visits: { ...record.visits, [screen]: n } });
  return n;
}
