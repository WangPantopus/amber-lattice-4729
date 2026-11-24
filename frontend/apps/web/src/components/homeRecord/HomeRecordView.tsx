'use client';

/* eslint-disable @next/next/no-img-element */
// The server's image of the block comes from our own API (`/api/public/home-record/aerial.jpg`), already sized.

// "This home's record" / "Your home's record": the server draws the page as blocks (docs/product/home-record), this
// draws each block in the web's own tokens and skips a kind it doesn't know. Every word comes from the server.

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, BarChart3, Bell, Check, EyeOff, FileText, History, Home, Image as ImageIcon, Landmark, Layers, Lock, Mail,
  Percent, ShieldCheck, Tag, TrendingUp, Wrench, type LucideIcon,
} from 'lucide-react';
import type * as api from '@pantopus/api';

type Record_ = api.homeRecord.HomeRecord;
type Block = api.homeRecord.HomeRecordBlock;
type Chip = api.homeRecord.HomeRecordChip;
type Tone = api.homeRecord.HomeRecordTone;

const ICONS: Record<string, LucideIcon> = {
  history: History, trend: TrendingUp, tag: Tag, bank: Landmark, bars: BarChart3, shield: ShieldCheck, image: ImageIcon,
  wrench: Wrench, bell: Bell, layers: Layers, home: Home, alert: AlertTriangle, file: FileText, mail: Mail, percent: Percent,
  eye_off: EyeOff,
};
const iconFor = (name: string) => ICONS[name] || FileText;

const CHIP_CLASSES: Record<Chip['tone'], string> = {
  success: 'bg-app-success-bg text-app-success',
  warning: 'bg-app-warning-bg text-app-warning',
  neutral: 'bg-app-surface-sunken text-app-text-secondary',
};
const TONE_TEXT: Record<Tone, string> = { low: 'text-app-success', mid: 'text-app-warning', high: 'text-app-error' };
const TONE_FILL: Record<Tone, string> = { low: 'bg-app-success-solid', mid: 'bg-app-warning-solid', high: 'bg-app-error-solid' };

const card = 'bg-app-surface border border-app-border rounded-2xl shadow-sm';
const label = 'text-[11px] leading-4 font-semibold uppercase tracking-[0.08em] text-app-text-secondary';
const small = 'text-[12.5px] leading-[18px] text-app-text-secondary';

/**
 * Opens a block's link: an https page in a new tab, one of our own pages in place. `onAppLink` may take an app link the
 * page handles itself (the lookup's id-less claim links) and return true.
 */
function RecordLink({ link, className, children, onAppLink, testId }: {
  link: api.homeRecord.HomeRecordLink | { label: string; url: string };
  className: string;
  children?: ReactNode;
  onAppLink?: (url: string) => boolean;
  testId?: string;
}) {
  const text = children ?? link.label;
  if (/^https:\/\//.test(link.url)) {
    return <a href={link.url} target="_blank" rel="noopener noreferrer" className={className} data-testid={testId}>{text}</a>;
  }
  if (onAppLink) {
    return (
      <button type="button" className={className} data-testid={testId}
        onClick={(event) => { if (!onAppLink(link.url)) window.location.assign(webPathFor(link.url)); event.preventDefault(); }}>
        {text}
      </button>
    );
  }
  return <Link href={webPathFor(link.url)} className={className} data-testid={testId}>{text}</Link>;
}

/** An app link as a web page: `/homes/…` notification-style links live under `/app` on web. */
export function webPathFor(url: string): string {
  if (url.startsWith('/homes/')) return `/app${url}`;
  return url;
}

