import type { SitePage } from './sitePage';

// The public page of each pillar (/place, /today, /pulse, …). The sitemap lists every entry and the homepage footer
// links each one, so add a page here only once it opens signed out. Owned by the pillar pages' build (SEOPILLAR).
// The public pages' top bar and "More of Pantopus" read it too ((public)/_lib/pillars.ts): a pillar listed here is
// linked to its page there, and until then to its section of the homepage.
export const PILLAR_PAGES: SitePage[] = [
  { path: '/place', label: 'Place' },
  { path: '/today', label: 'Today' },
  { path: '/pulse', label: 'Pulse' },
  { path: '/moments', label: 'Moments' },
  { path: '/mail', label: 'Mail' },
  { path: '/plans', label: 'Plans' },
  { path: '/support-train', label: 'Support Train' },
  { path: '/chat', label: 'Chat' },
];
