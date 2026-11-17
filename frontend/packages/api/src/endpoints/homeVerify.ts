// ============================================================
// FASTER HOME VERIFICATION (FASTVERIFY)
// ============================================================
// The verify sheet's choices and the fast checks. Everything here is behind
// database flags: while `home_fast_verify` is off the server answers 404
// FAST_CHECK_OFF, and the apps keep today's verify sheet and pages.

import { get, post } from '../client';

/** How far the person's verification at this Home goes. */
export type VerifyLevel = 'none' | 'added' | 'fast' | 'proven';
/** A fast check's kind, as the server names it. */
export type FastCheckKind = 'phone' | 'location' | 'document';
export type VerifyOptionId = 'phone' | 'location' | 'document' | 'mail' | 'landlord';
export type VerifyOptionReason = 'OFF' | 'NEEDS_CLAIM' | 'ONE_HOME' | 'LIMIT' | 'APP_ONLY' | 'IN_REVIEW' | 'UNAVAILABLE';

export interface VerifyOption {
  id: VerifyOptionId;
  available: boolean;
  reason: VerifyOptionReason | null;
}

export interface FastCheckStanding {
  kind: FastCheckKind;
  at: string;
  expires_at: string;
  recheck_due_at: string | null;
}

export interface VerifyOptions {
  home_id: string;
  level: VerifyLevel;
  fast: FastCheckStanding | null;
  options: VerifyOption[];
  /** Add Home in two steps (`home_short_add`). */
  short_add_home: boolean;
  /** The card's QR picture and "This wasn't me" (`home_postcard_scan`). */
  postcard_scan: boolean;
  /** How and when the person was verified here, for "by {kind} · {date}" (null below `fast`). */
  verified_by?: 'mail' | 'document' | 'landlord' | 'phone' | 'location' | 'bill' | null;
  verified_at?: string | null;
  /** True at level `fast`: residency letters and home Mail need a mailed code. */
  needs_mail?: boolean;
}

/** The order the apps draw the choices in. */
export const VERIFY_OPTION_ORDER: VerifyOptionId[] = ['phone', 'location', 'document', 'mail', 'landlord'];

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** True when the server's answer has the shape the sheet needs; anything else keeps today's sheet. */
export function isVerifyOptions(value: unknown, homeId: string): value is VerifyOptions {
  if (!isObject(value) || typeof value.home_id !== 'string' || value.home_id.toLowerCase() !== homeId.toLowerCase()) return false;
  if (!['none', 'added', 'fast', 'proven'].includes(String(value.level)) || !Array.isArray(value.options)) return false;
  if (value.fast !== null && value.fast !== undefined
    && (!isObject(value.fast) || typeof value.fast.kind !== 'string' || typeof value.fast.at !== 'string')) return false;
  return value.options.every((o) => isObject(o) && typeof o.id === 'string' && typeof o.available === 'boolean');
}

/**
 * GET /api/homes/:id/verify-options. Null while the server has the faster
 * verification off (404 FAST_CHECK_OFF), or when it is older than this
 * build: the caller keeps today's screens.
 */
export async function getVerifyOptions(homeId: string): Promise<VerifyOptions | null> {
  try {
    const answer = await get<unknown>(`/api/homes/${encodeURIComponent(homeId)}/verify-options`);
    if (!isVerifyOptions(answer, homeId)) return null;
    return { ...answer, fast: answer.fast ?? null, short_add_home: answer.short_add_home === true, postcard_scan: answer.postcard_scan === true };
  } catch (error) {
    const status = (error as { statusCode?: number } | null)?.statusCode;
    if (status === 404) return null;
    throw error;
  }
}

/** The available choices, in the order the apps draw them. */
export function availableVerifyOptions(options: VerifyOptions | null | undefined): VerifyOptionId[] {
  if (!options) return [];
  return VERIFY_OPTION_ORDER.filter((id) => options.options.some((o) => o.id === id && o.available));
}

/** A choice's reason, when the server lists it but it can't be used now. */
export function verifyOptionReason(options: VerifyOptions | null | undefined, id: VerifyOptionId): VerifyOptionReason | null {
  return options?.options.find((o) => o.id === id)?.reason ?? null;
}

// ── The card's QR picture: "This wasn't me" (home_postcard_scan) ──────────────

/**
 * POST /api/public/postcard-report, with nobody signed in. The server answers
 * `{ recorded: true }` whatever the input, so the answer says nothing about the home.
 */
export async function reportPostcard(homeId: string, code: string): Promise<{ recorded: boolean }> {
  return post<{ recorded: boolean }>('/api/public/postcard-report', { home_id: homeId, code });
}