function ChipView({ chip, testId, mark = false }: { chip: Chip; testId?: string; mark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${CHIP_CLASSES[chip.tone] || CHIP_CLASSES.neutral}`} data-testid={testId}>
      {mark && chip.tone === 'success' ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" /> : null}
      {chip.text}
    </span>
  );
}

function Outline({ outline }: { outline: api.homeRecord.HomeRecordOutline }) {
  const points = outline.map(([x, y]) => `${(x * 1000).toFixed(1)},${(y * 1000).toFixed(1)}`).join(' ');
  return (
    <svg aria-hidden="true" viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      <polygon points={points} fill="none" stroke="#ffffff" strokeWidth={9} vectorEffect="non-scaling-stroke" />
      <polygon points={points} fill="none" stroke="#15803d" strokeWidth={4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function PictureView({ block }: { block: api.homeRecord.PictureBlock }) {
  // The web has no street picture yet (Apple's web key is the founder's step), so it shows the photo from above only.
  if (!block.above) return null;
  const { above } = block;
  return (
    <section className={`${card} p-3 flex flex-col gap-3`} data-testid="home-record-picture">
      <div className="relative overflow-hidden rounded-xl bg-app-surface-sunken" style={{ aspectRatio: '800 / 523' }}>
        <img src={above.image_url} alt={block.caption || 'Photo from above of the block around this home'} className="block h-full w-full object-cover" />
        {above.outline?.length ? <Outline outline={above.outline} /> : null}
        {above.chips.map((chip) => (
          <span key={chip.at} className={`absolute bottom-2.5 ${chip.at === 'bl' ? 'left-2.5 bg-white text-gray-900' : 'right-2.5 bg-gray-900 text-white'} rounded-full px-2.5 py-1 text-xs font-semibold shadow`}>{chip.text}</span>
        ))}
      </div>
      {block.caption ? <p className={`${small} mx-1`}>{block.caption}</p> : null}
    </section>
  );
}

function FactsView({ block }: { block: api.homeRecord.FactsBlock }) {
  return (
    <section className={`${card} p-4 flex flex-col gap-3`} data-testid="home-record-facts">
      {block.tiles.length ? (
        <div className="grid grid-cols-3 gap-2">
          {block.tiles.map((tile) => (
            <div key={tile.label} className="rounded-xl bg-app-surface-muted px-2.5 py-3 flex flex-col gap-0.5 min-w-0">
              <span className={label}>{tile.label}</span>
              <span className="text-[22px] leading-7 font-bold -tracking-[0.015em] text-app-text">
                {tile.value}{tile.unit ? <span className="ml-1 text-[13px] font-medium text-app-text-secondary">{tile.unit}</span> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {block.line ? <p className="text-sm text-app-text-strong">{block.line}</p> : null}
      {block.source ? <p className="text-xs text-app-text-secondary">{block.source}</p> : null}
    </section>
  );
}

function Meter({ level, tone }: { level: number; tone: Tone }) {
  return (
    <span aria-hidden="true" className="flex gap-[3px]">
      {[1, 2, 3, 4, 5].map((step) => <span key={step} className={`h-2 w-4 rounded-[3px] ${step <= level ? TONE_FILL[tone] : 'bg-app-border'}`} />)}
    </span>
  );
}

function MetersView({ block }: { block: api.homeRecord.MetersBlock }) {
  return (
    <section data-testid="home-record-meters">
      <h2 className={`${label} mx-1 mt-2 mb-2.5`}>{block.title}</h2>
      <div className={`${card} px-4 pt-1.5 pb-3.5`}>
        {block.groups.map((group) => (
          <div key={group.title}>
            <h3 className="mt-3 mb-0.5 text-[13px] leading-[18px] font-semibold text-app-text-strong">{group.title}</h3>
            {group.rows.map((row) => (
              <div key={row.label} className="flex min-h-11 items-center gap-2.5 border-b border-app-border-subtle py-1.5">
                <span className="w-[104px] shrink-0 text-sm font-medium text-app-text">{row.label}</span>
                <Meter level={row.level} tone={row.tone} />
                <span className={`flex-1 text-right text-[13px] leading-[18px] font-semibold ${TONE_TEXT[row.tone] || ''}`}>
                  <span className="sr-only">{`${row.level} of 5: `}</span>{row.word}
                </span>
              </div>
            ))}
          </div>
        ))}
        {block.note ? <p className="mt-3 text-xs text-app-text-secondary">{block.note}</p> : null}
      </div>
    </section>
  );
}

function ClosedGroupView({ block }: { block: api.homeRecord.ClosedGroupBlock }) {
  return (
    <section className={`${card} px-3.5 pt-1 pb-1.5`} data-testid={`home-record-${block.id}`}>
      <div className="flex min-h-12 items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold -tracking-[0.01em] text-app-text">{block.title}</h3>
        {block.chip ? <span className="inline-flex items-center gap-1 rounded-full bg-app-info-bg px-2.5 py-0.5 text-xs font-semibold text-app-info"><Lock className="h-3 w-3" aria-hidden="true" />{block.chip}</span> : null}
      </div>
      {block.items.map((item) => {
        const Icon = iconFor(item.icon);
        return (
          <div key={item.title} className="flex min-h-14 items-center gap-3 border-t border-app-border-subtle py-2">
            <span aria-hidden="true" className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-app-success-bg text-app-success"><Icon className="h-4 w-4" /></span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[14.5px] leading-5 font-semibold -tracking-[0.01em] text-app-text">{item.title}</span>
              <span className={small}>{item.line}</span>
            </span>
          </div>
        );
      })}
    </section>
  );
}

function PromiseView({ block, onAppLink }: { block: api.homeRecord.PromiseBlock; onAppLink?: (url: string) => boolean }) {
  return (
    <section className={`${card} p-5 flex flex-col gap-4`} data-testid="home-record-promise">
      <div>
        <h2 className="text-[19px] leading-6 font-bold -tracking-[0.015em] text-app-text">{block.title}</h2>
        <p className="mt-1.5 text-sm text-app-text-secondary">{block.body}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {block.steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">{i + 1}</span>
            <span className="flex flex-col">
              <span className="text-[14.5px] font-semibold text-app-text">{step.title}</span>
              <span className={small}>{step.line}</span>
            </span>
          </li>
        ))}
      </ol>
      <RecordLink link={block.button} onAppLink={onAppLink} testId="home-record-promise-button"
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-[15px] font-semibold text-white hover:bg-primary-700" />
      {block.alt ? (
        <p className="text-center text-[13.5px] text-app-text-secondary">
          {block.alt.lead}{' '}
          <RecordLink link={block.alt} onAppLink={onAppLink} testId="home-record-promise-alt" className="font-semibold text-app-link underline-offset-2 hover:underline" />
        </p>
      ) : null}
    </section>
  );
}

function ValueView({ block }: { block: api.homeRecord.ValueBlock }) {
  const top = Math.max(...block.bars.map((bar) => bar.amount), 1);
  return (
    <section className={`${card} p-4 flex flex-col gap-3`} data-testid="home-record-value">
      <div className="flex flex-col gap-1">
        <span className={label}>{block.label}</span>
        <span className="text-[30px] leading-9 font-bold -tracking-[0.02em] text-app-text tabular-nums">{block.value}</span>
        {block.chip ? <span><ChipView chip={block.chip} /></span> : null}
      </div>
      {block.bars.length ? (
        <div className="flex h-[132px] items-end gap-2" role="img" aria-label={block.bars.map((bar) => `${bar.year}: $${bar.amount.toLocaleString('en-US')}`).join(', ')}>
          {block.bars.map((bar, i) => (
            <div key={bar.year} className="flex flex-1 flex-col items-center gap-1">
              <div className={`w-full rounded-t-md ${i === block.bars.length - 1 ? 'bg-primary-600' : 'bg-primary-200 dark:bg-primary-800'}`} style={{ height: `${Math.max(6, Math.round((bar.amount / top) * 110))}px` }} />
              <span className="text-[11px] text-app-text-secondary">{bar.year}</span>
            </div>
          ))}
        </div>
      ) : null}
      {block.source ? <p className="text-xs text-app-text-secondary">{block.source}</p> : null}
      {block.estimate ? (
        <div className="mt-1 border-t border-app-border-subtle pt-3 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold text-app-text-strong">{block.estimate.label}</span>
            <span className="text-[15px] font-semibold text-app-text tabular-nums">{block.estimate.text}</span>
          </div>
          <div aria-hidden="true" className="relative h-2 rounded-full bg-app-surface-sunken">
            <div className="absolute top-0 h-2 rounded-full bg-primary-200 dark:bg-primary-800" style={{ left: `${block.estimate.low * 100}%`, width: `${(block.estimate.high - block.estimate.low) * 100}%` }} />
            <div className="absolute -top-1 h-4 w-1 rounded-full bg-primary-600" style={{ left: `calc(${block.estimate.mark * 100}% - 2px)` }} />
          </div>
          {block.estimate.note ? <p className={small}>{block.estimate.note}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function PhotoYearsView({ block }: { block: api.homeRecord.PhotoYearsBlock }) {
  // Newest last: it shows large first, and each year is a button.
  const [shown, setShown] = useState(block.photos.length - 1);
  const photo = block.photos[Math.min(shown, block.photos.length - 1)];
  if (!photo) return null;
  return (
    <section className={`${card} p-3 flex flex-col gap-3`} data-testid="home-record-photo-years">
      <div className="mx-1 flex items-baseline justify-between"><h2 className="text-[15px] font-semibold text-app-text">{block.title}</h2>{block.count ? <span className={small}>{block.count}</span> : null}</div>
      <div className="relative overflow-hidden rounded-xl bg-app-surface-sunken" style={{ aspectRatio: '800 / 523' }}>
        <img key={photo.image_url} src={photo.image_url} alt={`Photo from above, ${photo.label}`} className="block h-full w-full object-cover" />
        {photo.outline?.length ? <Outline outline={photo.outline} /> : null}
        <span className="absolute bottom-2.5 right-2.5 rounded-full bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white">{photo.label}</span>
      </div>
      {block.photos.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Survey years">
          {block.photos.map((each, i) => (
            <button key={each.image_url} type="button" aria-pressed={i === shown} onClick={() => setShown(i)}
              className={`min-h-9 rounded-lg px-3 text-[13px] font-semibold ${i === shown ? 'bg-primary-600 text-white' : 'bg-app-surface-muted text-app-text-strong hover:bg-app-hover'}`}>
              {each.year}
            </button>
          ))}
        </div>
      ) : null}
      {block.note ? <p className={`${small} mx-1`}>{block.note}</p> : null}
    </section>
  );
}

function TimelineView({ block }: { block: api.homeRecord.TimelineBlock }) {
  return (
    <section className={`${card} px-4 py-3`} data-testid={`home-record-${block.id}`}>
      <h2 className="mb-1 text-[15px] font-semibold text-app-text">{block.title}</h2>
      <ol>
        {block.items.map((item, i) => (
          <li key={`${item.title}-${i}`} className="flex items-start justify-between gap-3 border-t border-app-border-subtle py-2.5 first:border-t-0">
            <span className="flex flex-col">
              <span className={`text-[14px] ${item.strong ? 'font-semibold text-app-text' : 'font-medium text-app-text-strong'}`}>{item.title}</span>
              <span className={small}>{[item.line, item.mono].filter(Boolean).join(' · ')}</span>
            </span>
            {item.right ? <span className={`text-[14px] tabular-nums ${item.strong ? 'font-semibold text-app-text' : 'text-app-text-secondary'}`}>{item.right}</span> : null}
          </li>
        ))}
      </ol>
      {block.note ? <p className={`${small} mt-1`}>{block.note}</p> : null}
    </section>
  );
}

function NoticeView({ block }: { block: api.homeRecord.NoticeBlock }) {
  return (
    <section className="rounded-2xl border border-app-info-light bg-app-info-bg px-4 py-3" data-testid={`home-record-${block.id}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-app-info">{block.eyebrow}</span>
      <p className="mt-0.5 text-[15px] font-semibold text-app-text">{block.title}</p>
      {block.line ? <p className={small}>{block.line}</p> : null}
    </section>
  );
}

