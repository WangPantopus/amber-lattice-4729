import * as api from '@pantopus/api';
import type { AIActionCardAction, AIActionCardDraft, AIActionCardRequest, AIActionCardState } from '@pantopus/types';

// The assistant's one-tap cards (AI assistant phase 1 contract, section 4; phase 2 section 8.1; phase 3 sections 4
// and 12.2), as the iPhone and Android apps run them (Android: data/ai/AIActionRunner.kt, AIActionCardStore.kt).
// The server writes each request from a fixed list of card types; the web sends only the ones on this list, through
// the signed-in client, so each endpoint's own permissions, checks and notifications apply.

const SESSION_SCOPE_HEADER = 'x-pantopus-session-scope';
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
// The systems Place keeps an installed year for (PUT /api/homes/:id/systems/:key).
const SYSTEM_KEY = '(?:roof|hvac|water_heater|electrical_panel|sewer_septic|windows)';
// Stands in for a `{{response.…}}` placeholder when a follow-up is checked before the first request.
const PLACEHOLDER_STAND_IN = '00000000-0000-0000-0000-000000000000';

const ALLOWED: [string, RegExp][] = ([
  ['POST', '/api/plans'],
  ['PATCH', '/api/plans/:id'],
  ['POST', '/api/plans/:id/cancel'],
  ['POST', '/api/plans/:id/requests'],
  ['POST', '/api/plans/:id/requests/:id/accept'],
  ['POST', '/api/plans/:id/requests/:id/decline'],
  ['POST', '/api/chat/messages'],
  ['POST', '/api/posts/:id/comments'],
  ['PATCH', '/api/posts/:id/solve'],
  ['POST', '/api/homes/:id/tasks'],
  ['POST', '/api/homes/:id/tasks/:id/recurrence'],
  ['PUT', '/api/hub/preferences'],
  ['PUT', '/api/posts/feed-preferences'],
  // Phase 2: a system's installed year, a task's update, a nudge's "Fewer like this", an appliance.
  ['PUT', '/api/homes/:id/systems/:system'],
  ['PUT', '/api/homes/:id/tasks/:id'],
  ['POST', '/api/ai/nudges/:id/fewer'],
  ['POST', '/api/homes/:id/assets'],
  // Phase 3: a card made on a phone (Remember, check back, a standing rule) works here too.
  ['POST', '/api/ai/memory'],
  ['POST', '/api/ai/follow-ups'],
  ['DELETE', '/api/ai/follow-ups/:id'],
  ['POST', '/api/ai/rules'],
  ['PATCH', '/api/ai/rules/:id'],
] as [string, string][]).map(([method, path]) => [
  method,
  new RegExp(`^${path.replace(/:id/g, UUID).replace(':system', SYSTEM_KEY)}$`),
]);

const FEWER_LIKE_THIS = new RegExp(`^/api/ai/nudges/${UUID}/fewer$`);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** On the list: method and path, no header but the session scope, and a JSON object body (or none). */
export function allowsRequest(request: AIActionCardRequest | null | undefined): request is AIActionCardRequest {
  if (!request || typeof request.path !== 'string' || typeof request.method !== 'string') return false;
  const method = request.method.toUpperCase();
  if (!ALLOWED.some(([m, path]) => m === method && path.test(request.path))) return false;
  if (request.headers && Object.keys(request.headers).some((key) => key.toLowerCase() !== SESSION_SCOPE_HEADER)) return false;
  return request.body == null || isPlainObject(request.body);
}

/** A nudge's or the brief's "Fewer like this", which the server takes on an expired nudge too (phase 2 §3.6). */
export function isFewerLikeThis(action: AIActionCardAction | null | undefined): boolean {
  const request = action?.request;
  return !!request && request.method?.toUpperCase() === 'POST' && FEWER_LIKE_THIS.test(request.path || '');
}

// ─── {{response.a.b}} ────────────────────────────────────────

const PLACEHOLDER = /\{\{\s*response\.([A-Za-z0-9_.-]+)\s*\}\}/g;
const WHOLE_PLACEHOLDER = /^\{\{\s*response\.([A-Za-z0-9_.-]+)\s*\}\}$/;

/** The string, number or boolean at a dot path of a reply; undefined when it's missing or not a plain value. */
function valueAt(response: unknown, path: string): string | number | boolean | undefined {
  let current: unknown = response;
  for (const key of path.split('.')) {
    if (Array.isArray(current)) current = /^\d+$/.test(key) ? current[Number(key)] : undefined;
    else if (isPlainObject(current)) current = current[key];
    else return undefined;
    if (current == null) return undefined;
  }
  return typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean' ? current : undefined;
}

