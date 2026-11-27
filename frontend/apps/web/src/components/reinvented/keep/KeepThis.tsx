'use client';

// "Keep this?" (Pulse, reinvented, phase 1 piece 11; coord/CONTRACT.md §6d): a Moment that drew a reply asks its author
// once, in its last two hours, whether to keep it. Yes makes it a post that stays for the same people until its author
// removes it; nothing is copied and the picture stays where it is. The server says when to ask (`keep_offer`, on the
// author's own Moment only) and takes the one answer; the viewer draws the question over the picture.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { post } from '@pantopus/api/client';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { useMe } from '@/lib/me';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import './keep.css';

type KeepMoment = Moment & { keep_offer?: boolean; kept?: boolean };

export function answerKeep(id: string, keep: boolean) {
  return post<{ moment: KeepMoment }>(`/api/reinvented/moments/${encodeURIComponent(id)}/keep`, { keep });
}

/** While "Keep this?" is asked, the viewer holds still on the Moment, as it does for an unguessed spot. */
export function holdsForKeep(m: Moment, account: string): boolean {
  return (m as KeepMoment).keep_offer === true && m.author?.id === account;
}

/** Over the viewer's picture, on the author's own Moment while the server offers it. */
export function KeepOverPicture({ moment }: { moment: Moment }) {
  const m = moment as KeepMoment;
  const account = useMe().data?.id;
  const client = useQueryClient();
  const reread = useRereadSwitch();
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null),
    [error, setError] = useState(''),
    [done, setDone] = useState<'kept' | 'faded' | null>(null);
  if (!account || m.author?.id !== account || (!m.keep_offer && !done)) return null;
  // Taps here never reach the viewer's own tap-to-step and hold-to-pause.
  const stop = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };
  async function answer(keep: boolean) {
    if (busy) return;
    setBusy(keep ? 'yes' : 'no');
    setError('');
    try {
      const res = await answerKeep(m.id, keep);
      client.setQueryData<{ moment: KeepMoment }>(['moments', 'watch', account, m.id], (old) =>
        old ? { ...old, moment: { ...old.moment, ...res.moment } } : old,
      );
      void client.invalidateQueries({ queryKey: ['reinvented'] });
      setDone(keep ? 'kept' : 'faded');
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
      else setError(e instanceof Error && e.message ? e.message : 'Couldn’t save that. Try again.');
    } finally {
      setBusy(null);
    }
  }
  if (done)
    return (
      <p className="kp-done" role="status" {...stop}>
        {done === 'kept' ? 'Kept. It stays for the same people until you remove it.' : 'It will fade as planned.'}
      </p>
    );
  return (
    <div className="kp-ask" role="group" aria-label="Keep this?" {...stop}>
      <span>
        <strong>Keep this?</strong>
        <small>It drew answers. Keep it as a post that stays for the same people.</small>
        {error && <small role="alert">{error}</small>}
      </span>
      <button type="button" className="kp-no" disabled={!!busy} onClick={() => void answer(false)}>
        {busy === 'no' ? '…' : 'Let it fade'}
      </button>
      <button type="button" className="kp-yes" disabled={!!busy} onClick={() => void answer(true)}>
        <Bookmark size={16} aria-hidden="true" />
        {busy === 'yes' ? '…' : 'Keep'}
      </button>
    </div>
  );
}
