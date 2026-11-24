// ─────────────────────────────────────────────────────────────────────────────
// The public reading pages: the pillar pages (/place, /today, …), and the topic pages and guides that reuse this
// shell. A route group outside (site), so these pages load only globals.css and the homepage's stylesheet, never
// site.css; the URLs are unchanged.
//
// The homepage's family, made calm: its fonts, colours and spacing (home.module.css's .page tokens), its icons, its
// footer, and a top bar with the same parts (brand, the pillars, "Sign in", "See your place"), over a still night sky
// drawn in CSS. No three.js, no film, nothing that waits for a script: every word is server-rendered.
// ─────────────────────────────────────────────────────────────────────────────

import { IBM_Plex_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import HomeFooter from '../_components/HomeFooter';
import { IconSprite } from '../_components/HomeIcons';
import home from '../_components/home.module.css';
import PublicNav from './_components/PublicNav';
import styles from './_components/public.module.css';

// The homepage's Newsreader cut and Plex Mono, set up as on the homepage (page.tsx says why: not preloaded, no
// adjusted fallback; the fallbacks live in home.module.css).
const serif = localFont({
  src: [
    { path: '../_components/fonts/newsreader-core.woff2', weight: '200 800', style: 'normal' },
    { path: '../_components/fonts/newsreader-italic-core.woff2', weight: '200 800', style: 'italic' },
  ],
  declarations: [{ prop: 'font-family', value: 'Newsreader' }],
  variable: '--home-serif',
  display: 'swap',
  adjustFontFallback: false,
  preload: false,
});
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--home-mono', display: 'swap', adjustFontFallback: false });

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div id="top" className={`${home.page} ${styles.page} ${serif.variable} ${mono.variable}`}>
      <IconSprite />
      <div className={styles.sky} aria-hidden="true" />
      <a className={styles.skip} href="#content">
        Skip to the page
      </a>
      <PublicNav />
      <main id="content" className={styles.main}>
        {children}
      </main>
      <HomeFooter />
    </div>
  );
}