function RowsView({ block, onAppLink }: { block: api.homeRecord.RowsBlock; onAppLink?: (url: string) => boolean }) {
  return (
    <section className={`${card} px-4 py-3`} data-testid={`home-record-${block.id}`}>
      <h2 className="text-[15px] font-semibold text-app-text">{block.title}</h2>
      {block.lead ? <p className={`${small} mt-1`}>{block.lead}</p> : null}
      <dl className="mt-1.5">
        {block.rows.map((row, i) => (
          <div key={`${row.label}-${i}`} className="flex items-center justify-between gap-4 border-t border-app-border-subtle py-2.5 first:border-t-0">
            <dt className="text-[13.5px] text-app-text-strong">{row.label}</dt>
            <dd className="flex items-center gap-2 text-right">
              {row.value ? <span className={`text-[13.5px] font-semibold text-app-text tabular-nums ${row.mono ? 'font-mono' : ''}`}>{row.value}</span> : null}
              {row.chip ? <ChipView chip={row.chip} /> : null}
            </dd>
          </div>
        ))}
      </dl>
      {block.note ? <p className={`${small} mt-1`}>{block.note}</p> : null}
      {block.action ? <RecordLink link={block.action} onAppLink={onAppLink} className="mt-2 inline-block text-[13.5px] font-semibold text-app-link hover:underline" /> : null}
    </section>
  );
}

