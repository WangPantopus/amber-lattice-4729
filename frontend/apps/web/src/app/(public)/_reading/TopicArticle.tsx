// One topic page (/social-network, /home-buying, /home-management, /home-safety), from its data (src/lib/site/topics):
// the head with the address box or the app, a section per question people type, the questions people ask, more to
// read, every pillar, and the close. Its BreadcrumbList and FAQPage structured data come from the same objects the page draws.

import Link from 'next/link';
import type { TopicPage } from '@/lib/site/topics';
import { AppButtons, Breadcrumb, Close, Deeper, Kicker, MorePillars, OnThisPage, PillarLookup, Questions, Section } from '../_components/parts';
import styles from '../_components/public.module.css';
import { pageMetadata } from '../_lib/seo';
import { liveHref, linkCards } from './links';
import { anchorOf, Blocks, Em, unstar } from './Prose';
import r from './reading.module.css';

/** A topic page's tags: its title with " | Pantopus", description and canonical. */
export function topicMetadata(t: TopicPage) {
  return pageMetadata({ path: t.path, title: `${t.title} | Pantopus`, description: t.description });
}

export default function TopicArticle({ t }: { t: TopicPage }) {
  const sections = t.sections.map((s) => ({ ...s, id: anchorOf(s.h2) }));
  return (
    <>
      <header className={styles.hero}>
        <div className={styles.wrap}>
          <div className={r.head}>
            <Breadcrumb
              items={[
                { name: 'Pantopus', path: '/' },
                { name: t.label, path: t.path },
              ]}
            />
            <Kicker icon={t.path === '/social-network' ? 'globe' : 'home'}>{t.label}</Kicker>
            <h1 className={styles.h1}>
              <Em text={t.h1} />
            </h1>
            <p className={styles.lede}>{t.lede}</p>
            {t.lookup ? (
              <>
                {t.lookupText ? (
                  <p className={r.lookupTitle}>
                    {t.lookupText.title}
                    <span>{t.lookupText.line}</span>
                  </p>
                ) : null}
                <PillarLookup route={t.route} label="Look it up" placeholder="Start typing an address" />
              </>
            ) : (
              <AppButtons />
            )}
          </div>
          <OnThisPage items={[...sections.map((s) => ({ id: s.id, label: s.eyebrow ?? unstar(s.h2).replace(/[?.]$/, '') })), { id: 'questions', label: 'Questions' }]} />
        </div>
      </header>

      {sections.map((s) => {
        const more = s.more ? liveHref(s.more.href) : null;
        return (
          <Section key={s.id} id={s.id} kicker={s.eyebrow ?? t.label} title={<Em text={s.h2} />}>
            <div className={r.column}>
              <Blocks blocks={s.blocks} />
              {s.more && more ? (
                <Link className={r.more} href={more}>
                  {s.more.label}
                </Link>
              ) : null}
            </div>
          </Section>
        );
      })}

      <Section id="questions" kicker="Questions people ask" title="Questions people ask">
        <Questions items={t.questions} />
      </Section>

      <Section id="keep-reading" kicker="Keep reading" title="Keep reading">
        <Deeper items={linkCards(t.related)} />
        {t.notAdvice ? <p className={r.note}>{t.notAdvice}</p> : null}
      </Section>

      <Section id="more" kicker="More of Pantopus" title={<>One app for the place where your life <em>actually happens.</em></>}>
        <MorePillars order={t.pillars} />
      </Section>

      <Close title={<Em text={t.close.title} />} text={t.close.line} route={t.route} />
    </>
  );
}
