'use client';

// ============================================================
// "Pick a card" as shelves (card shelves SPEC Part C, server key card_shelves,
// founder 2026-11-21): one large card from each collection ("One from each
// collection"), then a shelf per collection (its first 10 cards in a row that
// scrolls sideways), and a page per collection, its cards two across, in parts
// where it has them. A card opens the card rack among all its collection's
// cards, as a tile of the grid does; the chosen card carries the tick wherever
// it shows. The server's answer turns it on (`shelves: true`); without it, or
// without the collections' facts, "Pick a card" is today's.
// ============================================================

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import type { HolidayCardCollection, HolidayCardDesign, HolidayCards } from '@pantopus/api';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { cardPicture, SERIF, WAX } from './cardArt';
import styles from './CardShelves.module.css';

/** The first cards a shelf shows; a collection with more ends its row with "See all <N>". */
const SHELF_MAX = 10;
const MUTED = 'text-[#4e5563] [@media(prefers-color-scheme:dark)]:text-app-text-secondary';
const INK = 'text-[#111827] [@media(prefers-color-scheme:dark)]:text-app-text';
const WAX_TEXT = 'text-[#8b1d1d] [@media(prefers-color-scheme:dark)]:text-[#f0a093]';
const PILL = 'h-9 flex-shrink-0 whitespace-nowrap rounded-full border px-4 text-[14px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b1d1d] focus-visible:ring-offset-2';
const PILL_ON = 'border-[#8b1d1d] bg-[#8b1d1d] text-[#fff7ed]';
const PILL_OFF = 'border-[#d6cbb6] bg-[#fffdf8] text-[#374151] hover:bg-[#f5efe3]';

/** A collection with its cards, in shelf order. */
export type Shelf = HolidayCardCollection & { cards: HolidayCardDesign[] };

/**
 * The shelves the server's answer gives: while it says `shelves` and its collections carry their facts. Null (a server
 * without the switch, without collections or without their facts): today's "Pick a card".
 */
export function shelvesOf(data: Pick<HolidayCards, 'shelves' | 'collections' | 'designs'>): Shelf[] | null {
  const collections = data.collections ?? [];
  if (data.shelves !== true || !collections.length || !collections.every((c) => typeof c.slug === 'string' && c.slug)) return null;
  const byId = new Map(data.designs.map((design) => [design.id, design]));
  const shelves = collections
    .map((collection) => ({ ...collection, cards: collection.designs.flatMap((id) => byId.get(id) ?? []) }))
    .filter((shelf) => shelf.cards.length);
  return shelves.length ? shelves : null;
}

