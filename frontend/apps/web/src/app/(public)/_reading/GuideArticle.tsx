// One guide's page, from its data (src/lib/site/guides): the head with the dates, the guide itself, its sources with the
// day each was read, the questions people ask, more to read, and the close with the address box and the app. Its
// Article, BreadcrumbList and FAQPage structured data are built from the same objects the page draws.

import Link from 'next/link';
import { dateWords, type Guide } from '@/lib/site/guides';
import { Breadcrumb, Close, Deeper, JsonLd, Kicker, Questions, Section } from '../_components/parts';
import styles from '../_components/public.module.css';
import { SITE_URL } from '../_lib/seo';
import { liveHref, linkCards } from './links';
import { anchorOf, Blocks } from './Prose';
import r from './reading.module.css';

export const guidePath = (g: Guide) => `/guides/${g.slug}`;

/** Article: publisher Pantopus, the date written and the date every fact was last checked. */
function articleLd(g: Guide) {
  const url = `${SITE_URL}${guidePath(g)}`;
  const pantopus = { '@type': 'Organization', name: 'Pantopus', url: SITE_URL };
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: g.h1,
    description: g.description,
    url,
    mainEntityOfPage: url,
    // The page's own share card lives at a hashed address Next picks at build time; this is the picture it is drawn on.
    image: { '@type': 'ImageObject', url: `${SITE_URL}/home/og-earth.jpg`, width: 1200, height: 630 },
    inLanguage: 'en-US',
    datePublished: g.written,
    dateModified: g.checked,
    author: pantopus,
    publisher: { ...pantopus, logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon-512.png`, width: 512, height: 512 } },
    ...(g.sources.length ? { citation: g.sources.map((s) => ({ '@type': 'WebPage', name: `${s.publisher}: ${s.title}`, url: s.url })) } : {}),
  };
}

export default function GuideArticle({ g }: { g: Guide }) {
  const cta = liveHref(g.pantopus.href);
  return (
    <>
      <header className={styles.hero}>
        <div className={styles.wrap}>
          <div className={r.head}>
            <Breadcrumb
              items={[
                { name: 'Pantopus', path: '/' },
                { name: 'Guides', path: '/guides' },
                { name: g.h1, path: guidePath(g) },
              ]}
            />
            <Kicker icon="spark">Guide</Kicker>
            <h1 className={styles.h1}>{g.h1}</h1>
            <p className={styles.lede}>{g.lede}</p>
            <p className={r.meta}>
              <span>
                Written <time dateTime={g.written}>{dateWords(g.written)}</time>
              </span>
              <span>
                Facts last checked <time dateTime={g.checked}>{dateWords(g.checked)}</time>
              </span>
              <span>By Pantopus</span>
            </p>
          </div>
        </div>
      </header>

      <article className={r.article} aria-label={g.h1}>
        <div className={styles.wrap}>
          <div className={r.column}>
            {g.sections.map((s) => (
              <section key={s.h2} aria-labelledby={anchorOf(s.h2)}>
                <h2 id={anchorOf(s.h2)}>{s.h2}</h2>
                <Blocks blocks={s.blocks} />
              </section>
            ))}
            {cta ? (
              <Link className={r.cta} href={cta}>
                {g.pantopus.label}
              </Link>
            ) : null}
            {g.notAdvice ? <p className={r.note}>{g.notAdvice}</p> : null}
          </div>
        </div>
      </article>

      {g.sources.length ? (
        <Section id="sources" kicker="Sources" title="Where these facts come from" intro="Each page was read on the day shown. Agencies change their pages, so check the source before you rely on a date or a deadline.">
          <ul className={r.sourceList}>
            {g.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} rel="noopener">
                  {s.publisher}: {s.title}
                </a>
                <span>Read {dateWords(s.read)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section id="questions" kicker="Questions people ask" title="Questions people ask">
        <Questions items={g.questions} />
      </Section>

      <Section id="keep-reading" kicker="Keep reading" title="Keep reading">
        <Deeper items={linkCards(g.related)} />
      </Section>

      <Close title={g.pantopus.title} text={g.pantopus.text} route={`guide:${g.slug}`} />
      <JsonLd data={articleLd(g)} />
    </>
  );
}
