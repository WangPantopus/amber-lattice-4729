// Level 4, the world (the Earth with moments lighting up on its cities), the numbers, and Pantopus AI as the hub of
// every part of the app. Words as approved in the sample (2026-11-18).

import type { CSSProperties } from 'react';
import { Chapter } from './HomeChapter';
import { Icon, type IconName } from './HomeIcons';
import styles from './home.module.css';

const STATS: Array<[string, string]> = [
  ['7:00', 'The morning your mail arrives, in your own time zone'],
  ['86', 'Facts about a home, from its county record'],
  ['50', 'States where your tax exemption is checked'],
  ['67', 'Christmas cards to seal by hand'],
  ['10 ft', 'The steps Moments use to show how high you were'],
  ['0', 'Ads sold on your address. Crime alerts in your feed.'],
];

const HUB_NODES: Array<[string, IconName]> = [
  ['Place', 'home'],
  ['Today', 'sun'],
  ['Mail', 'mail'],
  ['Pulse', 'pulse'],
  ['Moments', 'moment'],
  ['Plans', 'plans'],
  ['Support Train', 'heart'],
  ['Messages', 'chat'],
];

const HUB = HUB_NODES.map(([name, icon], n) => {
  const a = (n / HUB_NODES.length) * 6.283 - 1.571;
  return { name, icon, x: (230 + 160 * Math.cos(a)).toFixed(1), y: (230 + 160 * Math.sin(a)).toFixed(1), delay: `${(-n * 0.4).toFixed(1)}s` };
});

function Hub() {
  return (
    <div className={styles.hub}>
      <svg viewBox="0 0 460 460" role="img" aria-label="Pantopus AI in the middle, connected to Place, Today, Mail, Pulse, Moments, Plans, Support Train and Messages">
        {HUB.map((h) => (
          <g key={`spoke-${h.name}`}>
            <line className={styles.spoke} x1="230" y1="230" x2={h.x} y2={h.y} />
            <line className={styles.run} style={{ animationDelay: h.delay }} x1="230" y1="230" x2={h.x} y2={h.y} />
          </g>
        ))}
        {HUB.map((h) => (
          <g key={h.name} className={styles.node} transform={`translate(${h.x} ${h.y})`}>
            <circle r="29" />
            <svg className={styles.ic} x="-11" y="-11" width="22" height="22" style={{ color: '#ffc867' }} aria-hidden="true">
              <use href={`#hp-i-${h.icon}`} />
            </svg>
            <text y="48">{h.name}</text>
          </g>
        ))}
        <circle className={styles.core} cx="230" cy="230" r="44" />
        <svg className={styles.ic} x="206" y="206" width="48" height="48" style={{ color: '#ffc867', strokeWidth: 1.5 }} aria-hidden="true">
          <use href="#hp-i-spark" />
        </svg>
      </svg>
    </div>
  );
}

export default function HomeWorld() {
  return (
    <>
      <section className={styles.world} id="world" data-world="" data-u="0:3.15,.34:4,.72:5,1:5" data-scrim=".25">
        <div className={styles.stick}>
          <div className={styles.wrap}>
            <div className={styles.worldBox}>
              <span className={styles.eyebrow}>
                <Icon name="globe" />
                Level 4 · The world
              </span>
              <h2 className={styles.h2}>
                Zoom out. <em>It’s all real.</em>
              </h2>
              <ul className={styles.truths} data-truths="">
                <li>Every light is somebody’s home, and every account starts at one.</li>
                <li>There is no main feed. What you see starts at a real place.</li>
                <li>You see it when it happens, from the person who was there.</li>
                <li>Your street, your town, or the far side of the planet.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section data-u="5" data-scrim=".55" aria-label="Pantopus in numbers">
        <div className={styles.wrap}>
          <div className={styles.stats}>
            {STATS.map(([n, text], i) => (
              <div key={n} className={styles.stat} data-rv="" style={i ? ({ '--i': i } as CSSProperties) : undefined}>
                <b>{n}</b>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Chapter
        id="ai"
        u="5"
        scrim=".7"
        icon="spark"
        eyebrow="Pantopus AI"
        title={
          <>
            Pantopus AI connects <em>all of it.</em>
          </>
        }
        lede="One assistant that knows your place, your day, your mail and your plans. Ask it on any screen. Nothing happens without your yes."
        groups={[
          {
            title: 'Ask',
            items: [
              '“Is radon a risk here?” with the source named',
              '“What’s due this week?”',
              '“What came in the mail?” behind Face ID',
              '“Catch me up on Pulse”',
              'Ask by voice, with Siri and shortcuts',
            ],
          },
          {
            title: 'Get it done',
            items: [
              'Tasks, plans and replies drafted for you to approve',
              'Reads a flyer or a letter from a photo',
              '“Check back Thursday”, and it does',
              'Helps you write a card or a post',
              'You choose what it remembers and what it does',
            ],
          },
        ]}
        visual={<Hub />}
      />
    </>
  );
}