/** What scrolls the page: the flow's own panel from 768 px wide, the window below it. */
export function scrollerOf(el: Element | null): HTMLElement {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Scrolls the page so `el` starts `offset` px below the top of what scrolls it (Safari's scrollIntoView doesn't keep
 * the scroll-margin under a bar that stays at the top, so the distance is set here for every browser).
 */
export function scrollToStart(el: HTMLElement, offset: number, smooth = false) {
  const scroller = scrollerOf(el);
  const page = scroller === document.scrollingElement || scroller === document.documentElement;
  const from = page ? window.scrollY : scroller.scrollTop;
  const top = from + el.getBoundingClientRect().top - (page ? 0 : scroller.getBoundingClientRect().top) - offset;
  (page ? window : scroller).scrollTo({ top: Math.max(0, Math.round(top)), behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
}

/** How much of the top the app bar covers where the shelves are (`--stuck`: 56 px at phone width, none from 768 px). */
const stuckOf = (el: Element) => parseFloat(getComputedStyle(el).getPropertyValue('--stuck')) || 0;

// The first large card's picture comes alone, before any other (on a slow network the pictures on screen would otherwise
// share it and all arrive late); the rest follow as they come near. At most 2 s, in case it never answers.
let firstPicture = { open: true, waiting: new Set<() => void>(), timer: 0 };
function openFirst() {
  if (firstPicture.open) return;
  firstPicture.open = true;
  window.clearTimeout(firstPicture.timer);
  firstPicture.waiting.forEach((go) => go());
  firstPicture.waiting.clear();
}
function holdForFirst() {
  if (typeof window === 'undefined') return;
  window.clearTimeout(firstPicture.timer);
  firstPicture = { open: false, waiting: new Set(), timer: window.setTimeout(openFirst, 2000) };
}
function afterFirst(go: () => void): () => void {
  if (firstPicture.open) { go(); return () => {}; }
  const gate = firstPicture;
  gate.waiting.add(go);
  return () => { gate.waiting.delete(go); };
}

// The pictures come in this order, so the ones on screen never wait for others: the first large card's thumbnail, then
// the thumbnails of the cards on screen, then those of cards within 300 px of it, then the sharper copies.
const thumbsMissing = new Set<object>();
const askLater = new Set<() => void>();
const sharpenLater = new Set<() => void>();
function flushPictures() {
  if (thumbsMissing.size) return;
  if (askLater.size) {
    const now = [...askLater];
    askLater.clear();
    now.forEach((go) => go());
    if (thumbsMissing.size) return;
  }
  const now = [...sharpenLater];
  sharpenLater.clear();
  now.forEach((go) => go());
}
function thumbSettled(key: object) {
  if (thumbsMissing.delete(key)) flushPictures();
}
function later(queue: Set<() => void>, go: () => void): () => void {
  queue.add(go);
  flushPictures();
  return () => { queue.delete(go); };
}

/**
 * A card's picture, fetched as it comes near: its 360-wide thumbnail (as today's grid has it) once the card is on screen,
 * or within 300 px of the screen's top or bottom once those on screen are in (a row's cards beyond its edge wait until
 * the row scrolls them in); then, once every thumbnail asked for is in, the 960-wide picture where the screen would show
 * the thumbnail soft (a card on screen, on a 2x or 3x screen). `eager`: the first large card, fetched at once and first.
 */
export function useNearPicture(design: string, eager: boolean) {
  const ref = useRef<HTMLImageElement>(null);
  const thumb = cardPicture(design, 'thumb');
  const [src, setSrc] = useState<string | undefined>(eager ? thumb : undefined);
  useEffect(() => {
    const img = ref.current;
    if (!img || typeof IntersectionObserver === 'undefined') { setSrc(thumb); return undefined; }
    const key = {};
    let gone = false;
    const undo: (() => void)[] = [];
    // Its thumbnail is missing from when it's asked for until it's in (or failed).
    const settle = () => thumbSettled(key);
    img.addEventListener('load', settle);
    img.addEventListener('error', settle);
    if (eager && !(img.complete && img.naturalWidth)) thumbsMissing.add(key);
    const ask = () => {
      if (gone || img.currentSrc) return;
      thumbsMissing.add(key);
      setSrc(thumb);
    };
    const sharpen = () => {
      if (gone || img.getBoundingClientRect().width * (window.devicePixelRatio || 1) <= 380) return;
      undo.push(later(sharpenLater, () => {
        const full = new Image();
        full.src = cardPicture(design);
        full.decode().then(() => { if (!gone) setSrc(full.src); }).catch(() => {});
      }));
    };
    const onScreen = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      onScreen.disconnect();
      undo.push(afterFirst(ask));
      if (img.complete && img.naturalWidth) sharpen();
      else img.addEventListener('load', sharpen, { once: true });
    });
    const near = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      near.disconnect();
      undo.push(afterFirst(() => { if (!gone) undo.push(later(askLater, ask)); }));
    }, { rootMargin: '300px 0px' });
    onScreen.observe(img);
    near.observe(img);
    return () => {
      gone = true;
      undo.forEach((u) => u());
      onScreen.disconnect();
      near.disconnect();
      img.removeEventListener('load', sharpen);
      img.removeEventListener('load', settle);
      img.removeEventListener('error', settle);
      thumbSettled(key);
    };
  }, [design, thumb, eager]);
  return { ref, src };
}

