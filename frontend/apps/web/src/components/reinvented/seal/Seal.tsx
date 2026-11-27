'use client';

// Relics and "Seal it" (Pulse, reinvented, phase 3; coord/CONTRACT.md §8g): a Moment that opens later, on a date, when
// someone stands where it was left, or the next time it rains there. Until it opens nobody but its author sees what it
// holds; the reader sees a sealed cover with the server's hint, and a place relic opens for them where it was left.

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { post } from '@pantopus/api/client';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { useMe } from '@/lib/me';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import './seal.css';

export interface SealInfo {
  opens: 'date' | 'place' | 'rain';
  at: string | null;
  open: boolean;
  hint?: string;
  opened_at?: string | null;
}
export function sealOf(m: Moment | null | undefined): SealInfo | null {
  const s = (m as (Moment & { seal?: SealInfo | null }) | null | undefined)?.seal;
  return s && typeof s.opens === 'string' ? s : null;
}

/** Over a sealed Moment in the viewer: its cover for a reader, a small mark for its author. */
export function SealCover({ moment }: { moment: Moment }) {
  const client = useQueryClient();
  const reread = useRereadSwitch();
  const account = useMe().data?.id;
  const seal = sealOf(moment);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (!seal || seal.open) return null;
  if (account && moment.author?.id === account)
    return (
      <span className="sl-mark">
        <Lock aria-hidden="true" /> Sealed · {seal.hint || 'only you see it until it opens'}
      </span>
    );
  async function openHere() {
    setBusy(true);
    setError('');
    try {
      const fix = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation
          ? navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('Allow your location to open it where it was left.')), { timeout: 8000 })
          : reject(new Error('This browser can’t tell where you are.')),
      );
      const { moment: whole } = await post<{ moment: Moment }>(`/api/reinvented/seals/${encodeURIComponent(moment.id)}/open`, {
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
      });
      // Whole for this reader while they're here; nothing is recorded.
      client.setQueryData<{ moment: Moment }>(['moments', 'watch', account, moment.id], (old) => (old ? { ...old, moment: whole } : { moment: whole }));
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
      const err = e as { code?: string; message?: string };
      setError(err.code === 'SEAL_NOT_HERE' ? 'Stand where it was left to open it.' : err.message || 'Couldn’t open it. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sl-cover" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <Lock aria-hidden="true" />
      <strong>Sealed</strong>
      <p>{seal.hint || 'It opens later.'}</p>
      <p className="sl-by">Left by {moment.author?.name || 'someone'}</p>
      {seal.opens === 'place' && (
        <button type="button" className="sl-open" disabled={busy} onClick={() => void openHere()}>
          {busy ? 'Opening…' : 'Open it here'}
        </button>
      )}
      {error && (
        <p className="sl-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
