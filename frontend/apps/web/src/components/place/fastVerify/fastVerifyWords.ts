// FASTVERIFY words (SPEC section 6), kept in one place so every web screen says the same thing.

import type { FastCheckKind, VerifyOptions } from '@pantopus/api';

/** "phone", "location", "bill" (a fast check's `document`) or "mail", for "by {kind} · {date}". */
export function fastKindWord(kind: FastCheckKind | string): string {
  if (kind === 'document') return 'bill';
  return kind;
}

/** The "by {kind} · {date}" line from the server's answer: its `verified_by` word, else the fast check's kind. */
export function verifiedByFromOptions(options: VerifyOptions | null | undefined): string | null {
  if (!options) return null;
  if (options.verified_by) {
    const day = verifiedDay(options.verified_at ?? options.fast?.at);
    return day ? `by ${options.verified_by} · ${day}` : `by ${options.verified_by}`;
  }
  return options.fast ? verifiedByLine(options.fast.kind, options.fast.at) : null;
}

/** "November 17", with the year when it isn't this year. */
export function verifiedDay(at: string | null | undefined): string | null {
  if (!at) return null;
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return null;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "by phone · November 17". */
export function verifiedByLine(kind: FastCheckKind | string, at: string | null | undefined): string {
  const day = verifiedDay(at);
  return day ? `by ${fastKindWord(kind)} · ${day}` : `by ${fastKindWord(kind)}`;
}

/** B3's line under "You're verified". */
export function verifiedSentence(kind: FastCheckKind | string, address: string): { before: string; address: string } {
  if (kind === 'location') return { before: 'Your phone was at ', address };
  if (kind === 'document') return { before: 'Your bill matches ', address };
  return { before: 'Your phone number matches ', address };
}

export const FAST_VERIFY_WORDS = {
  sheetTitle: 'Verify you live here',
  sheetBody: 'It takes under a minute. Then you can message homes near you, and your home gets the Verified mark.',
  fastest: 'Fastest',
  orByMail: 'Or by mail',
  notNow: 'Not now',
  toolsEitherWay: 'Your home tools work either way.',
  homeAdded: 'Home added',
  verifiedChip: 'Verified resident',
  messageHomes: 'Message homes near you',
  needsMailLine: 'Residency letters and home Mail need a mailed code.',
  mailMeACode: 'Mail me a code',
} as const;

/** The sheet's rows (the landlord row keeps today's words). */
export const FAST_VERIFY_ROWS = {
  phone: { label: 'Use my phone number', sub: 'We text a code, then match the number to this address.' },
  document: { label: 'Take a photo of a bill', sub: 'A utility bill or lease with your name and this address.' },
  mail: { label: 'Mail me a code', sub: 'A postcard to this home. It arrives in about a week.' },
  landlord: { label: 'Confirm with your landlord', sub: 'Your landlord confirms that you live here.' },
} as const;
