'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Copy, Eye, Printer, QrCode, Send } from 'lucide-react';
import * as api from '@pantopus/api';
import type { ProfilePartSetting, ProfileRings, ProfileShare, ProfileSharePart } from '@pantopus/api';
import BottomSheet from '@/components/ui/BottomSheet';
import QRCode from '@/components/ui/QRCode';
import ProfileAvatar from '@/components/profile/public/atoms/ProfileAvatar';
import { extractApiError } from '@/lib/auth-utils';
import { AvatarRing } from './RingArt';
import { card, overline } from './blocks';
import { GROUPS } from './parts';
import LinksSection from './LinksSection';

const linkLabel = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** A switch: on means anyone with the link sees the part. */
function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative shrink-0 w-11 h-[26px] rounded-full transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-link)] ${on ? 'bg-[var(--color-link)]' : 'bg-[rgb(var(--app-border-strong))]'}`}
    >
      {/* A 44 px target around the switch. */}
      <span aria-hidden="true" className="absolute -inset-y-[9px] inset-x-0" />
      <span aria-hidden="true" className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[left] ${on ? 'left-[21px]' : 'left-[3px]'}`} />
    </button>
  );
}

function Row({ label, detail, control }: { label: string; detail?: ReactNode; control?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 min-h-[3.25rem]">
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-5 font-semibold text-app">{label}</p>
        {detail ? <p className="text-xs leading-4 text-app-muted">{detail}</p> : null}
      </div>
      {control}
    </div>
  );
}

export interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  /** The owner's name, portrait and rings, for the link card. */
  name: string;
  seed: string;
  photoUrl?: string | null;
  rings: ProfileRings;
  /** "See it as a visitor": the page exactly as a signed-out visitor gets it. */
  onSeeAsVisitor: () => void;
  /** "Save as PDF": the visitor's page, printed. */
  onSaveAsPdf: () => void;
  /** Saved parts change what visitors get: the page reads itself again. */
  onSaved?: (share: ProfileShare) => void;
}

/**
 * Share your profile (board 21): the main link, and which parts it shows. A part switched off simply isn't on the page
 * a visitor gets: nothing says it exists. On is "anyone with the link"; off keeps the part to people signed in.
 */
