'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronRight, Copy, ExternalLink, Plus } from 'lucide-react';
import * as api from '@pantopus/api';
import type { ProfileShare, ProfileShareLink, ProfileSharePartKey } from '@pantopus/api';
import BottomSheet from '@/components/ui/BottomSheet';
import { confirmStore } from '@/components/ui/confirm-store';
import { extractApiError } from '@/lib/auth-utils';
import { card, overline } from './blocks';
import { GROUPS, PART_SHORT } from './parts';

type Parts = Partial<Record<ProfileSharePartKey, boolean>>;

/** "December 31", or "January 4, 2027" outside this year: a calendar day, no time zone shift. */
function shortDay(value: string | null | undefined): string | null {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const thisYear = Number(match[1]) === new Date().getFullYear();
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(thisYear ? {} : { year: 'numeric' }), timeZone: 'UTC' });
}

function opensText(link: ProfileShareLink): string {
  if (!link.opens) return 'not opened yet';
  return link.opens === 1 ? 'opened once' : `opened ${link.opens} times`;
}

/** "Work, Known for, Record · ends December 31 · opened 3 times" (board 21). */
function summary(link: ProfileShareLink): string {
  const parts = [...new Set(Object.entries(link.parts || {}).filter(([, on]) => on).map(([key]) => PART_SHORT[key]).filter(Boolean))];
  const state = link.switched_off ? 'switched off' : !link.live ? 'ended' : null;
  const ends = link.ends_on && !state ? `ends ${shortDay(link.ends_on)}` : null;
  return [parts.join(', ') || 'Portrait, name and rings', state, ends, opensText(link)].filter(Boolean).join(' · ');
}

/** The link's own path, so it opens on whichever web this is (the server's address names pantopus.com). */
function linkPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function Check({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative shrink-0 w-11 h-[26px] rounded-full transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-link)] ${on ? 'bg-[var(--color-link)]' : 'bg-[rgb(var(--app-border-strong))]'}`}
    >
      <span aria-hidden="true" className="absolute -inset-y-[9px] inset-x-0" />
      <span aria-hidden="true" className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[left] ${on ? 'left-[21px]' : 'left-[3px]'}`} />
    </button>
  );
}

const button = 'min-h-[2.75rem] px-3.5 rounded-xl text-[0.9375rem] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60';

