'use client';

// "Mail it" (Pulse, reinvented, phase 3; coord/CONTRACT.md §8j): the author sends their own Moment's picture as an
// ordinary letter in today's Mail tab. The server first keeps the picture as one of the sender's own mail enclosures
// (POST /api/reinvented/moments/:id/enclosure). Then the letter goes through today's POST /api/mailbox/send, so every
// rule of today's letters applies: writing to someone else is today's `mail_extras`, and blocks, the stamp and the
// recipient's own mail settings all hold. It looks like any letter with a photo. It is drawn inside the viewer's
// options sheet, because on a phone the viewer is a modal dialog.

import { useState } from 'react';
import { Mail } from 'lucide-react';
import * as api from '@pantopus/api';
import { post } from '@pantopus/api/client';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { launchFeatures } from '@/lib/featureFlags';
import { useMe } from '@/lib/me';
import { useConnectionsForMentions } from '../mentions/Mentions';
import { sealOf } from '../seal/Seal';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import './mailit.css';

type MailMoment = Moment & { post_as?: string | null; guess?: unknown; caption?: string | null; text?: string | null };

interface Enclosed {
  enclosure: { ref: string; id: string; name: string; mime_type: string; size_bytes: number };
  words: string | null;
  place: string | null;
}

function messageOf(e: unknown): string {
  const err = e as { message?: string; code?: string } | null;
  if (err?.code === 'MAIL_EXTRAS_UNAVAILABLE') return 'Letters to other people aren’t available yet. You can mail it to yourself.';
  return err?.message || 'Couldn’t mail it. Try again.';
}

/** Whether this Moment can be mailed by this reader: their own, with a picture, under their own name, not held back. */
export function canMailIt(m: Moment, account: string | undefined): boolean {
  const mm = m as MailMoment;
  if (!launchFeatures.mailbox || !account || m.author?.id !== account) return false;
  if (mm.post_as === 'pen_name' || (m.author as { kind?: string } | undefined)?.kind === 'pen_name') return false;
  if (m.kind !== 'photo' && m.kind !== 'video') return false;
  const live = Date.parse(m.expires_at || '') > Date.now();
  if (mm.guess && live) return false;
  const seal = sealOf(m);
  return !(seal && !seal.open);
}

/** In Moment options, on the author's own Moment with a picture: "Mail it", opening its form in place. */
export function MailItEntry({ moment, close }: { moment: Moment; close(): void }) {
  const account = useMe().data?.id;
  const [open, setOpen] = useState(false);
  if (!canMailIt(moment, account)) return null;
  if (!open)
    return (
      <button type="button" className="mo-action" onClick={() => setOpen(true)}>
        <Mail />
        Mail it
      </button>
    );
  return <MailItForm moment={moment as MailMoment} account={account!} close={close} onCancel={() => setOpen(false)} />;
}

function MailItForm({ moment, account, close, onCancel }: { moment: MailMoment; account: string; close(): void; onCancel(): void }) {
  const reread = useRereadSwitch();
  const others = launchFeatures.mailExtras;
  const people = useConnectionsForMentions(others);
  const [to, setTo] = useState(account);
  const [words, setWords] = useState(() => (moment.caption || moment.text || '').trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const toName = to === account ? 'your' : `${people.data?.find((p) => p.id === to)?.name || 'their'}’s`;

  async function send() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const kept = await post<Enclosed>(`/api/reinvented/moments/${encodeURIComponent(moment.id)}/enclosure`, {});
      // Written as the morning postcards are (CONTRACT 8j): "A postcard from <first name>", the words, "<place> · <day>".
      const first = (moment.author?.first_name || moment.author?.name || '').split(/\s+/)[0] || 'me';
      const subject = `A postcard from ${first}`;
      const day = new Date(moment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const content = [words.trim() || null, [kept.place, day].filter(Boolean).join(' · ')].filter(Boolean).join('\n\n');
      await api.mailbox.sendMail({
        recipient: { mode: 'user', userId: to },
        envelope: { type: 'letter', subject },
        object: {
          format: 'mailjson_v1',
          mimeType: 'application/json',
          title: subject,
          content,
          attachments: [kept.enclosure.ref],
          payload: { bodyFormat: 'plain_text' },
        },
        tracking: { source: 'pulse_mail_it_web' },
      });
      setSent(`Mailed. It’s in ${toName} Mail.`);
      window.setTimeout(close, 1600);
    } catch (e) {
      if (isSwitchedOff(e)) void reread();
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <p className="mi-sent" role="status">
        <Mail size={16} aria-hidden="true" />
        {sent}
      </p>
    );
  return (
    <form
      className="mi-form"
      aria-label="Mail it"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <p className="mi-title">
        <Mail size={16} aria-hidden="true" />
        Mail it
      </p>
      <label className="mi-field">
        <span>To</span>
        <select value={to} onChange={(e) => setTo(e.target.value)} disabled={busy}>
          <option value={account}>Yourself, in your Mail</option>
          {others && (people.data || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mi-field">
        <span>Words</span>
        <textarea value={words} maxLength={2000} rows={3} onChange={(e) => setWords(e.target.value)} disabled={busy} placeholder="A few words to go with it" />
      </label>
      <small className="mi-note">It goes as a letter with this picture enclosed, as any letter in Mail.</small>
      {error && (
        <small className="mi-error" role="alert">
          {error}
        </small>
      )}
      <div className="mi-actions">
        <button type="button" className="mi-cancel" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="mi-send" disabled={busy}>
          {busy ? 'Mailing…' : 'Mail it'}
        </button>
      </div>
    </form>
  );
}
