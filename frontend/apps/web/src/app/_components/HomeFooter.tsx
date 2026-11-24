import Link from 'next/link';
import { PantopusMark } from '@/components/brand/PantopusMark';
import { GUIDE_PAGES } from '@/lib/site/guidePages';
import { PILLAR_PAGES } from '@/lib/site/pillarPages';
import type { SitePage } from '@/lib/site/sitePage';
import styles from './home.module.css';

type FooterColumn = { head: string; links: { href: string; label: string }[] };

// One column per group, in the order the pages are listed; pages without a group sit under `head`.
function columnsFrom(pages: SitePage[], head: string): FooterColumn[] {
  const columns: FooterColumn[] = [];
  for (const page of pages) {
    const name = page.group || head;
    let column = columns.find((c) => c.head === name);
    if (!column) {
      column = { head: name, links: [] };
      columns.push(column);
    }
    column.links.push({ href: page.path, label: page.label });
  }
  return columns;
}

// Only pages that are live: nothing here links into a switched-off feature. Other public pages draw this footer too,
// so the homepage's sections are linked as /#<section>: it scrolls on the homepage and opens it elsewhere.
// The pillar and guide pages come from their lists in src/lib/site, so a page added there is linked here and listed
// in the sitemap at once.
const COLUMNS: FooterColumn[] = [
  ...columnsFrom(PILLAR_PAGES, 'Pantopus'),
  ...columnsFrom(GUIDE_PAGES, 'Guides'),
  {
    head: 'Explore',
    links: [
      { href: '/start', label: 'See your place' },
      { href: '/property-records', label: 'Property records' },
      { href: '/tax-check', label: 'Property tax check' },
      { href: '/#how-it-works', label: 'How it works' },
      // The homepage's Plans section, until Plans has its own page in the Pantopus column.
      ...(PILLAR_PAGES.some((page) => page.path === '/plans') ? [] : [{ href: '/#plans', label: 'Plans' }]),
      { href: '/login', label: 'Sign in' },
    ],
  },
  {
    head: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    head: 'Trust',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
      { href: '/child-safety', label: 'Child Safety' },
      { href: '/delete-account', label: 'Delete account' },
    ],
  },
];

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
          {COLUMNS.map((col) => (
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
