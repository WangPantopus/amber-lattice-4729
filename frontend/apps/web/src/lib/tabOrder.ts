'use client';

// ============================================================
// Which of Place and Today is first on the phone-width bar (founder decision
// 2026-11-21). A person with a home gets Today first: it is the page they come
// back to each day. Until they have one, Place is first, because Place is
// where a home is added and verified. "Has a home" is the primary home the
// home list answers with (GET /api/homes/my-homes), the home Place and Today
// already show.
//
// The answer is kept in this browser with the account it belongs to, each
// time the home list is read, and the bar reads it once, when it mounts. So
// the bar is drawn in its order at once, with no request, and never moves
// while the app is in use: a home set up now shows Today first on the next
// load. An account new to this browser gets Place first until then. As on the
// iPhone and Android apps.
// ============================================================

const STORAGE_KEY = 'pantopus-tabs-today-first';

export type KeptTabOrder = { account: string; todayFirst: boolean };

/** What this browser kept, or null (nothing kept, or storage is closed). */
export function keptTabOrder(): KeptTabOrder | null {
  if (typeof window === 'undefined') return null;
  try {
    const kept = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<KeptTabOrder> | null;
    return kept && typeof kept.account === 'string' && typeof kept.todayFirst === 'boolean'
      ? { account: kept.account, todayFirst: kept.todayFirst }
      : null;
  } catch {
    return null;
  }
}

/** The home list was read for `account`: keep its answer for the next load. */
export function noteTabOrder(account: string, hasHome: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const kept = keptTabOrder();
    if (kept?.account === account && kept.todayFirst === hasHome) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ account, todayFirst: hasHome }));
  } catch {
    // Storage is closed (private mode, a full disk): the bar keeps Place first.
  }
}

/**
 * Today first for the bar that mounted with `kept`. Before the account is known the kept answer stands, so the bar
 * doesn't move when the profile arrives; an answer kept for another account doesn't count.
 */
export function todayIsFirst(kept: KeptTabOrder | null, account: string | null | undefined): boolean {
  return !!kept?.todayFirst && (!account || kept.account === account);
}
