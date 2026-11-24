'use client';

import { useEffect, useId, useState } from 'react';
import { Plus, User, X } from 'lucide-react';
import * as api from '@pantopus/api';
import type { ProfileCredit } from '@pantopus/api';
import { extractApiError } from '@/lib/auth-utils';
import { InkGlyph, howText, inkOf } from './ink';
import Picture from './Picture';

export type CreditRelation = 'with' | 'led' | 'learned_from' | 'for';

/** A person or a typed name to ask once a new piece is on the Work (asking needs a piece that shows). */
export interface QueuedCredit {
  key: string;
  user_id?: string;
  name?: string;
  shown: string;
  portrait_url?: string | null;
  role: string | null;
  relation: CreditRelation;
}

const RELATIONS: Array<{ key: CreditRelation; label: string }> = [
  { key: 'with', label: 'Worked with me' },
  { key: 'led', label: 'I led them' },
  { key: 'learned_from', label: 'I learned from them' },
  { key: 'for', label: 'I did it for them' },
];
const ROLE_MAX = 40;
const NAME_MAX = 60;

interface Connection { id: string; name: string; username: string | null; picture: string | null }

let counter = 0;

function initials(name: string | null | undefined): string {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

function Face({ name, url }: { name: string | null; url: string | null | undefined }) {
  if (url) return <Picture src={url} className="w-10 h-10 shrink-0 rounded-full object-cover bg-app-surface-sunken" />;
  return (
    <span aria-hidden="true" className="w-10 h-10 shrink-0 rounded-full bg-app-surface-sunken text-app-secondary flex items-center justify-center text-[0.8125rem] font-bold">
      {name?.trim() ? initials(name) : <User className="w-5 h-5" />}
    </span>
  );
}

/** A credit's state in the owner's words, as the server sends it ("Signed", "Asked today", "Did not confirm", "Said"). */
function Status({ credit }: { credit: ProfileCredit }) {
  if (credit.status === 'asked' || credit.status === 'did_not_confirm') {
    return <span className="shrink-0 inline-flex items-center min-h-7 px-2.5 rounded-full bg-app-surface-sunken text-xs font-semibold text-app-secondary">{credit.how || (credit.status === 'asked' ? 'Asked' : 'Did not confirm')}</span>;
  }
  const ink = inkOf(credit.ink);
  return <span className="shrink-0 inline-flex items-center gap-1.5 text-[0.8125rem] text-app-secondary"><InkGlyph ink={ink} inline />{howText(ink)}</span>;
}

/**
 * "Who was on it?" (board 10). The owner names a person they are connected to (or the other party of the job or plan
 * the piece started from), who is asked to sign and shows by name only once they do, or types a name, which stays
 * Said. On a saved piece each change goes to the server at once; on a new piece the names wait and are asked once the
 * piece is on the Work.
 */
export default function CreditsField({ pieceId, initial, queued, onQueued, onChanged, waiting }: {
  pieceId: string | null;
  initial: ProfileCredit[];
  queued: QueuedCredit[];
  onQueued: (list: QueuedCredit[]) => void;
  /** A saved piece's credits changed on the server. */
  onChanged: () => void;
  /** Why names can't be asked yet (a draft or a hidden piece), or null. */
  waiting: string | null;
}) {
  const ids = { who: useId(), role: useId() };
  const [credits, setCredits] = useState<ProfileCredit[]>(initial);
  const [adding, setAdding] = useState(false);
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [who, setWho] = useState('');
  const [chosen, setChosen] = useState<Connection | null>(null);
  const [role, setRole] = useState('');
  const [relation, setRelation] = useState<CreditRelation>('with');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!adding || connections) return;
    let live = true;
    Promise.resolve().then(() => api.relationships.getConnections({ limit: 100 })).then(
      (res) => {
        if (!live) return;
        const people = (res?.relationships || []).map((r) => r.other_user).filter(Boolean).map((u) => ({
          id: u!.id,
          name: u!.name || [u!.first_name, u!.last_name].filter(Boolean).join(' ') || u!.username || 'Someone',
          username: u!.username,
          picture: u!.profile_picture_url || null,
        }));
        setConnections(people);
      },
      () => { if (live) setConnections([]); },
    );
    return () => { live = false; };
  }, [adding, connections]);

  const reset = () => { setAdding(false); setWho(''); setChosen(null); setRole(''); setRelation('with'); setNote(null); };
  const text = who.trim();
  const matches = !chosen && text && connections
    ? connections.filter((c) => c.name.toLowerCase().includes(text.toLowerCase()) || (c.username || '').toLowerCase().includes(text.toLowerCase())).slice(0, 6)
    : [];

  const add = async () => {
    if (!chosen && !text) { setNote('Choose someone you are connected to, or type a name.'); return; }
    const body = { ...(chosen ? { user_id: chosen.id } : { name: text.slice(0, NAME_MAX) }), role: role.trim() || null, relation };
    if (!pieceId) {
      onQueued([...queued, { key: `q${(counter += 1)}`, ...body, shown: chosen ? chosen.name : text, portrait_url: chosen?.picture ?? null }]);
      reset();
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const credit = await api.profilePage.addCredit(pieceId, body);
      setCredits((list) => [...list.filter((c) => c.id !== credit.id), credit]);
      onChanged();
      reset();
    } catch (err) {
      setNote(extractApiError(err, 'Couldn’t add them. Try again.'));
    }
    setBusy(false);
  };

  const remove = async (credit: ProfileCredit) => {
    const shown = credit.party?.name || credit.party?.did || credit.role || 'them';
    if (!window.confirm(`Take ${shown} off this piece?`)) return;
    setBusy(true);
    setNote(null);
    try {
      await api.profilePage.removeCredit(pieceId!, credit.id);
      setCredits((list) => list.filter((c) => c.id !== credit.id));
      onChanged();
    } catch (err) {
      setNote(extractApiError(err, 'Couldn’t take them off. Try again.'));
    }
    setBusy(false);
  };

  const row = 'flex items-center gap-3 px-4 py-2.5';
  return (
    <section aria-label="Who was on it?" className="flex flex-col gap-2">
      <span className="text-[0.9375rem] font-semibold text-app">Who was on it?</span>
      <div className="rounded-2xl border border-app bg-surface overflow-hidden">
        {credits.length > 0 || queued.length > 0 ? (
          <ul className="divide-y divide-app-subtle">
            {credits.map((credit) => (
              <li key={credit.id} className={row}>
                <Face name={credit.party?.name ?? null} url={credit.party?.portrait_url} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{credit.party?.name || credit.party?.did || credit.role}</span>
                  {credit.party?.name && credit.role ? <span className="block text-[0.8125rem] leading-[1.125rem] text-app-secondary [overflow-wrap:anywhere]">{credit.role}</span> : null}
                </span>
                <Status credit={credit} />
                <button type="button" disabled={busy} onClick={() => remove(credit)} aria-label={`Take ${credit.party?.name || credit.party?.did || 'them'} off this piece`} className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-app-secondary hover-bg-app disabled:opacity-50">
                  <X aria-hidden="true" className="w-4 h-4" />
                </button>
              </li>
            ))}
            {queued.map((q) => (
              <li key={q.key} className={row}>
                <Face name={q.shown} url={q.portrait_url} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{q.shown}</span>
                  <span className="block text-[0.8125rem] leading-[1.125rem] text-app-secondary [overflow-wrap:anywhere]">
                    {[q.role, q.user_id ? 'Asked when you add the piece' : 'Your words'].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button type="button" onClick={() => onQueued(queued.filter((x) => x.key !== q.key))} aria-label={`Remove ${q.shown}`} className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-app-secondary hover-bg-app">
                  <X aria-hidden="true" className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {waiting ? (
          <p className={`px-4 py-3 text-[0.8125rem] leading-[1.125rem] text-app-secondary ${credits.length || queued.length ? 'border-t border-app-subtle' : ''}`}>{waiting}</p>
        ) : adding ? (
          <div className={`px-4 py-3 flex flex-col gap-3 ${credits.length || queued.length ? 'border-t border-app-subtle' : ''}`}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.who} className="text-[0.875rem] font-semibold text-app">Who</label>
              {chosen ? (
                <div className="flex items-center gap-3 min-h-[3rem] px-3 rounded-xl border border-app-strong">
                  <Face name={chosen.name} url={chosen.picture} />
                  <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold text-app [overflow-wrap:anywhere]">{chosen.name}</span>
                  <button type="button" onClick={() => setChosen(null)} aria-label="Choose someone else" className="w-9 h-9 rounded-full flex items-center justify-center text-app-secondary hover-bg-app"><X aria-hidden="true" className="w-4 h-4" /></button>
                </div>
              ) : (
                <input id={ids.who} value={who} maxLength={NAME_MAX} onChange={(e) => setWho(e.target.value)} placeholder="Someone you are connected to, or a name" autoComplete="off" className="w-full min-h-[3rem] rounded-xl border border-app-strong bg-surface px-3.5 text-[1rem] text-app placeholder:text-app-muted focus:outline focus:outline-2 focus:outline-[color:var(--color-link)]" />
              )}
              {matches.length > 0 ? (
                <ul className="rounded-xl border border-app divide-y divide-app-subtle overflow-hidden" aria-label="Your connections">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => { setChosen(c); setWho(''); }} className="w-full flex items-center gap-3 px-3 py-2 text-left hover-bg-app">
                        <Face name={c.name} url={c.picture} />
                        <span className="min-w-0 flex-1 text-[0.9375rem] text-app [overflow-wrap:anywhere]">{c.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs leading-4 text-app-muted">
                {chosen ? `${chosen.name.split(/\s+/)[0]} is asked to sign, and shows by name only once they do.` : 'Someone not on Pantopus, or not connected to you: their name as you type it, in your words.'}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={ids.role} className="text-[0.875rem] font-semibold text-app">What they did</label>
                {role ? <span className="text-xs text-app-muted">{role.length} of {ROLE_MAX}</span> : null}
              </div>
              <input id={ids.role} value={role} maxLength={ROLE_MAX} onChange={(e) => setRole(e.target.value)} placeholder="Carpenter" autoComplete="off" className="w-full min-h-[3rem] rounded-xl border border-app-strong bg-surface px-3.5 text-[1rem] text-app placeholder:text-app-muted focus:outline focus:outline-2 focus:outline-[color:var(--color-link)]" />
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-[0.875rem] font-semibold text-app mb-1.5">You and them</legend>
              <div className="flex flex-wrap gap-2">
                {RELATIONS.map((r) => (
                  <button key={r.key} type="button" aria-pressed={relation === r.key} onClick={() => setRelation(r.key)} className={`min-h-9 px-3 rounded-full text-[0.8125rem] font-semibold border ${relation === r.key ? 'bg-[rgb(var(--app-text))] text-[rgb(var(--app-surface))] border-transparent' : 'border-app-strong text-app-secondary hover-bg-app'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </fieldset>
            {note ? <p role="alert" className="text-[0.8125rem] leading-[1.125rem] text-app-error">{note}</p> : null}
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={add} className="min-h-[2.75rem] px-4 rounded-xl bg-primary-600 text-white text-[0.9375rem] font-semibold hover:bg-primary-700 disabled:opacity-60">
                {busy ? 'Adding…' : chosen ? 'Ask to sign' : 'Add the name'}
              </button>
              <button type="button" onClick={reset} className="min-h-[2.75rem] px-4 rounded-xl text-[0.9375rem] font-semibold text-app-secondary hover-bg-app">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={`w-full flex items-center gap-2 px-4 min-h-[3rem] text-[0.9375rem] font-semibold text-app-link hover-bg-app ${credits.length || queued.length ? 'border-t border-app-subtle' : ''}`}>
            <Plus aria-hidden="true" className="w-5 h-5" />Add a person and ask them to sign
          </button>
        )}
        {!adding && note ? <p role="alert" className="px-4 pb-3 text-[0.8125rem] leading-[1.125rem] text-app-error">{note}</p> : null}
      </div>
    </section>
  );
}
