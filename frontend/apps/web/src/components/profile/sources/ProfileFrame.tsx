'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { PantopusMark } from '@/components/brand/PantopusMark';
import { authPageHref } from '@/lib/auth-utils';

/** A link for one purpose's address: `/<username>/v/<key>`. */
const KEY_PAGE = /^\/[^/]+\/v\/[^/]+\/?$/;

/**
 * A shared page for someone signed out (board 22, SPEC 9.10, founder: "Yes, drop them"): the profile with sources and
 * its links for one purpose open under a plain top, "Pantopus" to the home page and "Make your own", with no menu,
 * bell, chat or account icons and no tab bar or sidebar at any width. Make your own comes back to the person's main
 * page, never to a key's address.
 */
function PublicFrame({ username, children }: { username: string; children: ReactNode }) {
  const back = `/${encodeURIComponent(username)}`;
  return (
    <div className="min-h-screen bg-app flex flex-col">
      <header className="sticky top-0 z-30 h-12 shrink-0 bg-surface border-b border-app print:hidden">
        <div className="mx-auto h-full w-full max-w-6xl px-4 lg:px-8 flex items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)]">
            <PantopusMark size={24} className="shrink-0" />
            <span className="truncate text-[1.0625rem] leading-6 font-bold tracking-[-0.02em] text-app">Pantopus</span>
          </Link>
          <Link
            href={authPageHref('/register', back)}
            className="shrink-0 inline-flex items-center min-h-[2.75rem] -my-1 px-3.5 rounded-xl bg-app-surface-sunken text-[0.8125rem] font-semibold text-app hover-bg-app focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)]"
          >
            Make your own
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

/**
 * The frame around a person's pages. Signed in, the app's frame as always. Signed out, the plain shared frame on the
 * profile with sources (`newPage`: the server drew the new page for a visitor) and on every link for one purpose;
 * anything else (today's profile, the posts page) keeps the app's frame.
 */
export default function ProfileFrame({ signedOut, newPage, sourcesOn, username, children }: {
  signedOut: boolean;
  newPage: boolean;
  sourcesOn: boolean;
  username: string;
  children: ReactNode;
}) {
  const pathname = usePathname() || '';
  const keyPage = KEY_PAGE.test(pathname);
  const profilePage = pathname.replace(/\/$/, '').split('/').filter(Boolean).length === 1;
  const shared = signedOut && sourcesOn && ((newPage && profilePage) || keyPage);
  if (shared) return <PublicFrame username={username}>{children}</PublicFrame>;
  return <AppShell publicPage>{children}</AppShell>;
}
