'use client';

// ============================================================
// The Christmas card on real paper (launch key card_table): the picture side
// and the back, drawn the same at any size. The note is in the pen, with each
// word a little off the line (seeded from the card, so it looks the same every
// time). The pen is as large as the note allows (mail-cards-experience Part 1):
// three sizes on the rules, then today's shrinking for a longer note.
// ============================================================

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { cardTrimmedPicture, firstNameOf, isVerseReference, PAPER_SERIF, postmarkDay, seededRandom } from './cardArt';
import { cardHand, cardPen } from './cardFont';
import { SignatureInk, drawableSignature } from './cardSignature';
import type { CardSignature } from '@pantopus/api';
import styles from './CardPaper.module.css';

const SERIF_VAR = { '--card-serif': PAPER_SERIF } as CSSProperties;
const PEN_STACK = `${cardPen.style.fontFamily}, ui-serif, Georgia, serif`;

/** The note's size, as shares of the card's width. `rules` says whether its lines still sit on the printed rules. */
export type NoteFit = { size: number; line: number; rules: boolean };
const NOTE_FIT: NoteFit = { size: 6, line: 7.6, rules: true };
const NOTE_WIDTH = 85;
export const NOTE_HEIGHT = 83.6;
/**
 * The pen's three sizes, largest first (mail-cards-experience Part 1): 9, 10 or 11 ruled lines, each set filling the same
 * 83.6u from 9u down, so FROM and the foot never move. The largest at which the note fits its lines is used.
 */
const PEN_SIZES: NoteFit[] = [
  { size: 7.8, line: NOTE_HEIGHT / 9, rules: true },
  { size: 7.0, line: NOTE_HEIGHT / 10, rules: true },
  NOTE_FIT,
];

/** The note's lines and words, with the small shift and turn each word gets. Shared with the share pictures. */
export function penWords(note: string, number: number | null | undefined) {
  const random = seededRandom((number ?? 1) * 7 + 3);
  return note.split('\n').map((line) => line.split(/( )/).map((word) => {
    if (word === ' ' || word === '') return { word, shift: 0, turn: 0, ink: 1 };
    const shift = (random() - 0.5) * 0.34;
    const turn = (random() - 0.5) * 1.5;
    return { word, shift, turn, ink: 0.93 + random() * 0.07 };
  }));
}

/**
 * Largest size at which `note` fits: the pen's three sizes on their rules, then (as before November 17) smaller pens on the
 * 11 rules, then tighter lines for a note of many short lines. Every place the back is drawn asks this one function.
 */
