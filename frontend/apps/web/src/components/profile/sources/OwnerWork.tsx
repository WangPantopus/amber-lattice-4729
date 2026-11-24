'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, User } from 'lucide-react';
import * as api from '@pantopus/api';
import type { ProfileAsk, ProfileMyPieces, ProfilePieceOffer } from '@pantopus/api';
import { extractApiError } from '@/lib/auth-utils';
import { card, overline } from './blocks';
import Picture from './Picture';

/** Where an ask's piece opens: its owner's page with the piece open. */
function pieceHref(ask: ProfileAsk): string | null {
  if (!ask.piece?.id) return null;
  const who = ask.from?.username ? encodeURIComponent(ask.from.username) : ask.from?.user_id ? `u/${encodeURIComponent(ask.from.user_id)}` : null;
  return who ? `/${who}?piece=${encodeURIComponent(ask.piece.id)}` : null;
}

/**
 * One ask (board 8's credits, seen by the one named): who asked, the piece and what they did, then "Sign" or "Not me".
 * Signing asks two things first: show the piece on my Work too (on), and show my name on pages opened by a link (off).
 */
function AskRow({ ask, onDone }: { ask: ProfileAsk; onDone: () => void }) {
  const [signing, setSigning] = useState(false);
  const [onMyWork, setOnMyWork] = useState(true);
  const [nameOnLinks, setNameOnLinks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const from = ask.from?.name || 'Someone';
  const href = pieceHref(ask);
  const what = ask.piece?.title || ask.role || 'their work';
  const sign = async () => {
    setBusy(true); setNote(null);
    try {
      await api.profilePage.signAsk(ask.id, { show_on_my_work: ask.kind === 'credit' ? onMyWork : false, show_name_on_links: nameOnLinks });
      onDone();
    } catch (err) { setNote(extractApiError(err, 'Couldn’t sign. Try again.')); setBusy(false); }
  };
  const decline = async () => {
    if (!window.confirm(`Not you on “${what}”? ${from.split(/\s+/)[0]} will see that you didn’t confirm it; nobody else will.`)) return;
    setBusy(true); setNote(null);
    try {
      await api.profilePage.declineAsk(ask.id);
      onDone();
    } catch (err) { setNote(extractApiError(err, 'Couldn’t answer. Try again.')); setBusy(false); }
  };
  const check = 'flex items-start gap-3 min-h-[2.75rem] py-1 cursor-pointer';
  return (
    <li className="px-5 py-3 flex flex-col gap-2.5">
      <div className="flex items-start gap-3">
        {ask.from?.portrait_url ? (
          <Picture src={ask.from.portrait_url} className="w-10 h-10 shrink-0 rounded-full object-cover bg-app-surface-sunken" />
        ) : (
          <span aria-hidden="true" className="w-10 h-10 shrink-0 rounded-full bg-app-surface-sunken text-app-secondary flex items-center justify-center"><User className="w-5 h-5" /></span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] leading-5 text-app [overflow-wrap:anywhere]">
            <strong className="font-semibold">{from}</strong> named you on {ask.kind === 'credit' ? 'a piece' : 'a role'}
            {ask.role ? <> as <strong className="font-semibold">{ask.role}</strong></> : null}.
          </p>
          {ask.piece ? (
            href ? (
              <Link href={href} className="mt-0.5 inline-flex min-h-[2rem] items-center text-[0.875rem] font-semibold text-app-link hover:underline [overflow-wrap:anywhere]">{ask.piece.title}{ask.piece.when ? ` · ${ask.piece.when}` : ''}</Link>
            ) : <p className="mt-0.5 text-[0.875rem] text-app-secondary">{ask.piece.title}</p>
          ) : null}
        </div>
      </div>
      {signing ? (
        <div className="ml-[3.25rem] flex flex-col gap-1">
          {ask.kind === 'credit' ? (
            <label className={check}>
              <input type="checkbox" checked={onMyWork} onChange={(e) => setOnMyWork(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[color:var(--color-link)]" />
              <span className="text-[0.9375rem] leading-5 text-app">Show this piece on my Work too</span>
            </label>
          ) : null}
          <label className={check}>
            <input type="checkbox" checked={nameOnLinks} onChange={(e) => setNameOnLinks(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[color:var(--color-link)]" />
            <span className="text-[0.9375rem] leading-5 text-app">
              Show my name on pages opened by a link
              <span className="block text-xs leading-4 text-app-muted">Off: those pages say what you did, not who you are.</span>
            </span>
          </label>
          <div className="flex gap-2 pt-1">
            <button type="button" disabled={busy} onClick={sign} className="min-h-[2.75rem] px-4 rounded-xl bg-primary-600 text-white text-[0.9375rem] font-semibold hover:bg-primary-700 disabled:opacity-60">{busy ? 'Signing…' : 'Sign'}</button>
            <button type="button" disabled={busy} onClick={() => setSigning(false)} className="min-h-[2.75rem] px-4 rounded-xl text-[0.9375rem] font-semibold text-app-secondary hover-bg-app">Back</button>
          </div>
        </div>
      ) : (
        <div className="ml-[3.25rem] flex gap-2">
          <button type="button" disabled={busy} onClick={() => setSigning(true)} className="min-h-[2.75rem] px-4 rounded-xl bg-primary-600 text-white text-[0.9375rem] font-semibold hover:bg-primary-700 disabled:opacity-60">Sign</button>
          <button type="button" disabled={busy} onClick={decline} className="min-h-[2.75rem] px-4 rounded-xl border border-app-strong text-[0.9375rem] font-semibold text-app hover-bg-app disabled:opacity-60">Not me</button>
        </div>
      )}
      {note ? <p role="alert" className="ml-[3.25rem] text-[0.8125rem] leading-[1.125rem] text-app-error">{note}</p> : null}
    </li>
  );
}

/**
 * The owner's own start of their Work tab: "Asked of you" (pieces and roles someone named them on, to sign or not),
 * the jobs and plans Pantopus saw that aren't a piece yet ("Make it a piece"), and "Add a piece". Read again whenever
 * the page is. Whether asks can be read at all says whether credits are on (`onTies`).
 */
export default function OwnerWork({ round, onAdd, onOffer, onCounts, onTies, onAnswered }: {
  round: number;
  onAdd: () => void;
  onOffer: (offer: ProfilePieceOffer) => void;
  onCounts?: (mine: ProfileMyPieces) => void;
  onTies?: (on: boolean) => void;
  /** An ask was signed or declined: the page is read again (a signed piece joins this Work). */
  onAnswered?: () => void;
}) {
  const [offered, setOffered] = useState<ProfilePieceOffer[]>([]);
  const [asks, setAsks] = useState<ProfileAsk[]>([]);
  const [asksRound, setAsksRound] = useState(0);
  useEffect(() => {
    let live = true;
    // Started inside a promise: any failure leaves just "Add a piece".
    Promise.resolve().then(() => api.profilePage.getMyPieces()).then(
      (mine) => {
        if (!live) return;
        setOffered(Array.isArray(mine?.offered) ? mine.offered.filter((o) => o && o.id && o.title) : []);
        onCounts?.(mine);
      },
      () => { if (live) setOffered([]); },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read again when the page is read again
  }, [round]);
  useEffect(() => {
    let live = true;
    // 404 while the server's credits are off: no "Asked of you", and the editor has no "Who was on it?".
    Promise.resolve().then(() => api.profilePage.getAsks()).then(
      (res) => {
        if (!live) return;
        setAsks(Array.isArray(res?.asks) ? res.asks.filter((a) => a && a.id) : []);
        onTies?.(true);
      },
      () => { if (live) { setAsks([]); onTies?.(false); } },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read again when the page is, or after an answer
  }, [round, asksRound]);

  return (
    <>
      {asks.length > 0 ? (
        <section aria-label="Asked of you" className={`${card} overflow-hidden print:hidden`}>
          <h2 className={`${overline} px-5 pt-4 pb-1`}>Asked of you</h2>
          <ul className="divide-y divide-app-subtle">
            {asks.map((ask) => <AskRow key={ask.id} ask={ask} onDone={() => { setAsksRound((n) => n + 1); onAnswered?.(); }} />)}
          </ul>
        </section>
      ) : null}
      <section aria-label="Add to your Work" className={`${card} overflow-hidden print:hidden`}>
        {offered.length > 0 ? (
          <>
            <h2 className={`${overline} px-5 pt-4 pb-1`}>Pantopus saw these</h2>
            <ul className="divide-y divide-app-subtle">
              {offered.map((offer) => (
                <li key={`${offer.kind}-${offer.id}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9375rem] leading-5 font-semibold text-app [overflow-wrap:anywhere]">{offer.title}</span>
                    <span className="block text-[0.8125rem] leading-[1.125rem] text-app-secondary [overflow-wrap:anywhere]">{offer.text}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onOffer(offer)}
                    className="shrink-0 min-h-[2.75rem] px-3.5 rounded-xl bg-app-surface-sunken text-[0.875rem] font-semibold text-app hover-bg-app focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)]"
                  >
                    Make it a piece
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className={`px-4 ${offered.length > 0 ? 'pb-4 pt-1' : 'py-4'}`}>
          <button
            type="button"
            onClick={onAdd}
            className="w-full min-h-[3rem] rounded-xl border border-app-strong bg-surface inline-flex items-center justify-center gap-2 text-[1rem] font-semibold text-app hover-bg-app focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-link)]"
          >
            <Plus aria-hidden="true" className="w-5 h-5" />Add a piece
          </button>
        </div>
      </section>
    </>
  );
}
