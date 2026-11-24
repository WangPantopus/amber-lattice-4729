import { GUIDE_PAGES } from './guidePages';
import { PILLAR_PAGES } from './pillarPages';
import type { ShareCard } from './sitePage';

// The share pictures of the site-wide pages, by path. The pillar and guide pages name theirs in their own lists.
const SITE_CARDS: Record<string, ShareCard> = {
  '/about': { heading: 'Real life, connected.', line: 'Pantopus starts with your home.' },
  '/about/data-sources': { heading: 'Data sources', line: 'The public files behind every address and property record.' },
  '/contact': { heading: 'Contact Pantopus', line: 'Write to us about support, business or privacy.' },
  '/privacy': { heading: 'Privacy policy', line: 'What Pantopus collects, why, and the choices you have.' },
  '/terms': { heading: 'Terms of service', line: 'What you agree to when you use Pantopus, in plain words.' },
  '/child-safety': { heading: 'Child safety standards', line: 'Zero tolerance for child sexual abuse and exploitation.' },
  '/start': { heading: 'See what’s true about your address.', line: 'Public records and local risks for any U.S. address. Free, no account.' },
  '/tax-check': { heading: 'Does the county value your home higher?', line: 'Where county records allow it, compare with similar houses on your street.' },
};

/** Every page with a share picture, by path: the site-wide ones, then the pillar and guide pages that name one. */
export function shareCards(): Record<string, ShareCard> {
  const cards: Record<string, ShareCard> = { ...SITE_CARDS };
  for (const page of [...PILLAR_PAGES, ...GUIDE_PAGES]) if (page.share) cards[page.path] = page.share;
  return cards;
}
