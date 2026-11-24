// /llms.txt — what Pantopus is and its public pages, in plain text for AI assistants (the llms.txt convention: a title,
// a one-line summary, then lists of links). Written from the homepage's words. The pillar and guide pages come from
// their lists in src/lib/site, so a page listed there appears here at the next build.
import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL } from '@pantopus/utils';
import { isLaunchCutPath } from '@/lib/featureFlags';
import { GUIDE_PAGES } from '@/lib/site/guidePages';
import { PILLAR_PAGES } from '@/lib/site/pillarPages';

export const dynamic = 'force-static';

const SITE_URL = 'https://pantopus.com';

const SITE_PAGES: [string, string, string][] = [
  ['/', 'Home', 'What Pantopus is: one app for the place where your life actually happens.'],
  ['/start', 'See your place', 'Type any U.S. address and see its public record and local risks, free, with no account.'],
  ['/tax-check', 'Property tax check', 'Where county records allow it, compare the county value of a home with similar houses on its street.'],
  ['/property-records', 'Property records', "Each county's own property offices, the federal hazard ratings for the area and a lookup for any U.S. home, with every source named."],
  ['/cards', 'Christmas cards', 'Pick a card and send it to someone. It arrives with their morning mail, and they open it like real mail.'],
  ['/about', 'About Pantopus', 'The Verified home, each part of the app, who it is for and how to reach the company.'],
  ['/about/data-sources', 'Data sources', 'The publishers of the public files behind address and property records.'],
  ['/contact', 'Contact', 'Support, business and privacy email addresses.'],
  ['/privacy', 'Privacy policy', 'What Pantopus collects, why, and your rights and choices.'],
  ['/terms', 'Terms of service', 'The terms for using Pantopus.'],
  ['/child-safety', 'Child safety standards', 'How Pantopus prevents and reports child sexual abuse and exploitation.'],
];

function body(): string {
  const link = (path: string, label: string, note?: string) => `- [${label}](${SITE_URL}${path === '/' ? '' : path})${note ? `: ${note}` : ''}`;
  const lines = [
    '# Pantopus',
    '',
    '> Pantopus is one app for the place where your life actually happens. Every account starts at a real home, so the people, the mail and the news around you are real. Free on iPhone and Android.',
    '',
    "Pantopus starts with your home. Anyone can make an account, but nobody can make up the address they live at: each person is tied to a real home, verified by a code on a postcard, a bill or lease, a landlord's yes, or a phone number and being at home. Others see a first name and a street, at most. Addresses are never sold and never used for ads.",
    '',
    'The parts of the app:',
    '',
    '- Place: the public record of any U.S. address in plain words; every fact names its source.',
    '- Today: the sky over your house and the day under it; what is due at home, shared with everyone who lives there.',
    '- Mail: a mailbox for your home, on your phone; mail arrives once each morning at 7:00, stamped and sealed.',
    '- Christmas cards: written, signed and sealed by hand in the app, opened on Christmas morning.',
    '- Pulse: questions, recommendations, events and good news from around you, as a list or on a map. No crime alerts.',
    '- Support Train: organize meals and help for a household after a new baby, a surgery or a loss.',
    '- Plans: make plans with friends, family and the people nearby; the exact spot shows once the host says yes.',
    '- Moments: short photo and video posts pinned where they happened, gone in a day or two.',
    '- Messages: direct and group chats, a plan\'s chat and a Support Train\'s group chat.',
    '- Pantopus AI: one assistant that knows your place, your day, your mail and your plans; nothing happens without your yes.',
    '',
    '## Pages',
    '',
    // A switched-off feature's pages redirect home, so they are left out (as in the sitemap).
    ...SITE_PAGES.filter(([path]) => !isLaunchCutPath(path)).map(([path, label, note]) => link(path, label, note)),
  ];
  if (PILLAR_PAGES.length) lines.push('', '## Parts of the app', '', ...PILLAR_PAGES.map((page) => link(page.path, page.label, page.share?.line)));
  if (GUIDE_PAGES.length) lines.push('', '## Guides', '', ...GUIDE_PAGES.map((page) => link(page.path, page.label, page.share?.line)));
  lines.push(
    '',
    '## Apps',
    '',
    `- [Pantopus on the App Store](${IOS_APP_STORE_URL})`,
    `- [Pantopus on Google Play](${ANDROID_PLAY_STORE_URL})`,
    '',
  );
  return lines.join('\n');
}

export function GET() {
  return new Response(body(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
