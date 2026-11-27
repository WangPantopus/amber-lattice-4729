import type { Metadata } from 'next';
import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { publicPageMetadata } from '@/lib/site/pageMetadata';
import SiteFooter from '@/components/site/SiteFooter';

// ─────────────────────────────────────────────────────────────────────────────
// Pantopus — /about/explore
// frontend/apps/web/src/app/(site)/about/explore/page.tsx
//
// How Pulse orders what it shows and how Explore picks (Pulse, reinvented, phase 1, PHASE-1.md section 4: the
// founder's decision 7, the rules on a page anyone can read). Reachable without signing in; the reach dial links here.
// Kept out of search engines while `pulse_reinvented` is off in production (docs/seo/README.md: nothing switched off
// is made public to win a search). The founder looks at this page before switching it on there; its search work
// (index, sitemap, links in) comes with that.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  ...publicPageMetadata({
    path: '/about/explore',
    title: 'How Pulse and Explore choose what you see',
    description:
      'The whole rule for what Pantopus Pulse shows: your close circle newest first, around you nearest first, and Explore’s ten picked a day by how many people marked them, then newest. No hidden ranking.',
  }),
  robots: { index: false, follow: true },
};

const REACH = [
  { name: 'Close circle', line: 'The people you’re connected with. Newest first.' },
  { name: 'Around me', line: 'Within 1 to 25 miles of your place, as you choose. Nearest first, newest first inside each distance. Distance is only ever shown as a band (your street, your town, 2, 5, 10 or 25 miles).' },
  { name: 'Explore', line: 'Places beyond your own: ten picked a day, then newest first.' },
];

export default function ExploreRulesPage() {
  return (
    <div className="min-h-screen bg-app-surface">
      <SiteNav />

      <main>
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-6">
          <p className="text-sm font-semibold text-primary-700 dark:text-primary-300 mb-3">Pulse</p>
          <h1 className="text-4xl md:text-5xl font-extrabold text-app-text dark:text-white leading-tight tracking-tight mb-5">
            How Pulse and Explore choose what you see
          </h1>
          <p className="text-lg text-app-text-secondary dark:text-app-text-muted leading-relaxed">
            No hidden ranking. This page is the whole rule.
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 space-y-10">
          <Rule title="How far Pulse looks">
            <ul className="space-y-3">
              {REACH.map((r) => (
                <li key={r.name}>
                  <strong className="text-app-text dark:text-white">{r.name}.</strong> {r.line}
                </li>
              ))}
            </ul>
          </Rule>

          <Rule title="What can be in Explore">
            <p>
              A Moment or post is in Explore only if its author chose it, per post: one row when they post, “Also show in
              Explore”, off by default, with one line under it: “People anywhere can see this, with its place.”
            </p>
            <p>
              It is not offered at home, under a made-up name, for a Moment with no place, or for an Ask, Offer, Heads-up or
              Lost and found. Those stay tied to the place and who lives there.
            </p>
          </Rule>

          <Rule title="Today, elsewhere">
            <p>
              Each day, the ten with signals from the most different people in the last 24 hours, at most one per author and
              two per town, never from your own town. Counted by people, never by watch time.
            </p>
          </Rule>

          <Rule title="Then newest first">
            <p>Then newest first, with variety: no two in a row from one author or one town. Explore pauses now and then to ask “Keep exploring?”.</p>
          </Rule>

          <Rule title="Why am I seeing this?">
            <p>Every card in Explore answers in one line: “Picked today: 14 people marked it”, or “New from Kyoto”.</p>
          </Rule>

          <Rule title="Your choices still apply">
            <p>
              Your blocks, mutes and reports apply in Explore as everywhere in Pantopus, and Explore only shows what its
              author could already share with people nearby.
            </p>
          </Rule>

          <p className="text-sm text-app-text-muted">
            Questions? <Link href="/contact" className="text-primary-700 dark:text-primary-300 font-medium hover:underline">Contact us</Link>.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-app-text dark:text-white mb-3">{title}</h2>
      <div className="space-y-3 text-app-text-secondary dark:text-app-text-muted leading-relaxed">{children}</div>
    </div>
  );
}

function SiteNav() {
  return (
    <nav className="sticky top-0 z-50 bg-app-surface/90 backdrop-blur-md border-b border-app-border-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2.5">
            <LayoutDashboard className="w-7 h-7 text-primary-600" />
            <span className="text-xl font-bold tracking-tight text-primary-700 dark:text-primary-400">Pantopus</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-app-text-strong hover:text-primary-700 dark:hover:text-primary-300 px-3 py-2 transition">Log in</Link>
            <Link href="/register" className="text-sm font-semibold bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition shadow-sm">Get started free</Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
