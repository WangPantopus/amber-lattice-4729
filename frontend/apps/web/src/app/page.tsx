// ─────────────────────────────────────────────────────────────────────────────
// Pantopus homepage — real people, real places, right now.
//
// One fixed night sky behind the whole page (HomeStage: stars, a real 3D Earth and a drawn town with one lit window),
// and one camera that scroll moves between five scales: the page opens on the Earth, dives to one lit window, then
// pulls back out level by level, and each part of the app appears at its own scale. Level 1, one home: Verified,
// Place, Today, Mail. Level 2, the street: Pulse, Support Train. Level 3, the town: Plans, Moments. Level 4, the
// world; then the numbers, Pantopus AI as the hub, and a closing with dawn coming round the Earth.
//
// Built from the design session's sample, approved by the founder on 2026-11-18 ("Yes, build it"). Every word is
// server-rendered; the sky and three.js start on the client after first paint. The page shows everything inside
// Place, Today, Mail, Pulse, Moments, Plans and Support Train as on (the founder's decision, 2026-11-18).
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import Link from 'next/link';
import { IBM_Plex_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import { IOS_APP_STORE_APP_ID } from '@pantopus/utils';
import { PantopusMark } from '@/components/brand/PantopusMark';
import HomeStage from './_components/HomeStage';
import HomeHero from './_components/HomeHero';
import LevelOne, { Dive } from './_components/HomeLevelOne';
import { LevelThree, LevelTwo } from './_components/HomeLevelsTwoThree';
import HomeWorld from './_components/HomeWorld';
import CloseSection from './_components/CloseSection';
import HomeFooter from './_components/HomeFooter';
import { IconSprite } from './_components/HomeIcons';
import styles from './_components/home.module.css';

// Newsreader with every weight, optical size and both styles. The page loads a cut of Google's Latin file holding
// every English letter and digit and the punctuation headings use, with all its axes, kerning and figure styles, so
// those glyphs draw exactly as from the whole file at about half the bytes. Every other character still draws in
// Newsreader, from Google's own files in home.module.css, fetched only when a text uses one; its fallback while
// loading is there too. Files and ranges come from scripts/newsreader-subset.py.
//
// Not preloaded: first paint waits for the stylesheets, and on a slow connection these 152 KB, requested alongside
// them, usually reach the wire first (about a second's delay at 1.5 Mbit/s). A first visit paints the heading in its
// size-matched fallback and swaps when the font lands; a return visit has the font from the cache before first paint.
const serif = localFont({
  src: [
    { path: './_components/fonts/newsreader-core.woff2', weight: '200 800', style: 'normal' },
    { path: './_components/fonts/newsreader-italic-core.woff2', weight: '200 800', style: 'italic' },
  ],
  // next/font/local would otherwise name the family after this constant ("serif").
  declarations: [{ prop: 'font-family', value: 'Newsreader' }],
  variable: '--home-serif',
  display: 'swap',
  adjustFontFallback: false,
  preload: false,
});
// Plex Mono's fallbacks are in home.module.css (adjustFontFallback is off): next/font's Arial-based one has wider
// capitals than Plex Mono, so when the page painted before Plex Mono arrived, the hero's eyebrow wrapped
// differently and the hero moved when the font landed. A Courier New face with Plex Mono's advance stands in.
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--home-mono', display: 'swap', adjustFontFallback: false });

const TITLE = 'Pantopus · Real life, connected';
const SHARE_TITLE = 'Real people. Real places. Right now.';
const DESCRIPTION =
  'Pantopus is one app for the place where your life actually happens. Every account starts at a real home, so the people, the mail and the news around you are real.';

export const metadata: Metadata = {
  metadataBase: new URL('https://pantopus.com'),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Pantopus',
    title: SHARE_TITLE,
    description: DESCRIPTION,
    images: [{ url: '/api/og/home', width: 1200, height: 630, alt: 'The Earth at night with its city lights, under the words “Real people. Real places. Right now.”' }],
  },
  twitter: { card: 'summary_large_image', title: SHARE_TITLE, description: DESCRIPTION, images: ['/api/og/home'] },
  // Safari on an iPhone offers the app in its own banner above the page.
  ...(IOS_APP_STORE_APP_ID ? { itunes: { appId: IOS_APP_STORE_APP_ID } } : {}),
};

// Re-rendered hourly, as before.
export const revalidate = 3600;

const NAV = [
  ['#place', 'Place'],
  ['#today', 'Today'],
  ['#mail', 'Mail'],
  ['#pulse', 'Pulse'],
  ['#train', 'Support Train'],
  ['#plans', 'Plans'],
  ['#moments', 'Moments'],
];

export default function HomePage() {
  return (
    <div className={`${styles.page} ${serif.variable} ${mono.variable}`}>
      <IconSprite />
      <HomeStage />

      <nav className={styles.nav} data-nav="" aria-label="Main">
        <div className={styles.navWrap}>
          <a className={styles.brand} href="#top" aria-label="Pantopus">
            <PantopusMark size={26} variant="reverse" />
            Pantopus
          </a>
          <div className={styles.navLinks}>
            {NAV.map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </div>
          <Link className={styles.signIn} href="/login">
            Sign in
          </Link>
          <Link className={styles.navBtn} href="/start">
            See your place
          </Link>
        </div>
      </nav>

      <main id="top" className={styles.main}>
        <HomeHero />
        <Dive />
        <LevelOne />
        <LevelTwo />
        <LevelThree />
        <HomeWorld />
        <CloseSection />
      </main>
      <HomeFooter />
    </div>
  );
}
