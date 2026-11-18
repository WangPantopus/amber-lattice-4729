// ============================================================
// The hero, over the Earth at night: "Real people. Real places. Right now." and the address lookup (HeroLookup).
// The words are server-rendered and never wait for the sky, three.js or any video.
// ============================================================

import HeroLookup from './HeroLookup';
import styles from './home.module.css';

export default function HomeHero() {
  return (
    <header className={styles.hero} data-u="5" data-scrim=".5">
      <div className={styles.wrap}>
        <div className={styles.heroInner}>
          <span className={styles.eyebrow}>Real life, connected</span>
          <h1 className={styles.h1}>
            Real people.
            <br />
            Real places.
            <br />
            <em>Right now.</em>
          </h1>
          <p className={styles.lede}>
            Pantopus is one app for the place where your life actually happens. Every account starts at a real home, so the
            people, the mail and the news around you are real.
          </p>
          <HeroLookup />
        </div>
      </div>
      <div className={styles.cue}>
        <div className={styles.wrap}>
          <span>Scroll · from the whole Earth down to one window</span>
        </div>
      </div>
    </header>
  );
}
