// Where the guides' and topic pages' links go, and the "Keep reading" cards.
//
// A link to a page of the site goes there only while that page is live: a pillar page listed in pillarPages.ts (else
// its section of the homepage, as the top bar does), a topic page listed in guidePages.ts (else the link is left out,
// and its words stay as plain text). /guides and the guides ship with the route that draws them, so they are always
// live. So no page here ever links to a 404, whichever pull request lands first.
// Each card has one line under it, taken from the page it opens, so a card never promises what the page doesn't say.

import { GUIDES } from '@/lib/site/guides';
import { GUIDE_PAGES } from '@/lib/site/guidePages';
import { TOPICS } from '@/lib/site/topics';
import { PILLARS, pillarHref } from '../_lib/pillars';

const TOPIC_PATHS = new Set<string>(TOPICS.map((t) => t.path));
const LIVE = new Set(GUIDE_PAGES.map((p) => p.path));

/** Where a link should go now, or null when its page isn't live yet. Outside links are kept as they are. */
export function liveHref(href: string): string | null {
  if (!href.startsWith('/')) return href;
  const pillar = PILLARS.find((p) => p.path === href);
  if (pillar) return pillarHref(pillar);
  if (TOPIC_PATHS.has(href)) return LIVE.has(href) ? href : null;
  return href;
}

const FIXED: Record<string, string> = {
  '/property-records': 'Each county’s own offices for records, permits and taxes.',
  '/tax-check': 'Does the county value your home above similar homes on your street?',
  '/cards': 'A Christmas card they open by hand.',
  '/start': 'Type an address and get its public record in plain words.',
  '/guides': 'Plain guides to the home, its records and the people around it.',
};

/** The first sentence of a text. */
function firstSentence(text: string): string {
  const m = text.match(/^.*?[.?](?=\s|$)/);
  return m ? m[0] : text;
}

function lineFor(href: string): string {
  if (FIXED[href]) return FIXED[href];
  const pillar = PILLARS.find((p) => p.path === href);
  if (pillar) return pillar.line;
  const topic = TOPICS.find((t) => t.path === href);
  if (topic) return firstSentence(topic.lede);
  const guide = GUIDES.find((g) => `/guides/${g.slug}` === href);
  if (guide) return firstSentence(guide.lede);
  return '';
}

/** The cards for a page's related links, live ones only. */
export function linkCards(links: { href: string; label: string }[]) {
  return links.flatMap((l) => {
    const href = liveHref(l.href);
    return href ? [{ href, label: l.label, text: lineFor(l.href) }] : [];
  });
}
