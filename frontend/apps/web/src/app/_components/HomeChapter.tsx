// One chapter of the homepage: an eyebrow, a heading, a lede and groups of what the area does, beside a picture
// (a clip of the launch film or a card drawn for the page). `u` and `scrim` set the camera scale and how much the sky
// darkens behind the words (stage/controller.ts).

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from './HomeIcons';
import { pillarPageFor } from './pillarLinks';
import { MEDIA } from './stage/media';
import styles from './home.module.css';

export type FeatureItem = string | { text: string; small: string };

export interface FeatureGroup {
  title: string;
  /** Drawn in blue: what businesses and campaigns get. */
  biz?: boolean;
  items: FeatureItem[];
}

interface ChapterProps {
  id: string;
  u: string;
  scrim?: string;
  flip?: boolean;
  icon: IconName;
  eyebrow: string;
  title: ReactNode;
  lede: string;
  groups: FeatureGroup[];
  visual: ReactNode;
  /** Anything after the chapter's two columns (the Christmas band). */
  after?: ReactNode;
}

export function Chapter({ id, u, scrim = '.78', flip, icon, eyebrow, title, lede, groups, visual, after }: ChapterProps) {
  // A pillar's section ends its copy with a link to the pillar's own page, once that page is live.
  const page = pillarPageFor(id);
  return (
    <section className={styles.chapter} id={id} data-u={u} data-scrim={scrim} aria-labelledby={`${id}-title`}>
      <div className={styles.wrap}>
        <div className={flip ? `${styles.ch} ${styles.flip}` : styles.ch}>
          <div className={styles.copy}>
            <span className={styles.eyebrow}>
              <Icon name={icon} />
              {eyebrow}
            </span>
            <h2 id={`${id}-title`} className={styles.h2}>
              {title}
            </h2>
            <p className={styles.lede}>{lede}</p>
            <div className={styles.groups}>
              {groups.map((g) => (
                <div key={g.title} className={g.biz ? `${styles.group} ${styles.biz}` : styles.group} data-rv="">
                  <h3>{g.title}</h3>
                  <ul className={styles.feat}>
                    {g.items.map((item) =>
                      typeof item === 'string' ? (
                        <li key={item}>{item}</li>
                      ) : (
                        <li key={item.text}>
                          {item.text}
                          <small>{item.small}</small>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              ))}
            </div>
            {page ? (
              <p className={styles.more}>
                <Link className={styles.textBtn} href={page.path}>
                  More about {page.label}
                </Link>
              </p>
            ) : null}
          </div>
          <div className={styles.visual}>{visual}</div>
        </div>
        {after}
      </div>
    </section>
  );
}

/** A clip of the launch film, cropped to the phone. Its poster and video load as it nears the screen (so nothing here
 *  competes with the hero's first paint), and it plays only while in view. */
export function Clip({ name, label, caption }: { name: string; label: string; caption: string }) {
  return (
    <>
      <figure className={styles.clip}>
        <video muted loop playsInline preload="none" data-poster={`${MEDIA}/poster-${name}.jpg`} data-src={`${MEDIA}/clip-${name}.mp4`} aria-label={label} />
      </figure>
      <span className={styles.caption}>{caption}</span>
    </>
  );
}

/** A pinned screen that names the scale the camera has reached. */
export function Level({ u, eyebrow, title, lede, scale }: { u: string; eyebrow: string; title: ReactNode; lede: string; scale: string }) {
  return (
    <section className={styles.level} data-u={u} data-scrim=".3">
      <div className={styles.stick}>
        <div className={styles.wrap}>
          <div className={styles.levelBox}>
            <span className={styles.eyebrow}>{eyebrow}</span>
            <h2 className={styles.levelTitle}>{title}</h2>
            <p className={styles.lede}>{lede}</p>
            <span className={styles.scale}>{scale}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
