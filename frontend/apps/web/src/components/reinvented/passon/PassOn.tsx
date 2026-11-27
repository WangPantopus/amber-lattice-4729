'use client';

// Passing on, and Eyes on (Pulse, reinvented, phase 3; coord/CONTRACT.md §8f). A post travels when someone passes it on
// from where they are: a pass is the passer's own post quoting the original, made from their place now, so it reaches
// people around them by today's rules, and it says who carried it. Today's screens and the apps in the stores see an
// ordinary quote post. An Eyes-on Ask asks a place a question that people there now answer with a Live photo.

import { useState } from 'react';
import { Send } from 'lucide-react';
import type { Post } from '@pantopus/api';
import { posts as postsApi } from '@pantopus/api';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { useMe } from '@/lib/me';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import { purposeOf, type StudioKind } from '../studio/postKinds';
import './passon.css';

type Person = Moment['author'];
type TravelPost = Omit<Post, 'post_as'> & {
  passed?: { count: number; carriers: Person[] } | null;
  passed_on?: { from: string; carried_by: Person } | null;
  eyes_on?: { open: boolean; until: string; answers: number } | null;
  user_id?: string;
  post_as?: string | null;
};

const names = (people: Person[], count: number) => {
  const shown = people.slice(0, 2).map((p) => p?.first_name || p?.name || 'Someone');
  const rest = count - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}` : shown.join(' and ');
};

/** Under a post's status line: who carried it on, who it came from, and an Eyes-on Ask's window. */
export function travelLine(post: Post): string | null {
  const p = post as unknown as TravelPost;
  if (p.passed_on?.carried_by) return `Carried here by ${p.passed_on.carried_by.first_name || p.passed_on.carried_by.name || 'someone'}`;
  if (p.passed?.count) return `Passed on by ${names(p.passed.carriers || [], p.passed.count)}`;
  if (p.eyes_on) {
    const n = p.eyes_on.answers;
    const until = new Date(p.eyes_on.until).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `Eyes on · ${p.eyes_on.open ? `open until ${until}` : 'closed'}${n ? ` · ${n} ${n === 1 ? 'Live answer' : 'Live answers'}` : ''}`;
  }
  return null;
}

const KINDS: StudioKind[] = ['ask_local', 'alert', 'lost_found', 'recommendation', 'local_update', 'event'];

function errorWords(e: unknown): string {
  const err = e as { code?: string; message?: string; statusCode?: number };
  if (['PASS_OWN', 'PASS_INVALID', 'PASSED_ALREADY'].includes(err.code || '') && err.message) return err.message;
  if (err.statusCode && err.statusCode < 500 && err.message) return err.message;
  return 'Couldn’t pass it on. Try again.';
}

/** "Pass it on": the reader's own words over the original, from where they are now (a fresh device fix). */
export function PassItOn({ post }: { post: Post }) {
  const p = post as unknown as TravelPost;
  const account = useMe().data?.id;
  const reread = useRereadSwitch();
  const [open, setOpen] = useState(false),
    [words, setWords] = useState(''),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [done, setDone] = useState(false);
  // Never one's own post, a pass itself, or a post under a made-up name (the server refuses those too).
  if (!account || p.user_id === account || p.passed_on || p.post_as === 'pen_name') return null;
  async function send() {
    setBusy('Finding where you are…');
    setError('');
    try {
      const fix = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation
          ? navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('Allow your location to pass it on from where you are.')), {
              timeout: 8000,
              enableHighAccuracy: true,
            })
          : reject(new Error('This browser can’t tell where you are.')),
      );
      setBusy('Passing it on…');
      const kind = (KINDS.includes(String(p.post_type) as StudioKind) ? String(p.post_type) : 'local_update') as StudioKind;
      await postsApi.createPost({
        clientRequestId: crypto.randomUUID(),
        content: words.trim(),
        postType: kind,
        visibility: 'neighborhood',
        audience: 'nearby',
        postAs: 'personal',
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
        gpsTimestamp: new Date().toISOString(),
        gpsLatitude: fix.coords.latitude,
        gpsLongitude: fix.coords.longitude,
        purpose: purposeOf(kind),
        profileVisibilityScope: 'local_context',
        showOnProfile: true,
        quotedPostId: post.id,
        studio: { passed_on: true },
      } as Parameters<typeof postsApi.createPost>[0]);
      setDone(true);
      setOpen(false);
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
      setError(e instanceof Error && !(e as { code?: string }).code && !(e as { statusCode?: number }).statusCode ? e.message : errorWords(e));
    } finally {
      setBusy('');
    }
  }
  if (done) return <p className="po-note">Passed on, from where you are.</p>;
  return open ? (
    <div className="po-panel">
      <p className="po-title">Pass it on from where you are</p>
      <p className="po-note">It goes to people around you now, with your words, and says you carried it.</p>
      <textarea value={words} maxLength={500} rows={2} placeholder="Why it’s worth passing on" aria-label="Your words" onChange={(e) => setWords(e.target.value)} />
      {error && (
        <p className="po-error" role="alert">
          {error}
        </p>
      )}
      <div className="po-actions">
        <button type="button" className="po-button" disabled={!!busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="button" className="po-button po-strong" disabled={!!busy || !words.trim()} onClick={() => void send()}>
          {busy || 'Pass it on'}
        </button>
      </div>
    </div>
  ) : (
    <button type="button" className="rp-place-button" onClick={() => setOpen(true)}>
      <Send size={15} aria-hidden />
      Pass it on
    </button>
  );
}
