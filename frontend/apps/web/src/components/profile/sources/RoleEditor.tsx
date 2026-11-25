'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Building2, X } from 'lucide-react';
import * as api from '@pantopus/api';
import type { ProfileRoleFields, ProfileRoleLine } from '@pantopus/api';
import { extractApiError } from '@/lib/auth-utils';
import Screen from './Screen';
import Picture from './Picture';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TITLE_MAX = 40;
const PLACE_MAX = 60;

const field = 'w-full min-h-[3rem] rounded-xl border border-app-strong bg-surface px-3.5 py-2.5 text-[1.0625rem] text-app placeholder:text-app-muted focus:outline focus:outline-2 focus:outline-[color:var(--color-link)]';
const label = 'text-[0.9375rem] font-semibold text-app';

/** Month and year pickers for a `YYYY-MM` value (works in every browser, unlike type="month"). */
function MonthYear({ value, onChange, legend, disabled = false }: { value: string; onChange: (v: string) => void; legend: string; disabled?: boolean }) {
  const ids = { m: useId(), y: useId() };
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: now - 1939 }, (_, i) => String(now - i));
  }, []);
  const [y, m] = value ? value.split('-') : ['', ''];
  const set = (year: string, month: string) => onChange(year ? `${year}-${month || '01'}` : '');
  return (
    <fieldset className="flex flex-col gap-1.5 min-w-0" disabled={disabled}>
      <legend className={`${label} mb-1.5`}>{legend}</legend>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
        <label htmlFor={ids.m} className="sr-only">{legend}: month</label>
        <select id={ids.m} className={`${field} disabled:opacity-50`} value={m} onChange={(e) => set(y || String(new Date().getFullYear()), e.target.value)}>
          <option value="">Month</option>
          {MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}
        </select>
        <label htmlFor={ids.y} className="sr-only">{legend}: year</label>
        <select id={ids.y} className={`${field} disabled:opacity-50`} value={y} onChange={(e) => set(e.target.value, m)}>
          <option value="">Year</option>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </div>
    </fieldset>
  );
}

interface Place { kind: 'business'; id: string; name: string; username: string | null; picture: string | null }

/**
 * Adding or changing a role or a school ("Worked and learned", board 10's form shape): a title, where (a business on
 * Pantopus, which its owner is asked to confirm, or a place typed as words, which stays Said), worked or learned there,
 * and from and to (or now). A changed role keeps its place; to change the place, remove it and add it again.
 */
export default function RoleEditor({ role, open, onClose, onSaved }: {
  /** The role to change, or null to add one. */
  role: ProfileRoleLine | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!open) return null;
  return <Editor key={role?.id ?? 'new'} role={role} onClose={onClose} onSaved={onSaved} />;
}

