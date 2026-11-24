'use client';

// The public pages' top bar: the homepage's parts (brand, the pillars, "Sign in", "See your place"), always solid,
// since these pages have no sky to show through it. A client component to mark the page you are on and to know
// someone signed in (the JS-readable `pantopus_session` flag, read as lib/shellReads.ts does), who gets one "Open
// Pantopus" button instead of "Sign in" and "See your place"; it is rendered on the server like the rest. Under 980 px
// the pillar links give way, as on the homepage; each page lists the pillars again in "More of Pantopus", and the
// footer lists every page.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PantopusMark } from '@/components/brand/PantopusMark';
import home from '../../_components/home.module.css';
import { PILLARS, pillarHref } from '../_lib/pillars';
import styles from './public.module.css';

export default function PublicNav() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    setSignedIn(/(?:^|;\s*)pantopus_session=1(?:;|$)/.test(document.cookie));
  }, []);
  return (
    <nav className={styles.nav} aria-label="Main">
      <div className={styles.navWrap}>
        <Link className={home.brand} href="/" aria-label="Pantopus home">
          <PantopusMark size={26} variant="reverse" />
          Pantopus
        </Link>
        <div className={styles.navLinks}>
          {PILLARS.map((p) => {
            const href = pillarHref(p);
            if (!href) return null;
            return (
              <Link key={p.key} href={href} aria-current={pathname === p.path ? 'page' : undefined}>
                {p.label}
              </Link>
            );
          })}
        </div>
        {signedIn ? (
          <Link className={`${home.navBtn} ${styles.navOpen}`} href="/app/place">
            Open Pantopus
          </Link>
        ) : (
          <>
            <Link className={styles.signIn} href="/login">
              Sign in
            </Link>
            <Link className={home.navBtn} href="/start">
              See your place
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
