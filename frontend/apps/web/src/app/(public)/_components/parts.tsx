// ─────────────────────────────────────────────────────────────────────────────
// The public pages' parts, for the pillar pages (PillarPage.tsx) and the topic pages and guides that reuse this
// shell. All server components: their words are in the HTML. The two client parts are the address box
// (PillarLookup) and the film clip (PillarClip).
//
// Use them inside (public)/**, whose layout supplies the fonts, the colours, the icons, the top bar and the footer:
//   <Breadcrumb items={[{ name: 'Pantopus', path: '/' }, { name: 'Place', path: '/place' }]} />
//   <Section id="questions" kicker="Questions people ask" title="…"><Questions items={QUESTIONS} /></Section>
// Questions and Breadcrumb print their own structured data (FAQPage, BreadcrumbList) from the same array they draw.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL } from '@pantopus/utils';
import { Icon, type IconName } from '../../_components/HomeIcons';
import { PILLARS, isListed, pillarHref, type PillarKey } from '../_lib/pillars';
import { breadcrumbLd, faqLd, jsonLd, type Crumb, type Question } from '../_lib/seo';
import PillarLookup from './PillarLookup';
import styles from './public.module.css';

export { PillarLookup };
export { default as PillarClip } from './PillarClip';

/** Structured data, escaped. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}

/** Pantopus / Place, with its BreadcrumbList. The last item is this page. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className={styles.crumbs} aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) =>
          i === items.length - 1 ? (
            <li key={item.path} aria-current="page">
              {item.name}
            </li>
          ) : (
            <li key={item.path}>
              <Link href={item.path}>{item.name}</Link>
            </li>
          ),
        )}
      </ol>
      <JsonLd data={breadcrumbLd(items)} />
    </nav>
  );
}

/** A kicker in the homepage's mono capitals, with an optional icon. */
export function Kicker({ icon, children }: { icon?: IconName; children: ReactNode }) {
  return (
    <span className={styles.kicker}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </span>
  );
}

