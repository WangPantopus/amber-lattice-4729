import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { ANDROID_PLAY_STORE_URL, IOS_APP_STORE_URL } from '@pantopus/utils';
import { breadcrumbLd, jsonLd } from '@/lib/site/jsonLd';
import { publicPageMetadata } from '@/lib/site/pageMetadata';
import { PILLAR_PAGES } from '@/lib/site/pillarPages';

// ─────────────────────────────────────────────────────────────────────────────
// Pantopus — /about
// frontend/apps/web/src/app/(site)/about/page.tsx
//
// What Pantopus is today, from the homepage's words: the Verified home, each part of the app, who it is for, where
// the facts come from and how to reach the company (rewritten November 23, 2026 for the search build; the spring's
// story of tasks, a marketplace and earning is gone).
// ─────────────────────────────────────────────────────────────────────────────


export const metadata = publicPageMetadata({
  path: '/about',
  title: 'About Pantopus: real life, connected',
  description:
    'Pantopus is one app for the place where your life actually happens. Every account starts at a real home. Who we are, what we build and how to reach us.',
});

// Each part of the app in the homepage's own words (src/app/_components, approved by the founder on November 18). A
// part links to its own page once that page is listed in src/lib/site/pillarPages.ts.
const PARTS: { name: string; path: string; head: string; body: string }[] = [
  {
    name: 'Place',
    path: '/place',
    head: 'See what’s true about your address.',
    body: 'Type an address and get its public record in plain words. Every fact names its source, and says when it is county-wide and when it is about this exact home.',
  },
  {
    name: 'Today',
    path: '/today',
    head: 'Everyone at home sees what’s due.',
    body: 'The sky over your own house, and the day under it. Weather outside, what is due inside, and what is happening around you.',
  },
  {
    name: 'Mail',
    path: '/mail',
    head: 'Letters and cards, delivered at 7 a.m.',
    body: 'A mailbox for your home, on your phone. Mail comes once each morning, stamped and sealed. No paper, no truck, no pile on the counter, and nothing lost in a feed.',
  },
  {
    name: 'Christmas cards',
    path: '/cards',
    head: 'A Christmas card they open by hand.',
    body: 'Write a few words, sign it yourself, seal it by hand. It stays sealed until 7:00 a.m. on Christmas morning, wherever they live.',
  },
  {
    name: 'Pulse',
    path: '/pulse',
    head: 'Know what’s going on. No crime alerts.',
    body: 'Questions, recommendations, events, deals and good news from around you, and updates from the people you know. See it as a list, or on a map that shows where things are happening.',
  },
  {
    name: 'Support Train',
    path: '/support-train',
    head: 'When someone needs help, show up.',
    body: 'A new baby, a surgery, a loss. Organize meals, groceries and the things a household needs, one day at a time, so nobody has to ask twice.',
  },
  {
    name: 'Plans',
    path: '/plans',
    head: 'Make plans with the people in your life.',
    body: 'Friends, family, the team, the people nearby. Pick a kind and a time. The exact spot shows once the host says yes.',
  },
  {
    name: 'Moments',
    path: '/moments',
    head: 'See the moments around you.',
    body: 'Short posts with a real place attached. Photos, videos and a few words, on the map where they happened, gone in a day or two.',
  },
  {
    name: 'Messages',
    path: '/chat',
    head: 'Talk with the people in your life.',
    body: 'Direct and group chats, the chat a plan opens at the first yes, a Support Train’s group chat, and the homes on your block once you are verified.',
  },
  {
    name: 'Pantopus AI',
    path: '',
    head: 'Pantopus AI connects all of it.',
    body: 'One assistant that knows your place, your day, your mail and your plans. Ask it on any screen. Nothing happens without your yes.',
  },
];

// The pages that exist now: the pillar pages as they are listed, plus the card pages, which have been public since
// before the pillar pages.
function partPage(path: string): string | null {
  if (path === '/cards') return '/cards';
  return PILLAR_PAGES.some((page) => page.path === path) ? path : null;
}

const WAYS_TO_VERIFY = [
  'A code on a postcard, mailed to your door',
  'A bill or your lease',
  'Your landlord says yes',
  'Your phone number, being at home right now, or a bill read on the spot',
];

const STAYS_YOURS = [
  'Your address is never sold and never used for ads',
  'Nobody sees your house number or unit',
  'Verified homes are counted in ranges, never shown as dots',
  'Other people see a post’s area, not your door',
];

