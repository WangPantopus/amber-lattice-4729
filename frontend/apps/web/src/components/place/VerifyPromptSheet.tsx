// ============================================================
// Place — B1 · "Verify your address" prompt sheet (T3 → T4).
//
// The web mirror of docs/design/place (place-verify.jsx): a sheet over
// the claimed dashboard that frames the Band-D unlock, then lets the
// resident pick HOW to verify. It does not rebuild the verification
// machinery — each method routes into the EXISTING verification pages
// (verify-postcard / verify-landlord / claim-owner) carrying
// `?return=place`, so the success path lands back on /app/place.
//
// Reuses the shared BottomSheet shell (backdrop, Esc, scroll-lock,
// mobile-bottom / desktop-center) and the Place archetype atoms.
// Home-green carries the place; sky carries the CTA. Tokens only.
// ============================================================

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as api from '@pantopus/api';
import type { VerifyOptions } from '@pantopus/api';
import type { LucideIcon } from 'lucide-react';
import {
  ShieldCheck,
  X,
  Send,
  Upload,
  MessageCircle,
  BadgeCheck,
  Mailbox,
  Award,
  Clock,
  Hourglass,
  ChevronRight,
  Camera,
  Mail,
  Smartphone,
} from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
import { IconTile } from '@/components/archetypes/place';
import { launchFeatures } from '@/lib/featureFlags';
import { FAST_VERIFY_ROWS, FAST_VERIFY_WORDS } from './fastVerify/fastVerifyWords';

export interface VerifyPromptSheetProps {
  open: boolean;
  onClose: () => void;
  /** The claimed home being verified. */
  homeId: string;
  /** Display address, e.g. "1421 SE Oak St, Portland". */
  address: string;
  /**
   * The server's verify-options answer (FASTVERIFY). Null or absent while
   * `home_fast_verify` is off: the sheet is today's, unchanged.
   */
  verifyOptions?: VerifyOptions | null;
}

type MethodId = 'mail' | 'landlord' | 'document';

interface Method {
  id: MethodId;
  icon: LucideIcon;
  label: string;
  sub: string;
  /** Routes into an existing verification page, keeping the place return. */
  href: (homeId: string) => string;
}

// Each method maps to a verification page already in the app. We carry
// `return=place` so those pages send the now-verified resident back to
// /app/place (the success reveal) instead of the home dashboard.
const METHODS: Method[] = [
  {
    id: 'mail',
    icon: Send,
    label: 'Mail a code to my address',
    sub: 'A postcard with a code, 3–7 days. Yours to keep.',
    href: (h) => `/app/homes/${h}/verify-postcard?return=place`,
  },
  {
    id: 'document',
    icon: Upload,
    label: 'Upload a document',
    sub: 'A utility bill or lease. A person reviews it.',
    href: (h) => `/app/homes/${h}/verify-residency?return=place`,
  },
  {
    id: 'landlord',
    icon: ShieldCheck,
    label: 'Confirm with your landlord',
    sub: 'Your landlord confirms that you live here.',
    href: (h) => `/app/homes/${h}/verify-landlord?return=place`,
  },
];

// What verifying adds — the T4 unlocks that actually exist (Wedge v2 D4:
// the prize is proof you live here, money that's real, and the rooms
// that open), framed as a promise (no chevrons; not tappable).
const BENEFITS: { icon: LucideIcon; label: string; sub: string }[] = [
  { icon: BadgeCheck, label: 'Proof you live here', sub: 'Your verified badge, a residency letter, and a shareable Residency Pass' },
  // Launch cut #10 (Mailbox): only the rank while the mailbox is hidden.
  launchFeatures.mailbox
    ? { icon: Mailbox, label: 'Your mailbox and your rank', sub: 'The digital mailbox opens, and you take a permanent Block Founder number' }
    : { icon: Award, label: 'Your rank on the block', sub: 'You take a permanent Block Founder number' },
  { icon: MessageCircle, label: 'What only verified residents see', sub: 'Real rents on your block, messages between homes, the Fridge Card, rate watch' },
];

function Overline({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-app-text-muted mb-2 px-0.5">
      {children}
    </div>
  );
}

function Radio({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={`w-[22px] h-[22px] rounded-full shrink-0 box-border bg-app-surface transition-all ${
        selected
          ? 'border-[6.5px] border-primary-600 ring-[3px] ring-primary-600/20'
          : 'border-2 border-app-border-strong'
      }`}
    />
  );
}

