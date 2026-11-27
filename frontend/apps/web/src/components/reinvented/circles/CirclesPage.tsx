'use client';

// Your circles (Pulse, reinvented, phase 3; coord/CONTRACT.md §8d): circles of 2 to 8 close people. Make one from your
// connections (they're invited, and in only by their own yes), say yes or no to an invite (nobody is told who said
// no), and for each circle: who's in, your own "Keep my Moments for this circle after they fade" (its magazine and
// morning postcards), rename, add or remove people (its maker), leave, or end it. Only while `pulse_reinvented` is on
// for the person.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MomentFace } from '@/components/moments/MomentFace';
import { useConnectionsForMentions } from '../mentions/Mentions';
import { useReinventedOn } from '../pulse/useReinventedOn';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import {
  changeCircle,
  CIRCLES_KEY,
  endCircle,
  joinCircle,
  leaveCircle,
  makeCircle,
  readCircles,
  setKeepFaded,
  setWindow,
  WEEK_DAYS,
  type Circle,
} from './circlesApi';
import Windows from './Windows';
import { useMe } from '@/lib/me';
import './circles.css';

const MAX_OTHERS = 7;
const KEEP_WORDS = 'Keep my Moments for this circle after they fade: its weekly magazine and morning postcards';

function errorWords(e: unknown): string {
  const err = e as { message?: string; statusCode?: number };
  return err.message && err.statusCode && err.statusCode < 500 ? err.message : 'Couldn’t do that. Try again.';
}

function Faces({ people }: { people: Circle['members'] }) {
  return (
    <span className="cc-faces" aria-hidden="true">
      {people.slice(0, 5).map((m) => (
        <MomentFace key={m.person.id} author={m.person} />
      ))}
    </span>
  );
}

