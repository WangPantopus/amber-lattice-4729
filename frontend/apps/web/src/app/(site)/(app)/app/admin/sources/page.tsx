'use client';

import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import * as api from '@pantopus/api';
import { getAuthToken } from '@pantopus/api';
import { toast } from '@/components/ui/toast-store';

type Region = api.admin.AroundSourceRegion;
type Source = api.admin.AroundSource;
type Kind = { id: string; label: string };

const KEEP_CHOICES: { label: string; hours: number | null }[] = [
  { label: 'As its section', hours: null },
  { label: '3 days', hours: 72 },
  { label: 'A week (a weekly paper)', hours: 168 },
];

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const statusOf = (err: unknown) => {
  const e = err as { statusCode?: number; status?: number } | null;
  return e?.statusCode ?? e?.status ?? null;
};
const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never';

/** "20 items · 12 in the last 7 days · 3 of 20 name Leavenworth or Chelan County" */
function numbersLine(source: Source) {
  const n = source.note;
  if (!n || n.items === null) return null;
  const calendar = n.format === 'ical';
  const parts = [`${num(n.items)} ${calendar ? 'events' : 'items'}`];
  if (n.recent_7d !== null) parts.push(calendar ? `${num(n.recent_7d)} in the next 7 days` : `${num(n.recent_7d)} in the last 7 days`);
  else if (!calendar) parts.push('no dates');
  // The content fetcher keeps a story for 48 hours after it was published.
  if (!calendar && n.recent_2d !== null && n.recent_2d !== undefined) parts.push(`${num(n.recent_2d)} in the last 2 days`);
  if (n.names_place !== null && n.place_words) {
    parts.push(`${num(n.names_place)} of ${num(calendar ? n.recent_7d : n.items)} name ${n.place_words}`);
  }
  return parts.join(' · ');
}

function subscriptionLine(source: Source) {
  const s = source.note?.subscription;
  if (!s) return null;
  if (s.asked === true) return `Asks for a subscription: ${s.sign}`;
  if (s.asked === false) return 'No sign of a subscription on a story page';
  return `Subscription not checked: ${s.sign}`;
}

function kindLabel(kinds: Kind[], id: string | null | undefined) {
  return kinds.find((k) => k.id === id)?.label || 'Source';
}

function SourceLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs text-violet-700 dark:text-violet-300 break-all hover:underline">
      {url}
      <ExternalLink className="w-3 h-3 shrink-0" />
    </a>
  );
}

