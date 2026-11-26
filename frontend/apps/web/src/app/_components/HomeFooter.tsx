import Link from 'next/link';
import { PantopusMark } from '@/components/brand/PantopusMark';
import { FOOTER_COLUMNS } from '@/lib/site/footerLinks';
import styles from './home.module.css';

// The site's main sections, from the one list every public footer reads (src/lib/site/footerLinks.ts). Other public
// pages draw this footer too.
export default function HomeFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <Link className={styles.brand} href="/#top">
            <PantopusMark size={22} variant="reverse" />
            Pantopus
          </Link>
          <span>Real life, connected.</span>
          <span>© 2026 Pantopus, Inc.</span>
        </div>
        <nav className={styles.footerCols} aria-label="Footer">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.head} className={styles.footerCol}>
              <span className={styles.footerHead}>{col.head}</span>
              {col.links.map((l) => (
                <Link key={l.href} href={l.href}>{l.label}</Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}
