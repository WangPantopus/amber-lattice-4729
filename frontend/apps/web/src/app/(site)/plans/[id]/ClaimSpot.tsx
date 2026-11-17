'use client';

// One person pays for the group (Plans for the holidays, the extras, 08-extras section 7): the page a buyer's link
// opens, /plan-link/<id>?spot=<token>. "{Chris} got you a spot" and "I'm in": signed out, the web's sign-in comes back
// here with `&join=1` (through /app/plans/<id>/spot); signed in, it takes the spot (POST …/requests/claim-spot, the
// route the apps call), free to the person. Every word is the server's, and the server decides who may take one.

import { useEffect, useRef, useState } from 'react';
import * as api from '@pantopus/api';

const BUTTON = 'flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-[15px] font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60';

export type SpotView = { text: string | null; left: number; open: boolean; button: string; closed_text: string | null };

function messageOf(err: unknown): string {
  const e = err as { data?: { message?: string }; message?: string };
  return e?.data?.message || e?.message || 'Something went wrong. Please try again.';
}

export default function ClaimSpot({ planId, token, spot, signedIn, joinNow, alreadyIn, place }: {
  planId: string;
  token: string;
  spot: SpotView;
  signedIn: boolean;
  joinNow: boolean;
  alreadyIn: boolean;
  place: string;
}) {
  const [inNow, setInNow] = useState(alreadyIn);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  const claim = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.post(`/api/plans/${encodeURIComponent(planId)}/requests/claim-spot?biz=1`, { token });
      setInNow(true);
    } catch (err) {
      setMessage(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  // Back from sign-in with &join=1: straight to taking the spot.
  useEffect(() => {
    if (signedIn && joinNow && spot.open && !alreadyIn && !started.current) {
      started.current = true;
      void claim();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, joinNow]);

  if (inNow) {
    return (
      <section aria-label="You're in" className="flex flex-col gap-2 rounded-[20px] border border-app-border bg-app-surface p-4">
        <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">You&apos;re in</p>
        {spot.text ? <p className="text-sm leading-5 text-app-text">{spot.text}</p> : null}
        <p className="text-sm leading-5 text-app-text-strong">{place}</p>
        <p className="text-sm leading-5 text-app-text-secondary">Get the app for the chat and the plan&apos;s updates.</p>
      </section>
    );
  }

  if (!spot.open) {
    return <p className="text-sm leading-5 text-app-text-secondary">{spot.closed_text || 'This link isn’t taking anyone now.'}</p>;
  }

  const back = `/app/plans/${encodeURIComponent(planId)}/spot?token=${encodeURIComponent(token)}`;
  return (
    <section aria-label="A spot for you" className="flex flex-col gap-3 rounded-[20px] border border-app-border bg-app-surface p-4">
      {spot.text ? <p className="text-lg font-semibold leading-6 text-app-text">{spot.text}</p> : null}
      {signedIn ? (
        <button type="button" className={BUTTON} disabled={busy} onClick={() => void claim()}>
          {busy ? 'Taking your spot…' : spot.button}
        </button>
      ) : (
        <a href={`/login?redirectTo=${encodeURIComponent(back)}`} className={BUTTON}>{spot.button}</a>
      )}
      {message ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{message}</p> : null}
    </section>
  );
}
