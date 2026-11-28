'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useHomePermissions } from './useHomePermissions';
import * as api from '@pantopus/api';
import LandlordVerificationFlow from './LandlordVerificationFlow';
import { removalLink } from './member-removals/removalModel';
import { useResidencyProgress } from '@/components/homes/useResidencyProgress';
import { residencyNextStep } from '@/components/homes/residencyGuidance';

interface VerificationCenterProps {
  homeId: string;
  onRefresh?: () => Promise<void>;
}

export default function VerificationCenter({ homeId, onRefresh }: VerificationCenterProps) {
  const router = useRouter();
  const { access, reload: reloadPermissions } = useHomePermissions();
  const reload = onRefresh ?? reloadPermissions;

  // ── Landlord check ──────────────────────────────────────
  const [landlordCheck, setLandlordCheck] = useState<{
    checked: boolean;
    hasLandlord: boolean;
    hasLease: boolean;
    mailAvailable: boolean;
    failed: boolean;
  }>({ checked: false, hasLandlord: false, hasLease: false, mailAvailable: false, failed: false });

  const handleMoveOut = useCallback(() => {
    router.push(removalLink(homeId, 'self'));
  }, [homeId, router]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const res = await api.tenant.getTenantHomeStatus(homeId);
        if (canceled) return;
        setLandlordCheck({
          checked: true,
          hasLandlord: res.landlord.has_landlord,
          hasLease: res.lease.state !== 'none',
          mailAvailable: res.home_id === homeId && res.mail_available === true,
          failed: false,
        });
      } catch {
        // The existing landlord error/retry view owns unavailable status; a
        // failed read does not establish that no landlord or lease exists.
        if (!canceled) {
          setLandlordCheck({ checked: true, hasLandlord: false, hasLease: false, mailAvailable: false, failed: true });
        }
      }
    })();
    return () => { canceled = true; };
  }, [homeId]);

  // Show landlord flow when a landlord authority exists or tenant has a lease relationship
  if (landlordCheck.checked && (landlordCheck.failed || landlordCheck.hasLandlord || landlordCheck.hasLease)) {
    return (
      <LandlordVerificationFlow
        homeId={homeId}
        onApproved={reload}
        onBack={() => router.push('/app')}
      />
    );
  }

  const status = access?.verification_status || 'unverified';
  const effectiveStatus = access?.ownership_claim_state === 'needs_more_info' ? 'claim_needs_more_info' : status;
  const isResidency = access?.verification_kind === 'residency';
  if (isResidency) {
    return <ResidencyPanel homeId={homeId} onReload={reload} onMoveOut={handleMoveOut} />;
  }
  const config = getStatusConfig(effectiveStatus, access);

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      {/* Status icon */}
      <div className="flex justify-center mb-6">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl ${config.iconBg}`}>
          {config.icon}
        </div>
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-app-text text-center mb-3">
        {config.title}
      </h2>

      {/* Body */}
      <p className="text-app-text-secondary text-center text-[15px] leading-relaxed mb-8 max-w-sm mx-auto">
        {config.body}
      </p>

      {/* Postcard countdown */}
      {status === 'pending_postcard' && access?.postcard_expires_at && (
        <div className="flex items-center gap-3 bg-app-surface border border-app-border rounded-xl p-4 mb-5">
          <span className="text-xl">&#128340;</span>
          <div>
            <p className="text-sm text-app-text-secondary">Code expires</p>
            <p className="text-sm font-semibold text-app-text">
              {new Date(access.postcard_expires_at).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </p>
          </div>
        </div>
      )}

      {/* Challenge window countdown */}
      {status === 'provisional' && access?.is_in_challenge_window && access?.challenge_window_ends_at && (
        <div className="flex items-center gap-3 bg-app-surface border border-app-border rounded-xl p-4 mb-5">
          <span className="text-xl">&#9203;</span>
          <div>
            <p className="text-sm text-app-text-secondary">Full access unlocks</p>
            <p className="text-sm font-semibold text-app-text">
              {new Date(access.challenge_window_ends_at).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </p>
          </div>
        </div>
      )}

      {/* Provisional bootstrap — feature list */}
      {status === 'provisional_bootstrap' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <p className="text-sm font-medium text-amber-800 mb-2">Available with limited access:</p>
          <ul className="text-sm text-amber-700 space-y-1">
            <li className="flex items-center gap-2"><span>&#10003;</span> View and create tasks</li>
            <li className="flex items-center gap-2"><span>&#10003;</span> View calendar</li>
          </ul>
          <p className="text-xs text-amber-600 mt-3">Verify your address to unlock all features.</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        {/* Enter postcard code */}
        {status === 'pending_postcard' && (
          <>
            <ActionButton
              label="Enter verification code"
              description="Enter the code from your postcard"
              icon="&#128273;"
              onClick={() => router.push(`/app/homes/${homeId}/verify-postcard`)}
            />
          </>
        )}

        {/* Upload documents while verification is open. */}
        {(status === 'provisional_bootstrap' || status === 'pending_doc' || status === 'provisional' || effectiveStatus === 'claim_needs_more_info') && (
          <ActionButton
            label="Upload proof"
            description="Submit a document for review"
            icon="&#128228;"
            onClick={() => router.push(`/app/homes/${homeId}/claim-owner/evidence`)}
          />
        )}

        {/* Request mailed code */}
        {landlordCheck.mailAvailable && status === 'provisional_bootstrap' && (
          <ActionButton
            label="Mail me a code"
            description="Receive a verification code at this address"
            icon="&#128235;"
            onClick={() => router.push(`/app/homes/${homeId}/verify-postcard`)}
          />
        )}

        {/* Additional eligible mail methods. */}
        {landlordCheck.mailAvailable && (status === 'provisional' || status === 'pending_doc' || effectiveStatus === 'claim_needs_more_info') && (
          <ActionButton
            label="Verify with mailed code"
            description="Receive a code at this address"
            icon="&#128235;"
            onClick={() => router.push(`/app/homes/${homeId}/verify-postcard`)}
          />
        )}
      </div>

      <AlwaysVisibleActions homeId={homeId} onMoveOut={handleMoveOut} onReload={reload} />
    </div>
  );
}

// ============================================================
// Someone who isn't this Home's owner and can't open it yet
// ============================================================

/**
 * The server knows why: they asked to join a household, their address still needs proof, or they added the Home
 * themselves and ownership has its own review (GET /api/homes/:id/my-residency). The panel says that, in the
 * Residency status page's words and with its links. It used to tell every one of them that a household reviewer
 * must confirm their request, which is not so for a Home nobody else lives in. That sentence stays only while the
 * answer is loading or can't be read.
 */
function ResidencyPanel({ homeId, onReload, onMoveOut }: { homeId: string; onReload: () => void | Promise<void>; onMoveOut: () => void }) {
  const router = useRouter();
  const { progress } = useResidencyProgress(homeId);
  const next = progress ? residencyNextStep(progress, homeId) : null;
  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl bg-blue-100">{'\u23F3'}</div>
      </div>
      <h2 className="text-2xl font-bold text-app-text text-center mb-3">
        {next ? next.title : 'Your residency request is under review'}
      </h2>
      <p className="text-app-text-secondary text-center text-[15px] leading-relaxed mb-8 max-w-sm mx-auto">
        {next ? next.body : 'A household reviewer must confirm your request before you can open this home. Check for updates below.'}
      </p>
      {next && next.actions.length > 0 && <div className="space-y-3">
        {next.actions.map(action => (
          <ActionButton key={action.label} label={action.label} description="" icon="&#8594;"
            onClick={() => (action.href === `/app/homes/${homeId}/dashboard` ? void onReload() : router.push(action.href))} />
        ))}
      </div>}
      <AlwaysVisibleActions homeId={homeId} onMoveOut={onMoveOut} onReload={onReload} />
    </div>
  );
}

function AlwaysVisibleActions({ homeId, onMoveOut, onReload }: { homeId: string; onMoveOut: () => void; onReload: () => void | Promise<void> }) {
  const router = useRouter();
  const handleMoveOut = onMoveOut;
  const reload = onReload;
  return (
    <>
      {/* Always-visible actions */}
      <div className="mt-8 space-y-2">
        <button
          onClick={handleMoveOut}
          className="w-full flex items-center justify-center gap-2 py-3 text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
        >
          <span>&#128682;</span>
          This isn&apos;t my home / I made a mistake
        </button>

        <button
          onClick={() => router.push(`/app/homes/${homeId}/messages`)}
          className="w-full flex items-center justify-center gap-2 py-3 text-app-text-secondary hover:text-app-text text-sm font-medium"
        >
          <span>&#128172;</span>
          Message household admin
        </button>

        <button
          onClick={() => window.open('mailto:help@pantopus.com?subject=Verification%20Help', '_blank')}
          className="w-full flex items-center justify-center gap-2 py-2 text-app-text-muted hover:text-app-text-secondary text-xs"
        >
          Request help
        </button>
      </div>

      {/* Refresh hint */}
      <p className="text-center text-xs text-app-text-muted mt-8">
        <button onClick={reload} className="underline hover:text-app-text-secondary">
          Check for updates
        </button>
      </p>
    </>
  );
}

// ============================================================
// Action button
// ============================================================

function ActionButton({
  label,
  description,
  icon,
  onClick,
  loading = false,
}: {
  label: string;
  description: string;
  icon: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center gap-3 bg-app-surface border border-app-border rounded-xl p-4 text-left hover:border-app-border hover:shadow-sm transition-all disabled:opacity-50"
    >
      <span className="text-xl flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-app-text">{label}</p>
        {description && <p className="text-xs text-app-text-secondary mt-0.5">{description}</p>}
      </div>
      {loading ? (
        <span className="animate-spin inline-block w-4 h-4 border-2 border-app-border border-t-gray-600 rounded-full flex-shrink-0" />
      ) : (
        <span className="text-app-text-muted flex-shrink-0">&#8250;</span>
      )}
    </button>
  );
}

// ============================================================
// Status configuration
// ============================================================

interface StatusConfig {
  icon: string;
  iconBg: string;
  title: string;
  body: string;
}

function getStatusConfig(
  status: string,
  access: { is_in_challenge_window?: boolean } | null,
): StatusConfig {
  switch (status) {
    case 'claim_needs_more_info':
      return {
        icon: '\uD83D\uDCC4',
        iconBg: 'bg-amber-100 dark:bg-amber-900/30',
        title: 'More information needed',
        body: 'Our team needs additional documentation. Please upload proof or use the options below.',
      };
    case 'pending_postcard':
      return {
        icon: '\u2709\uFE0F',
        iconBg: 'bg-blue-100',
        title: 'Check your mailbox',
        body: 'A verification code is being mailed to your address. Expected arrival: 3-7 business days.',
      };
    case 'provisional_bootstrap':
      return {
        icon: '\uD83D\uDEE1\uFE0F',
        iconBg: 'bg-amber-100',
        title: 'You have limited access',
        body: 'Verify your address to unlock all home management features.',
      };
    case 'pending_approval':
      return {
        icon: '\u23F3',
        iconBg: 'bg-blue-100',
        title: 'Waiting for approval',
        body: 'A household member needs to approve your request. This page will update automatically.',
      };
    case 'pending_doc':
      return {
        icon: '\uD83D\uDCC4',
        iconBg: 'bg-amber-100',
        // This state outlasts the claim: it also shows after a claim was declined, withdrawn or closed for having no
        // document, when nothing is under review. So the words hold either way.
        title: 'Verify with a document',
        // No review time is promised while document review is undecided (founder, 2026-10-06).
        body: 'A Pantopus reviewer checks the document you upload, and you get a notification when it\'s decided. If you haven\'t uploaded one yet, add it below.',
      };
    case 'provisional':
      if (access?.is_in_challenge_window) {
        return {
          icon: '\u23F1\uFE0F',
          iconBg: 'bg-blue-100',
          title: 'Your access is being confirmed',
          body: 'Existing members have a window to review your access. Full features unlock when the window closes.',
        };
      }
      return {
        icon: '\uD83D\uDEE1\uFE0F',
        iconBg: 'bg-amber-100',
        title: 'Provisional access',
        body: 'Verify your address to unlock full home management features.',
      };
    case 'suspended_challenged':
      return {
        icon: '\u26A0\uFE0F',
        iconBg: 'bg-red-100',
        title: 'Access suspended',
        body: 'Your access has been challenged by a household member. Contact support if you believe this is an error.',
      };
    default:
      return {
        icon: '\uD83D\uDD12',
        iconBg: 'bg-app-surface-sunken',
        title: 'Verification required',
        body: 'Complete verification to access this home.',
      };
  }
}
