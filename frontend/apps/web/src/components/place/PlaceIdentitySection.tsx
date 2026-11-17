// ============================================================
// Place — IdentityGroup (T4 verified).
//
// The web mirror of the verified ProfileDashboard's Identity group in
// docs/design/place: the verified-resident status row + a residency
// letter row, routing to the Identity center.
//
// The verify nudge (T3) and the "Locked until you verify" Band-D cards
// live in the shared archetype (VerifyBanner) and presentation
// (renderVerifyLocked); this group is the T4 counterpart the contract
// doesn't carry yet (launch set is Band A). Tokens only.
//
// FASTVERIFY: a person verified by a fast check (phone, location or a
// bill) sees "Verified resident · by {kind} · {date}", messaging, and the
// line that residency letters and home Mail need a mailed code. With the
// flags off `fast` is null and the group is today's.
// ============================================================

'use client';

import { useRouter } from 'next/navigation';
import { BadgeCheck, FileText, Check, Lock, ArrowRight } from 'lucide-react';
import type { VerifyOptions } from '@pantopus/api';
import { Group, SectionCard } from '@/components/archetypes/place';
import Chip from '@/components/archetypes/primitives/Chip';
import { launchFeatures } from '@/lib/featureFlags';
import { FAST_VERIFY_WORDS, verifiedByFromOptions } from './fastVerify/fastVerifyWords';

export function IdentityGroup({ homeId, verifyOptions = null }: { homeId?: string; verifyOptions?: VerifyOptions | null } = {}) {
  const router = useRouter();
  // Launch cut #2 (Personas): the Identity Center is hidden; Place's own Identity section (badge, residency letters) stays.
  const goIdentity = () => router.push(launchFeatures.personas ? '/app/identity' : '/app/place/identity');
  const byLine = verifiedByFromOptions(verifyOptions);
  if (verifyOptions?.level === 'fast' && homeId) return <FastIdentityGroup homeId={homeId} byLine={byLine} />;
  return (
    <Group label="Identity">
      {verifyOptions?.level === 'proven' && byLine ? (
        // Proven by mail, a document, a landlord or a review: "Verified resident · by mail · {date}".
        <div
          role="button"
          tabIndex={0}
          onClick={goIdentity}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goIdentity(); } }}
          className="bg-app-surface border border-app-border rounded-2xl shadow-sm px-3.5 py-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 cursor-pointer hover:bg-app-hover"
        >
          <Chip label={FAST_VERIFY_WORDS.verifiedChip} variant="success" icon={BadgeCheck} />
          <span className="text-[13px] text-app-text-secondary">{byLine}</span>
        </div>
      ) : (
        <SectionCard
          icon={BadgeCheck}
          title="Identity"
          chip={{ label: 'Verified', variant: 'success', icon: Check }}
          inline
          onClick={goIdentity}
        />
      )}
      <SectionCard
        icon={FileText}
        title="Residency letter"
        action={{ label: 'Generate a residency letter', onClick: goIdentity }}
        onClick={goIdentity}
      />
    </Group>
  );
}

function FastIdentityGroup({ homeId, byLine }: { homeId: string; byLine: string | null }) {
  const router = useRouter();
  return (
    <Group label="Identity">
      <div className="bg-app-surface border border-app-border rounded-2xl shadow-sm p-4" data-testid="place.fastVerified">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <Chip label={FAST_VERIFY_WORDS.verifiedChip} variant="success" icon={BadgeCheck} />
          {byLine ? <span className="text-[13px] text-app-text-secondary">{byLine}</span> : null}
        </div>
        <button
          type="button"
          onClick={() => router.push('/app/place/neighbor-message')}
          className="mt-3 inline-flex items-center gap-1 text-[15px] font-semibold text-app-text hover:text-primary-600 dark:hover:text-primary-300"
        >
          {FAST_VERIFY_WORDS.messageHomes}
          <ArrowRight size={15} strokeWidth={2.25} aria-hidden />
        </button>
        <div className="mt-3 pt-3 border-t border-app-border-subtle flex items-start gap-2">
          <Lock size={15} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-app-text-muted" />
          <p className="text-[13px] leading-[19px] text-app-text-secondary">
            {FAST_VERIFY_WORDS.needsMailLine}{' '}
            <button
              type="button"
              onClick={() => router.push(`/app/homes/${homeId}/verify-postcard?return=place`)}
              className="font-semibold text-primary-600 dark:text-primary-300 underline-offset-2 hover:underline"
            >
              {FAST_VERIFY_WORDS.mailMeACode}
            </button>
          </p>
        </div>
      </div>
    </Group>
  );
}
