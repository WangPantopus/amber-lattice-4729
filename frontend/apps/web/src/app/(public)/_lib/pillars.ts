// ─────────────────────────────────────────────────────────────────────────────
// The pillars, in the homepage's order, for the public pages' top bar and their "More of Pantopus" links.
//
// A pillar whose page is live (listed in src/lib/site/pillarPages.ts, which the sitemap and the footer read too)
// links to its page; until then it links to its section of the homepage, and chat, which has no section there, is
// left out. So adding a page to that list is the one step that links it everywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { GUIDE_PAGES } from '@/lib/site/guidePages';
import { PILLAR_PAGES } from '@/lib/site/pillarPages';
import type { IconName } from '../../_components/HomeIcons';

export type PillarKey = 'place' | 'today' | 'mail' | 'pulse' | 'support-train' | 'plans' | 'moments' | 'chat';

export interface Pillar {
  key: PillarKey;
  label: string;
  path: string;
  /** Its section of the homepage, when it has one. */
  homeAnchor: string | null;
  icon: IconName;
  /** One line for the "More of Pantopus" cards, from the homepage's words. */
  line: string;
}

export const PILLARS: Pillar[] = [
  { key: 'place', label: 'Place', path: '/place', homeAnchor: '/#place', icon: 'home', line: 'See what’s true about your address.' },
  { key: 'today', label: 'Today', path: '/today', homeAnchor: '/#today', icon: 'sun', line: 'Everyone at home sees what’s due.' },
  { key: 'mail', label: 'Mail', path: '/mail', homeAnchor: '/#mail', icon: 'mail', line: 'Letters and cards, delivered at 7 a.m.' },
  { key: 'pulse', label: 'Pulse', path: '/pulse', homeAnchor: '/#pulse', icon: 'pulse', line: 'Know what’s going on. No crime alerts.' },
  { key: 'support-train', label: 'Support Train', path: '/support-train', homeAnchor: '/#train', icon: 'heart', line: 'When someone needs help, show up.' },
  { key: 'plans', label: 'Plans', path: '/plans', homeAnchor: '/#plans', icon: 'plans', line: 'Make plans with the people in your life.' },
  { key: 'moments', label: 'Moments', path: '/moments', homeAnchor: '/#moments', icon: 'moment', line: 'See the moments around you.' },
  { key: 'chat', label: 'Chat', path: '/chat', homeAnchor: null, icon: 'chat', line: 'Message real people, home to home.' },
];

const LIVE = new Set(PILLAR_PAGES.map((page) => page.path));
const LISTED = new Set([...PILLAR_PAGES, ...GUIDE_PAGES].map((page) => page.path));

/** True when a pillar, topic or guide page is live (listed in src/lib/site), so a link to it can be drawn. */
export function isListed(path: string): boolean {
  return LISTED.has(path);
}

/** True when the pillar's own page is live. */
export function hasPage(pillar: Pillar): boolean {
  return LIVE.has(pillar.path);
}

/** Where a link to the pillar goes today: its page, else its homepage section, else nowhere (null). */
export function pillarHref(pillar: Pillar): string | null {
  return hasPage(pillar) ? pillar.path : pillar.homeAnchor;
}

export function pillar(key: PillarKey): Pillar {
  const found = PILLARS.find((p) => p.key === key);
  if (!found) throw new Error(`No pillar ${key}`);
  return found;
}
