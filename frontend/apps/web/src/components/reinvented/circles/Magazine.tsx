'use client';

// A circle's weekly magazine (Pulse, reinvented, phase 3; coord/CONTRACT.md §8d): its week, laid out on read from
// what its people posted that this reader may see. Made by the server each time (nothing stored); opening it marks it
// read for this reader. A tap opens the Moment or post as the reader may open it.

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MomentFace } from '@/components/moments/MomentFace';
import { isSwitchedOff } from '../switchOff';
import { readMagazine, type MagazineItem } from './circlesApi';

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
const before = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};
const href = (it: MagazineItem) => (it.type === 'moment' ? `/app/moments/${encodeURIComponent(it.id)}` : `/app/feed/post/${encodeURIComponent(it.id)}`);

function Item({ it, big = false }: { it: MagazineItem; big?: boolean }) {
  return (
    <Link className="mg-item" data-big={big || undefined} href={href(it)}>
      {it.thumb_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a signed thumbnail from the server
        <img src={it.thumb_url} alt="" loading="lazy" />
      ) : (
        <span className="mg-words">{it.caption || '…'}</span>
      )}
      <span className="mg-by">
        <MomentFace author={it.author} />
        <span>
          <strong>{it.author?.name}</strong>
          {it.caption && it.thumb_url && <span className="mg-caption">{it.caption}</span>}
          {it.ended && <span className="mg-caption">Kept after it faded</span>}
        </span>
      </span>
    </Link>
  );
}

export default function Magazine({ circleId, onBack }: { circleId: string; onBack(): void }) {
  const [weeks, setWeeks] = useState<string[]>([]);
  const week = weeks[weeks.length - 1] ?? null;
  const mag = useQuery({
    queryKey: ['reinvented', 'magazine', circleId, week],
    queryFn: ({ signal }) => readMagazine(circleId, week, signal),
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
  const m = mag.data;
  return (
    <div className="cc-page mg">
      <div className="cc-row">
        <button type="button" className="cc-button" onClick={onBack}>
          Back
        </button>
        {m && (
          <div className="cc-actions">
            {weeks.length < 8 && (
              <button type="button" className="cc-button" onClick={() => setWeeks([...weeks, before(m.week.from)])}>
                An earlier week
              </button>
            )}
            {weeks.length > 0 && (
              <button type="button" className="cc-button" onClick={() => setWeeks(weeks.slice(0, -1))}>
                A later week
              </button>
            )}
          </div>
        )}
      </div>
      {mag.isPending ? (
        <p className="cc-note">Laying out the week…</p>
      ) : mag.isError ? (
        <p className="cc-note">This magazine couldn’t load.</p>
      ) : m ? (
        <>
          <header className="mg-head">
            <p className="mg-kicker">{m.circle.name}</p>
            <h1>
              {day(m.week.from)} to {day(m.week.to)}
            </h1>
            {m.people.length > 0 && (
              <p className="mg-people">
                {m.people.map((p) => (
                  <span key={p.person.id}>
                    <MomentFace author={p.person} /> {p.person.name} · {p.count}
                  </span>
                ))}
              </p>
            )}
          </header>
          {m.empty ? (
            <p className="cc-note">Nothing from this circle that week.</p>
          ) : (
            m.pages.map((page, i) => (
              <section key={i} className="mg-page" data-layout={page.layout}>
                {page.items.map((it, j) => (
                  <Item key={`${it.type}:${it.id}`} it={it} big={page.layout === 'cover' && j === 0} />
                ))}
              </section>
            ))
          )}
        </>
      ) : null}
    </div>
  );
}
