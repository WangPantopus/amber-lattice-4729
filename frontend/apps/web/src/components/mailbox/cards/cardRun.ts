// ============================================================
// Open the next card (mail-cards-experience Part 4): the Mailbox list that opens a card hands the table the other cards
// waiting in it, oldest first (delivered, not yet opened, not sealed or the seal has lifted), so the reader goes from
// one card to the next without going back to the list. Kept per tab (sessionStorage) for the card it was handed to;
// a card opened from a notice or a link has none, so no button shows there. Nothing reaches the server.
// ============================================================

import type { MailItemV2 } from '@/types/mailbox';

const KEY = 'pantopus:card-run';
const KEEP_MS = 6 * 60 * 60 * 1000;

type CardRun = { current: string; waiting: string[]; at: number };

function read(): CardRun | null {
  try {
    const run = JSON.parse(sessionStorage.getItem(KEY) || 'null') as CardRun | null;
    if (!run || !Array.isArray(run.waiting) || typeof run.current !== 'string' || Date.now() - run.at > KEEP_MS) return null;
    return run;
  } catch {
    return null;
  }
}

function write(run: CardRun | null) {
  try {
    if (run) sessionStorage.setItem(KEY, JSON.stringify(run));
    else sessionStorage.removeItem(KEY);
  } catch { /* storage off: no next card */ }
}

/** A card that can be opened now and hasn't been. */
export function waitingCard(item: MailItemV2): boolean {
  return Boolean(item.card) && !item.card?.sealed && !item.opened_at && !item.removed;
}

/** The list opened `opened`: the cards waiting beside it, oldest first, go with it. Anything but a card ends a run. */
export function startCardRun(opened: MailItemV2, items: MailItemV2[]) {
  if (!opened.card) { write(null); return; }
  const when = (item: MailItemV2) => Date.parse(item.delivered_at || item.created_at || '') || 0;
  const waiting = items.filter((item) => item.id !== opened.id && waitingCard(item))
    .sort((a, b) => when(a) - when(b) || a.id.localeCompare(b.id))
    .map((item) => item.id);
  write({ current: opened.id, waiting, at: Date.now() });
}

/** The cards still waiting after `cardId`, when the list handed its run to this card; [] otherwise. */
export function nextCards(cardId: string): string[] {
  const run = read();
  if (!run || run.current !== cardId) return [];
  return run.waiting.filter((id) => id !== cardId);
}

/** Moving on from `cardId` to the next card: the run goes with it. Answers the next card's id, or null. */
export function moveToNextCard(cardId: string): string | null {
  const run = read();
  if (!run || run.current !== cardId) return null;
  const waiting = run.waiting.filter((id) => id !== cardId);
  const [next, ...rest] = waiting;
  if (!next) { write(null); return null; }
  write({ current: next, waiting: rest, at: Date.now() });
  return next;
}
