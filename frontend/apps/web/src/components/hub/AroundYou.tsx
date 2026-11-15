'use client';

// Today's two halves and the second one's page (founder decision 2026-11-14): "At home" is Today as it was;
// "Around you" lists local headlines, each the outlet's own with a link to the story at the outlet.
import { ExternalLink, Home, Newspaper } from 'lucide-react';
import type { AroundYou, AroundYouItem } from '@pantopus/api';
import { seenAgo, type TodayHalf } from '@/lib/aroundYou';

const HALVES = [['home', 'At home', Home], ['around', 'Around you', Newspaper]] as const;

/** The big two-part switch under Today's title, drawn as Pulse draws List | Map. */
export function TodayHalfSwitch({ half, onChange }: { half: TodayHalf; onChange: (half: TodayHalf) => void }) {
  return (
    <div
      role="group"
      aria-label="Today"
      data-testid="todayHalfToggle"
      className="mb-5 flex gap-1 rounded-full border border-app bg-surface-muted p-1"
    >
      {HALVES.map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={half === key}
          data-testid={`todayHalfSegment_${key}`}
          className={`flex-1 h-10 rounded-full text-[15px] font-bold flex items-center justify-center gap-2 transition ${
            half === key ? 'bg-primary-600 text-white' : 'text-app-muted hover:text-app'
          }`}
        >
          <Icon className="w-[18px] h-[18px]" /> {label}
        </button>
      ))}
    </div>
  );
}

function ItemRow({ item, now }: { item: AroundYouItem; now: number | null }) {
  // A story says when it was first seen; a tip (no link) is not news and carries no time.
  const meta = [item.source, now === null || !item.url ? null : seenAgo(item.seen_at, now)].filter(Boolean).join(' · ');
  const body = (
    <>
      <span className="block text-[15px] font-semibold leading-snug text-app-text">{item.title}</span>
      {meta ? <span className="mt-1 block text-xs text-app-text-secondary">{meta}</span> : null}
    </>
  );
  if (!item.url) {
    return <div className="px-4 py-3" data-testid="aroundYouItem">{body}</div>;
  }
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="aroundYouItem"
      className="flex items-start gap-3 px-4 py-3 transition hover:bg-app-hover"
    >
      <span className="min-w-0 flex-1">{body}</span>
      <ExternalLink className="mt-1 h-4 w-4 flex-shrink-0 text-app-text-muted" aria-hidden />
    </a>
  );
}

/** The Around you page. `now` is null until the page has hydrated, so the server's HTML shows no clock-bound words. */
export function AroundYouPanel({ data, now }: { data: AroundYou; now: number | null }) {
  return (
    <div className="space-y-5" data-testid="aroundYouPanel">
      {data.area ? (
        <p className="px-1 text-sm text-app-text-secondary">
          From local news outlets around {data.area}. Each headline opens the story where it was published.
        </p>
      ) : null}
      {data.sections.map((section) => (
        <section key={section.id} aria-label={section.title} data-testid={`aroundYouSection_${section.id}`}>
          <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-app-text-secondary">{section.title}</h2>
          <div className="divide-y divide-app overflow-hidden rounded-2xl border border-app bg-surface">
            {section.items.map((item) => <ItemRow key={item.id} item={item} now={now} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
