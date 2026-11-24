import { isLaunchCutPath } from '@/lib/featureFlags';

// The assistant's link buttons carry the apps' own addresses (pantopus://…), written by the server from one fixed
// catalog (backend/services/ai/appGuide.js, SCREENS). The phones open them with their deep-link routers; this is the
// web's router for the same catalog.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const one = (pattern: string) => new RegExp(`^${pattern}$`);
const PLACE_SECTIONS = new Set(['today', 'your-home', 'risk', 'block', 'money', 'civic']);
// A Christmas card picture's id ("christmas-2026-16").
const DESIGN = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** The assistant's own page: a button that would only open the page it is on is left out there. */
export const ASSISTANT_PATH = '/app/chat/ai-assistant';

// Screens that are one fixed page.
const FIXED: Record<string, string> = {
  today: '/app/today',
  place: '/app/place',
  // Pulse is the feed; `nearby` has been "Verified homes nearby" since November 7.
  feed: '/app/feed',
  nearby: '/app/nearby',
  connections: '/app/connections',
  plans: '/app/plans',
  'plans/new': '/app/plans/new',
  mailbox: '/app/mailbox/personal',
  'mailbox/cards': '/app/mailbox/cards',
  wallet: '/app/wallet',
  'settings/payments': '/app/settings/payments',
  'settings/notifications': '/app/settings/notifications',
  notifications: '/app/notifications',
  assistant: ASSISTANT_PATH,
};

function pageFor(path: string, query: URLSearchParams): string | null {
  if (path === 'mailbox/cards') {
    // One picture already picked.
    const design = (query.get('design') || '').toLowerCase();
    return DESIGN.test(design) ? `/app/mailbox/cards?design=${design}` : FIXED[path];
  }
  if (FIXED[path]) return FIXED[path];

  let m = path.match(one(`place/(${UUID})(?:/([a-z-]+))?`));
  if (m) {
    if (!m[2]) return `/app/place?home=${m[1]}`;
    return PLACE_SECTIONS.has(m[2]) ? `/app/place/${m[2]}?home=${m[1]}` : null;
  }
  m = path.match(one(`homes/(${UUID})/(dashboard|members|verify-postcard|waiting-room)`));
  if (m) return `/app/homes/${m[1]}/${m[2]}`;
  m = path.match(one(`homes/(${UUID})/tasks/(${UUID})`));
  if (m) return `/app/homes/${m[1]}/tasks/${m[2]}`;
  m = path.match(one(`posts/(${UUID})`));
  if (m) return `/app/feed/post/${m[1]}`;
  // The host's list of who asked to join is a part of the plan's own page.
  m = path.match(one(`plans/(${UUID})(/requests)?`));
  if (m) return `/app/plans/${m[1]}${m[2] ? '#requests' : ''}`;
  m = path.match(one(`chat/(${UUID})`));
  if (m) return `/app/chat/${m[1]}`;
  // A piece of mail opens in Me and moves to its own drawer once it loads (mailbox/[drawer]/layout.tsx).
  m = path.match(one(`mailbox/(${UUID})`));
  if (m) return `/app/mailbox/${m[1]}`;
  m = path.match(one(`mailbox/sent/(${UUID})`));
  if (m) return `/app/mailbox/sent/${m[1]}`;
  m = path.match(one(`moments/(${UUID})`));
  if (m) return `/app/moments/${m[1]}`;
  m = path.match(one(`support-trains/(${UUID})`));
  if (m) return `/app/support-trains/${m[1]}`;
  return null;
}

/**
 * The web page one of the apps' addresses opens (pantopus://settings/notifications → /app/settings/notifications),
 * or null where the web has no such screen (the phones' memory and rules lists, their identity check, anything
 * this build doesn't know) or the screen belongs to a feature that is hidden for the launch. A button is drawn only
 * for an address this answers, so none leads nowhere.
 */
export function webPathForAppLink(url: string | null | undefined): string | null {
  const match = /^pantopus:\/\/([^?#]*)(?:\?([^#]*))?$/i.exec((url ?? '').trim());
  if (!match) return null;
  const path = match[1].toLowerCase().replace(/\/+$/, '');
  const page = pageFor(path, new URLSearchParams(match[2] || ''));
  if (!page) return null;
  return isLaunchCutPath(page.split(/[?#]/)[0]) ? null : page;
}
