// ─────────────────────────────────────────────────────────────────────────────
// One pillar's public page, from its content (each page's content.tsx): the homepage's heading and opening lines for
// the pillar, then what you can do, how it works, your privacy, anything the pillar adds, the questions people ask,
// the other pillars, and the close with the address box and the app.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import type { IconName } from '../../_components/HomeIcons';
import type { PillarKey } from '../_lib/pillars';
import type { Question } from '../_lib/seo';
import {
  AppButtons,
  AtAGlance,
  Breadcrumb,
  Close,
  Deeper,
  FeatureGroups,
  Kicker,
  liveLinks,
  MorePillars,
  OnThisPage,
  PillarClip,
  PillarLookup,
  Privacy,
  Questions,
  Section,
  Steps,
  type Assurance,
  type DeeperLink,
  type FeatureGroup,
  type Glance,
  type Step,
} from './parts';
import styles from './public.module.css';

export interface ExtraSection {
  id: string;
  /** Its label in "On this page". */
  label: string;
  kicker: string;
  title: ReactNode;
  intro?: ReactNode;
  body: ReactNode;
}

export interface PillarContent {
  key: PillarKey;
  path: string;
  /** Its name in the breadcrumb and the eyebrow. */
  name: string;
  icon: IconName;
  /** The homepage's heading for the pillar, with its italic part in <em>. */
  title: ReactNode;
  /** The homepage's opening lines, as written. */
  lede: string;
  /** More, underneath, from the code. */
  more?: string;
  /** The hero's action: the address box, or the app (with a link to the lookup). */
  action: 'lookup' | 'app';
  /** The funnel route a lookup started here records. */
  route: string;
  glance: Glance[];
  /** The pillar's clip from public/home/, or a picture drawn for the page. */
  clip?: { name: string; label: string; caption: string };
  visual?: ReactNode;
  can: { title: ReactNode; intro?: ReactNode; groups: FeatureGroup[] };
  how: { title: ReactNode; steps: Step[] };
  privacy: { title: ReactNode; quote: string; items: Assurance[] };
  /** Sections only this pillar has, after privacy. */
  extra?: ExtraSection[];
  deeper?: { title: ReactNode; intro?: ReactNode; links: DeeperLink[] };
  questions: { title: ReactNode; items: Question[] };
  related: PillarKey[];
  close: { title: ReactNode; text?: string };
}

export default function PillarPage({ c }: { c: PillarContent }) {
  const deeper = c.deeper && liveLinks(c.deeper.links).length ? c.deeper : null;
  const toc = [
    { id: 'what-you-can-do', label: 'What you can do' },
    { id: 'how-it-works', label: 'How it works' },
    { id: 'privacy', label: 'Your privacy' },
    ...(c.extra ?? []).map((s) => ({ id: s.id, label: s.label })),
    ...(deeper ? [{ id: 'go-deeper', label: 'Go deeper' }] : []),
    { id: 'questions', label: 'Questions' },
  ];

  return (
    <>
      <header className={styles.hero}>
        <div className={styles.wrap}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <Breadcrumb
                items={[
                  { name: 'Pantopus', path: '/' },
                  { name: c.name, path: c.path },
                ]}
              />
              <Kicker icon={c.icon}>{c.name}</Kicker>
              <h1 className={styles.h1}>{c.title}</h1>
              <p className={styles.lede}>{c.lede}</p>
              {c.more ? <p className={styles.more}>{c.more}</p> : null}
              {c.action === 'lookup' ? <PillarLookup route={c.route} /> : <AppButtons />}
            </div>
            <div className={styles.heroVisual}>{c.clip ? <PillarClip {...c.clip} eager /> : c.visual}</div>
          </div>
          <AtAGlance items={c.glance} />
          <OnThisPage items={toc} />
        </div>
      </header>

      <Section id="what-you-can-do" kicker="What you can do" icon={c.icon} title={c.can.title} intro={c.can.intro}>
        <FeatureGroups groups={c.can.groups} />
      </Section>

      <Section id="how-it-works" kicker="How it works" title={c.how.title}>
        <Steps items={c.how.steps} />
      </Section>

      <Privacy title={c.privacy.title} quote={c.privacy.quote} items={c.privacy.items} />

      {(c.extra ?? []).map((s) => (
        <Section key={s.id} id={s.id} kicker={s.kicker} title={s.title} intro={s.intro}>
          {s.body}
        </Section>
      ))}

      {deeper ? (
        <Section id="go-deeper" kicker="Go deeper" title={deeper.title} intro={deeper.intro}>
          <Deeper items={deeper.links} />
        </Section>
      ) : null}

      <Section id="questions" kicker="Questions people ask" title={c.questions.title}>
        <Questions items={c.questions.items} />
      </Section>

      <Section id="more" kicker="More of Pantopus" title={<>One app for the place where your life <em>actually happens.</em></>}>
        <MorePillars current={c.key} order={c.related} />
      </Section>

      <Close title={c.close.title} text={c.close.text} route={c.route} />
    </>
  );
}
