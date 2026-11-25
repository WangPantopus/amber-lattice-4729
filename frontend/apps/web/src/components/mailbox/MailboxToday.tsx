'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import MailboxHero, { sentWaiting } from '@/components/mailbox/MailboxHero';
import { useEmptyDayCard } from '@/components/mailbox/cards/cardDoors';
import { useMailboxContext } from '@/contexts/MailboxContext';
import { useMailboxDrawers } from '@/lib/mailbox-queries';

// From this width Mail is a page in the middle of the window, and the pane beside the list has room for the mailbox.
const WIDE = '(min-width: 1280px)';

function watchWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * A wide window (1280 px and up). There, your mailbox and today's delivery, and the mantel, show in the pane beside
 * the list while no mail is open; narrower windows keep them above the drawers and at the top of the list. The
 * Mailbox renders only in the browser (after its sign-in check), so the first render already knows the width.
 */
export function useMailWide(): boolean {
  return useSyncExternalStore(watchWide, () => window.matchMedia(WIDE).matches, () => false);
}

/**
 * Your mailbox and today's delivery (MailboxHero) with what the Mailbox knows: the round, the flag while something
 * you sent waits for the 7 a.m. pickup, and, in your own mail on a day with no mail while Christmas cards are open,
 * the invitation to send one.
 */
export default function MailboxToday({ personal }: { personal: boolean }) {
  const { data: drawers } = useMailboxDrawers();
  const { deliveryOpening } = useMailboxContext();
  const emptyDayCard = useEmptyDayCard();
  if (!drawers) return null;
  const { waiting, waitingLetters } = sentWaiting(drawers);
  return (
    <MailboxHero
      delivery={drawers.delivery}
      homes={drawers.homes}
      opening={deliveryOpening}
      waiting={waiting}
      waitingLetters={waitingLetters}
      invite={personal ? emptyDayCard : null}
    />
  );
}

/**
 * The pane beside the list on a wide window while no mail is open: the mantel (passed in, your own mail only) along
 * its top, then your mailbox and today's delivery in the middle.
 */
export function MailboxRest({ personal, line, children }: { personal: boolean; line: string; children?: ReactNode }) {
  return (
    <div data-testid="mailboxRest" className="flex h-full flex-col overflow-y-auto">
      {children}
      {/* Under the mantel when there is one; else in the middle of the pane. */}
      <div className={`flex flex-1 flex-col items-center px-6 ${children ? 'pb-10 pt-12' : 'justify-center py-10'}`}>
        <div className="w-full max-w-[608px]">
          <MailboxToday personal={personal} />
        </div>
        <p className="mt-4 text-center text-sm text-app-text-secondary">{line}</p>
      </div>
    </div>
  );
}