function TilesView({ block }: { block: api.homeRecord.TilesBlock }) {
  return (
    <section className={`${card} p-4 flex flex-col gap-3`} data-testid={`home-record-${block.id}`}>
      <h2 className="text-[15px] font-semibold text-app-text">{block.title}</h2>
      <div className="grid grid-cols-2 gap-2">
        {block.tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl bg-app-surface-muted px-3 py-2.5">
            <span className={label}>{tile.label}</span>
            <p className="text-lg font-bold text-app-text">{tile.value}</p>
            {tile.line ? <p className={small}>{tile.line}</p> : null}
          </div>
        ))}
      </div>
      {block.rows.length ? (
        <dl>
          {block.rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 border-t border-app-border-subtle py-2"><dt className="text-[13.5px] text-app-text-strong">{row.label}</dt><dd className="text-[13.5px] font-semibold text-app-text">{row.value}</dd></div>
          ))}
        </dl>
      ) : null}
      {block.note ? <p className={small}>{block.note}</p> : null}
    </section>
  );
}

function BarsView({ block }: { block: api.homeRecord.BarsBlock }) {
  return (
    <section className={`${card} px-4 py-3`} data-testid={`home-record-${block.id}`}>
      <h2 className="mb-1 text-[15px] font-semibold text-app-text">{block.title}</h2>
      {block.items.map((item) => (
        <div key={item.title} className="border-t border-app-border-subtle py-2.5 first:border-t-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-semibold text-app-text">{item.title}</span>
            {item.right ? <span className={`text-[13px] font-semibold ${TONE_TEXT[item.tone] || ''}`}>{item.right}</span> : null}
          </div>
          <div aria-hidden="true" className="mt-1.5 h-1.5 rounded-full bg-app-surface-sunken">
            <div className={`h-1.5 rounded-full ${TONE_FILL[item.tone] || TONE_FILL.low}`} style={{ width: `${Math.round(Math.max(0, Math.min(1, item.fill)) * 100)}%` }} />
          </div>
          {item.line ? <p className={`${small} mt-1`}>{item.line}</p> : null}
        </div>
      ))}
      {block.note ? <p className={`${small} mt-1`}>{block.note}</p> : null}
    </section>
  );
}

