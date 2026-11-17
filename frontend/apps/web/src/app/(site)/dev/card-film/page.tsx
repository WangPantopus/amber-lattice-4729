'use client';

// ============================================================
// /dev/card-film — the card on the table with nobody on it, for filming the
// share videos (scripts/film-card-videos.cjs) and the Christmas cards ad
// (scripts/film-card-ad.cjs). The real CardTable and CardRack, so a film is
// what the app shows: the picture's own cloth, stamp, mood and sounds. The
// picture's facts come in the address (?design=christmas-2026-08&number=8&
// caption=…&paper=…&table=…). Public route, no fetching: a tool's surface, not
// a shipped screen (404 in production builds).
//
// The share videos: the envelope says "For you" from "Pantopus", and the back
// carries the invitation in place of anyone's note.
//
// The ad (?scene=…), with made-up people only (from, to, note):
//   open    the card arrives and is opened, as the person it's for sees it
//   sealed  sealed until Christmas morning (until): the flap won't open
//   send    sealing it by hand: the sending moment, its seal answered at once
//   rack    the card rack, its cards (rack, a JSON list) opening at start
// mailed is the postmark's day. top and bottom (CSS px) lay the table out
// inside the platforms' safe area: a taller top inset and bottom bar, as the
// table makes room for a phone's own; left (CSS px) keeps the rack's card
// clear of words at the left of a wide window. The ad's script writes the
// note and signs it through window.__cardFilm.
// ============================================================

import { useEffect, useState } from 'react';
import type { CardSignature, HolidayCardDesign } from '@pantopus/api';
import CardRack from '@/components/mailbox/cards/CardRack';
import CardTable, { type TableCard } from '@/components/mailbox/cards/CardTable';

/** What every share video's card says on its back, signed FROM Pantopus. */
const INVITATION = 'This is how a Christmas card arrives on Pantopus.\nIt opens like real mail.\n\nSend one at\npantopus.com/cards';
/** Every picture on a public page prints the same postmark: there's no person's day to print. */
const POSTMARK_DAY = '2026-12-25';

type Scene = 'open' | 'sealed' | 'send' | 'rack';

type AdSetup = {
  scene: Scene;
  fromName: string;
  toName: string;
  mailedOn: string;
  /** The room the table keeps above and below itself, in CSS px (null: the phone's own). */
  top: number | null;
  bottom: number | null;
  /** The room the rack keeps at its left, in CSS px (null: none), so its card sits clear of words on that side. */
  left: number | null;
  rack: HolidayCardDesign[];
  start: string;
};

const SCENES: Scene[] = ['open', 'sealed', 'send', 'rack'];

/** A size in CSS px from the address, or null. */
function px(value: string | null): number | null {
  const n = Number(value);
  return value !== null && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The room the platforms' own buttons take, and the table lays itself out inside what's left: its top inset (as a
 * phone's own) and the bar under it. The rack: the room above its card (its top row is 44px) and below its button
 * (the hint under it 22px), its card as large as the room between allows, as on a shorter screen.
 */
function insetStyle(ad: AdSetup): string {
  if (ad.top === null && ad.bottom === null) return '';
  const top = ad.top ?? 0;
  const bottom = ad.bottom ?? 0;
  if (ad.scene === 'rack') {
    const left = ad.left ?? 0;
    return [
      `[data-testid="cardRack"] > div:has(> [data-testid="cardRackClose"]) { padding-top: ${Math.max(0, top - 44)}px !important; }`,
      `[data-testid="cardRack"] > div:has(> [data-testid="cardRackWrite"]) { padding-bottom: ${Math.max(0, bottom - 22)}px !important; }`,
      `[data-testid="cardRackCard"] { width: min(calc(100vw - ${32 + left}px), 560px, calc((100dvh - ${top + bottom + 68}px) / 1.2)) !important; }`,
      ...(left ? [`[data-testid="cardRack"] { padding-left: ${left}px !important; }`] : []),
    ].join('\n');
  }
  return [`[data-el="safe"] { height: ${top}px !important; }`, `[data-el="bottom"] { min-height: ${bottom}px; }`].join('\n');
}

export default function CardFilmPage() {
  const [card, setCard] = useState<TableCard | null>(null);
  const [ad, setAd] = useState<AdSetup | null>(null);
  const [note, setNote] = useState('');
  const [signature, setSignature] = useState<CardSignature | null>(null);

  // Read after the page is on screen, so it needs nothing from the server.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const design = query.get('design') || 'christmas-2026-08';
    const scene = SCENES.find((name) => name === query.get('scene')) ?? null;
    const base = {
      design,
      number: Number(query.get('number')) || Number(design.split('-').pop()) || 8,
      caption: query.get('caption') || 'Come finish our snowman.',
      paper: query.get('paper') || '#f9f1e3',
      table: query.get('table') || '#3b4c6e',
      year: Number(query.get('year')) || 2026,
    };
    if (!scene) {
      setCard({ ...base, sealed: false });
      return;
    }
    let rack: HolidayCardDesign[] = [];
    try {
      rack = JSON.parse(query.get('rack') || '[]') as HolidayCardDesign[];
    } catch {
      rack = [];
    }
    // Sealing it, the envelope carries the "Do not open until Christmas" mark unless sealed=0.
    const sealed = scene === 'sealed' || (scene === 'send' && query.get('sealed') !== '0');
    setCard({ ...base, sealed, sealed_until: scene === 'sealed' ? query.get('until') || `${base.year}-12-25T15:00:00.000Z` : null });
    setNote(query.get('note') ?? '');
    setAd({
      scene,
      fromName: query.get('from') || 'Pantopus',
      toName: query.get('to') || 'For you',
      mailedOn: query.get('mailed') || POSTMARK_DAY,
      top: px(query.get('top')),
      bottom: px(query.get('bottom')),
      left: px(query.get('left')),
      rack,
      start: query.get('start') || rack[0]?.id || design,
    });
    (window as unknown as { __cardFilm?: unknown }).__cardFilm = { setNote, setSignature };
  }, []);

  if (!card) return null;
  if (!ad) return <CardTable card={card} note={INVITATION} fromName="Pantopus" toName="For you" mailedOn={POSTMARK_DAY} onClose={() => {}} />;
  const inset = insetStyle(ad);
  const style = inset ? <style>{inset}</style> : null;
  if (ad.scene === 'rack') {
    return (
      <>
        {style}
        <CardRack designs={ad.rack} collectionName={null} start={ad.start} year={card.year} onClose={() => {}} onWrite={() => {}} />
      </>
    );
  }
  const signed = { ...card, signature };
  return (
    <>
      {style}
      <CardTable
        card={signed}
        note={note}
        fromName={ad.fromName}
        toName={ad.toName}
        mailedOn={ad.mailedOn}
        onClose={() => {}}
        sendMoment={ad.scene === 'send' ? {
          firstName: ad.toName,
          onSeal: () => Promise.resolve({ ok: true as const }),
          goneWords: `On its way to ${ad.toName}.`,
          gone: null,
        } : null}
      />
    </>
  );
}
