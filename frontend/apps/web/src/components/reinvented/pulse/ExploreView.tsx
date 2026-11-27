'use client';

// Explore (Pulse, reinvented, phase 1 piece 10, board B10; coord/CONTRACT.md §6f): "Today, elsewhere", up to ten picked
// a day by how many different people marked each (never by watch time), then the newest with variety, pausing with
// "Keep exploring?" instead of running on. Every card answers "Why am I seeing this?". Only Moments their makers chose
// to show anywhere are here, and never one from the reader's own town (the server decides all of it).

import { useState } from 'react';
import Link from 'next/link';
import { Compass } from 'lucide-react';
import MomentRow from './MomentRow';
import { EXPLORE_RULES_PATH } from './ReachDial';
import type { ExploreItem, Point } from './listApi';

interface Props {
  picked: ExploreItem[];
  items: ExploreItem[];
  pause: string | null;
  loading: boolean;
  more: boolean;
  now: number;
  onMore(): void;
  onOpen(id: string): void;
  onPlace(point: Point): void;
}

function Why({ why }: { why: string }) {
  const [open, setOpen] = useState(false);
  return (
    <p className="rp-why">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Why am I seeing this?
      </button>
      {open && <span role="status">{why}</span>}
    </p>
  );
}

export default function ExploreView({ picked, items, pause, loading, more, now, onMore, onOpen, onPlace }: Props) {
  const card = (item: ExploreItem) => (
    <li key={item.id}>
      <MomentRow moment={item.moment} bandLabel={null} now={now} onOpen={onOpen} onPlace={onPlace} />
      <Why why={item.why} />
    </li>
  );
  return (
    <div className="rp-explore">
      {picked.length > 0 && (
        <section aria-labelledby="rp-explore-picked">
          <header className="rp-explore-head">
            <div>
              <h2 id="rp-explore-picked">Today, elsewhere</h2>
              <p>Picked by how many people marked each. Shown anywhere only by their makers’ choice.</p>
            </div>
            <Link href={EXPLORE_RULES_PATH}>How these are picked</Link>
          </header>
          <ol className="rp-items">{picked.map(card)}</ol>
        </section>
      )}
      {items.length > 0 && (
        <section aria-labelledby="rp-explore-new">
          <header className="rp-explore-head">
            <div>
              <h2 id="rp-explore-new">Newest elsewhere</h2>
              <p>Newest first, never two in a row from one person or one town.</p>
            </div>
            {picked.length === 0 && <Link href={EXPLORE_RULES_PATH}>How this works</Link>}
          </header>
          <ol className="rp-items">{items.map(card)}</ol>
        </section>
      )}
      {picked.length === 0 && items.length === 0 && !loading && (
        <div className="rp-empty">
          <Compass size={28} aria-hidden />
          <p>Nothing from elsewhere right now. Moments show here when their makers choose “Also show in Explore”.</p>
          <Link className="rp-button rp-button-quiet" href={EXPLORE_RULES_PATH}>
            See the rules
          </Link>
        </div>
      )}
      {loading ? (
        <p className="rp-muted rp-center">Loading…</p>
      ) : more && pause ? (
        <div className="rp-explore-pause">
          <button type="button" className="rp-button" onClick={onMore}>
            {pause}
          </button>
        </div>
      ) : (
        (picked.length > 0 || items.length > 0) && <p className="rp-end">That’s everything from elsewhere for now.</p>
      )}
    </div>
  );
}