export function measureNote(note: string): NoteFit {
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:-9999px;top:0;visibility:hidden;width:${NOTE_WIDTH * 8}px;font-family:${PEN_STACK}`;
  for (const line of note.split('\n')) {
    const row = document.createElement('p');
    row.style.cssText = 'margin:0;min-height:1lh';
    for (const word of line.split(/( )/)) {
      if (word === ' ') { row.append(' '); continue; }
      const span = document.createElement('span');
      span.style.cssText = 'display:inline-block;max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere';
      span.textContent = word;
      row.append(span);
    }
    box.append(row);
  }
  document.body.append(box);
  // `byLines`: the words take no more lines than the rules hold (the rows' own height). Each word is an inline box as
  // tall as a line that hangs a little below its row, so the box's scroll height counts that overhang once more; the
  // smaller pens past 11 lines keep measuring that way, as they always have.
  const fits = (size: number, line: number, byLines = false) => {
    box.style.fontSize = `${size * 8}px`;
    box.style.lineHeight = `${line * 8}px`;
    return (byLines ? box.offsetHeight : box.scrollHeight) <= (NOTE_HEIGHT * 8) + 2;
  };
  let answer: NoteFit | null = PEN_SIZES.find((pen) => fits(pen.size, pen.line, true)) ?? null;
  if (!answer) {
    for (const size of [5.6, 5.2, 4.8, 4.4]) {
      if (fits(size, 7.6)) { answer = { size, line: 7.6, rules: true }; break; }
    }
  }
  if (!answer) {
    // More lines than the rules hold: tighter lines, off the rules.
    for (let line = 7; line >= 2.4; line -= 0.2) {
      const size = Math.max(2.2, line * 0.72);
      if (fits(size, line)) { answer = { size, line, rules: false }; break; }
    }
  }
  box.remove();
  return answer ?? { size: 2.2, line: 2.4, rules: false };
}

/** How the note fits. Starts at the full size and settles once the pen has loaded. */
export function useNoteFit(note: string): NoteFit {
  const [fit, setFit] = useState<NoteFit>(NOTE_FIT);
  useEffect(() => {
    let live = true;
    const measure = () => { if (live) setFit(measureNote(note)); };
    measure();
    void document.fonts?.load(`48px ${PEN_STACK}`).then(measure).catch(() => {});
    return () => { live = false; };
  }, [note]);
  return fit;
}

export function CardPostmarkSvg({ day, year }: { day: string; year: number }) {
  return (
    <svg viewBox="0 0 100 60" fill="none" stroke="#b2413a" strokeOpacity=".86" aria-hidden="true">
      <circle cx="36" cy="30" r="22" strokeWidth="1.6" />
      <circle cx="36" cy="30" r="18.5" strokeWidth=".8" />
      <path strokeWidth="1.6" d="M58 21q6-8 12 0t12 0t12 0M58 30q6-8 12 0t12 0t12 0M58 39q6-8 12 0t12 0t12 0" />
      <text x="36" y="28" textAnchor="middle" fontFamily="Georgia,serif" fontWeight="700" fontSize="7.6" fill="#b2413a" stroke="none">{day}</text>
      <text x="36" y="40" textAnchor="middle" fontFamily="Georgia,serif" fontWeight="700" fontSize="8.5" fill="#b2413a" stroke="none">{year}</text>
    </svg>
  );
}

export function PaperFront({
  design,
  caption,
  paper,
  year,
  mailedOn,
  className = '',
  style,
  children,
}: {
  design: string;
  caption: string | null;
  paper: string;
  year: number;
  /** The day it was mailed; today while it's being written. */
  mailedOn?: string | null;
  className?: string;
  style?: CSSProperties;
  /** What moves over the face on the table (sheen, shade). */
  children?: ReactNode;
}) {
  const text = caption || '';
  const captionSize = Math.min(4.8, 70 / Math.max(1, text.length * 0.53));
  const day = postmarkDay(mailedOn || new Date().toISOString());
  return (
    <div className={`${styles.face} ${className}`} style={{ ...SERIF_VAR, ...style }}>
      <div className={styles.inner} style={{ backgroundColor: paper }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cardTrimmedPicture(design)} alt="" className={styles.photo} draggable={false} />
        <div className={`${styles.caption} ${isVerseReference(text) ? styles.verse : cardHand.className}`} style={{ fontSize: `${captionSize}cqw` }}>{text}</div>
        <div className={styles.year}>CHRISTMAS, {year}</div>
        <div className={styles.pm}><CardPostmarkSvg day={day} year={year} /></div>
        <div className={`${styles.grain} ${styles.grainFront}`} />
        <div className={styles.edges} />
        {children}
      </div>
    </div>
  );
}

export function PaperBack({
  number,
  paper,
  fromName,
  year,
  note,
  writing,
  signature,
  className = '',
  style,
  children,
}: {
  /** The picture's number: the note's small shifts are seeded from it. */
  number?: number | null;
  paper: string;
  fromName: string;
  year: number;
  note?: string;
  /** Signed beside FROM (design plan 8.2): drawn in the pen's ink in place of the typed first name. */
  signature?: CardSignature | null;
  /** The writing box while it's being written, in place of the note. */
  writing?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const text = note ?? '';
  const fit = useNoteFit(text);
  const signed = drawableSignature(signature);
  const lines = useMemo(() => penWords(text, number), [text, number]);
  return (
    <div className={`${styles.face} ${className}`} style={{ ...SERIF_VAR, ...style }}>
      <div className={styles.inner} style={{ backgroundColor: paper }}>
        {writing ? <div className={styles.writing}>{writing}</div> : (
          <>
            {fit.rules ? <div className={styles.rules} style={{ '--rule': `${fit.line}cqw` } as CSSProperties} /> : null}
            <div className={styles.note} style={{ fontFamily: PEN_STACK, fontSize: `${fit.size}cqw`, lineHeight: `${fit.line}cqw` }}>
              {lines.map((line, i) => (
                <p key={i} dir="auto">
                  {line.map((part, k) => (part.word === ' ' || part.word === '' ? part.word : (
                        <span key={k} className={styles.word} style={{ transform: `translateY(${part.shift.toFixed(3)}em) rotate(${part.turn.toFixed(2)}deg)`, opacity: Number(part.ink.toFixed(2)) }}>{part.word}</span>
                  )))}
                </p>
              ))}
            </div>
          </>
        )}
        <div className={styles.from}>
          <b>FROM</b>
          {signed ? (
            <span className={styles.signed} data-testid="cardSignature">
              <span className={styles.srOnly}>{firstNameOf(fromName)}</span>
              <SignatureInk signature={signed} className={styles.signInk} />
            </span>
          ) : <span style={{ fontFamily: PEN_STACK }}>{firstNameOf(fromName)}</span>}
        </div>
        <div className={styles.foot}>PANTOPUS POST · CHRISTMAS {year}</div>
        {/* Full grain under the table's light; away from it, lighter, so the back reads as the same paper. */}
        <div className={`${styles.grain} ${children ? '' : styles.grainSoft}`} />
        <div className={styles.edges} />
        {children}
      </div>
    </div>
  );
}