/** One reading section: a kicker, an h2 (the question people type) and an optional intro, then its content. */
export function Section({ id, kicker, icon, title, intro, children }: { id: string; kicker: string; icon?: IconName; title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.wrap}>
        <div className={styles.sectionHead}>
          <Kicker icon={icon}>{kicker}</Kicker>
          <h2 id={`${id}-title`} className={styles.h2}>
            {title}
          </h2>
          {intro ? <p className={styles.intro}>{intro}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

export interface Glance {
  value: string;
  label: string;
}

/** A row of plain facts under the page's head. */
export function AtAGlance({ items }: { items: Glance[] }) {
  return (
    <div className={styles.glance}>
      {items.map((g) => (
        <div key={g.value}>
          <b>{g.value}</b>
          <span>{g.label}</span>
        </div>
      ))}
    </div>
  );
}

/** "On this page": a link to each section, wrapping on a phone (never a sideways scroll). */
export function OnThisPage({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav className={styles.toc} aria-label="On this page">
      <span>On this page</span>
      {items.map((item) => (
        <a key={item.id} href={`#${item.id}`}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export interface Feature {
  /** The homepage's line, as written. */
  text: string;
  /** What it is, from the code: one or two sentences. Left out where the code says no more than the line. */
  small?: string;
}

export interface FeatureGroup {
  title: string;
  /** Drawn in blue, as on the homepage: what businesses get. */
  biz?: boolean;
  items: Feature[];
}

/** "What you can do": the homepage's groups for the area, each line with what it is underneath. */
export function FeatureGroups({ groups }: { groups: FeatureGroup[] }) {
  return (
    <div className={styles.groups}>
      {groups.map((g) => (
        <div key={g.title} className={g.biz ? `${styles.group} ${styles.biz}` : styles.group}>
          <h3>{g.title}</h3>
          <ul className={styles.items}>
            {g.items.map((item) => (
              <li key={item.text}>
                <b>{item.text}</b>
                {item.small ? <span>{item.small}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export interface Step {
  title: string;
  text: string;
}

/** "How it works": numbered steps. */
export function Steps({ items }: { items: Step[] }) {
  return (
    <ol className={styles.steps}>
      {items.map((s) => (
        <li key={s.title} className={styles.step}>
          <h3>{s.title}</h3>
          <p>{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

export interface Assurance {
  title: string;
  text: string;
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/** "Your privacy here": one line set large (a quote of the app's own words), and what others see and don't. */
export function Privacy({ id = 'privacy', title, quote, items }: { id?: string; title: ReactNode; quote: string; items: Assurance[] }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.wrap}>
        <div className={styles.privacy}>
          <div className={styles.sectionHead} style={{ marginBottom: 0 }}>
            <Kicker icon="shield">Your privacy here</Kicker>
            <h2 id={`${id}-title`} className={styles.h2}>
              {title}
            </h2>
            <blockquote className={styles.quote}>{quote}</blockquote>
          </div>
          <ul className={styles.checks}>
            {items.map((a) => (
              <li key={a.title}>
                <Check />
                <span>
                  <b>{a.title}</b> {a.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Named sources, each with what it gives. */
export function Sources({ items }: { items: { name: string; gives: string }[] }) {
  return (
    <ul className={styles.sources}>
      {items.map((s) => (
        <li key={s.name} className={styles.source}>
          <b>{s.name}</b>
          <span>{s.gives}</span>
        </li>
      ))}
    </ul>
  );
}

export interface DeeperLink {
  href: string;
  label: string;
  text: string;
  /** A pillar, topic or guide page that may not be live yet: drawn only once src/lib/site lists it. */
  listed?: boolean;
}

/** The links that can be drawn today. */
export function liveLinks(items: DeeperLink[]): DeeperLink[] {
  return items.filter((d) => !d.listed || isListed(d.href));
}

/** Links to the deeper pages of the area. */
export function Deeper({ items }: { items: DeeperLink[] }) {
  return (
    <ul className={styles.deeper}>
      {liveLinks(items).map((d) => (
        <li key={d.href}>
          <Link className={styles.deeperLink} href={d.href}>
            <b>{d.label}</b>
            <span>{d.text}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Questions people ask": every question visible, and the FAQPage data built from the same array. */
export function Questions({ items }: { items: Question[] }) {
  return (
    <>
      <div className={styles.questions}>
        {items.map((item) => (
          <div key={item.q} className={styles.question}>
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}
      </div>
      <JsonLd data={faqLd(items)} />
    </>
  );
}

/** "More of Pantopus": the pillars, the closest first, each to its page (or its homepage section until the page is
 *  live). A pillar page passes `current` to leave itself out; a topic page or guide can list every pillar. */
export function MorePillars({ current, order = [] }: { current?: PillarKey; order?: PillarKey[] }) {
  const keys = [...order, ...PILLARS.map((p) => p.key).filter((k) => !order.includes(k))];
  const list = keys.map((k) => PILLARS.find((p) => p.key === k)).filter((p) => p && p.key !== current);
  return (
    <ul className={styles.pillars}>
      {list.map((p) => {
        if (!p) return null;
        const href = pillarHref(p);
        if (!href) return null;
        return (
          <li key={p.key}>
            <Link className={styles.pillarCard} href={href}>
              <Icon name={p.icon} />
              <b>{p.label}</b>
              <span>{p.line}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Both store badges, in the HTML, for any device. */
export function AppButtons({ caption = 'Free on iPhone and Android' }: { caption?: string }) {
  return (
    <div className={styles.apps}>
      <span>{caption}</span>
      <a className={styles.badge} href={IOS_APP_STORE_URL} target="_blank" rel="noopener noreferrer">
        <Image src="/landing/badge-appstore.svg" alt="Download on the App Store" width={132} height={44} />
      </a>
      <a className={styles.badge} href={ANDROID_PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
        <Image src="/landing/badge-playstore.svg" alt="Get it on Google Play" width={148} height={44} />
      </a>
    </div>
  );
}

/** The close: a line set large, the promise, the address box and the app. */
export function Close({ title, route, text }: { title: ReactNode; route: string; text?: string }) {
  return (
    <section className={styles.close} aria-labelledby="close-title">
      <div className={styles.wrap}>
        <div className={styles.closeBox}>
          <h2 id="close-title" className={styles.closeTitle}>
            {title}
          </h2>
          {text ? <p className={styles.intro}>{text}</p> : null}
          <div className={styles.promise}>
            <span>Your address is never sold</span>
            <span>Never used for ads</span>
            <span>Free on iPhone and Android</span>
          </div>
          <PillarLookup route={route} />
          <AppButtons caption="Get the app:" />
        </div>
      </div>
    </section>
  );
}