function Editor({ role, onClose, onSaved }: { role: ProfileRoleLine | null; onClose: () => void; onSaved: () => void }) {
  const ids = { title: useId(), where: useId() };
  const [title, setTitle] = useState(role?.title ?? '');
  const [relation, setRelation] = useState<'worked' | 'learned'>(role?.relation === 'learned' ? 'learned' : 'worked');
  const [from, setFrom] = useState(role?.from?.slice(0, 7) ?? '');
  const [now, setNow] = useState(role ? !role.to : false);
  const [to, setTo] = useState(role?.to?.slice(0, 7) ?? '');
  const [whereText, setWhereText] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [found, setFound] = useState<Place[]>([]);
  const [saving, setSaving] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Businesses on Pantopus, as the person types (one read a pause).
  useEffect(() => {
    if (role || place) return;
    const q = whereText.trim();
    if (q.length < 2) { setFound([]); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      Promise.resolve().then(() => api.businesses.discoverBusinesses({ q, limit: 5 })).then(
        (res) => {
          if (!live) return;
          setFound((res?.businesses || []).filter((b) => b?.id && b.name).map((b) => ({ kind: 'business', id: b.id, name: b.name, username: b.username || null, picture: b.profile_picture_url || null })));
        },
        () => { if (live) setFound([]); },
      );
    }, 300);
    return () => { live = false; window.clearTimeout(timer); };
  }, [whereText, place, role]);

  const shownPlace = role
    ? (role.where?.name || null)
    : place?.name ?? (whereText.trim() || null);
  const dirty = role
    ? title !== role.title || relation !== role.relation || from !== (role.from?.slice(0, 7) ?? '') || (now ? null : to) !== (role.to?.slice(0, 7) ?? null)
    : Boolean(title.trim() || whereText.trim() || place || from || to);

  const close = () => {
    if (saving) return;
    if (dirty && !window.confirm('Leave without saving? What you wrote here won’t be kept.')) return;
    onClose();
  };

  const save = async () => {
    if (!title.trim()) { setError('Give the role a title.'); return; }
    if (!role && !place && !whereText.trim()) { setError('Say where: a business on Pantopus, or the place’s name.'); return; }
    if (!from) { setError('Say when it started.'); return; }
    if (!now && !to) { setError('Say when it ended, or choose “I’m still there”.'); return; }
    setSaving('save');
    setError(null);
    try {
      const fields = { title: title.trim(), relation, from, to: now ? null : to };
      if (role) await api.profilePage.updateRole(role.id, fields);
      else await api.profilePage.createRole({ ...fields, where: place ? { business_user_id: place.id } : { name: whereText.trim().slice(0, PLACE_MAX) } } as ProfileRoleFields);
      onSaved();
    } catch (err) {
      setError(extractApiError(err, 'Couldn’t save it. Try again.'));
      setSaving(null);
    }
  };

  const remove = async () => {
    if (!role) return;
    if (!window.confirm(`Remove “${role.title}” from your Work?`)) return;
    setSaving('remove');
    setError(null);
    try {
      await api.profilePage.deleteRole(role.id);
      onSaved();
    } catch (err) {
      setError(extractApiError(err, 'Couldn’t remove it. Try again.'));
      setSaving(null);
    }
  };

  const seg = (key: 'worked' | 'learned', text: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={relation === key}
      onClick={() => setRelation(key)}
      className={`min-h-[2.75rem] px-2 rounded-[0.625rem] text-[1rem] font-semibold transition ${relation === key ? 'bg-surface text-app shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-app-secondary hover:text-app'}`}
    >
      {text}
    </button>
  );

  return (
    <Screen
      open
      onClose={close}
      close="close"
      z="z-[60]"
      title={role ? 'Change role' : 'Worked or learned'}
      footer={(
        <div className="flex flex-col gap-2">
          {error ? <p role="alert" className="text-[0.875rem] leading-5 text-app-error">{error}</p> : null}
          <button type="button" onClick={save} disabled={Boolean(saving)} className="w-full min-h-[3rem] rounded-xl bg-primary-600 px-4 text-[1.0625rem] font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
            {saving === 'save' ? 'Saving…' : role ? 'Save changes' : 'Add to Work'}
          </button>
        </div>
      )}
    >
      <div className="px-4 sm:px-6 py-4 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={ids.title} className={label}>Your role</label>
            <span className="text-xs text-app-muted">{title.length} of {TITLE_MAX}</span>
          </div>
          <input id={ids.title} className={field} value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="Apprentice carpenter" autoComplete="off" />
        </div>

        <div className="flex flex-col gap-1.5">
          <span id={`${ids.title}-rel`} className={label}>You</span>
          <div role="group" aria-labelledby={`${ids.title}-rel`} className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-app-surface-sunken">
            {seg('worked', 'Worked there')}{seg('learned', 'Learned there')}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.where} className={label}>Where</label>
          {role ? (
            <>
              <p className="min-h-[3rem] flex items-center px-3.5 rounded-xl bg-app-surface-sunken text-[1rem] text-app">{shownPlace || 'In your words'}</p>
              <p className="text-xs leading-4 text-app-muted">The place can’t change. To change it, remove this role and add it again.</p>
            </>
          ) : place ? (
            <div className="flex items-center gap-3 min-h-[3rem] px-3 rounded-xl border border-app-strong">
              {place.picture ? <Picture src={place.picture} className="w-9 h-9 rounded-[9px] object-cover" /> : <span aria-hidden="true" className="w-9 h-9 rounded-[9px] bg-app-business-bg text-app-business flex items-center justify-center"><Building2 className="w-[1.125rem] h-[1.125rem]" /></span>}
              <span className="min-w-0 flex-1 text-[1rem] font-semibold text-app [overflow-wrap:anywhere]">{place.name}</span>
              <button type="button" onClick={() => setPlace(null)} aria-label="Choose another place" className="w-9 h-9 rounded-full flex items-center justify-center text-app-secondary hover-bg-app"><X aria-hidden="true" className="w-4 h-4" /></button>
            </div>
          ) : (
            <>
              <input id={ids.where} className={field} value={whereText} maxLength={PLACE_MAX} onChange={(e) => setWhereText(e.target.value)} placeholder="A business on Pantopus, or a place’s name" autoComplete="off" />
              {found.length > 0 ? (
                <ul className="rounded-xl border border-app divide-y divide-app overflow-hidden" aria-label="Businesses on Pantopus">
                  {found.map((b) => (
                    <li key={b.id}>
                      <button type="button" onClick={() => { setPlace(b); setWhereText(''); setFound([]); }} className="w-full flex items-center gap-3 px-3 py-2 text-left hover-bg-app">
                        {b.picture ? <Picture src={b.picture} className="w-9 h-9 rounded-[9px] object-cover" /> : <span aria-hidden="true" className="w-9 h-9 rounded-[9px] bg-app-business-bg text-app-business flex items-center justify-center"><Building2 className="w-[1.125rem] h-[1.125rem]" /></span>}
                        <span className="min-w-0 flex-1 text-[0.9375rem] text-app [overflow-wrap:anywhere]">{b.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
          {!role ? (
            <p className="text-xs leading-4 text-app-muted">
              {place ? `${place.name} is asked to confirm it; one of its owners signs for it.` : 'A place not on Pantopus stays in your words.'}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MonthYear legend="From" value={from} onChange={setFrom} />
          <div className="flex flex-col gap-2">
            <MonthYear legend="To" value={now ? '' : to} onChange={setTo} disabled={now} />
            <label className="flex items-center gap-3 min-h-[2.75rem] cursor-pointer">
              <input type="checkbox" checked={now} onChange={(e) => setNow(e.target.checked)} className="w-5 h-5 accent-[color:var(--color-link)]" />
              <span className="text-[0.9375rem] text-app">I’m still there</span>
            </label>
          </div>
        </div>

        {role?.how ? <p className="text-[0.8125rem] leading-[1.125rem] text-app-secondary">Now: {role.how}. {role.status === 'signed' ? 'Changing its words asks again.' : ''}</p> : null}

        {role ? (
          <button type="button" onClick={remove} disabled={Boolean(saving)} className="self-start min-h-[2.75rem] px-1 text-[0.9375rem] font-semibold text-app-error hover:underline disabled:opacity-60">
            {saving === 'remove' ? 'Removing…' : 'Remove this role'}
          </button>
        ) : null}
      </div>
    </Screen>
  );
}