/** The template with every placeholder filled from the reply; null when one has no value. */
function fillText(template: string, response: unknown): string | null {
  let missing = false;
  const filled = template.replace(PLACEHOLDER, (_match, path: string) => {
    const value = valueAt(response, path);
    if (value === undefined) missing = true;
    return value === undefined ? '' : String(value);
  });
  return missing ? null : filled;
}

/** A follow-up filled from the first reply: its path and the body's top-level strings (a lone placeholder keeps its type). */
function fillRequest(request: AIActionCardRequest, response: unknown): AIActionCardRequest | null {
  const path = fillText(request.path, response);
  if (path == null) return null;
  let body = request.body ?? null;
  if (body) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'string') {
        out[key] = value;
        continue;
      }
      const whole = WHOLE_PLACEHOLDER.exec(value.trim());
      const filled = whole ? valueAt(response, whole[1]) : fillText(value, response);
      if (filled === undefined || filled === null) return null;
      out[key] = filled;
    }
    body = out;
  }
  return { ...request, path, body };
}

/** A follow-up whose placeholders aren't filled yet: its shape must already be on the list. */
function allowsTemplate(request: AIActionCardRequest): boolean {
  return allowsRequest({ ...request, path: request.path.replace(PLACEHOLDER, PLACEHOLDER_STAND_IN) });
}

// ─── Running a button ────────────────────────────────────────

export type ActionOutcome =
  | { kind: 'done'; link: string | null; note: string | null }
  | { kind: 'failed'; message: string }
  /** Off the list: nothing was sent. */
  | { kind: 'not_allowed' }
  /** 409 SESSION_SCOPE_CHANGED: the card came from an earlier sign-in. */
  | { kind: 'session_changed' };

export const NOT_ALLOWED_TEXT = "This card can't be used in this version of Pantopus.";
export const SESSION_CHANGED_TEXT = 'This card is from an earlier sign-in. Ask again.';
const REPEAT_NOT_SET = "The repeat wasn't set.";

type Sent = { ok: true; json: unknown } | { ok: false; outcome: ActionOutcome };

async function send(request: AIActionCardRequest): Promise<Sent> {
  const headers: Record<string, string> = {};
  for (const value of Object.values(request.headers || {})) headers[SESSION_SCOPE_HEADER] = value;
  try {
    const json = await api.apiRequest(
      request.method.toUpperCase() as 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      request.path,
      request.body ?? {},
      { headers, suppressDevErrorOverlay: true },
    );
    return { ok: true, json: json ?? {} };
  } catch (err) {
    const failure = err as { statusCode?: number; code?: string; message?: string; data?: { code?: string; error?: string } } | null;
    const code = failure?.code || failure?.data?.code || failure?.data?.error;
    if (failure?.statusCode === 409 && code === 'SESSION_SCOPE_CHANGED') return { ok: false, outcome: { kind: 'session_changed' } };
    const message = failure?.message && !/^[A-Z][A-Z0-9_]*$/.test(failure.message) ? failure.message : "That didn't work. Try again.";
    return { ok: false, outcome: { kind: 'failed', message } };
  }
}

/** A button's request, then its follow-up, and the "Open" link filled in (phase 1 contract, section 4.3). */
export async function runAction(action: AIActionCardAction): Promise<ActionOutcome> {
  if (!allowsRequest(action.request)) return { kind: 'not_allowed' };
  const then = action.then?.request ?? null;
  if (then && !allowsTemplate(then)) return { kind: 'not_allowed' };
  const first = await send(action.request);
  if (!first.ok) return first.outcome;
  let second: unknown = null;
  let note: string | null = null;
  if (then) {
    const filled = fillRequest(then, first.json);
    if (!filled || !allowsRequest(filled)) {
      note = REPEAT_NOT_SET;
    } else {
      const sent = await send(filled);
      if (sent.ok) second = sent.json;
      else note = [REPEAT_NOT_SET, sent.outcome.kind === 'failed' ? sent.outcome.message : null].filter(Boolean).join(' ');
    }
  }
  // The link comes from the first reply; a placeholder only the follow-up's reply holds is read there.
  const template = action.done?.link || null;
  const link = template ? fillText(template, first.json) ?? (second ? fillText(template, second) : null) : null;
  return { kind: 'done', link, note };
}

// ─── What was done, on this browser and the person's other devices ───

/** `card` for the card's own buttons, a row's id for a row's, `fewer` for "Fewer like this". */
export const CARD_SCOPE = 'card';
export const FEWER_SCOPE = 'fewer';