/** Pick connections: a search over the person's connections, the picked ones shown as chips. */
function PeoplePicker({ picked, onChange, leaveOut = [], max }: { picked: string[]; onChange(ids: string[]): void; leaveOut?: string[]; max: number }) {
  const people = useConnectionsForMentions(true);
  const [q, setQ] = useState('');
  const all = (people.data || []).filter((p) => !leaveOut.includes(p.id));
  const shown = all.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30);
  const names = new Map(all.map((p) => [p.id, p.name]));
  return (
    <div className="cc-picker">
      {picked.length > 0 && (
        <div className="cc-chips">
          {picked.map((id) => (
            <button key={id} type="button" className="cc-chip" onClick={() => onChange(picked.filter((x) => x !== id))} aria-label={`Take ${names.get(id) || 'them'} off`}>
              {names.get(id) || 'Someone'} ×
            </button>
          ))}
        </div>
      )}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your connections" aria-label="Search your connections" />
      {people.isPending ? (
        <p className="cc-note">Reading your connections…</p>
      ) : !all.length ? (
        <p className="cc-note">
          {people.data?.length ? 'Everyone you’re connected with is in it already.' : 'Circles are made from the people you’re connected with.'}
        </p>
      ) : (
        <ul className="cc-people">
          {shown.map((p) => {
            const on = picked.includes(p.id);
            return (
              <li key={p.id}>
                <label>
                  <input type="checkbox" checked={on} disabled={!on && picked.length >= max} onChange={() => onChange(on ? picked.filter((x) => x !== p.id) : [...picked, p.id])} />
                  {p.name}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NewCircle({ onDone }: { onDone(c: Circle | null): void }) {
  const [name, setName] = useState(''),
    [people, setPeople] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function make() {
    setBusy(true);
    setError('');
    try {
      onDone((await makeCircle(name.trim(), people)).circle);
    } catch (e) {
      setError(errorWords(e));
      setBusy(false);
    }
  }
  return (
    <section className="cc-card" aria-label="New circle">
      <h2>New circle</h2>
      <label className="cc-field">
        <span>Its name (only its people see it)</span>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Sunday walkers" />
      </label>
      <p className="cc-label">
        Who’s in it ({people.length} of up to {MAX_OTHERS}). They’re invited, and in only when they say yes.
      </p>
      <PeoplePicker picked={people} onChange={setPeople} max={MAX_OTHERS} />
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
      <div className="cc-actions">
        <button type="button" className="cc-button" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" className="cc-button cc-strong" disabled={busy || !name.trim() || !people.length} onClick={() => void make()}>
          {busy ? 'Making…' : 'Make the circle'}
        </button>
      </div>
    </section>
  );
}

function Invite({ circle, onChanged }: { circle: Circle; onChanged(): void }) {
  const [keep, setKeep] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const go = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(errorWords(e));
      setBusy(false);
    }
  };
  const inNow = circle.members.filter((m) => m.state === 'in');
  return (
    <li className="cc-card cc-invite">
      <div className="cc-row">
        <Faces people={inNow} />
        <div className="cc-words">
          <strong>{circle.name}</strong>
          <span>
            {circle.owner.name} asked you to join · {inNow.length} in
          </span>
        </div>
      </div>
      <label className="cc-check">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
        {KEEP_WORDS}
      </label>
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
      <div className="cc-actions">
        <button type="button" className="cc-button" disabled={busy} onClick={() => void go(() => leaveCircle(circle.id))}>
          No thanks
        </button>
        <button type="button" className="cc-button cc-strong" disabled={busy} onClick={() => void go(() => joinCircle(circle.id, keep))}>
          Join
        </button>
      </div>
    </li>
  );
}

const WINDOW_WORDS = 'Show a window for my home to this circle. It lights when I share something, and never says what or where.';

function CircleDetail({ circle, onChanged, onClose }: { circle: Circle; onChanged(): void; onClose(): void }) {
  const client = useQueryClient();
  const account = useMe().data?.id ?? null;
  // The reader's window for their home in this circle (CONTRACT 9f): their own choice, off by default.
  const [windowName, setWindowName] = useState(circle.my_window?.label || '');
  const showing = !!circle.my_window;
  const windowsAgain = () => void client.invalidateQueries({ queryKey: ['reinvented', 'windows'] });
  const [name, setName] = useState(circle.name),
    [adding, setAdding] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState<'leave' | 'end' | null>(null);
  const go = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChanged();
      after?.();
    } catch (e) {
      setError(errorWords(e));
    } finally {
      setBusy(false);
    }
  };
  const listed = circle.members.map((m) => m.person.id);
  const room = MAX_OTHERS + 1 - circle.members.length;
  return (
    <section className="cc-card" aria-label={circle.name}>
      <div className="cc-row">
        <h2>{circle.name}</h2>
        <button type="button" className="cc-button" onClick={onClose}>
          Back
        </button>
      </div>
      <p className="cc-note">Its magazine comes each {WEEK_DAYS[circle.week_day] || 'week'}.</p>
      <Link className="cc-button cc-strong cc-link" href={`/app/circles?circle=${encodeURIComponent(circle.id)}&magazine=1`}>
        {circle.magazine_ready ? 'This week’s magazine · new' : 'This week’s magazine'}
      </Link>
      <ul className="cc-members">
        {circle.members.map((m) => (
          <li key={m.person.id} className="cc-row">
            <MomentFace author={m.person} />
            <span className="cc-words">
              <strong>{m.person.name}</strong>
              <span>{m.person.id === circle.owner.id ? 'Made it' : m.state === 'in' ? 'In' : 'Invited'}</span>
            </span>
            {circle.mine && m.person.id !== circle.owner.id && (
              <button type="button" className="cc-button" disabled={busy} onClick={() => void go(() => changeCircle(circle.id, { remove: [m.person.id] }))}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <label className="cc-check">
        <input type="checkbox" checked={!!circle.my_keep_faded} disabled={busy} onChange={(e) => void go(() => setKeepFaded(circle.id, e.target.checked))} />
        {KEEP_WORDS}
      </label>
      <div className="hw-choice">
        <label className="cc-check">
          <input
            type="checkbox"
            checked={showing}
            disabled={busy || (!showing && !windowName.trim())}
            onChange={(e) => void go(() => setWindow(circle.id, e.target.checked ? windowName.trim() : null), windowsAgain)}
          />
          {WINDOW_WORDS}
        </label>
        <label className="cc-field">
          <span>{showing ? 'Its name' : 'Name it first, like Mom and Dad’s'}</span>
          <span className="cc-inline">
            <input value={windowName} maxLength={30} placeholder="Mom and Dad’s" onChange={(e) => setWindowName(e.target.value)} />
            {showing && (
              <button
                type="button"
                className="cc-button"
                disabled={busy || !windowName.trim() || windowName.trim() === circle.my_window?.label}
                onClick={() => void go(() => setWindow(circle.id, windowName.trim()), windowsAgain)}
              >
                Rename
              </button>
            )}
          </span>
        </label>
      </div>
      <Windows account={account} circle={circle.id} title="Windows in this circle" />
      {circle.mine && (
        <>
          <label className="cc-field">
            <span>Name</span>
            <span className="cc-inline">
              <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              <button type="button" className="cc-button" disabled={busy || !name.trim() || name.trim() === circle.name} onClick={() => void go(() => changeCircle(circle.id, { name: name.trim() }))}>
                Rename
              </button>
            </span>
          </label>
          {room > 0 && (
            <>
              <p className="cc-label">Invite more ({room} more can join)</p>
              <PeoplePicker picked={adding} onChange={setAdding} leaveOut={listed} max={room} />
              <button
                type="button"
                className="cc-button"
                disabled={busy || !adding.length}
                onClick={() => void go(() => changeCircle(circle.id, { add: adding }), () => setAdding([]))}
              >
                Invite them
              </button>
            </>
          )}
        </>
      )}
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
      {confirm ? (
        <div className="cc-confirm" role="alertdialog" aria-label={confirm === 'end' ? 'End this circle?' : 'Leave this circle?'}>
          <p>{confirm === 'end' ? 'End this circle for everyone in it? Its magazine goes with it.' : 'Leave this circle? You can be invited again.'}</p>
          <div className="cc-actions">
            <button type="button" className="cc-button" onClick={() => setConfirm(null)}>
              Keep it
            </button>
            <button
              type="button"
              className="cc-button cc-danger"
              disabled={busy}
              onClick={() => void go(() => (confirm === 'end' ? endCircle(circle.id) : leaveCircle(circle.id)), onClose)}
            >
              {confirm === 'end' ? 'End it' : 'Leave'}
            </button>
          </div>
        </div>
      ) : (
        <div className="cc-actions">
          <button type="button" className="cc-button" onClick={() => setConfirm('leave')}>
            Leave
          </button>
          {circle.mine && (
            <button type="button" className="cc-button cc-danger" onClick={() => setConfirm('end')}>
              End the circle
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default function CirclesPage({ circleId, onCircle }: { circleId: string | null; onCircle(id: string | null): void }) {
  const on = useReinventedOn();
  const client = useQueryClient();
  const reread = useRereadSwitch();
  const circles = useQuery({
    queryKey: CIRCLES_KEY,
    queryFn: ({ signal }) => readCircles(signal),
    enabled: on,
    retry: (count, error) => !isSwitchedOff(error) && count < 1,
  });
  useEffect(() => {
    if (circles.error && isSwitchedOff(circles.error)) void reread();
  }, [circles.error, reread]);
  const [making, setMaking] = useState(false);
  const refresh = () => void client.invalidateQueries({ queryKey: CIRCLES_KEY });
  const open = useMemo(() => circles.data?.circles.find((c) => c.id === circleId) || null, [circles.data, circleId]);
  if (!on)
    return (
      <div className="cc-page">
        <p className="cc-note">Circles aren’t on for you right now.</p>
      </div>
    );
  return (
    <div className="cc-page">
      <header className="cc-head">
        <h1>Your circles</h1>
        <p>Circles of 2 to 8 close people. Pick one in Pulse’s Close circle to see only them, and read its magazine each week. Nobody outside a circle knows it exists.</p>
      </header>
      {circles.isPending ? (
        <p className="cc-note">Loading…</p>
      ) : open ? (
        <CircleDetail circle={open} onChanged={refresh} onClose={() => onCircle(null)} />
      ) : making ? (
        <NewCircle
          onDone={(c) => {
            setMaking(false);
            refresh();
            if (c) onCircle(c.id);
          }}
        />
      ) : (
        <>
          {!!circles.data?.invites.length && (
            <section aria-label="Invites">
              <h2 className="cc-section">Invites</h2>
              <ul className="cc-list">
                {circles.data.invites.map((c) => (
                  <Invite key={c.id} circle={c} onChanged={refresh} />
                ))}
              </ul>
            </section>
          )}
          <section aria-label="Your circles">
            <ul className="cc-list">
              {(circles.data?.circles || []).map((c) => (
                <li key={c.id}>
                  <button type="button" className="cc-card cc-row cc-open" onClick={() => onCircle(c.id)}>
                    <Faces people={c.members.filter((m) => m.state === 'in')} />
                    <span className="cc-words">
                      <strong>{c.name}</strong>
                      <span>
                        {c.members.filter((m) => m.state === 'in').length} in
                        {c.members.some((m) => m.state === 'invited') ? ` · ${c.members.filter((m) => m.state === 'invited').length} invited` : ''}
                        {c.magazine_ready ? ' · new magazine' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!circles.data?.circles.length && <p className="cc-note">No circles yet.</p>}
            <button type="button" className="cc-button cc-strong" onClick={() => setMaking(true)}>
              New circle
            </button>
          </section>
        </>
      )}
    </div>
  );
}
