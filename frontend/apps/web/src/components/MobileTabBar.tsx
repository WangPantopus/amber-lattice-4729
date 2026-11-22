'use client';

// Phone-width web follows the native order: Place, Today, Mail, Pulse, Moments, Plans.
// Mail, Moments, and Plans appear while their respective switches are on. Desktop keeps its sidebar.
// A person with a home gets Today before Place (founder decision 2026-11-21; lib/tabOrder.ts).

import { useMomentBadge } from './moments/useMomentBadge';
import { useMomentsAccess } from './moments/useMomentsAccess';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { usePathname, useRouter } from 'next/navigation';
import { NavIcons } from '@/lib/icons';
import { launchFeatures } from '@/lib/featureFlags';
import { afterInboxRows } from '@/lib/shellReads';
import { useChristmasMail } from '@/components/mailbox/cards/cardDoors';
import { myHomesQuery } from '@/lib/myHomes';
import { keptTabOrder, noteTabOrder, todayIsFirst } from '@/lib/tabOrder';

type Tab = {
  key: 'place' | 'today' | 'nearby' | 'mail' | 'moments' | 'plans';
  label: string;
  href: string;
  icon: typeof NavIcons.place;
  matches: (path: string) => boolean;
};

const starts = (path: string, ...prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export const MOBILE_TABS: Tab[] = [
  // "Verified homes nearby" (/app/nearby) opens from Place (founder decision 2026-11-07).
  { key: 'place', label: 'Place', href: '/app/place', icon: NavIcons.place, matches: (p) => starts(p, '/app/place', '/app/homes', '/app/nearby', '/app/neighborhood') },
  { key: 'today', label: 'Today', href: '/app/today', icon: NavIcons.today, matches: (p) => starts(p, '/app/today', '/app/hub/today') },
  // Launch cut #10 (Mailbox): Mail is its own tab (founder, 2026-10-26), third
  // since the founder's November 13 decision. It opens the Me drawer.
  ...(launchFeatures.mailbox
    ? [{ key: 'mail' as const, label: 'Mail', href: '/app/mailbox/personal', icon: NavIcons.mail, matches: (p: string) => starts(p, '/app/mailbox') }]
    : []),
  // The Pulse tab, named Nearby until the founder's November 7 decision (its key stays): the feed under its List | Map
  // switch. Connections is in the menu.
  { key: 'nearby', label: 'Pulse', href: '/app/feed', icon: NavIcons.pulse, matches: (p) => starts(p, '/app/feed', '/app/beacons', '/app/gigs', '/app/marketplace') },
];

const momentTab: Tab = { key: 'moments', label: 'Moments', href: '/app/moments', icon: NavIcons.moments, matches: p => starts(p, '/app/moments') };
const planTab: Tab = { key: 'plans', label: 'Plans', href: '/app/plans', icon: NavIcons.plans, matches: p => starts(p, '/app/plans') };
const allTabs = [...MOBILE_TABS, momentTab, planTab];

const placeTab = allTabs.find(tab => tab.key === 'place')!;
const todayTab = allTabs.find(tab => tab.key === 'today')!;

// `todayFirst`: Today and Place swap for a person with a home; the rest keep their order.
export function availableMobileTabs(moments: boolean, plans: boolean, todayFirst = false): Tab[] {
  const tabs = allTabs.filter(tab => (tab.key !== 'moments' || moments) && (tab.key !== 'plans' || plans));
  return todayFirst ? tabs.map(tab => (tab === placeTab ? todayTab : tab === todayTab ? placeTab : tab)) : tabs;
}

// With the Mailbox on, Mail's badge is the drawings' red count (Mail tab
// design, 2026-10-27).
const BADGE_CLASS = launchFeatures.mailbox
  ? 'absolute left-1/2 top-0.5 ml-1 min-w-[18px] rounded-full border-2 border-app-surface bg-red-700 px-1 text-center text-[10px] font-bold leading-[14px] text-white'
  : 'absolute right-[calc(50%-18px)] top-1 min-w-[16px] rounded-full bg-primary-600 px-1 text-center text-[10px] font-bold leading-4 text-white';

export function activeMobileTab(pathname: string): Tab['key'] | null {
  return allTabs.find((t) => t.matches(pathname))?.key ?? null;
}

// A conversation has the whole window on a phone (founder, 2026-11-06), a
// person's, a group's or the assistant's: leaving it brings the bar back on the
// screen underneath. The Messages list keeps the bar, with no tab lit.
export function isConversation(pathname: string): boolean {
  return pathname.startsWith('/app/chat/');
}

// Sending a Christmas card is a full-screen flow on a phone too (launch key
// card_table): its steps and the "on its way" page have no bar (design plan 1.3,
// founder 2026-11-09). Back leaves it.
export function hidesMobileTabs(pathname: string): boolean {
  return isConversation(pathname) || (launchFeatures.cardTable && pathname === '/app/mailbox/cards');
}

export default function MobileTabBar({ unreadMail = 0, accountId }: { unreadMail?: number; accountId?: string | null }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const active = activeMobileTab(pathname);
  const enabled = useMomentsAccess().data?.enabled;
  const newMoments = useMomentBadge(!!enabled);
  const plansEnabled = useFeatureFlag('plans');
  // Read once, when the bar mounts: the order doesn't move while the app is in use.
  const [keptOrder] = useState(keptTabOrder);
  const todayFirst = todayIsFirst(keptOrder, accountId);
  const tabs = useMemo(() => availableMobileTabs(!!enabled, plansEnabled, todayFirst), [enabled, plansEnabled, todayFirst]);
  // The home list as the pages read it (the bar asks for nothing itself): its answer is kept for the next load.
  // An older server sends no primary_home; nothing is kept then.
  const primaryHome = useQuery({ ...myHomesQuery(), enabled: false }).data?.primary_home;
  useEffect(() => {
    if (accountId && primaryHome !== undefined) noteTabOrder(accountId, primaryHome !== null);
  }, [accountId, primaryHome]);
  const christmasMail = useChristmasMail();

  // The sidebar prefetches each tab on hover; phones have no hover, so
  // warm every tab once instead of giving the slowest connections the
  // coldest navigation. A cold Messages inbox paints its rows first (lib/shellReads.ts), and AppShell
  // prefetches Messages for the top bar's chat button.
  useEffect(() => afterInboxRows(() => {
    tabs.forEach((tab) => router.prefetch(tab.href));
  }), [router, tabs]);

  return (
    <nav
      aria-label="Primary"
      data-testid="mobile-tab-bar"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-app bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          // The red envelope keeps its own colours, selected or not; the label keeps the tab's.
          const Icon = tab.key === 'mail' && christmasMail ? NavIcons.christmasMail : tab.icon;
          const isActive = active === tab.key;
          // Mail counts unopened mail; unread chats show on the top bar's chat button.
          const count = tab.key === 'mail' ? unreadMail : 0;
          const countLabel = count > 0 ? `${tab.label}, ${count} unopened` : undefined;
          return (
            <li key={tab.key} className="min-w-0">
              <button
                type="button"
                onClick={() => router.push(tab.href)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={countLabel}
                data-testid={`mobile-tab-${tab.key}`}
                className={`relative flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium leading-none transition-colors ${
                  isActive ? 'text-primary-700 dark:text-primary-400' : 'text-app-text-secondary'
                }`}
              >
                <Icon className="h-6 w-6" strokeWidth={isActive ? 2.25 : 1.75} aria-hidden />
                <span className="max-w-full truncate px-0.5">{tab.label}</span>
                {tab.key === 'moments' && newMoments && <span aria-label="New Moments" className="absolute left-1/2 top-1 ml-2 h-2 w-2 rounded-full bg-teal-500 ring-2 ring-white"/>}
                {count > 0 ? (
                  <span aria-hidden className={BADGE_CLASS}>
                    {count > 99 ? '99+' : count}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