export default function VerifyPromptSheet({ open, onClose, homeId, address, verifyOptions = null }: VerifyPromptSheetProps) {
  const router = useRouter();
  // Mail leads: a postcard finishes on its own, while documents wait for a person to review them.
  const [selected, setSelected] = useState<MethodId>('mail');
  // A landlord request can only be answered by a verified landlord, so that
  // door joins once the Home has one (or the person already has a request).
  const [landlordHomeId, setLandlordHomeId] = useState<string | null>(null);
  const [mailHomeId, setMailHomeId] = useState<string | null>(null);
  const methods = METHODS.filter(m => (m.id !== 'landlord' || landlordHomeId === homeId) && (m.id !== 'mail' || mailHomeId === homeId));
  // A residency document the person sent that waits on a reviewer: the document
  // door says so (and links to its status) instead of offering another upload.
  const [documentHomeId, setDocumentHomeId] = useState<string | null>(null);
  const documentInReview = documentHomeId === homeId;
  const choices = documentInReview ? methods.filter((m) => m.id !== 'document') : methods;

  useEffect(() => {
    if (documentInReview && selected === 'document') setSelected('mail');
  }, [documentInReview, selected]);

  // The person's own claims, as the Waiting Room reads them: a residency document
  // for this Home under review (a claim with no document yet isn't). An
  // unreadable list keeps the upload door.
  useEffect(() => {
    if (!open) return;
    let canceled = false;
    (async () => {
      try {
        const { claims } = await api.homeOwnership.getMyOwnershipClaims();
        if (canceled) return;
        const inReview = (claims ?? []).some((c) => c.home_id?.toLowerCase() === homeId.toLowerCase()
          && c.claim_type === 'resident' && c.status === 'under_review' && c.has_evidence !== false);
        setDocumentHomeId(inReview ? homeId : null);
      } catch {
        // Keep the upload door.
      }
    })();
    return () => { canceled = true; };
  }, [open, homeId]);

  useEffect(() => {
    if (!open) return;
    let canceled = false;
    (async () => {
      try {
        const status = await api.tenant.getTenantHomeStatus(homeId);
        if (canceled || status?.home_id !== homeId) return;
        const offers = status.landlord?.has_landlord === true || (status.lease?.state ?? 'none') !== 'none';
        setLandlordHomeId(offers ? homeId : null);
        setMailHomeId(status.mail_available === true ? homeId : null);
      } catch {
        if (!canceled) { setMailHomeId(null); setLandlordHomeId(null); }
      }
    })();
    return () => { canceled = true; };
  }, [open, homeId]);

  const method = choices.find((m) => m.id === selected) ?? choices[0];
  const handleStart = () => {
    if (!method) return;
    onClose();
    router.push(method.href(homeId));
  };

  // The residency document's status page (the one its upload ends on).
  const openDocumentStatus = () => {
    onClose();
    router.push(`/app/homes/${homeId}/verify-residency/submitted?return=place`);
  };

  // FASTVERIFY (drawing 3): the same sheet, with the server's choices as rows that open at a tap.
  if (verifyOptions) {
    return (
      <FastVerifySheet
        open={open}
        onClose={onClose}
        homeId={homeId}
        address={address}
        verifyOptions={verifyOptions}
        documentInReview={documentInReview}
        onOpen={(href) => { onClose(); router.push(href); }}
        onOpenDocumentStatus={openDocumentStatus}
      />
    );
  }

  const footer = (
    <button
      type="button"
      disabled={choices.length === 0}
      onClick={handleStart}
      className="w-full h-[52px] rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-base -tracking-[0.01em] flex items-center justify-center gap-2 shadow-sm transition-colors"
    >
      <ShieldCheck size={17} strokeWidth={2.25} />
      Start verification
    </button>
  );

  return (
    <BottomSheet open={open} onClose={onClose} footer={footer}>
      {/* header */}
      <div className="flex items-center gap-3 mb-5">
        <IconTile icon={ShieldCheck} tone="home" size={38} />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-app-text -tracking-[0.02em] leading-[22px]">
            Verify your address
          </h2>
          <p className="text-[13px] text-app-text-secondary mt-0.5 truncate">{address}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-[30px] h-[30px] shrink-0 rounded-full bg-app-surface-sunken text-app-text-secondary hover:bg-app-hover flex items-center justify-center transition-colors"
        >
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>

      {/* what verifying adds */}
      <div className="mb-5">
        <Overline>What this unlocks</Overline>
        <div className="bg-app-surface border border-app-border rounded-2xl shadow-sm overflow-hidden">
          {BENEFITS.map((b, i) => (
            <div
              key={b.label}
              className={`flex items-center gap-3 px-3.5 py-3 ${i > 0 ? 'border-t border-app-border-subtle' : ''}`}
            >
              <IconTile icon={b.icon} tone="home" size={34} />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-app-text -tracking-[0.01em]">{b.label}</div>
                <div className="text-[12.5px] text-app-text-secondary mt-0.5 leading-[17px]">{b.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* method picker */}
      <div className="mb-4">
        <Overline>Choose how</Overline>
        <div className="bg-app-surface border border-app-border rounded-2xl shadow-sm overflow-hidden">
          {methods.map((m, i) => {
            if (m.id === 'document' && documentInReview) {
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={openDocumentStatus}
                  data-testid="place-verify-document-in-review"
                  className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-app-hover ${
                    i > 0 ? 'border-t border-app-border-subtle' : ''
                  }`}
                >
                  <IconTile icon={Hourglass} tone="muted" size={34} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14.5px] font-semibold text-app-text -tracking-[0.01em]">Document under review</span>
                    <span className="block text-[12.5px] text-app-text-secondary mt-0.5 leading-[17px]">
                      A person is reviewing your document. You&apos;ll get a notification when it&apos;s decided.
                    </span>
                  </span>
                  <ChevronRight size={18} strokeWidth={2.25} aria-hidden className="shrink-0 text-app-text-muted" />
                </button>
              );
            }
            const isSelected = method?.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelected(m.id)}
                aria-pressed={isSelected}
                className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors ${
                  i > 0 ? 'border-t border-app-border-subtle' : ''
                } ${isSelected ? 'bg-primary-50' : 'hover:bg-app-hover'}`}
              >
                <IconTile icon={m.icon} tone={isSelected ? 'sky' : 'muted'} size={34} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14.5px] font-semibold text-app-text -tracking-[0.01em]">{m.label}</span>
                  <span className="block text-[12.5px] text-app-text-secondary mt-0.5 leading-[17px]">{m.sub}</span>
                </span>
                <Radio selected={isSelected} />
              </button>
            );
          })}
        </div>
      </div>

      {/* calm note — nothing is taken away while you wait */}
      <div className="flex items-start gap-2 px-0.5">
        <Clock size={15} strokeWidth={2} className="shrink-0 mt-0.5 text-app-text-muted" />
        <span className="text-[12.5px] text-app-text-secondary leading-[18px]">
          Documents are reviewed by a person. Everything you have now stays available while you wait.
        </span>
      </div>
    </BottomSheet>
  );
}

// ── FASTVERIFY: the sheet's rows from the server's verify-options ─────────────

/** The choices the web draws. "I'm at home now" is app-only (APP_ONLY), so it never is. */
type WebRowId = 'phone' | 'document' | 'mail' | 'landlord';
const WEB_ROWS: { id: WebRowId; icon: LucideIcon; group: 'fastest' | 'mail'; href: (homeId: string) => string }[] = [
  { id: 'phone', icon: Smartphone, group: 'fastest', href: (h) => `/app/homes/${h}/verify-phone?return=place` },
  { id: 'document', icon: Camera, group: 'fastest', href: (h) => `/app/homes/${h}/verify-residency?return=place` },
  { id: 'mail', icon: Mail, group: 'mail', href: (h) => `/app/homes/${h}/verify-postcard?return=place` },
  { id: 'landlord', icon: ShieldCheck, group: 'mail', href: (h) => `/app/homes/${h}/verify-landlord?return=place` },
];

function FastVerifySheet({
  open,
  onClose,
  homeId,
  address,
  verifyOptions,
  documentInReview,
  onOpen,
  onOpenDocumentStatus,
}: {
  open: boolean;
  onClose: () => void;
  homeId: string;
  address: string;
  verifyOptions: VerifyOptions;
  documentInReview: boolean;
  onOpen: (href: string) => void;
  onOpenDocumentStatus: () => void;
}) {
  const option = (id: string) => verifyOptions.options.find((o) => o.id === id);
  // The document row is a fast check only when the server reads the photo at once (`fast`; older answers had no
  // hint and meant yes). A document a person reviews, or one already waiting on a reviewer, sits with mail.
  const documentOption = option('document');
  const documentFast = documentOption?.available === true && documentOption.fast !== false;
  // A residency document waiting on a reviewer keeps today's row (and its status page). Read from the person's own
  // claims: the server's IN_REVIEW reason also covers a reported card's hold, which is no document.
  const inReview = documentInReview && !documentFast;
  const groupOf = (row: (typeof WEB_ROWS)[number]) => (row.id === 'document' && !documentFast ? 'mail' : row.group);
  const rows = WEB_ROWS.filter((row) => (row.id === 'document' && inReview) || option(row.id)?.available === true);
  const fastest = rows.filter((row) => groupOf(row) === 'fastest');
  const byMail = rows.filter((row) => groupOf(row) === 'mail');

  const rowButton = (row: (typeof WEB_ROWS)[number], i: number) => {
    if (row.id === 'document' && inReview) {
      return (
        <button
          key={row.id}
          type="button"
          onClick={onOpenDocumentStatus}
          data-testid="place-verify-document-in-review"
          className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-app-hover ${
            i > 0 ? 'border-t border-app-border-subtle' : ''
          }`}
        >
          <IconTile icon={Hourglass} tone="muted" size={34} />
          <span className="flex-1 min-w-0">
            <span className="block text-[14.5px] font-semibold text-app-text -tracking-[0.01em]">Document under review</span>
            <span className="block text-[12.5px] text-app-text-secondary mt-0.5 leading-[17px]">
              A person is reviewing your document. You&apos;ll get a notification when it&apos;s decided.
            </span>
          </span>
          <ChevronRight size={18} strokeWidth={2.25} aria-hidden className="shrink-0 text-app-text-muted" />
        </button>
      );
    }
    // A document that isn't read at once is today's reviewed upload: today's words, no promise of speed.
    const words = row.id === 'document' && !documentFast
      ? { label: 'Upload a document', sub: 'A utility bill or lease. A person reviews it.' }
      : FAST_VERIFY_ROWS[row.id];
    return (
      <button
        key={row.id}
        type="button"
        onClick={() => onOpen(row.href(homeId))}
        data-testid={`place-verify-${row.id}`}
        className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-app-hover ${
          i > 0 ? 'border-t border-app-border-subtle' : ''
        }`}
      >
        <IconTile icon={row.icon} tone={groupOf(row) === 'fastest' ? 'sky' : 'muted'} size={34} />
        <span className="flex-1 min-w-0">
          <span className="block text-[14.5px] font-semibold text-app-text -tracking-[0.01em]">{words.label}</span>
          <span className="block text-[12.5px] text-app-text-secondary mt-0.5 leading-[17px]">{words.sub}</span>
        </span>
        <ChevronRight size={18} strokeWidth={2.25} aria-hidden className="shrink-0 text-app-text-muted" />
      </button>
    );
  };

  const footer = (
    <div className="text-center">
      <button
        type="button"
        onClick={onClose}
        className="w-full h-[48px] rounded-xl text-primary-600 dark:text-primary-300 font-semibold text-base hover:bg-app-hover transition-colors"
      >
        {FAST_VERIFY_WORDS.notNow}
      </button>
      <p className="mt-1 text-[12.5px] text-app-text-secondary">{FAST_VERIFY_WORDS.toolsEitherWay}</p>
    </div>
  );

  return (
    <BottomSheet open={open} onClose={onClose} footer={footer} labelledBy="fast-verify-title">
      <div className="flex items-center gap-3 mb-3">
        <IconTile icon={ShieldCheck} tone="home" size={38} />
        <div className="flex-1 min-w-0">
          <h2 id="fast-verify-title" className="text-lg font-bold text-app-text -tracking-[0.02em] leading-tight">
            {FAST_VERIFY_WORDS.sheetTitle}
          </h2>
          <p className="text-[13px] text-app-text-secondary mt-0.5 truncate">{address}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-[30px] h-[30px] shrink-0 rounded-full bg-app-surface-sunken text-app-text-secondary hover:bg-app-hover flex items-center justify-center transition-colors"
        >
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>
      {verifyOptions.level === 'added' ? (
        <span className="inline-flex items-center mb-2 rounded-full bg-app-home-bg text-app-home px-2.5 py-0.5 text-[12px] font-semibold">
          {FAST_VERIFY_WORDS.homeAdded}
        </span>
      ) : null}
      {/* "It takes under a minute" only while a fast check is on offer. */}
      {fastest.length ? (
        <p className="text-[14px] text-app-text-secondary leading-[20px] mb-5">{FAST_VERIFY_WORDS.sheetBody}</p>
      ) : null}

      {fastest.length ? (
        <div className="mb-4">
          <Overline>{FAST_VERIFY_WORDS.fastest}</Overline>
          <div className="bg-app-surface border border-app-border rounded-2xl shadow-sm overflow-hidden">
            {fastest.map(rowButton)}
          </div>
        </div>
      ) : null}
      {byMail.length ? (
        <div className="mb-2">
          <Overline>{FAST_VERIFY_WORDS.orByMail}</Overline>
          <div className="bg-app-surface border border-app-border rounded-2xl shadow-sm overflow-hidden">
            {byMail.map(rowButton)}
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}
