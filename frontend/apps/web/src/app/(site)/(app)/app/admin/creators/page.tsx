'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, RefreshCw, Search, ShieldAlert, Users } from 'lucide-react';
import * as api from '@pantopus/api';
import { getAuthToken } from '@pantopus/api';
import { toast } from '@/components/ui/toast-store';

type CreatorSales = api.admin.CreatorSales;
type CreatorAccount = api.admin.CreatorAccount;

const SIZES = ['5', '20', '50'];
const CODE_SHAPE = /^[A-Za-z0-9]{6,12}$/;

const dollars = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

function accountLabel(a: CreatorAccount | null) {
  if (!a) return 'Account deleted';
  if (a.name && a.username) return `${a.name} (@${a.username})`;
  return a.name || (a.username ? `@${a.username}` : 'Unnamed account');
}

/** The percentage typed in the box, or null while it isn't a number from 0 to 100. It's never saved. */
function percentFrom(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const isForbidden = (err: unknown) => {
  const e = err as { statusCode?: number; status?: number } | null;
  return e?.statusCode === 403 || e?.status === 403;
};

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Link copied');
  } catch {
    toast.error('Could not copy. Select the link and copy it.');
  }
}

// Creator links for Christmas cards: the founder gives a creator's account a readable code, the creator shares
// pantopus.com/cards?ref=CODE, and this page counts the stamp books bought by people who joined through it.
export default function AdminCreatorsPage() {
  const router = useRouter();
  const [creators, setCreators] = useState<CreatorSales[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [percent, setPercent] = useState('');

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<CreatorAccount[] | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const [giving, setGiving] = useState<string | null>(null);

  useEffect(() => { if (!getAuthToken()) router.push('/login'); }, [router]);

  const fetchReport = useCallback(async () => {
    try {
      const result = await api.admin.getCreatorSales();
      setCreators(result.creators || []);
    } catch (err) {
      if (isForbidden(err)) {
        setDenied(true);
        return;
      }
      toast.error('Failed to load the creator report');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchReport().finally(() => setLoading(false));
  }, [fetchReport]);

  const find = async (e: FormEvent) => {
    e.preventDefault();
    if (searching || query.trim().length < 2) return;
    setSearching(true);
    try {
      const result = await api.admin.findCreatorAccounts(query.trim());
      setFound(result.accounts || []);
      setRefusals({});
    } catch (err) {
      toast.error(errorText(err, 'Failed to look up the account'));
    } finally {
      setSearching(false);
    }
  };

  const give = async (account: CreatorAccount) => {
    const code = (codes[account.id] || '').trim();
    if (!CODE_SHAPE.test(code)) {
      setRefusals((r) => ({ ...r, [account.id]: 'A code is 6 to 12 letters and digits, with no spaces, dashes or other marks.' }));
      return;
    }
    if (giving) return;
    setGiving(account.id);
    setRefusals((r) => ({ ...r, [account.id]: '' }));
    try {
      const result = await api.admin.giveCreatorCode(account.id, code);
      toast.success(`${result.code} is ${accountLabel(result.account)}'s code`);
      setFound((list) => (list || []).map((a) => (a.id === account.id ? { ...a, creator_code: result.code } : a)));
      await fetchReport();
    } catch (err) {
      setRefusals((r) => ({ ...r, [account.id]: errorText(err, 'Failed to save the code') }));
    } finally {
      setGiving(null);
    }
  };

  const pct = percentFrom(percent);
  const owed = (cents: number) => (pct === null ? null : Math.round((cents * pct) / 100));
  const totals = creators.reduce(
    (t, c) => ({ joined: t.joined + c.joined, books: t.books + c.books_total, sales: t.sales + c.sales_cents }),
    { joined: 0, books: 0, sales: 0 },
  );

  return (
    <div className="min-h-screen bg-app-surface">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-app-border bg-app-surface">
        <button onClick={() => router.back()} className="p-1.5 hover:bg-app-hover rounded-lg transition" aria-label="Back"><ArrowLeft className="w-5 h-5 text-app-text" /></button>
        <h1 className="text-xl font-bold text-app-text flex-1">Creator links</h1>
        {!denied && (
          <button onClick={() => { setLoading(true); fetchReport().finally(() => setLoading(false)); }} className="p-1.5 hover:bg-app-hover rounded-lg transition" aria-label="Refresh">
            <RefreshCw className={`w-4.5 h-4.5 text-app-text-secondary ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {denied ? (
          <div className="flex flex-col items-center justify-center py-24 text-center" data-testid="admin-creators-denied">
            <ShieldAlert className="w-14 h-14 text-app-text-muted mb-4" />
            <p className="text-lg font-semibold text-app-text">Admins only</p>
            <p className="text-sm text-app-text-secondary mt-1">You do not have admin access.</p>
            <Link href="/app" className="mt-4 px-4 py-2 rounded-lg text-sm font-medium border border-app-border text-app-text hover:bg-app-hover transition">
              Back to Pantopus
            </Link>
          </div>
        ) : (
          <>
            <section className="rounded-xl border border-app-border bg-app-surface p-4" data-testid="admin-creators-give">
              <h2 className="text-base font-semibold text-app-text">Give a creator a code</h2>
              <p className="text-sm text-app-text-secondary mt-1">
                Find their Pantopus account by email address or username, then type a code of 6 to 12 letters and digits.
                Codes are kept in capitals, and a link typed in any case still counts.
              </p>
              <form onSubmit={find} className="mt-3 flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Email address or username"
                  aria-label="Email address or username"
                  className="flex-1 min-w-0 rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text"
                  data-testid="admin-creators-query"
                />
                <button
                  type="submit"
                  disabled={searching || query.trim().length < 2}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition"
                >
                  <Search className="w-4 h-4" />Find
                </button>
              </form>
              {found && found.length === 0 && (
                <p className="mt-3 text-sm text-app-text-secondary">No account has that email address or username.</p>
              )}
              {found && found.length > 0 && (
                <ul className="mt-3 space-y-2" data-testid="admin-creators-found">
                  {found.map((account) => (
                    <li key={account.id} className="rounded-lg border border-app-border p-3">
                      <p className="text-sm font-medium text-app-text">{accountLabel(account)}</p>
                      {account.email && <p className="text-xs text-app-text-muted">{account.email}</p>}
                      {account.creator_code ? (
                        <p className="mt-2 text-sm text-app-text-secondary">Has the code <span className="font-semibold text-app-text">{account.creator_code}</span>.</p>
                      ) : (
                        <div className="mt-2 flex gap-2">
                          <input
                            value={codes[account.id] || ''}
                            onChange={(e) => setCodes((c) => ({ ...c, [account.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); give(account); } }}
                            placeholder="GRACEFM"
                            aria-label="Code"
                            maxLength={12}
                            autoCapitalize="characters"
                            className="w-40 rounded-lg border border-app-border bg-app-surface px-3 py-1.5 text-sm uppercase text-app-text"
                            data-testid="admin-creators-code"
                          />
                          <button
                            type="button"
                            onClick={() => give(account)}
                            disabled={giving === account.id}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition"
                            data-testid="admin-creators-give-code"
                          >
                            Give code
                          </button>
                        </div>
                      )}
                      {refusals[account.id] ? <p className="mt-2 text-sm text-red-600" role="alert">{refusals[account.id]}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section data-testid="admin-creators-report">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-app-text">Stamp books bought through each link</h2>
                  <p className="text-sm text-app-text-secondary mt-1">
                    Only people who created their account through the creator&rsquo;s link count. Sales are at list price,
                    before store and card fees. Refunded books are shown but not counted.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-app-text">
                  Pay
                  <input
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    aria-label="Percentage to pay"
                    className="w-20 rounded-lg border border-app-border bg-app-surface px-3 py-1.5 text-sm text-right text-app-text"
                    data-testid="admin-creators-percent"
                  />
                  %
                </label>
              </div>
              {percent.trim() && pct === null && (
                <p className="mt-2 text-sm text-red-600">Type a number from 0 to 100.</p>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-2 border-violet-600 border-t-transparent rounded-full" /></div>
              ) : creators.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="w-12 h-12 text-app-text-muted mb-3" />
                  <p className="text-sm text-app-text-secondary">No creator has a code yet.</p>
                </div>
              ) : (
                <>
                  <p className="mt-4 text-sm text-app-text" data-testid="admin-creators-totals">
                    All creators: {totals.joined} joined · {totals.books} books · {dollars(totals.sales)}
                    {pct !== null ? ` · ${dollars(owed(totals.sales) ?? 0)} owed at ${pct}%` : ''}
                  </p>
                  <ul className="mt-3 space-y-3" data-testid="admin-creators-list">
                    {creators.map((c) => (
                      <li key={c.code} className="rounded-xl border border-app-border bg-app-surface p-4" data-testid={`admin-creator.${c.code}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase px-2 py-1 rounded bg-violet-50 text-violet-700">{c.code}</span>
                          <p className="text-sm font-medium text-app-text">{accountLabel(c.account)}</p>
                          {c.account?.email && <p className="text-xs text-app-text-muted">{c.account.email}</p>}
                        </div>
                        <div className="mt-2 flex items-center gap-2 min-w-0">
                          <code className="flex-1 min-w-0 truncate rounded-lg bg-app-surface-sunken px-2 py-1 text-xs text-app-text">{c.link}</code>
                          <button type="button" onClick={() => copy(c.link)} className="p-1.5 hover:bg-app-hover rounded-lg transition" aria-label="Copy link">
                            <Copy className="w-4 h-4 text-app-text-secondary" />
                          </button>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div><dt className="text-xs text-app-text-muted">Joined</dt><dd className="font-semibold text-app-text" data-testid="creator-joined">{c.joined}</dd></div>
                          <div><dt className="text-xs text-app-text-muted">Bought books</dt><dd className="font-semibold text-app-text" data-testid="creator-buyers">{c.buyers} {c.buyers === 1 ? 'person' : 'people'}</dd></div>
                          <div><dt className="text-xs text-app-text-muted">Sales</dt><dd className="font-semibold text-app-text" data-testid="creator-sales">{dollars(c.sales_cents)}</dd></div>
                          <div>
                            <dt className="text-xs text-app-text-muted">Owed{pct !== null ? ` at ${pct}%` : ''}</dt>
                            <dd className="font-semibold text-app-text" data-testid="creator-owed">{pct === null ? 'Type a %' : dollars(owed(c.sales_cents) ?? 0)}</dd>
                          </div>
                        </dl>
                        <table className="mt-3 w-full text-sm">
                          <thead>
                            <tr className="text-xs text-app-text-muted">
                              <th className="text-left font-normal">Books</th>
                              {SIZES.map((n) => <th key={n} className="text-right font-normal">{n} stamps</th>)}
                              <th className="text-right font-normal">All</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="text-app-text" data-testid="creator-books">
                              <td>Bought</td>
                              {SIZES.map((n) => <td key={n} className="text-right">{c.books[n] ?? 0}</td>)}
                              <td className="text-right font-semibold">{c.books_total}</td>
                            </tr>
                            <tr className="text-app-text-secondary" data-testid="creator-refunded">
                              <td>Refunded (not counted)</td>
                              {SIZES.map((n) => <td key={n} className="text-right">{c.refunded[n] ?? 0}</td>)}
                              <td className="text-right">{c.refunded_total}</td>
                            </tr>
                          </tbody>
                        </table>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
