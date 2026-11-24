// /guides: the topic pages and the ten guides, each with its own opening line, and an ItemList of the guides for
// search engines. Static: the list is data (src/lib/site/guides, src/lib/site/topics).

import Link from 'next/link';
import { GUIDES } from '@/lib/site/guides';
import { TOPICS } from '@/lib/site/topics';
import { Breadcrumb, Close, JsonLd, Kicker, Section } from '../_components/parts';
import styles from '../_components/public.module.css';
import { pageMetadata, SITE_URL } from '../_lib/seo';
import { liveHref } from '../_reading/links';
import { unstar } from '../_reading/Prose';
import r from '../_reading/reading.module.css';

const TITLE = 'Guides to your home, its records and plans | Pantopus';
const DESCRIPTION =
  'Plain guides from Pantopus: meals for a family, checking a house before you buy, flood zones, radon, property tax appeals, chores, plans and proof of address.';

export const metadata = pageMetadata({ path: '/guides', title: TITLE, description: DESCRIPTION });

function itemListLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Pantopus guides',
    itemListElement: GUIDES.map((g, i) => ({ '@type': 'ListItem', position: i + 1, name: g.h1, url: `${SITE_URL}/guides/${g.slug}` })),
  };
}

export default function GuidesPage() {
  const topics = TOPICS.flatMap((t) => {
    const href = liveHref(t.path);
    return href ? [{ href, title: unstar(t.h1), label: t.label }] : [];
  });
  return (
    <>
      <header className={styles.hero}>
        <div className={styles.wrap}>
          <div className={r.head}>
            <Breadcrumb
              items={[
                { name: 'Pantopus', path: '/' },
                { name: 'Guides', path: '/guides' },
              ]}
            />
            <Kicker icon="spark">Guides</Kicker>
            <h1 className={styles.h1}>
              Plain guides to <em>the place you live.</em>
            </h1>
            <p className={styles.lede}>
              How to read a property record, find your flood zone, test for radon, share the chores, organize meals for
              someone who needs them, and more. Each guide names its sources and the day they were read.
            </p>
          </div>
        </div>
      </header>

      <Section id="guides" kicker="Guides" title="Read a guide">
        <ul className={r.list}>
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`}>
                <b>{g.h1}</b>
                <span>{g.lede}</span>
              </Link>
            </li>
          ))}
        </ul>
        <JsonLd data={itemListLd()} />
      </Section>

      {topics.length ? (
        <Section id="topics" kicker="Topics" title="Start from what you need">
          <ul className={r.list}>
            {topics.map((t) => (
              <li key={t.href}>
                <Link href={t.href}>
                  <b>{t.label}</b>
                  <span>{t.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Close title={<>Pantopus starts with your home.</>} text="Start with your address, or get the app." route="guide:index" />
    </>
  );
}