/** A card as the shelves draw it: its picture, the tick when it's the chosen one, and its caption under it. */
function CardTile({ design, chosen, label, eager = false, captionClass, onOpen }: {
  design: HolidayCardDesign;
  chosen: boolean;
  label: string;
  eager?: boolean;
  captionClass: string;
  onOpen: () => void;
}) {
  const picture = useNearPicture(design.id, eager);
  return (
    <button
      type="button"
      aria-label={chosen ? `${label}, chosen` : label}
      data-testid={`shelfCard.${design.id}`}
      data-card={design.id}
      onClick={onOpen}
      className="group flex w-full flex-col items-center gap-1.5 rounded-lg p-1 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b1d1d]"
    >
      <span
        className="relative block w-full overflow-hidden rounded-[3px] transition-transform group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0"
        style={{ boxShadow: chosen ? `0 0 0 3px ${WAX}, 0 6px 14px rgba(60, 40, 10, 0.25)` : '0 4px 10px rgba(60, 40, 10, 0.22)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={picture.ref}
          src={picture.src}
          alt=""
          fetchPriority={eager ? 'high' : undefined}
          onLoad={eager ? openFirst : undefined}
          onError={eager ? openFirst : undefined}
          decoding="async"
          className={styles.picture}
        />
        {chosen ? (
          <span aria-hidden className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[#fff7ed]" style={{ backgroundColor: WAX }}>
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className={captionClass}>{design.caption}</span>
    </button>
  );
}

/**
 * A row that scrolls sideways and settles on a card's leading edge. Where there is a mouse, an arrow at each end moves it
 * by most of its width (shown only while it can move that way). `cardWidth` places the arrows on the pictures' middle.
 */
export function Row({ name, cardWidth, testId, children, rowClass = styles.row, dark = false }: {
  name: string;
  cardWidth: string;
  testId: string;
  children: ReactNode;
  /** The row's own spacing (the public pages lay theirs out on the table). */
  rowClass?: string;
  /** Arrows for the dark table of the public pages. */
  dark?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: true, end: true });
  useEffect(() => {
    const row = ref.current;
    if (!row) return undefined;
    const update = () => setEnds({ start: row.scrollLeft <= 2, end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 2 });
    update();
    row.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { row.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  const move = (by: -1 | 1) => {
    const row = ref.current;
    if (row) row.scrollBy({ left: by * Math.round(row.clientWidth * 0.85), behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  // A card reached with the keyboard settles at the row's leading edge, whole, rather than where the snap leaves it.
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const row = ref.current;
    // Only for the keyboard: a mouse press focuses the card too, and moving it then would lose the click.
    if (!(event.target as HTMLElement).matches(':focus-visible')) return;
    let item = event.target as HTMLElement | null;
    while (item && item.parentElement !== row) item = item.parentElement;
    if (!row || !item) return;
    const box = row.getBoundingClientRect();
    const at = item.getBoundingClientRect();
    const start = parseFloat(getComputedStyle(row).paddingLeft) || 0;
    if (at.left < box.left + start - 8 || at.right > box.right - 8) row.scrollTo({ left: Math.max(0, item.offsetLeft - start), behavior: 'auto' });
  };
  const arrow = dark
    ? 'absolute z-[2] h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[rgba(246,236,217,0.3)] bg-[rgba(22,18,16,0.72)] text-[#f6ecd9] shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition hover:bg-[rgba(40,32,28,0.85)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8b76f]'
    : 'absolute z-[2] h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#d6cbb6] bg-[#fffdf8]/95 text-[#374151] shadow-[0_4px_12px_rgba(60,40,10,0.22)] transition hover:bg-[#f5efe3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b1d1d]';
  const top = { top: `calc(${cardWidth} * 16 / 15 / 2 + 8px)` };
  // The flow's rows run to the edges of the page (styles.bleed), so their arrows sit just inside them; the public pages
  // lay their rows out themselves.
  const [left, right] = dark ? ['-left-2', '-right-2'] : ['left-2', 'right-2'];
  return (
    <div className={dark ? 'relative' : `relative ${styles.bleed}`}>
      <button type="button" hidden={ends.start} aria-label={`Earlier cards in ${name}`} onClick={() => move(-1)} className={`${styles.arrow} ${arrow} ${left}`} style={top}>
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <div ref={ref} className={rowClass} data-testid={testId} onFocus={onFocus}>{children}</div>
      <button type="button" hidden={ends.end} aria-label={`More cards in ${name}`} onClick={() => move(1)} className={`${styles.arrow} ${arrow} ${right}`} style={top}>
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * The shelves: "One from each collection" (each collection's `pick`, large, in the collections' order; none when no
 * collection has one), then a shelf per collection. A card opens the rack among its collection's cards; the line under a
 * large card scrolls to its shelf; "All <N>" and "See all <N>" open the collection's page. Opening with a card chosen
 * (back from step 3, or from a public card page), the page starts at the shelf that holds it; back from a collection's
 * page, where it was (`restoreTop`).
 */
export function CardShelves({ shelves, chosen, restoreTop, onOpen, onAll }: {
  shelves: Shelf[];
  chosen: string | null;
  restoreTop: number | null;
  onOpen: (design: string, shelf: Shelf) => void;
  onAll: (shelf: Shelf) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const picks = useMemo(() => shelves.flatMap((shelf) => {
    const card = shelf.pick ? shelf.cards.find((c) => c.id === shelf.pick) : undefined;
    return card ? [{ shelf, card }] : [];
  }), [shelves]);
  // While it renders, before any card asks for its picture: the first large card's comes first.
  useState(() => { if (picks.length) holdForFirst(); return null; });

  // As the step opens. The flow focuses its heading first (which may move the page), so this waits a frame.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const place = () => {
      const scroller = scrollerOf(el);
      if (restoreTop !== null) { scroller.scrollTop = restoreTop; return; }
      const shelf = chosen ? shelves.find((s) => s.cards.some((c) => c.id === chosen)) : undefined;
      if (!shelf) return;
      const section = document.getElementById(shelfAnchor(shelf.id));
      if (section) scrollToStart(section, stuckOf(el) + 8);
      const row = section?.querySelector<HTMLElement>('[data-testid^="shelfRow."]');
      const tile = row?.querySelector<HTMLElement>(`[data-card="${chosen}"]`)?.parentElement;
      if (row && tile) row.scrollLeft = Math.max(0, tile.offsetLeft - 16);
    };
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
    // Only as the shelves open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // How far the rows reach past the column on each side: to the edges of what scrolls the page (on a phone the screen,
  // 16 px; on a wider screen the flow's whole panel), measured again when anything resizes.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const measure = () => {
      const scroller = scrollerOf(el);
      const page = scroller === document.scrollingElement || scroller === document.documentElement;
      const box = el.getBoundingClientRect();
      const from = page ? 0 : scroller.getBoundingClientRect().left + scroller.clientLeft;
      const to = page ? document.documentElement.clientWidth : from + scroller.clientWidth;
      el.style.setProperty('--bleed-l', `${Math.max(0, Math.round(box.left - from))}px`);
      el.style.setProperty('--bleed-r', `${Math.max(0, Math.round(to - box.right))}px`);
    };
    measure();
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    watch?.observe(el);
    window.addEventListener('resize', measure);
    return () => { watch?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  const jump = (shelf: Shelf) => {
    const section = document.getElementById(shelfAnchor(shelf.id));
    if (section && root.current) scrollToStart(section, stuckOf(root.current) + 8, true);
  };

  return (
    <div ref={root} className={styles.shelves} data-testid="cardShelves">
      {picks.length ? (
        <section aria-labelledby="card-shelves-picks" className="mb-2">
          <p id="card-shelves-picks" className={`mb-1 mt-1 text-[12px] font-semibold uppercase tracking-[0.06em] ${MUTED}`}>One from each collection</p>
          <Row name="One from each collection" cardWidth="var(--open-w)" testId="shelfPicks">
            {picks.map(({ shelf, card }, i) => (
              <div key={shelf.id} className={styles.open}>
                <CardTile
                  design={card}
                  chosen={card.id === chosen}
                  label={`${card.caption}, ${shelf.name}`}
                  eager={i === 0}
                  captionClass={`line-clamp-2 text-[14px] font-semibold leading-[19px] ${INK}`}
                  onOpen={() => onOpen(card.id, shelf)}
                />
                <button
                  type="button"
                  data-testid={`shelfJump.${shelf.id}`}
                  onClick={() => jump(shelf)}
                  className={`block w-full rounded-md px-1 pb-1 text-center text-[13px] font-semibold leading-[18px] ${WAX_TEXT} focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b1d1d]`}
                >
                  {shelf.name} · {shelf.cards.length} cards <span aria-hidden>›</span>
                </button>
              </div>
            ))}
          </Row>
        </section>
      ) : null}
      {shelves.map((shelf) => {
        const count = shelf.cards.length;
        const heading = `card-shelf-name-${shelf.id}`;
        return (
          <section key={shelf.id} id={shelfAnchor(shelf.id)} aria-labelledby={heading} data-testid={`shelf.${shelf.id}`} className={`${styles.landing} border-t border-[#e3d8c3] pb-2 pt-3 [@media(prefers-color-scheme:dark)]:border-app`}>
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <h2 id={heading} className={`text-[17px] font-semibold leading-6 ${INK}`}>{shelf.name}</h2>
                <p className={`line-clamp-2 text-[13px] leading-[18px] ${MUTED}`}>{shelf.line}</p>
              </div>
              <button
                type="button"
                aria-label={`All ${count}, ${shelf.name}`}
                data-testid={`shelfAll.${shelf.id}`}
                onClick={() => onAll(shelf)}
                className={`flex min-h-[44px] flex-shrink-0 items-center whitespace-nowrap rounded-md px-1 text-[14px] font-semibold ${WAX_TEXT} focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b1d1d]`}
              >
                All {count} <span aria-hidden className="ml-1">›</span>
              </button>
            </div>
            <Row name={shelf.name} cardWidth="var(--shelf-w)" testId={`shelfRow.${shelf.id}`}>
              {shelfCards(shelf, chosen).map(({ card, i }) => (
                <div key={card.id} className={styles.shelfCard}>
                  <CardTile
                    design={card}
                    chosen={card.id === chosen}
                    label={`${card.caption}, ${i + 1} of ${count}`}
                    captionClass={`line-clamp-2 text-[13px] font-medium leading-[18px] text-[#374151] [@media(prefers-color-scheme:dark)]:text-app-text-secondary`}
                    onOpen={() => onOpen(card.id, shelf)}
                  />
                </div>
              ))}
              {count > SHELF_MAX ? (
                <div className="p-1">
                  <button
                    type="button"
                    data-testid={`shelfSeeAll.${shelf.id}`}
                    onClick={() => onAll(shelf)}
                    className={`${styles.more} flex items-center justify-center rounded-[4px] border border-dashed border-[#cdbfa6] bg-[#fffdf8] text-[15px] font-semibold ${WAX_TEXT} transition hover:bg-[#f5efe3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b1d1d] [@media(prefers-color-scheme:dark)]:bg-app-surface`}
                  >
                    See all {count}
                  </button>
                </div>
              ) : null}
            </Row>
          </section>
        );
      })}
    </div>
  );
}

const shelfAnchor = (id: string) => `card-shelf-${id}`;

/** A shelf's row: its first 10 cards, and the chosen card after them when it's further on, so it shows ticked there. */
function shelfCards(shelf: Shelf, chosen: string | null): { card: HolidayCardDesign; i: number }[] {
  const row = shelf.cards.slice(0, SHELF_MAX).map((card, i) => ({ card, i }));
  const at = chosen ? shelf.cards.findIndex((card) => card.id === chosen) : -1;
  return at >= SHELF_MAX ? [...row, { card: shelf.cards[at], i: at }] : row;
}
const partAnchor = (i: number) => `card-part-${i}`;

/**
 * A collection's page, inside step 2: its name in the card serif, its line, then all its cards two across (a wider
 * screen adds a column only while every tile stays as wide as a shelf card). With parts (Christmas with Jesus Christ), a
 * row of their names stays under the title as the page scrolls; a tap goes to that part, and the part in view is the
 * wax-red one. It opens at its top, or at the chosen card when it's here.
 */
export function CollectionPage({ shelf, chosen, onOpen }: { shelf: Shelf; chosen: string | null; onOpen: (design: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(shelf.cards.map((card) => [card.id, card])), [shelf]);
  const parts = useMemo(() => {
    const list = (shelf.parts ?? []).map((part) => ({ name: part.name, cards: part.designs.flatMap((id) => byId.get(id) ?? []) })).filter((p) => p.cards.length);
    return list.length ? list : null;
  }, [shelf, byId]);
  const [inView, setInView] = useState(0);
  const count = shelf.cards.length;
  const place = useMemo(() => new Map(shelf.cards.map((card, i) => [card.id, i])), [shelf]);

  useLayoutEffect(() => {
    // A collection's page waits for no other picture.
    openFirst();
    const el = root.current;
    if (!el) return;
    const scroller = scrollerOf(el);
    const tile = chosen ? el.querySelector<HTMLElement>(`[data-card="${chosen}"]`) : null;
    if (tile) tile.scrollIntoView({ block: 'center' });
    else scroller.scrollTop = 0;
    // Only as the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The part in view: the last whose name has passed under the row of parts.
  useEffect(() => {
    const el = root.current;
    if (!el || !parts) return undefined;
    const scroller = scrollerOf(el);
    const target: HTMLElement | Window = scroller === document.scrollingElement ? window : scroller;
    const update = () => {
      const line = (pillsRef.current?.getBoundingClientRect().bottom ?? 0) + 12;
      let now = 0;
      parts.forEach((_, i) => {
        const top = document.getElementById(partAnchor(i))?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) now = i;
      });
      setInView(now);
    };
    update();
    target.addEventListener('scroll', update, { passive: true });
    return () => target.removeEventListener('scroll', update);
  }, [parts]);

  // The part in view's name stays in sight in its row (it scrolls sideways on narrow screens).
  useEffect(() => {
    const row = pillsRef.current;
    const pill = row?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row || !pill) return;
    const box = row.getBoundingClientRect();
    const at = pill.getBoundingClientRect();
    if (at.left < box.left + 16) row.scrollLeft -= box.left + 16 - at.left;
    else if (at.right > box.right - 16) row.scrollLeft += at.right - (box.right - 16);
  }, [inView]);

  const grid = (cards: HolidayCardDesign[]) => (
    <div className={styles.grid}>
      {cards.map((card) => (
        <CardTile
          key={card.id}
          design={card}
          chosen={card.id === chosen}
          label={`${card.caption}, ${(place.get(card.id) ?? 0) + 1} of ${count}`}
          captionClass="text-[13px] font-medium leading-[18px] text-[#374151] [@media(prefers-color-scheme:dark)]:text-app-text-secondary"
          onOpen={() => onOpen(card.id)}
        />
      ))}
    </div>
  );

  return (
    <div ref={root} className={styles.shelves} data-testid={`collectionPage.${shelf.id}`}>
      <h2 className={`mt-1 text-[26px] leading-8 ${INK}`} style={{ fontFamily: SERIF }}>{shelf.name}</h2>
      <p className={`mt-1 text-[14px] leading-5 ${MUTED}`}>{shelf.line}</p>
      {parts ? (
        <>
          <div
            ref={pillsRef}
            data-testid="collectionParts"
            className={`${styles.parts} -mx-4 mt-2 flex gap-2 overflow-x-auto bg-[#f5f0e8] px-4 py-2.5 [scrollbar-width:none] [@media(prefers-color-scheme:dark)]:bg-app [&::-webkit-scrollbar]:hidden`}
          >
            {parts.map((part, i) => (
              <button
                key={part.name}
                type="button"
                aria-current={i === inView ? 'true' : undefined}
                data-testid={`collectionPart.${i}`}
                onClick={() => {
                  setInView(i);
                  const part = document.getElementById(partAnchor(i));
                  if (part && root.current) scrollToStart(part, stuckOf(root.current) + (pillsRef.current?.offsetHeight ?? 0) + 4, true);
                }}
                className={`${PILL} ${i === inView ? PILL_ON : PILL_OFF}`}
              >
                {part.name}
              </button>
            ))}
          </div>
          {parts.map((part, i) => (
            <section key={part.name} id={partAnchor(i)} aria-labelledby={`${partAnchor(i)}-name`} className={`${styles.partLanding} pt-3`}>
              <h3 id={`${partAnchor(i)}-name`} className={`mb-2.5 text-[15px] font-semibold leading-6 ${INK}`}>
                {part.name} <span className={`font-normal ${MUTED}`}>· {part.cards.length} cards</span>
              </h3>
              {grid(part.cards)}
            </section>
          ))}
        </>
      ) : (
        <div className="mt-3">{grid(shelf.cards)}</div>
      )}
    </div>
  );
}

/** The bar comes up from the bottom (no slide with Reduce Motion). */
export const shelvesBarClass = styles.bar;