export default function ShareSheet({ open, onClose, name, seed, photoUrl, rings, onSeeAsVisitor, onSaveAsPdf, onSaved }: ShareSheetProps) {
  const [share, setShare] = useState<ProfileShare | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);
  const [canSend, setCanSend] = useState(false);
  // What "off" returns a part to: a part kept to connections stays there when it is switched off again.
  const offSetting = useRef<Record<string, ProfilePartSetting>>({});
  const round = useRef(0);

  useEffect(() => {
    setCanSend(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const load = async () => {
    const mine = ++round.current;
    setLoadState('loading');
    try {
      const next = await api.profilePage.getShare();
      if (mine !== round.current) return;
      for (const part of next.parts || []) if (part.setting === 'connections') offSetting.current[part.key] = 'connections';
      setShare(next);
      setLoadState('ready');
    } catch {
      if (mine === round.current) setLoadState('failed');
    }
  };

  useEffect(() => {
    if (!open) return;
    setStatus('');
    setError('');
    void load();
  }, [open]);

  const save = async (key: string, body: Parameters<typeof api.profilePage.saveShare>[0], optimistic: ProfileShare) => {
    const before = share;
    setShare(optimistic);
    setSaving(key);
    setStatus('');
    setError('');
    try {
      const saved = await api.profilePage.saveShare(body);
      setShare(saved);
      setStatus('Saved.');
      onSaved?.(saved);
    } catch (err) {
      setShare(before);
      setError(extractApiError(err, "Your change wasn't saved. Try again."));
    } finally {
      setSaving(null);
    }
  };

  const setPart = (part: ProfileSharePart, on: boolean) => {
    if (!share) return;
    const setting: ProfilePartSetting = on ? 'anyone' : offSetting.current[part.key] ?? 'members';
    const parts = share.parts.map((p) => (p.key === part.key ? { ...p, setting } : p));
    void save(part.key, { parts: { [part.key]: setting } as Record<string, ProfilePartSetting> }, { ...share, parts });
  };

  const setListed = (on: boolean) => {
    if (!share) return;
    void save('search_engines', { search_engines: on }, { ...share, search_engines: on });
  };

  const url = share?.url || '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Link copied.');
    } catch {
      setError('Couldn’t copy the link. Select it and copy it yourself.');
    }
  };
  const send = async () => {
    try {
      await navigator.share({ title: `${name} on Pantopus`, url });
    } catch {
      // Dismissed: nothing to say.
    }
  };

  const byKey = new Map((share?.parts || []).map((p) => [p.key, p]));
  const cityLimit = share?.city_limit;

  let body: ReactNode;
  if (loadState === 'loading' && !share) {
    body = <div className="py-12 flex justify-center" role="status"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" aria-hidden="true" /><span className="sr-only">Loading</span></div>;
  } else if (loadState === 'failed' && !share) {
    body = (
      <div className="py-10 text-center">
        <p className="text-[0.9375rem] text-app-secondary">Couldn&apos;t load your link. Check your connection and try again.</p>
        <button type="button" onClick={() => void load()} className="mt-3 min-h-[2.75rem] px-4 rounded-xl border border-app-strong text-[0.9375rem] font-semibold text-app hover-bg-app">Try again</button>
      </div>
    );
  } else if (share) {
    body = (
      <div className="flex flex-col gap-3">
        <div className={`${card} p-4 flex flex-col gap-3`}>
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <AvatarRing rings={rings}><ProfileAvatar name={name} seed={seed} photoUrl={photoUrl} size={40} /></AvatarRing>
            <div className="min-w-[10rem] flex-1">
              <p className="text-[0.9375rem] leading-[1.3125rem] font-semibold text-app [overflow-wrap:anywhere]">{linkLabel(url)}</p>
              <p className="text-xs leading-4 text-app-muted">Anyone with this link can open it. No account needed.</p>
            </div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2">
            <button type="button" onClick={() => void copy()} className="min-h-[2.75rem] px-3 rounded-xl bg-primary-600 text-white text-[0.9375rem] font-semibold hover:bg-primary-700 inline-flex items-center justify-center gap-1.5">
              <Copy aria-hidden="true" className="w-4 h-4" />Copy link
            </button>
            {canSend ? (
              <button type="button" onClick={() => void send()} className="min-h-[2.75rem] px-3 rounded-xl border border-app-strong bg-surface text-app text-[0.9375rem] font-semibold hover-bg-app inline-flex items-center justify-center gap-1.5">
                <Send aria-hidden="true" className="w-4 h-4" />Send
              </button>
            ) : null}
            <button type="button" onClick={() => setCodeOpen((v) => !v)} aria-expanded={codeOpen} className="min-h-[2.75rem] px-3 rounded-xl border border-app-strong bg-surface text-app text-[0.9375rem] font-semibold hover-bg-app inline-flex items-center justify-center gap-1.5">
              <QrCode aria-hidden="true" className="w-4 h-4" />{codeOpen ? 'Hide code' : 'Show code'}
            </button>
          </div>
          {codeOpen ? <div className="flex justify-center rounded-xl bg-white p-3"><QRCode value={url} size={200} label={`A code that opens ${linkLabel(url)}`} /></div> : null}
        </div>
        <p className="rounded-2xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-[0.8125rem] leading-[1.125rem] text-sky-900">
          A part you switch off simply isn&apos;t there. Nothing on the page says it exists, and the page closes up around it.
        </p>
        <div className="sr-only" role="status" aria-live="polite">{status}</div>
        {error ? <p role="alert" className="text-[0.8125rem] leading-[1.125rem] text-app-error">{error}</p> : null}
        {GROUPS.map((group) => {
          const rows = group.parts.filter((p) => byKey.get(p.key)?.has_content);
          if (rows.length === 0 && group.title !== 'About you' && group.title !== 'Reaching you') return null;
          return (
            <section key={group.title} className={`${card} overflow-hidden`} aria-label={group.title}>
              <h3 className={`${overline} px-4 pt-3.5 pb-0.5`}>{group.title}</h3>
              <div className="divide-y divide-app-subtle">
                {group.title === 'About you' ? <Row label="Portrait, name and rings" detail="Always shown" /> : null}
                {rows.map((p) => {
                  const part = byKey.get(p.key)!;
                  const on = part.setting === 'anyone';
                  // The city never goes wider than "Who sees your city" in your privacy settings.
                  const cityHeld = p.key === 'city' && cityLimit !== 'anyone';
                  const detail = p.key === 'city'
                    ? (cityHeld
                      ? <>Your privacy settings keep your city {cityLimit === 'none' ? 'to you' : 'to connections'}. <Link href="/app/profile/settings/privacy" className="font-semibold text-app-link hover:underline">Change it</Link></>
                      : on ? 'Your city and state, never more' : 'Off, the page names no place')
                    : p.detail;
                  return (
                    <Row
                      key={p.key}
                      label={p.label}
                      detail={detail}
                      control={<Switch on={on && !cityHeld} label={p.label} disabled={cityHeld || saving !== null} onChange={(next) => setPart(part, next)} />}
                    />
                  );
                })}
                {group.title === 'Reaching you' ? <Row label="Phone and email" detail="Never on a link. Connections only." /> : null}
              </div>
            </section>
          );
        })}
        <section className={`${card} overflow-hidden`}>
          <Row
            label="Let search engines list this page"
            detail="On unless you switch it off. Links for one purpose are never listed."
            control={<Switch on={share.search_engines} label="Let search engines list this page" disabled={saving !== null} onChange={setListed} />}
          />
        </section>
        <LinksSection share={share} onShare={setShare} onError={setError} />
      </div>
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Share your profile"
      footer={share ? (
        <div className="flex flex-wrap gap-2 [&>*]:flex-1 [&>*]:basis-[9rem]">
          <button type="button" onClick={onSeeAsVisitor} className="min-h-[2.75rem] px-3 rounded-xl border border-app-strong bg-surface text-app text-[0.9375rem] font-semibold hover-bg-app inline-flex items-center justify-center gap-1.5">
            <Eye aria-hidden="true" className="w-4 h-4" />See it as a visitor
          </button>
          <button type="button" onClick={onSaveAsPdf} className="min-h-[2.75rem] px-3 rounded-xl bg-app-surface-sunken text-app text-[0.9375rem] font-semibold hover-bg-app inline-flex items-center justify-center gap-1.5">
            <Printer aria-hidden="true" className="w-4 h-4" />Save as PDF
          </button>
        </div>
      ) : undefined}
    >
      <div className="pb-2">{body}</div>
    </BottomSheet>
  );
}
