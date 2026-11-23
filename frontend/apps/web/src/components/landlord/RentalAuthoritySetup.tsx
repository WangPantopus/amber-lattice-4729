'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import * as api from '@pantopus/api';
import { myHomesQuery } from '@/lib/myHomes';
import { confirmStore } from '@/components/ui/confirm-store';

type Action = api.landlord.RentalAuthorityAction;
const button = 'rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const select = 'mt-1 block w-full rounded-lg border border-app-border bg-app-surface px-3 py-2';
const ref = (id: string) => id.slice(0, 8);

export default function RentalAuthoritySetup({ properties, onChanged }: {
  properties: api.landlord.HomeAuthority[];
  onChanged: () => Promise<void>;
}) {
  const session = api.authSessionMarker();
  const client = useQueryClient();
  const key = ['rentalAuthoritySetup', session];
  const setup = useQuery({ queryKey: key, queryFn: api.landlord.getRentalSetup, staleTime: 0 });
  const homes = useQuery(myHomesQuery());
  const [pickedHome, setHome] = useState('');
  const [pickedSubject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('home');
    if (id && /^[0-9a-f-]{36}$/i.test(id)) setHome(id);
  }, []);
  const data = setup.data;
  if (setup.isError) return <p role="alert">Could not load rental verification. <button onClick={() => void setup.refetch()} className="underline">Retry</button></p>;
  if (!data) return <p role="status">Checking rental verification…</p>;
  const subject = data.subjects.find(s => s.subject_id === pickedSubject) || data.subjects.find(s => s.subject_type === 'user');
  const options = new Map<string, string>();
  for (const h of data.owned) options.set(h.home_id, [h.address, h.address2, h.city, h.state].filter(Boolean).join(', '));
  for (const h of homes.data?.homes || []) {
    if (!options.has(h.id)) options.set(h.id, h.address || h.name || 'Home ' + ref(h.id));
  }
  for (const p of properties) {
    if (!options.has(p.home_id)) options.set(p.home_id, p.home?.name || 'Property ' + ref(p.home_id));
  }
  if (pickedHome && !options.has(pickedHome)) options.set(pickedHome, 'Selected rental property ' + ref(pickedHome));
  const home = pickedHome || options.keys().next().value || '';
  const owned = data.owned.some(o => o.home_id === home && o.subject_id === subject?.subject_id && o.subject_type === subject?.subject_type);
  const ownAuthority = properties.find(p => p.home_id === home && p.subject_id === subject?.subject_id && p.subject_type === subject?.subject_type);
  const write = async (action: Action) => {
    if (!data || busy || api.authSessionMarker() !== session) return;
    setBusy(true); setMessage('');
    try {
      const result = await api.landlord.manageRentalAuthority(action, data.session.session_scope);
      if (api.authSessionMarker() !== session) return;
      if (result.home_id !== action.home_id || !['pending', 'verified', 'revoked'].includes(result.status)) throw new Error('Reload to check the request.');
      setMessage(result.status === 'verified' ? 'Rental access approved.' : result.status === 'pending'
        ? 'Request sent. The verified property owner can review it in Rental properties.' : 'Rental access closed.');
      await Promise.all([client.invalidateQueries({ queryKey: key }), onChanged()]);
    } catch (error) {
      if (api.authSessionMarker() === session) setMessage(error instanceof Error ? error.message : 'Reload to check the request.');
    } finally { setBusy(false); }
  };
  const review = async (m: typeof data.managers[number], action: 'approve' | 'decline' | 'revoke') => {
    const label = action === 'approve' ? 'Approve' : action === 'decline' ? 'Decline' : 'Remove access';
    if (await confirmStore.open({ title: label + ' rental management?',
      description: '@' + m.username + (action === 'approve'
        ? ' will be able to manage tenants and leases for ' : ' will have no rental management access to ')
        + options.get(m.home_id) + '.', confirmLabel: label })) {
      await write({ action, authority_id: m.id, home_id: m.home_id });
    }
  };

  return <section className="mb-6 space-y-4 rounded-xl border border-app-border bg-app-surface p-5">
    <h2 className="text-lg font-semibold">Verify a rental property</h2>
    <div className="grid gap-4 sm:grid-cols-2">
      {options.size > 0 && <label className="text-sm font-semibold">Property
        <select className={select} value={home} onChange={e => { setHome(e.target.value); setMessage(''); }}>
          {Array.from(options, ([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>}
      {data.subjects.length > 1 && <label className="text-sm font-semibold">Manage as
        <select className={select} value={subject?.subject_id} onChange={e => { setSubject(e.target.value); setMessage(''); }}>
          {data.subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.label}</option>)}
        </select>
      </label>}
    </div>
    <Link className="inline-block text-sm font-semibold underline" href="/app/homes/new?rental=1">Find a rental by address</Link>
    {home && subject && <div className="space-y-2">
      {ownAuthority?.status === 'verified' ? <p>Rental access verified.</p> : <>
        {owned ? <p>Your ownership is verified. Enable rental management to review tenant requests.</p>
          : <p>A verified property owner can approve {subject.subject_type === 'business' ? 'your business to manage tenants and leases.' : 'you to manage tenants and leases.'}</p>}
        {owned || ownAuthority?.status !== 'pending' || ownAuthority.added_via !== 'owner_delegation' ? <button disabled={busy} className={button} onClick={() => void write({
          home_id: home, subject_type: subject.subject_type, subject_id: subject.subject_id, action: owned ? 'enable' : 'request',
        })}>{owned ? 'Enable landlord access' : 'Request manager access'}</button> : <p role="status">Waiting for owner approval</p>}
        {!owned && <p>{subject.subject_type === 'user'
          ? <Link className="text-sm font-semibold underline" href={'/app/homes/' + home + '/claim-owner/evidence'}>I own this property · Verify ownership</Link>
          : <a className="text-sm font-semibold underline" href="mailto:support@pantopus.com?subject=Business%20property%20ownership%20verification">My business owns this property · Contact support</a>}</p>}
      </>}
    </div>}
    {data.managers.length > 0 && <div className="border-t border-app-border pt-3">
      <h3 className="font-semibold">Property managers</h3>
      {data.managers.map(m => <div key={m.id} className="space-y-2 py-3">
        <p className="font-semibold">{m.name || m.username} <span className="font-normal">@{m.username}</span></p>
        <p className="text-sm">{options.get(m.home_id)} · {m.subject_type === 'business' ? 'Business team' : 'Individual'} · {m.status === 'pending' ? 'Requested access' : 'Approved manager'}</p>
        {m.status === 'pending' ? <div className="flex gap-3">
          <button className={button} disabled={busy} onClick={() => void review(m, 'approve')}>Approve manager</button>
          <button className="text-sm underline" disabled={busy} onClick={() => void review(m, 'decline')}>Decline</button>
        </div> : <button disabled={busy} className="text-sm underline" onClick={() => void review(m, 'revoke')}>Remove manager access</button>}
      </div>)}
    </div>}
    {message && <p role="status" className="text-sm font-semibold">{message}</p>}
  </section>;
}