/** Make or change one link for one purpose: its name, its parts, its last day; copy it, open it, switch it off. */
function LinkEditor({ open, link, share, onClose, onSaved, onDeleted }: {
  open: boolean;
  /** null: a new link. */
  link: ProfileShareLink | null;
  share: ProfileShare;
  onClose: () => void;
  onSaved: (link: ProfileShareLink) => void;
  onDeleted: (id: string) => void;
}) {
  const nameId = useId();
  const endsId = useId();
  const [name, setName] = useState('');
  const [parts, setParts] = useState<Parts>({});
  const [endsOn, setEndsOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  // The form starts from the link when the sheet opens or another link is chosen, not after each save.
  const linkId = link?.id ?? null;
  useEffect(() => {
    if (!open) return;
    setName(link?.name ?? '');
    setParts({ ...(link?.parts ?? {}) });
    setEndsOn(link?.ends_on ?? '');
    setError('');
    if (!linkId) setStatus('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, linkId]);

  const shown = GROUPS.flatMap((group) => group.parts).filter((p) => share.parts.some((part) => part.key === p.key && part.has_content));
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, this browser's day
  const trimmed = name.trim();
  const changed = !link || trimmed !== link.name || (endsOn || null) !== (link.ends_on ?? null)
    || shown.some((p) => Boolean(parts[p.key as ProfileSharePartKey]) !== Boolean(link.parts?.[p.key as ProfileSharePartKey]));

  const save = async () => {
    if (!trimmed || trimmed.length > 60) { setError('Give the link a name of up to 60 characters.'); return; }
    setBusy(true);
    setError('');
    try {
      const body = { name: trimmed, parts: Object.fromEntries(shown.map((p) => [p.key, Boolean(parts[p.key as ProfileSharePartKey])])) as Parts, ends_on: endsOn || null };
      const saved = link ? await api.profilePage.updateLink(link.id, body) : await api.profilePage.createLink(body);
      onSaved(saved);
      setStatus(link ? 'Saved.' : 'Made. Copy it to send it.');
    } catch (err) {
      setError(extractApiError(err, "The link wasn't saved. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const setSwitchedOff = async (off: boolean) => {
    if (!link) return;
    setBusy(true);
    setError('');
    try {
      onSaved(await api.profilePage.updateLink(link.id, { switched_off: off }));
      setStatus(off ? 'Switched off. It no longer opens.' : 'Switched on.');
    } catch (err) {
      setError(extractApiError(err, "The link wasn't changed. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!link) return;
    const yes = await confirmStore.open({
      title: `Delete "${link.name}"?`,
      description: 'The link stops opening for good. Anyone who has it sees nothing.',
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!yes) return;
    setBusy(true);
    try {
      await api.profilePage.deleteLink(link.id);
      onDeleted(link.id);
      onClose();
    } catch (err) {
      setError(extractApiError(err, "The link wasn't deleted. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setStatus('Link copied.');
    } catch {
      setError('Couldn’t copy the link.');
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={link ? link.name : 'A link for one purpose'}
      footer={(
        <div className="flex flex-wrap gap-2 [&>*]:flex-1 [&>*]:basis-[9rem]">
          <button type="button" onClick={onClose} className={`${button} border border-app-strong bg-surface text-app hover-bg-app`}>Done</button>
          <button type="button" onClick={() => void save()} disabled={busy || !changed || !trimmed} className={`${button} bg-primary-600 text-white hover:bg-primary-700`}>
            {link ? 'Save' : 'Make the link'}
          </button>
        </div>
      )}
    >
      <div className="pb-2 flex flex-col gap-3">
        {link ? (
          <div className={`${card} p-4 flex flex-col gap-3`}>
            <p className="text-xs leading-4 text-app-muted">
              {summary(link)}{link.last_opened_on ? ` · last ${shortDay(link.last_opened_on)}` : ''}. Never who opened it.
            </p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
              <button type="button" onClick={() => void copy()} disabled={!link.live} className={`${button} bg-primary-600 text-white hover:bg-primary-700`}>
                <Copy aria-hidden="true" className="w-4 h-4" />Copy link
              </button>
              <a href={linkPath(link.url)} target="_blank" rel="noopener noreferrer" aria-disabled={!link.live || undefined} className={`${button} border border-app-strong bg-surface text-app hover-bg-app ${link.live ? '' : 'pointer-events-none opacity-60'}`}>
                <ExternalLink aria-hidden="true" className="w-4 h-4" />Open it
              </a>
            </div>
          </div>
        ) : null}
        <div className="sr-only" role="status" aria-live="polite">{status}</div>
        {status ? <p className="text-[0.8125rem] leading-[1.125rem] text-app-secondary">{status}</p> : null}
        {error ? <p role="alert" className="text-[0.8125rem] leading-[1.125rem] text-app-error">{error}</p> : null}
        <div>
          <label htmlFor={nameId} className="block text-sm font-semibold text-app mb-1.5">What it&apos;s for</label>
          <input
            id={nameId}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="For the Hartley job"
            className="w-full min-h-[2.75rem] rounded-lg border border-app-strong bg-surface px-3 text-[0.9375rem] text-app"
          />
          <p className="mt-1 text-xs leading-4 text-app-muted">Only you see this name. The page never shows it.</p>
        </div>
        <section className={`${card} overflow-hidden`} aria-label="What this link shows">
          <h3 className={`${overline} px-4 pt-3.5 pb-0.5`}>What this link shows</h3>
          <div className="divide-y divide-app">
            <div className="flex items-center gap-3 px-4 py-3 min-h-[3.25rem]">
              <div className="min-w-0 flex-1"><p className="text-sm leading-5 font-semibold text-app">Portrait, name and rings</p><p className="text-xs leading-4 text-app-muted">Always shown</p></div>
            </div>
            {shown.map((p) => {
              const cityHeld = p.key === 'city' && share.city_limit !== 'anyone';
              return (
                <div key={p.key} className="flex items-center gap-3 px-4 py-3 min-h-[3.25rem]">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-5 font-semibold text-app">{p.label}</p>
                    {cityHeld ? <p className="text-xs leading-4 text-app-muted">Your privacy settings keep your city off links.</p> : p.detail ? <p className="text-xs leading-4 text-app-muted">{p.detail}</p> : null}
                  </div>
                  <Check
                    on={Boolean(parts[p.key as ProfileSharePartKey]) && !cityHeld}
                    label={p.label}
                    disabled={cityHeld || busy}
                    onChange={(on) => setParts((prev) => ({ ...prev, [p.key]: on }))}
                  />
                </div>
              );
            })}
          </div>
        </section>
        <div>
          <label htmlFor={endsId} className="block text-sm font-semibold text-app mb-1.5">Ends on</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={endsId}
              type="date"
              min={today}
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              className="min-h-[2.75rem] rounded-lg border border-app-strong bg-surface px-3 text-[0.9375rem] text-app"
            />
            {endsOn ? <button type="button" onClick={() => setEndsOn('')} className={`${button} text-app-link`}>No end</button> : null}
          </div>
          <p className="mt-1 text-xs leading-4 text-app-muted">
            {link?.switched_off ? 'Switched off: it doesn\u2019t open.' : endsOn ? `It works through ${shortDay(endsOn)}.` : 'It works until you switch it off.'}
          </p>
        </div>
        {link ? (
          <div className="flex flex-wrap gap-2 [&>*]:flex-1 [&>*]:basis-[9rem]">
            <button type="button" onClick={() => void setSwitchedOff(!link.switched_off)} disabled={busy} className={`${button} bg-app-surface-sunken text-app hover-bg-app`}>
              {link.switched_off ? 'Switch it on' : 'Switch it off'}
            </button>
            <button type="button" onClick={() => void remove()} disabled={busy} className={`${button} border border-app-strong bg-surface text-app-error hover-bg-app`}>
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

/**
 * Links for one purpose (board 21, contract v1.3): each shows its own parts, can end on a date, and can be switched
 * off. Drawn only while the server sends `links` (its PROFILE_LINKS switch is on).
 */
export default function LinksSection({ share, onShare, onError }: {
  share: ProfileShare;
  /** The share as the server now has it. */
  onShare: (share: ProfileShare) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<ProfileShareLink | null | 'new'>(null);
  const [busy, setBusy] = useState(false);
  if (!Array.isArray(share.links)) return null;
  const links = share.links;
  const enabled = share.links_enabled !== false;
  const current = editing && editing !== 'new' ? links.find((l) => l.id === editing.id) ?? editing : null;

  const upsert = (link: ProfileShareLink) => {
    const rest = links.filter((l) => l.id !== link.id);
    onShare({ ...share, links: [link, ...rest].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) });
    setEditing(link);
  };

  const setEnabled = async (on: boolean) => {
    setBusy(true);
    try {
      onShare(await api.profilePage.saveShare({ links_enabled: on }));
    } catch (err) {
      onError(extractApiError(err, "Your change wasn't saved. Try again."));
    } finally {
      setBusy(false);
    }
  };

  let rows: ReactNode = null;
  if (links.length > 0) {
    rows = links.map((link) => (
      <li key={link.id}>
        <button type="button" onClick={() => setEditing(link)} className="flex items-center gap-3 px-4 py-3 min-h-[3.25rem] w-full text-left hover-bg-app">
          <span className="min-w-0 flex-1">
            <span className={`block text-sm leading-5 font-semibold [overflow-wrap:anywhere] ${link.live ? 'text-app' : 'text-app-muted'}`}>{link.name}</span>
            <span className="block text-xs leading-4 text-app-muted">{summary(link)}</span>
          </span>
          <ChevronRight aria-hidden="true" className="w-[1.125rem] h-[1.125rem] shrink-0 text-app-muted" />
        </button>
      </li>
    ));
  }

  return (
    <section className="flex flex-col gap-2 mt-1.5" aria-label="Links for one purpose">
      <h3 className={`${overline} px-1`}>Links for one purpose</h3>
      <div className={`${card} overflow-hidden`}>
        {rows ? <ul className="divide-y divide-app">{rows}</ul> : null}
        {enabled ? (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={`flex items-center justify-center gap-1.5 w-full min-h-[3rem] px-4 text-sm font-semibold text-app-link hover-bg-app ${rows ? 'border-t border-app' : ''}`}
          >
            <Plus aria-hidden="true" className="w-4 h-4" />Make a link for one purpose
          </button>
        ) : null}
        <div className={`flex items-center gap-3 px-4 py-3 min-h-[3.25rem] ${rows || enabled ? 'border-t border-app' : ''}`}>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-5 font-semibold text-app">Links for one purpose open</p>
            <p className="text-xs leading-4 text-app-muted">{enabled ? 'Switch off to stop every link at once. They are kept.' : 'None of your links opens. They are kept.'}</p>
          </div>
          <Check on={enabled} label="Links for one purpose open" disabled={busy} onChange={(on) => void setEnabled(on)} />
        </div>
      </div>
      <p className="px-1 text-xs leading-4 text-app-muted">
        Each link shows its own parts, can end on a date, and can be switched off. You see how often it was opened, never by whom.
      </p>
      <LinkEditor
        open={editing !== null}
        link={editing === 'new' ? null : current}
        share={share}
        onClose={() => setEditing(null)}
        onSaved={upsert}
        onDeleted={(id) => onShare({ ...share, links: links.filter((l) => l.id !== id) })}
      />
    </section>
  );
}