const WHO = [
  {
    label: 'People at home',
    body: 'Owners and renters. Your address’s record, your home’s day and your mail, in one place.',
  },
  {
    label: 'Households',
    body: 'Members with roles, shared tasks with an owner and a due date, documents where the right people find them.',
  },
  {
    label: 'Friends and family',
    body: 'Game nights, dinners, trips and birthdays. Guests answer in a browser, without the app.',
  },
  {
    label: 'People who show up',
    body: 'When someone has a new baby, a surgery or a loss, a calendar of meals with one helper each day.',
  },
  {
    label: 'Local businesses',
    body: 'Plans hosted by the places people like, and mail sent as your business to real homes by city, ZIP or distance.',
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-app-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd([{ name: 'About', path: '/about' }])) }}
      />
      <SiteNav />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 via-white to-white dark:from-gray-900 dark:via-gray-950 dark:to-gray-950 pt-20 pb-16">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full bg-primary-100/50 dark:bg-primary-900/20 blur-3xl" />
          </div>
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200/60 dark:border-primary-700/30 bg-app-surface/80 px-4 py-1.5 text-sm text-primary-700 dark:text-primary-300 font-medium mb-8">
              Real life, connected
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-app-text dark:text-white leading-tight tracking-tight mb-6">
              About Pantopus
            </h1>
            <p className="text-xl md:text-2xl text-app-text-secondary dark:text-app-text-muted leading-relaxed max-w-2xl mx-auto">
              Pantopus is one app for the place where your life actually happens. Every account starts at a real home, so the people, the mail and the news around you are real.
            </p>
          </div>
        </section>

        {/* What Pantopus is */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="prose-custom">
            <p className="text-xl text-app-text-strong leading-relaxed mb-6">Pantopus starts with your home.</p>
            <p className="text-lg text-app-text-secondary dark:text-app-text-muted leading-relaxed mb-6">
              Anyone can make an account. A bot can write a post. Nobody can make up the address they live at. Pantopus ties each person to a real home, so there is a real person behind every post, plan and letter.
            </p>
            <p className="text-lg text-app-text-secondary dark:text-app-text-muted leading-relaxed">
              From there it connects your home to everything around it: the public record of your address, your household&apos;s day, your mail, what is going on around you, the people who need a hand, and the plans and moments that fill a week. There is no main feed. What you see starts at a real place.
            </p>
          </div>
        </section>

        {/* The Verified home */}
        <section className="bg-app-surface-raised/40 border-y border-app-border-subtle py-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-app-text dark:text-white mb-4 text-center">
              A home is hard to fake.
            </h2>
            <p className="text-app-text-secondary dark:text-app-text-muted text-center text-lg mb-14 max-w-2xl mx-auto">
              Proven by where you actually live. Verify once and the people around you know you are real. You stay private: a first name and a street, at most.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-app-surface border border-app-border-subtle rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-app-text dark:text-white mb-3">Four ways to prove it</h3>
                <ul className="space-y-2 text-app-text-secondary dark:text-app-text-muted leading-relaxed list-disc pl-5">
                  {WAYS_TO_VERIFY.map((way) => (
                    <li key={way}>{way}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-app-surface border border-app-border-subtle rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-app-text dark:text-white mb-3">What stays yours</h3>
                <ul className="space-y-2 text-app-text-secondary dark:text-app-text-muted leading-relaxed list-disc pl-5">
                  {STAYS_YOURS.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* The parts of the app */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <h2 className="text-3xl md:text-4xl font-bold text-app-text dark:text-white mb-4 text-center">
            What is in Pantopus
          </h2>
          <p className="text-app-text-secondary dark:text-app-text-muted text-center text-lg mb-14">
            One home, then the street, then the town. Each part of the app works at its own scale.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {PARTS.map((part) => {
              const page = partPage(part.path);
              return (
                <div key={part.name} className="bg-app-surface border border-app-border-subtle rounded-2xl p-6 shadow-sm">
                  <p className="text-sm font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300 mb-2">{part.name}</p>
                  <h3 className="text-lg font-bold text-app-text dark:text-white mb-2">{part.head}</h3>
                  <p className="text-app-text-secondary dark:text-app-text-muted leading-relaxed">{part.body}</p>
                  {page ? (
                    <Link href={page} className="inline-block mt-4 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                      More about {part.name}
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {/* Who it's for */}
        <section className="bg-app-surface-raised/40 border-y border-app-border-subtle py-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-app-text dark:text-white mb-4 text-center">
              Who Pantopus is for
            </h2>
            <p className="text-app-text-secondary dark:text-app-text-muted text-center text-lg mb-14">
              Anyone who lives somewhere, and the people and places around them.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {WHO.map(({ label, body }) => (
                <div key={label} className="bg-app-surface border border-app-border-subtle rounded-2xl p-6">
                  <h3 className="font-bold text-app-text dark:text-white mb-2">{label}</h3>
                  <p className="text-sm text-app-text-secondary dark:text-app-text-muted leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Data and contact */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 grid md:grid-cols-2 gap-10">
          <div>
            <h2 className="text-2xl font-bold text-app-text dark:text-white mb-4">Where the facts come from</h2>
            <p className="text-app-text-secondary dark:text-app-text-muted leading-relaxed mb-4">
              The facts about an address come from public files: county property records, and maps and data published by government agencies, from flood zones to radon and air quality. Every fact names its source in the app.
            </p>
            <p className="text-app-text-secondary dark:text-app-text-muted leading-relaxed">
              The publishers who ask to be credited are listed on{' '}
              <Link href="/about/data-sources" className="font-semibold text-primary-700 dark:text-primary-300 hover:underline">our data sources page</Link>
              . You can read the property records by state and county on{' '}
              <Link href="/property-records" className="font-semibold text-primary-700 dark:text-primary-300 hover:underline">Property records</Link>.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-app-text dark:text-white mb-4">How to reach us</h2>
            <p className="text-app-text-secondary dark:text-app-text-muted leading-relaxed mb-4">
              Pantopus is made by Pantopus, Inc. Write to support@pantopus.com for help with your account, business@pantopus.com about a business, and privacy@pantopus.com about privacy or legal questions.
            </p>
            <Link href="/contact" className="font-semibold text-primary-700 dark:text-primary-300 hover:underline">
              Contact us
            </Link>
          </div>
        </section>

        {/* Closing */}
        <section className="bg-gray-950 text-white py-20">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-glass/10 text-gray-300 text-xs font-semibold px-3 py-1.5 mb-8 tracking-wide uppercase">
              Free on iPhone and Android
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Social media gave everyone a feed. Pantopus gives everyone a place.
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed mb-10">
              Your address is never sold. Never used for ads.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/start"
                className="inline-flex items-center gap-2 bg-primary-600 text-white px-8 py-3.5 rounded-xl text-base font-semibold hover:bg-primary-700 transition"
              >
                See your place
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <a href={IOS_APP_STORE_URL} className="text-slate-300 font-semibold hover:text-white underline-offset-4 hover:underline">
                App Store
              </a>
              <a href={ANDROID_PLAY_STORE_URL} className="text-slate-300 font-semibold hover:text-white underline-offset-4 hover:underline">
                Google Play
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

// ── Shared Nav ───────────────────────────────────────────────────────────────
function SiteNav() {
  return (
    <nav className="sticky top-0 z-50 bg-app-surface/90 backdrop-blur-md border-b border-app-border-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2.5">
            <LayoutDashboard className="w-7 h-7 text-primary-600" />
            <div className="flex flex-col leading-none">
              <span className="text-xl font-bold tracking-tight text-primary-700 dark:text-primary-400">Pantopus</span>
              <span className="hidden sm:block text-[10px] font-medium text-app-text-muted dark:text-app-text-secondary tracking-wide uppercase">Real life, connected</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-app-text-strong hover:text-primary-700 dark:hover:text-primary-300 px-3 py-2 transition">
              Log in
            </Link>
            <Link href="/register" className="text-sm font-semibold bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition shadow-sm">
              Get started free
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

// ── Shared Footer ─────────────────────────────────────────────────────────────
function SiteFooter() {
  return (
    <footer className="bg-gray-900 text-slate-400 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-5 gap-8 mb-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              <LayoutDashboard className="w-5 h-5 text-primary-600" />
              <span className="text-lg font-bold text-white">Pantopus</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
              Real life, connected. Every account starts at a real home.
            </p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm">Product</h3>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/#how-it-works" className="hover:text-white transition">How it works</Link></li>
              <li><Link href="/start" className="hover:text-white transition">See your place</Link></li>
              <li><Link href="/property-records" className="hover:text-white transition">Property records</Link></li>
              <li><Link href="/tax-check" className="hover:text-white transition">Property tax check</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm">Company</h3>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/about" className="hover:text-white transition">About</Link></li>
              <li><Link href="/contact" className="hover:text-white transition">Contact</Link></li>
              <li><Link href="/about/data-sources" className="hover:text-white transition">Data sources</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm">Legal</h3>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/privacy" className="hover:text-white transition">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-white transition">Terms</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-8 text-center text-sm text-slate-400">
          <p>© 2026 Pantopus. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
