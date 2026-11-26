import { isLaunchCutPath } from '@/lib/featureFlags';
import { GUIDE_PAGES } from './guidePages';
import { PILLAR_PAGES } from './pillarPages';
import type { SitePage } from './sitePage';

// The site's main sections, as every public page's footer links them: the homepage and the pillar, topic and guide
// pages (HomeFooter), and the company, property-record and lookup pages (components/site/SiteFooter). One list, so
// each section is linked from every public page under the same words. A search engine picks the links it shows under
// a site's result from links like these; nobody can choose them for it.
//
// Only pages that are live: a switched-off feature's page is left out. The homepage's sections are linked as
// /#<section>: it scrolls on the homepage and opens it elsewhere. The pillar and guide pages come from their lists in
// src/lib/site, so a page added there is linked here and listed in the sitemap at once.

export type FooterColumn = { head: string; links: { href: string; label: string }[] };

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

const live = (columns: FooterColumn[]): FooterColumn[] =>
  columns.map((column) => ({ ...column, links: column.links.filter((link) => !isLaunchCutPath(link.href)) })).filter((column) => column.links.length);

/** The pillar pages: Place, Today, Pulse, … */
export const PILLAR_COLUMNS: FooterColumn[] = columnsFrom(PILLAR_PAGES, 'Pantopus');

/** The topic pages and the guides. */
export const GUIDE_COLUMNS: FooterColumn[] = columnsFrom(GUIDE_PAGES, 'Guides');

/** Sign up, sign in, the app, prices and help: where a person who searched for Pantopus by name wants to go. */
export const START_COLUMN: FooterColumn = {
  head: 'Get started',
  links: [
    { href: '/register', label: 'Sign up' },
    { href: '/login', label: 'Sign in' },
    { href: '/download', label: 'Get the app' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/help', label: 'Help' },
  ],
};

export const EXPLORE_COLUMN: FooterColumn = {
  head: 'Explore',
  links: [
    { href: '/start', label: 'See your place' },
    { href: '/property-records', label: 'Property records' },
    { href: '/tax-check', label: 'Property tax check' },
    { href: '/cards', label: 'Christmas cards' },
    { href: '/#how-it-works', label: 'How it works' },
    // The homepage's Plans section, until Plans has its own page in the Pantopus column.
    ...(PILLAR_PAGES.some((page) => page.path === '/plans') ? [] : [{ href: '/#plans', label: 'Plans' }]),
  ],
};

export const COMPANY_COLUMN: FooterColumn = {
  head: 'Company',
  links: [
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
    { href: '/about/data-sources', label: 'Data sources' },
  ],
};

export const TRUST_COLUMN: FooterColumn = {
  head: 'Trust',
  links: [
    { href: '/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms' },
    { href: '/child-safety', label: 'Child Safety' },
    { href: '/delete-account', label: 'Delete account' },
  ],
};

/** Every column, for the homepage's footer. */
export const FOOTER_COLUMNS: FooterColumn[] = live([...PILLAR_COLUMNS, ...GUIDE_COLUMNS, EXPLORE_COLUMN, START_COLUMN, COMPANY_COLUMN, TRUST_COLUMN]);

/** The same sections without each topic and guide (one link to all the guides instead), for the smaller footers. */
export const MAIN_FOOTER_COLUMNS: FooterColumn[] = live([
  ...PILLAR_COLUMNS,
  { ...EXPLORE_COLUMN, links: [...EXPLORE_COLUMN.links.filter((link) => !link.href.startsWith('/#')), { href: '/guides', label: 'Guides' }] },
  START_COLUMN,
  COMPANY_COLUMN,
  TRUST_COLUMN,
]);