function Proposal({ source, kinds, onDone }: { source: Source; kinds: Kind[]; onDone: () => void }) {
  const asked = source.note?.subscription?.asked === true;
  const [access, setAccess] = useState<'free' | 'subscription'>(asked ? 'subscription' : 'free');
  const [keep, setKeep] = useState<number | null>(null);
  const [name, setName] = useState(source.display_name);
  const [busy, setBusy] = useState(false);
  const numbers = numbersLine(source);
  const subscription = subscriptionLine(source);

  const act = async (approve: boolean) => {
    setBusy(true);
    try {
      if (approve) {
        await api.admin.approveAroundSource(source.id, { access, keep_hours: keep, display_name: name.trim() || null });
        toast.success(`${name.trim() || source.display_name} approved: it is read from the next run`);
      } else {
        await api.admin.rejectAroundSource(source.id);
        toast.success(`${source.display_name} rejected`);
      }
      onDone();
    } catch (err) {
      toast.error(errorText(err, approve ? 'Could not approve' : 'Could not reject'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-app-border p-3 space-y-2" data-testid={`admin-sources-proposal.${source.source_id}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-semibold text-app-text">{source.display_name}</span>
        <span className="text-xs text-app-text-muted">
          {kindLabel(kinds, source.note?.kind)} · {source.source_type === 'ical' ? 'calendar' : 'feed'} · {source.proposed_by === 'hand' ? 'added by hand' : 'found by the finder'}
        </span>
      </div>
      <SourceLink url={source.url} />
      {source.note?.why && <p className="text-sm text-app-text-secondary">{source.note.why}</p>}
      {numbers && <p className="text-sm text-app-text" data-testid="admin-sources-numbers">{numbers}</p>}
      {subscription && <p className="text-xs text-app-text-secondary">{subscription}</p>}
      {!!source.note?.samples?.length && (
        <ul className="text-xs text-app-text-secondary list-disc pl-5 space-y-0.5">
          {source.note.samples.map((sample, i) => <li key={i}>{sample}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2 pt-1">
        <label className="text-xs text-app-text-muted flex flex-col gap-1">
          Name on cards
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
            className="px-2 py-1.5 rounded-lg border border-app-border bg-app-surface text-sm text-app-text w-56" />
        </label>
        <label className="text-xs text-app-text-muted flex flex-col gap-1">
          Access
          <select value={access} onChange={(e) => setAccess(e.target.value as 'free' | 'subscription')}
            className="px-2 py-1.5 rounded-lg border border-app-border bg-app-surface text-sm text-app-text">
            <option value="free">Free</option>
            <option value="subscription">Subscription</option>
          </select>
        </label>
        <label className="text-xs text-app-text-muted flex flex-col gap-1">
          Stories stay
          <select value={keep === null ? '' : String(keep)} onChange={(e) => setKeep(e.target.value ? Number(e.target.value) : null)}
            className="px-2 py-1.5 rounded-lg border border-app-border bg-app-surface text-sm text-app-text">
            {KEEP_CHOICES.map((c) => <option key={c.label} value={c.hours === null ? '' : String(c.hours)}>{c.label}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => act(true)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition">
          Approve
        </button>
        <button type="button" disabled={busy} onClick={() => act(false)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-app-border text-app-text hover:bg-app-hover disabled:opacity-50 transition">
          Reject
        </button>
      </div>
    </li>
  );
}

function AddByHand({ region, kinds, onDone }: { region: Region; kinds: Kind[]; onDone: () => void }) {
  const [kind, setKind] = useState(kinds.find((k) => k.id === 'chamber_calendar')?.id || kinds[0]?.id || '');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setBusy(true);
    try {
      const answer = await api.admin.addAroundSource(region.region, { kind, name: name.trim(), url: url.trim() });
      if (answer.outcome === 'proposed') toast.success('It reads: proposed below for review');
      else if (answer.outcome === 'known') toast.success('This address is already here');
      else toast.error(`Not proposed: ${answer.result.reason || answer.result.status}`);
      if (answer.outcome === 'proposed') {
        setName('');
        setUrl('');
      }
      onDone();
    } catch (err) {
      toast.error(errorText(err, 'Could not test the address'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2" data-testid={`admin-sources-add.${region.region}`}>
      <label className="text-xs text-app-text-muted flex flex-col gap-1">
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-app-border bg-app-surface text-sm text-app-text">
          {kinds.filter((k) => k.id !== 'state_outlet').map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </label>
      <label className="text-xs text-app-text-muted flex flex-col gap-1">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Leavenworth Chamber"
          className="px-2 py-1.5 rounded-lg border border-app-border bg-app-surface text-sm text-app-text w-48" />
      </label>
      <label className="text-xs text-app-text-muted flex flex-col gap-1 flex-1 min-w-[14rem]">
        Feed or calendar address (https)
        <input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2048} placeholder="https://"
          className="px-2 py-1.5 rounded-lg border border-app-border bg-app-surface text-sm text-app-text" />
      </label>
      <button type="submit" disabled={busy || !name.trim() || !url.trim()}
        className="px-3 py-1.5 rounded-lg text-sm font-medium border border-app-border text-app-text hover:bg-app-hover disabled:opacity-50 transition">
        {busy ? 'Testing…' : 'Test and propose'}
      </button>
    </form>
  );
}

function RunLine({ region }: { region: Region }) {
  const run = region.run;
  if (!run) return <span>Checked {when(region.sources_checked_at)}</span>;
  if (run.state === 'running') return <span className="text-violet-700 dark:text-violet-300">Looking for sources since {when(run.started_at)}…</span>;
  if (run.state === 'failed') return <span className="text-red-600">The last run failed: {run.error}</span>;
  const s = run.summary;
  const claude = s?.claude;
  const claudeText = !claude ? '' : claude.outcome === 'off'
    ? ' · Claude search is off (AROUND_YOU_SOURCE_FINDER)'
    : ` · Claude ${claude.outcome}: ${num(claude.candidates ?? 0)} found, ${num(claude.searches ?? 0)} searches, ${num(claude.input ?? 0)} in / ${num(claude.output ?? 0)} out tokens`;
  return (
    <span>
      Last run {when(run.finished_at)}: {num(s?.proposed)} proposed, {num(s?.noted)} noted, {num(s?.known)} already here{claudeText}
    </span>
  );
}

function RegionCard({ region, kinds, onChanged }: { region: Region; kinds: Kind[]; onChanged: () => void }) {
  const [starting, setStarting] = useState(false);
  const proposals = region.sources.filter((s) => s.review_state === 'proposed');
  const approved = region.sources.filter((s) => s.review_state === 'approved');
  const noted = region.sources.filter((s) => s.review_state === 'rejected' && s.note && s.note.status !== 'proposed' && !s.note.reviewed_at);
  const rejected = region.sources.filter((s) => s.review_state === 'rejected' && !noted.includes(s));
  const reading = region.sources.filter((s) => !s.proposed_by && s.active);
  const running = region.run?.state === 'running';

  const find = async () => {
    setStarting(true);
    try {
      const answer = await api.admin.findAroundSources(region.region);
      toast.success(answer.finder_on ? 'Looking for sources: this takes a minute or two' : 'Checking the state outlet only: Claude search is off');
      onChanged();
    } catch (err) {
      toast.error(errorText(err, 'Could not start the finder'));
    } finally {
      setStarting(false);
    }
  };

  return (
    <details open={proposals.length > 0 || running} className="rounded-xl border border-app-border bg-app-surface" data-testid={`admin-sources-region.${region.region}`}>
      <summary className="cursor-pointer list-none p-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-base font-semibold text-app-text">{region.display_name || region.region}</span>
        <span className="text-xs text-app-text-muted">
          {[region.county_name, region.state].filter(Boolean).join(', ') || 'county not known yet'} · {region.provisioned_by}
        </span>
        {proposals.length > 0 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
            {proposals.length} to review
          </span>
        )}
      </summary>
      <div className="px-4 pb-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-app-text-secondary">
          <button type="button" onClick={find} disabled={starting || running}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-app-border text-app-text hover:bg-app-hover disabled:opacity-50 transition">
            <Search className="w-4 h-4" /> Find sources
          </button>
          <RunLine region={region} />
        </div>

        {proposals.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-app-text mb-2">To review</h3>
            <ul className="space-y-2">{proposals.map((s) => <Proposal key={s.id} source={s} kinds={kinds} onDone={onChanged} />)}</ul>
          </section>
        )}

        {approved.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-app-text mb-1">Approved</h3>
            <ul className="space-y-1 text-sm">
              {approved.map((s) => (
                <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-app-text">{s.display_name}</span>
                  <span className="text-xs text-app-text-muted">{s.access || 'access not set'}{s.keep_hours ? ` · stays ${s.keep_hours} h` : ''}</span>
                  <SourceLink url={s.url} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {reading.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-app-text mb-1">Already read (set up by hand)</h3>
            <ul className="space-y-1 text-sm">
              {reading.map((s) => (
                <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-app-text">{s.display_name}</span>
                  <SourceLink url={s.url} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {noted.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-app-text">Checked, not proposed ({noted.length})</summary>
            <ul className="mt-2 space-y-2 text-sm">
              {noted.map((s) => (
                <li key={s.id}>
                  <span className="text-app-text">{s.display_name}</span>
                  <span className="text-xs text-app-text-muted"> · {s.note?.reason || s.note?.status}</span>
                  <div><SourceLink url={s.url} /></div>
                  {s.note?.why && <p className="text-xs text-app-text-secondary">{s.note.why}</p>}
                </li>
              ))}
            </ul>
          </details>
        )}

        {rejected.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-app-text">Rejected ({rejected.length})</summary>
            <ul className="mt-2 space-y-1 text-sm">
              {rejected.map((s) => (
                <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-app-text">{s.display_name}</span>
                  <SourceLink url={s.url} />
                </li>
              ))}
            </ul>
          </details>
        )}

        <section>
          <h3 className="text-sm font-semibold text-app-text mb-2">Add by hand</h3>
          <AddByHand region={region} kinds={kinds} onDone={onChanged} />
        </section>
      </div>
    </details>
  );
}

// Sources for a new county (Around you): the finder's proposals with the server's own numbers, approved or rejected one
// by one. Nothing here shows on Around you until it is approved.
export default function AdminSourcesPage() {
  const router = useRouter();
  const [data, setData] = useState<{ finder_on: boolean; kinds: Kind[]; regions: Region[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [off, setOff] = useState(false);
  const [filter, setFilter] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (!getAuthToken()) router.push('/login'); }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.admin.getAroundSources());
    } catch (err) {
      const status = statusOf(err);
      if (status === 403) setDenied(true);
      else if (status === 404) setOff(true);
      else toast.error(errorText(err, 'Failed to load sources'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // While a run is going, read again every few seconds.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (data?.regions.some((r) => r.run?.state === 'running')) timer.current = setTimeout(load, 5000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [data, load]);

  const words = filter.trim().toLowerCase();
  const regions = (data?.regions || []).filter((r) => !words
    || [r.display_name, r.region, r.county_name, r.state].some((v) => v?.toLowerCase().includes(words)));
  const waiting = (data?.regions || []).reduce((n, r) => n + r.sources.filter((s) => s.review_state === 'proposed').length, 0);

  return (
    <div className="min-h-screen bg-app-surface">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-app-border bg-app-surface">
        <button onClick={() => router.back()} className="p-1.5 hover:bg-app-hover rounded-lg transition" aria-label="Back"><ArrowLeft className="w-5 h-5 text-app-text" /></button>
        <h1 className="text-xl font-bold text-app-text flex-1">Sources</h1>
        {!denied && !off && (
          <button onClick={() => load()} className="p-1.5 hover:bg-app-hover rounded-lg transition" aria-label="Refresh">
            <RefreshCw className={`w-4.5 h-4.5 text-app-text-secondary ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-4">
        {denied ? (
          <div className="flex flex-col items-center justify-center py-24 text-center" data-testid="admin-sources-denied">
            <ShieldAlert className="w-14 h-14 text-app-text-muted mb-4" />
            <p className="text-lg font-semibold text-app-text">Admins only</p>
            <p className="text-sm text-app-text-secondary mt-1">You do not have admin access.</p>
            <Link href="/app" className="mt-4 px-4 py-2 rounded-lg text-sm font-medium border border-app-border text-app-text hover:bg-app-hover transition">
              Back to Pantopus
            </Link>
          </div>
        ) : off ? (
          <div className="py-24 text-center" data-testid="admin-sources-off">
            <p className="text-lg font-semibold text-app-text">Around you is off on this server</p>
            <p className="text-sm text-app-text-secondary mt-1">Sources are reviewed here once AROUND_YOU is on.</p>
          </div>
        ) : loading && !data ? (
          <div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-2 border-violet-600 border-t-transparent rounded-full" /></div>
        ) : data ? (
          <>
            <p className="text-sm text-app-text-secondary">
              Around you&rsquo;s own sources for each place. When the first home is added in a new county, the finder
              proposes its state&rsquo;s capitol outlet and asks Claude, with web search, for the county&rsquo;s and the
              city&rsquo;s own sources; the server then reads each address itself and counts what it holds. Nothing here
              shows to anyone until it is approved; an approved feed is read from the content fetcher&rsquo;s next run,
              an approved calendar from the feeds job&rsquo;s.
              {!data.finder_on && ' Claude search is off on this server (AROUND_YOU_SOURCE_FINDER): Find sources checks the state outlet only.'}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a place"
                className="px-3 py-1.5 rounded-lg border border-app-border bg-app-surface text-sm text-app-text w-64" />
              <span className="text-xs text-app-text-muted">{regions.length} places · {waiting} proposals to review</span>
            </div>
            <div className="space-y-3">
              {regions.map((r) => <RegionCard key={r.region} region={r} kinds={data.kinds} onChanged={load} />)}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