export interface DoneRun {
  actionId: string;
  link: string | null;
  note?: string | null;
}

interface StoredCard {
  done?: Record<string, DoneRun & { unreported?: boolean }>;
  dismissed?: boolean;
  dismissUnreported?: boolean;
}

const STORE_KEY = 'pantopus.ai.actionCards.v1';
const STORE_LIMIT = 300;

function readStore(): Record<string, StoredCard> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORE_KEY) || '{}');
    return isPlainObject(parsed) ? (parsed as Record<string, StoredCard>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, StoredCard>) {
  if (typeof window === 'undefined') return;
  const ids = Object.keys(store);
  // Oldest first (insertion order): keep the newest cards.
  for (const id of ids.slice(0, Math.max(0, ids.length - STORE_LIMIT))) delete store[id];
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked: the server's record still shows it after a reload.
  }
}

function update(cardId: string, change: (card: StoredCard) => StoredCard) {
  const store = readStore();
  const next = change(store[cardId] || {});
  delete store[cardId];
  store[cardId] = next;
  writeStore(store);
}

function markReported(cardId: string, scope: string) {
  update(cardId, (card) => {
    const entry = card.done?.[scope];
    return entry ? { ...card, done: { ...card.done, [scope]: { ...entry, unreported: false } } } : card;
  });
}

/** The person's other devices show it too; a report that fails is sent again the next time the card is drawn. */
function reportDone(cardId: string, scope: string, run: DoneRun) {
  const itemId = scope === CARD_SCOPE || scope === FEWER_SCOPE ? null : scope;
  api.ai.reportCardState(cardId, { status: 'done', action_id: run.actionId, item_id: itemId, link: run.link })
    .then(() => markReported(cardId, scope))
    .catch((err: { statusCode?: number } | null) => {
      // 404 CARD_UNKNOWN: the server kept no record of this card, so there is nothing to send again.
      if (err?.statusCode === 404) markReported(cardId, scope);
    });
}

function reportDismissed(cardId: string) {
  api.ai.reportCardState(cardId, { status: 'dismissed' })
    .then(() => update(cardId, (card) => ({ ...card, dismissUnreported: false })))
    .catch((err: { statusCode?: number } | null) => {
      if (err?.statusCode === 404) update(cardId, (card) => ({ ...card, dismissUnreported: false }));
    });
}

export function markDone(cardId: string, scope: string, run: DoneRun) {
  update(cardId, (card) => ({ ...card, done: { ...card.done, [scope]: { ...run, unreported: true } } }));
  reportDone(cardId, scope, run);
}

export function markDismissed(cardId: string) {
  update(cardId, (card) => ({ ...card, dismissed: true, dismissUnreported: true }));
  reportDismissed(cardId);
}

export interface CardRuns {
  runs: Record<string, DoneRun>;
  dismissed: boolean;
  expiredOnServer: boolean;
}

/**
 * A card as it was left, by this browser's record or the server's (`state`, from any of the person's devices). Either
 * is enough; this browser's wins for a button both know, since it keeps the note. A card with a button that went
 * through is never put away.
 */
export function savedRuns(card: AIActionCardDraft, state: AIActionCardState | null | undefined): CardRuns {
  const fewerId = (card.actions || []).find(isFewerLikeThis)?.id ?? null;
  const runs: Record<string, DoneRun> = {};
  for (const done of state?.done || []) {
    if (!done?.action_id) continue;
    const scope = done.item_id ? done.item_id : done.action_id === fewerId ? FEWER_SCOPE : CARD_SCOPE;
    if (!runs[scope]) runs[scope] = { actionId: done.action_id, link: done.link ?? null };
  }
  const stored = readStore()[card.id];
  for (const [scope, run] of Object.entries(stored?.done || {})) {
    runs[scope] = { actionId: run.actionId, link: run.link ?? null, note: run.note ?? null };
  }
  const putAway = !!stored?.dismissed || state?.status === 'dismissed';
  return { runs, dismissed: putAway && Object.keys(runs).length === 0, expiredOnServer: state?.status === 'expired' };
}

/** Reports this browser couldn't send when the card was used: sent again when the card is drawn. */
export function resendUnreported(cardId: string) {
  const stored = readStore()[cardId];
  for (const [scope, run] of Object.entries(stored?.done || {})) {
    if (run.unreported) reportDone(cardId, scope, run);
  }
  if (stored?.dismissed && stored.dismissUnreported) reportDismissed(cardId);
}
