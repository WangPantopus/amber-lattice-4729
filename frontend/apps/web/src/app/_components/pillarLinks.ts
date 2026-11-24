// The homepage's pillar sections and their own pages. A pillar links to its page once that page is live (listed in
// src/lib/site/pillarPages.ts, which the sitemap and the footer read too); until then the menu keeps the section's
// anchor and the section draws no "More about" link.
import { PILLAR_PAGES } from '@/lib/site/pillarPages';

const SECTIONS: { id: string; label: string; path: string }[] = [
  { id: 'place', label: 'Place', path: '/place' },
  { id: 'today', label: 'Today', path: '/today' },
  { id: 'mail', label: 'Mail', path: '/mail' },
  { id: 'pulse', label: 'Pulse', path: '/pulse' },
  { id: 'train', label: 'Support Train', path: '/support-train' },
  { id: 'plans', label: 'Plans', path: '/plans' },
  { id: 'moments', label: 'Moments', path: '/moments' },
];

const LIVE = new Set(PILLAR_PAGES.map((page) => page.path));

/** The menu, in the homepage's order: each pillar's page when it is live, else its section. */
export const HOME_MENU = SECTIONS.map(({ id, label, path }) => ({ label, href: LIVE.has(path) ? path : `#${id}`, page: LIVE.has(path) }));

/** The live page of the pillar whose section has this id, for its "More about" link; null for any other section. */
export function pillarPageFor(sectionId: string): { label: string; path: string } | null {
  const section = SECTIONS.find((s) => s.id === sectionId);
  return section && LIVE.has(section.path) ? { label: section.label, path: section.path } : null;
}
