'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, ShieldAlert } from 'lucide-react';
import * as api from '@pantopus/api';
import { getAuthToken } from '@pantopus/api';
import { toast } from '@/components/ui/toast-store';

type Summary = api.admin.FunnelSummary;
type CardCounts = api.admin.FunnelCardCounts;

const WINDOWS = [7, 30, 90];
const SIZES = ['5', '20', '50'];

const isForbidden = (err: unknown) => {
  const e = err as { statusCode?: number; status?: number } | null;
  return e?.statusCode === 403 || e?.status === 403;
};
const dollars = (cents: number | null) =>
  cents === null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n * 1000) / 10}%`);
const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));
const books = (b: Record<string, number> | null) => (b ? SIZES.map((n) => b[n] ?? 0).join(' / ') : '—');

/** The cards table's columns: a heading, what it means (the header's tooltip), and the cell. */
const CARD_COLUMNS: { label: string; title: string; cell: (c: CardCounts) => string }[] = [
  { label: 'Senders', title: 'People who sent at least one card', cell: (c) => num(c.senders) },
  { label: 'Sent', title: 'Cards sent (not counting pass-ons)', cell: (c) => num(c.cards_sent) },
  { label: 'Per sender', title: 'Cards sent per sender', cell: (c) => num(c.cards_per_sender) },
  { label: 'To a person', title: 'Sent to someone on Pantopus', cell: (c) => num(c.by_via.person) },
  { label: 'By email', title: 'Sent by email', cell: (c) => num(c.by_via.email) },
  { label: 'By link', title: 'Sent by link', cell: (c) => num(c.by_via.link) },
  { label: 'Taken back', title: 'Cards their sender took back', cell: (c) => num(c.taken_back) },
  { label: 'Pages seen*', title: 'Link pages read signed out by a browser or an app', cell: (c) => num(c.pages_seen) },
  { label: 'Codes', title: 'Sign-in codes sent from a card’s page', cell: (c) => num(c.codes_sent) },
  { label: 'Claimed', title: 'Cards by email or link someone took', cell: (c) => num(c.claimed) },
  { label: 'Joined', title: 'Claimed by an account made after the card was sealed', cell: (c) => num(c.joined) },
  { label: 'Joined, then sent', title: 'Joiners who sent a card of their own within 7 days (on the day they joined)', cell: (c) => num(c.joiners_who_sent) },
  { label: 'Replies', title: 'Cards written back to', cell: (c) => num(c.replies) },
  { label: 'Passed on', title: 'Travelling cards passed on, one person each', cell: (c) => num(c.passed_on) },
  { label: 'Passers', title: 'People who passed a card on', cell: (c) => num(c.passers) },
  { label: 'Books 5 / 20 / 50', title: 'Stamp books bought, by size (refunds apart)', cell: (c) => books(c.books) },
  { label: 'Refunded', title: 'Stamp books refunded, by size', cell: (c) => books(c.refunded) },
  { label: 'Sales', title: 'Books not refunded, at list price', cell: (c) => dollars(c.sales_cents) },
  { label: 'Loop', title: 'Joiners who sent their own, per sender (0.50 = one for every two senders)', cell: (c) => (c.loop === null ? '—' : c.loop.toFixed(2)) },
];

function KeyValues({ title, rows, testId }: { title: string; rows: [string, string][]; testId: string }) {
  return (
    <section className="rounded-xl border border-app-border bg-app-surface p-4" data-testid={testId}>
      <h2 className="text-base font-semibold text-app-text">{title}</h2>
      <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k}><dt className="text-xs text-app-text-muted">{k}</dt><dd className="font-semibold text-app-text">{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}

// The funnel read-out (GET /api/admin/funnel/summary): the Christmas cards loop by UTC day with the window's totals on
// top, then the wedge ladder, Plans and activation the summary already returned. Totals only, never one person's line.
export default function AdminFunnelPage() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => { if (!getAuthToken()) router.push('/login'); }, [router]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await api.admin.getFunnelSummary(days));
    } catch (err) {
      if (isForbidden(err)) setDenied(true);
      else toast.error('Failed to load the funnel');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const cards = summary?.cards;
  const cardDays = cards ? [...cards.days].reverse() : [];

  return (
    <div className="min-h-screen bg-app-surface">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-app-border bg-app-surface">
        <button onClick={() => router.back()} className="p-1.5 hover:bg-app-hover rounded-lg transition" aria-label="Back"><ArrowLeft className="w-5 h-5 text-app-text" /></button>
        <h1 className="text-xl font-bold text-app-text flex-1">Funnel</h1>
        {!denied && (
          <button onClick={() => fetchReport()} className="p-1.5 hover:bg-app-hover rounded-lg transition" aria-label="Refresh">
            <RefreshCw className={`w-4.5 h-4.5 text-app-text-secondary ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {denied ? (
          <div className="flex flex-col items-center justify-center py-24 text-center" data-testid="admin-funnel-denied">
            <ShieldAlert className="w-14 h-14 text-app-text-muted mb-4" />
            <p className="text-lg font-semibold text-app-text">Admins only</p>
            <p className="text-sm text-app-text-secondary mt-1">You do not have admin access.</p>
            <Link href="/app" className="mt-4 px-4 py-2 rounded-lg text-sm font-medium border border-app-border text-app-text hover:bg-app-hover transition">
              Back to Pantopus
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Window">
              {WINDOWS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  aria-pressed={days === d}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${days === d ? 'bg-violet-600 text-white border-violet-600' : 'border-app-border text-app-text hover:bg-app-hover'}`}
                >
                  Last {d} days
                </button>
              ))}
              {summary && <span className="text-xs text-app-text-muted">Since {new Date(summary.since).toUTCString().replace(' GMT', ' UTC')}</span>}
            </div>

            {loading && !summary ? (
              <div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-2 border-violet-600 border-t-transparent rounded-full" /></div>
            ) : cards ? (
              <>
                <section data-testid="admin-funnel-cards">
                  <h2 className="text-base font-semibold text-app-text">Christmas cards</h2>
                  <p className="text-sm text-app-text-secondary mt-1">
                    Days are UTC days. *Pages seen counts every read of a card&rsquo;s link page signed out by a browser
                    or an app, so it&rsquo;s a ceiling, not people: the same person can open it again, and a robot that
                    runs the page counts too. The page&rsquo;s own server reads (one per web visit, and one per link
                    preview) are left out: {num(cards.page_server_reads)} in this window. A card to someone already on
                    Pantopus never goes through a claim, so its opening isn&rsquo;t here. Passed-on cards aren&rsquo;t in Sent.
                  </p>
                  <div className="mt-3 overflow-x-auto rounded-xl border border-app-border">
                    <table className="w-full text-sm whitespace-nowrap">
                      <thead>
                        <tr className="text-xs text-app-text-muted border-b border-app-border">
                          <th className="text-left font-normal px-3 py-2 sticky left-0 bg-app-surface">Day</th>
                          {CARD_COLUMNS.map((col) => <th key={col.label} title={col.title} className="text-right font-normal px-3 py-2">{col.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="font-semibold text-app-text border-b border-app-border bg-app-surface-sunken" data-testid="admin-funnel-cards-total">
                          <td className="px-3 py-2 sticky left-0 bg-app-surface-sunken">Last {summary?.days} days</td>
                          {CARD_COLUMNS.map((col) => <td key={col.label} className="text-right px-3 py-2">{col.cell(cards)}</td>)}
                        </tr>
                        {cardDays.map((d) => {
                          const quiet = d.cards_sent + d.pages_seen + d.claimed + d.replies + d.passed_on + d.taken_back + d.codes_sent === 0
                            && !(d.books && SIZES.some((n) => d.books?.[n]));
                          return (
                            <tr key={d.day} className={`border-b border-app-border last:border-0 ${quiet ? 'text-app-text-muted' : 'text-app-text'}`} data-testid={`admin-funnel-cards-day.${d.day}`}>
                              <td className="px-3 py-2 sticky left-0 bg-app-surface">{d.day}</td>
                              {CARD_COLUMNS.map((col) => <td key={col.label} className="text-right px-3 py-2">{col.cell(d)}</td>)}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-app-text-muted">
                    Stamps on cards sent: {num(cards.by_stamp.free)} free, {num(cards.by_stamp.paid)} bought
                    {cards.by_stamp.none ? `, ${num(cards.by_stamp.none)} with stamps off` : ''}. Cards that travel: {num(cards.travels)}.
                  </p>
                </section>

                {summary && (
                  <>
                    <KeyValues
                      title="The ladder"
                      testId="admin-funnel-ladder"
                      rows={[
                        ['Previews', num(summary.ladder.previews)], ['Aha cards', `${num(summary.ladder.aha_views)} · ${pct(summary.rates.aha)}`],
                        ['Shares', `${num(summary.ladder.shares)} · ${pct(summary.rates.share)}`], ['Walls', `${num(summary.ladder.walls)} · ${pct(summary.rates.wall)}`],
                        ['Sign-ups started', `${num(summary.ladder.registers)} · ${pct(summary.rates.register)}`],
                        ['Accounts', `${num(summary.ladder.accounts)} · ${pct(summary.rates.account)}`],
                      ]}
                    />
                    <KeyValues
                      title="Plans"
                      testId="admin-funnel-plans"
                      rows={[
                        ...Object.entries(summary.plans.events).map(([k, v]): [string, string] => [k.replace(/_/g, ' '), num(v)]),
                        ...Object.entries(summary.plans.rates).map(([k, v]): [string, string] => [`${k.replace(/_/g, ' ')} rate`, pct(v)]),
                      ]}
                    />
                    <KeyValues
                      title="First week (accounts made in the window)"
                      testId="admin-funnel-activation"
                      rows={[
                        ['Accounts', num(summary.activation.cohort_users)], ['Set up in their first week', num(summary.activation.activated_users)],
                        ['A full week old', num(summary.activation.matured_users)], ['Of those, set up', num(summary.activation.activated_matured_users)],
                        ['Rate', pct(summary.activation.matured_rate)],
                      ]}
                    />
                    <KeyValues
                      title="Every event in the window"
                      testId="admin-funnel-events"
                      rows={Object.entries(summary.events).filter(([, v]) => v > 0).map(([k, v]): [string, string] => [k, num(v)])}
                    />
                    {summary.truncated && (
                      <p className="text-sm text-red-600">More than {num(summary.rows)} events in this window: the counts above are cut short.</p>
                    )}
                  </>
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