function CardView({ block, onAppLink }: { block: api.homeRecord.CardBlock; onAppLink?: (url: string) => boolean }) {
  return (
    <section className={`${card} p-[18px]`} data-testid={`home-record-${block.id}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[15.5px] font-semibold text-app-text">{block.title}</h2>
        {block.chip ? <ChipView chip={block.chip} /> : null}
      </div>
      {block.lead ? <p className="mt-2 text-[13.5px] leading-5 text-app-text-strong">{block.lead}</p> : null}
      {block.rows.length ? (
        <dl className="mt-3 rounded-[11px] border border-app-border-subtle bg-app-surface-muted px-3.5 py-2">
          {block.rows.map((row) => (
            <div key={row.id} className="flex items-baseline justify-between gap-4 py-1">
              <dt className="text-[13px] text-app-text-secondary">{row.label}</dt>
              <dd className="text-right text-[13px] font-semibold text-app-text tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {block.notes.map((note) => <p key={note} className={`${small} mt-2.5`}>{note}</p>)}
      {block.source ? <p className={`${small} mt-2`}>{block.source}</p> : null}
      {block.action ? <RecordLink link={block.action} onAppLink={onAppLink} className="mt-3 inline-block text-[13.5px] font-semibold text-app-link hover:underline" /> : null}
    </section>
  );
}

function BlockView({ block, onAppLink }: { block: Record_['blocks'][number]; onAppLink?: (url: string) => boolean }) {
  const known = block as Block;
  switch (known.kind) {
    case 'picture': return <PictureView block={known} />;
    case 'facts': return <FactsView block={known} />;
    case 'meters': return <MetersView block={known} />;
    case 'intro': return (
      <div className="mx-1 mt-4 flex flex-col gap-1.5" data-testid="home-record-intro">
        <h2 className="text-[22px] leading-7 font-bold -tracking-[0.015em] text-app-text">{known.title}</h2>
        <p className="text-sm text-app-text-secondary">{known.body}</p>
      </div>
    );
    case 'closed_group': return <ClosedGroupView block={known} />;
    case 'promise': return <PromiseView block={known} onAppLink={onAppLink} />;
    case 'note': {
      const Icon = iconFor(known.icon);
      return <p className="mx-1 flex gap-2 text-[13px] leading-5 text-app-text-secondary" data-testid={`home-record-${known.id}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{known.text}</p>;
    }
    case 'section_label': return <h2 className={`${label} mx-1 mt-4`}>{known.text}</h2>;
    case 'value': return <ValueView block={known} />;
    case 'photo_years': return <PhotoYearsView block={known} />;
    case 'timeline': return <TimelineView block={known} />;
    case 'notice': return <NoticeView block={known} />;
    case 'rows': return <RowsView block={known} onAppLink={onAppLink} />;
    case 'tiles': return <TilesView block={known} />;
    case 'bars': return <BarsView block={known} />;
    case 'card': return <CardView block={known} onAppLink={onAppLink} />;
    // A kind this build doesn't know: skipped, so a later piece never breaks the page.
    default: return null;
  }
}

/** The whole record: header, blocks in order, footer. */
export default function HomeRecordView({ record, onAppLink }: { record: Record_; onAppLink?: (url: string) => boolean }) {
  return (
    <article className="flex flex-col gap-3" data-testid="home-record" data-state={record.state}>
      <header className="mb-1 flex flex-col gap-2">
        {record.header.chip ? (
          <span className="self-start"><ChipView chip={record.header.chip} testId="home-record-chip" mark /></span>
        ) : null}
        <h1 className="text-[28px] leading-8 font-bold -tracking-[0.02em] text-app-text">{record.header.title}</h1>
        {record.header.subtitle ? <p className="text-[15px] leading-[21px] text-app-text-secondary">{record.header.subtitle}</p> : null}
      </header>
      {record.blocks.map((block) => <BlockView key={`${block.kind}:${block.id}`} block={block} onAppLink={onAppLink} />)}
      {record.footer ? <p className="mx-1 mt-3 text-xs text-app-text-secondary">{record.footer}</p> : null}
    </article>
  );
}
