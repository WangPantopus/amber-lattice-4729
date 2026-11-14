'use client';

// ============================================================
// /dev/card-film — the card on the table with nobody on it, for filming the
// share videos (scripts/film-card-videos.cjs). The real CardTable, so a video
// is what the app shows: the picture's own cloth, stamp, mood and sounds. The
// envelope says "For you" from "Pantopus", and the back carries the invitation
// in place of anyone's note. The picture's facts come in the address
// (?design=christmas-2026-08&number=8&caption=…&paper=…&table=…). Public
// route, no fetching: a tool's surface, not a shipped screen.
// ============================================================

import { useEffect, useState } from 'react';
import CardTable, { type TableCard } from '@/components/mailbox/cards/CardTable';

/** What every share video's card says on its back, signed FROM Pantopus. */
const INVITATION = 'This is how a Christmas card arrives on Pantopus.\nIt opens like real mail.\n\nSend one at\npantopus.com/cards';
/** Every picture on a public page prints the same postmark: there's no person's day to print. */
const POSTMARK_DAY = '2026-12-25';

export default function CardFilmPage() {
  const [card, setCard] = useState<TableCard | null>(null);

  // Read after the page is on screen, so it needs nothing from the server.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const design = query.get('design') || 'christmas-2026-08';
    setCard({
      design,
      number: Number(query.get('number')) || Number(design.split('-').pop()) || 8,
      caption: query.get('caption') || 'Come finish our snowman.',
      paper: query.get('paper') || '#f9f1e3',
      table: query.get('table') || '#3b4c6e',
      year: Number(query.get('year')) || 2026,
      sealed: false,
    });
  }, []);

  if (!card) return null;
  return <CardTable card={card} note={INVITATION} fromName="Pantopus" toName="For you" mailedOn={POSTMARK_DAY} onClose={() => {}} />;
}
