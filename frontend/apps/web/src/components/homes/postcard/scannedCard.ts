// The card's QR picture (FASTVERIFY, home_postcard_scan) opens
// /app/homes/<homeId>/verify-postcard#c=<code>. The code rides in the
// fragment, which the browser never sends to a server; this keeps it that
// way: read from the fragment, wiped from the address bar, and carried over a
// sign-in only in this tab's sessionStorage.

export interface ScannedCard { homeId: string; code: string }

const CODE = /^[A-Za-z0-9]{6,8}$/;
const HOME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = 'pantopus.postcardScan';
const KEEP_MS = 30 * 60_000;

/** The code in a `#c=` fragment, or null. */
export function codeFromHash(hash: string): string | null {
  const code = new URLSearchParams(hash.replace(/^#/, '')).get('c');
  return code && CODE.test(code) ? code.toUpperCase() : null;
}

/** The Home a verify-postcard path names (a sign-in's redirectTo), or null. */
export function verifyPostcardHome(path: string | null | undefined): string | null {
  const match = (path || '').match(/^\/app\/homes\/([^/?#]+)\/verify-postcard(?:[?#]|$)/);
  return match && HOME.test(match[1]) ? match[1].toLowerCase() : null;
}

/** Drop the fragment from the address bar, keeping the path and query. */
export function wipeHash() {
  try {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  } catch {
    // An address bar we can't change keeps the fragment; it still never reaches a server.
  }
}

/** Keep the scanned code for this tab while the person signs in. */
export function keepScannedCard(card: ScannedCard) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...card, at: Date.now() })); } catch { /* the code is then typed by hand */ }
}

/** The kept code for this Home, once (it is removed as it's read). */
export function takeScannedCard(homeId: string): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const kept = JSON.parse(raw) as { homeId?: string; code?: string; at?: number };
    if (kept.homeId?.toLowerCase() !== homeId.toLowerCase()) return null;
    sessionStorage.removeItem(KEY);
    if (!kept.code || !CODE.test(kept.code) || !kept.at || Date.now() - kept.at > KEEP_MS) return null;
    return kept.code.toUpperCase();
  } catch {
    return null;
  }
}
