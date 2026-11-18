'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '@pantopus/api';
import { launchFeatures } from '@/lib/featureFlags';
import { getAuthToken } from '@pantopus/api';
import { buildSupportTrainShareUrl } from '@pantopus/utils';
import ErrorState from '@/components/ui/ErrorState';
import ModalShell from '@/components/ui/ModalShell';
import { confirmStore } from '@/components/ui/confirm-store';
import { toast } from '@/components/ui/toast-store';
import { CONTRIBUTION_LABELS, trainStatusLabel } from '@/components/support-trains/contributionLabels';
import { forgetSupportTrain, refreshSupportTrains } from '@/components/support-trains/supportTrainQueries';
import ManageDates, { apiMessage } from '@/components/support-trains/ManageDates';
import ManagePeople from '@/components/support-trains/ManagePeople';
import WhereSection, {
  homesFromApi,
  toSupportTrainDeliveryLocation,
  type HomeInfo,
  type LocationOption,
  type ResolvedLocation,
} from '@/components/support-trains/WhereSection';
import { formatTrainTime, isSlotPast, trainTodayKey } from '@/components/support-trains/trainTime';
import {
  ArrowLeft,
  Copy,
  Link,
  Users,
  Heart,
  ArrowUpDown,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Megaphone,
  Send,
  Pencil,
  Bell,
  Utensils,
} from 'lucide-react';

// ============================================================
// SUPPORT TRAIN MANAGE PAGE (Web)
// Everything an organizer does with a train: publish, pause, close, edit, dates, signups, people, updates.
// ============================================================

const AUDIENCES = [
  { key: 'direct_share_only', label: 'Anyone with the link', desc: 'Not listed anywhere. Share the link with people you trust.' },
  { key: 'private_link', label: 'People near you', desc: 'Listed for people within about 25 mi, who can sign up.' },
  { key: 'invited_only', label: 'My connections', desc: 'Only your connections and people you invite can open it.' },
] as const;

const LIVE = new Set(['published', 'active']);

export default function ManageSupportTrainPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [data, setData] = useState<any>(null);
  const [reservations, setReservations] = useState<any[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [reservationsError, setReservationsError] = useState<string | null>(null);
  const [invites, setInvites] = useState<any[]>([]);
  const [organizers, setOrganizers] = useState<any[]>([]);
  const [homes, setHomes] = useState<HomeInfo[]>([]);
  const [fund, setFund] = useState<any>(null);
  const [contributions, setContributions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The action in flight (a lifecycle step or a signup id), so one runs at a time.
  const [busy, setBusy] = useState<string | null>(null);

  // Share link
  const [copied, setCopied] = useState(false);
  // Send an update, as from the apps' Manage screen
  const [updateBody, setUpdateBody] = useState('');
  const [pushToPhones, setPushToPhones] = useState(true);
  const [sendingUpdate, setSendingUpdate] = useState(false);
  // Open-date reminder to the train's chat
  const [nudge, setNudge] = useState('');
  const [nudgeBusy, setNudgeBusy] = useState<'draft' | 'send' | null>(null);
  // Edit the train
  const [editOpen, setEditOpen] = useState(false);
  const [recipientOpen, setRecipientOpen] = useState(false);
  // Remove a signup, with a reason
  const [removing, setRemoving] = useState<any>(null);
  const [removeReason, setRemoveReason] = useState('');

  // Sort
  // By the slot each helper took (soonest first), not when they signed up.
  const [sortField, setSortField] = useState<'slot_date' | 'status'>('slot_date');
  const [sortAsc, setSortAsc] = useState(true);

  const fetchReservations = useCallback(async () => {
    setReservationsLoading(true);
    setReservationsError(null);
    try {
      const result = await api.supportTrains.listReservations(id);
      setReservations(result.reservations || []);
    } catch {
      setReservationsError('Signups could not be loaded. Please try again.');
    } finally {
      setReservationsLoading(false);
    }
  }, [id]);

  const fetchAll = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    if (!getAuthToken()) {
      router.push('/login');
      return;
    }
    try {
      const [trainData, , invData, orgData, fundData, contribData] = await Promise.all([
        api.supportTrains.getSupportTrain(id),
        fetchReservations(),
        api.supportTrains.listInvites(id).catch(() => ({ invites: [] })),
        api.supportTrains.listOrganizers(id).catch(() => ({ organizers: [] })),
        launchFeatures.giftFunds ? api.supportTrains.getFund(id).catch(() => null) : null,
        launchFeatures.giftFunds
          ? api.supportTrains.listContributions(id, { limit: 50 }).catch(() => ({ contributions: [] }))
          : { contributions: [] },
      ]);
      setData(trainData);
      setInvites(invData.invites || []);
      setOrganizers(orgData.organizers || []);
      setFund(fundData);
      setContributions(contribData.contributions || []);

      if (trainData && (trainData as any).viewer_level !== 'organizer') {
        router.replace(`/app/support-trains/${id}`);
      }
    } catch (err: any) {
      setError(err?.statusCode === 404
        ? 'Support Train not found.'
        : 'This Support Train could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id, router, fetchReservations]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!getAuthToken()) return;
    api.homes.getMyHomes().then((res) => setHomes(homesFromApi(res))).catch(() => {});
  }, []);

  // After a change: this page reads again, and the train's other pages refresh on their next visit.
  const afterChange = useCallback(async () => {
    await fetchAll(true);
    void refreshSupportTrains(queryClient);
  }, [fetchAll, queryClient]);

  const handleCopyLink = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(buildSupportTrainShareUrl(id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Couldn’t copy the link. Select it and copy it instead.');
    }
  }, [id]);

  const handleSendUpdate = useCallback(async () => {
    const body = updateBody.trim();
    if (!body || sendingUpdate) return;
    setSendingUpdate(true);
    try {
      await api.supportTrains.postUpdate(id, { body, push_to_phones: pushToPhones });
      setUpdateBody('');
      toast.success('Update sent');
      void refreshSupportTrains(queryClient);
    } catch (err: unknown) {
      toast.error(apiMessage(err, 'Could not send the update. Try again.'));
    } finally {
      setSendingUpdate(false);
    }
  }, [id, updateBody, pushToPhones, sendingUpdate, queryClient]);

  // One lifecycle step, asked first when it can't be undone easily.
  const runStep = useCallback(async (
    key: string,
    run: () => Promise<unknown>,
    done: string,
    confirm?: { title: string; description: string; confirmLabel: string; destructive?: boolean },
  ) => {
    if (busy) return;
    if (confirm) {
      const ok = await confirmStore.open({ ...confirm, variant: confirm.destructive ? 'destructive' : 'primary' });
      if (!ok) return;
    }
    setBusy(key);
    try {
      await run();
      toast.success(done);
      await afterChange();
    } catch (err) {
      toast.error(apiMessage(err, 'That didn’t work. Please try again.'));
      await fetchAll(true);
    } finally {
      setBusy(null);
    }
  }, [busy, afterChange, fetchAll]);

  const handleDeleteSupportTrain = useCallback(async () => {
    if (busy) return;
    const confirmed = await confirmStore.open({
      title: 'Delete this Support Train?',
      description: launchFeatures.giftFunds
        ? 'This removes its schedule, updates and invitations for good. Trains with helpers or gifts can’t be deleted.'
        : 'This removes its schedule, updates and invitations for good. Trains with helpers can’t be deleted.',
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setBusy('delete');
    try {
      await api.supportTrains.deleteSupportTrain(id);
      void forgetSupportTrain(queryClient, id);
      router.replace('/app/support-trains');
    } catch (err) {
      toast.error(apiMessage(err, 'Couldn’t delete this Support Train.'));
      setBusy(null);
    }
  }, [busy, id, router, queryClient]);

  const shareAddress = (r: any) => runStep(
    `share:${r.id}`,
    () => api.supportTrains.revealReservationAddress(id, r.id),
    r.user ? `Address shared with ${r.user.name || 'them'}` : `Address emailed to ${r.guest_name || 'the helper'}`,
    {
      title: 'Share the exact address?',
      description: r.user
        ? 'They see the address and delivery instructions on the train.'
        : 'We email the address and delivery instructions to the address they signed up with.',
      confirmLabel: 'Share address',
    },
  );

  const confirmDelivery = (r: any) => runStep(
    `confirm:${r.id}`,
    async () => {
      if (r.status === 'reserved') await api.supportTrains.markDelivered(id, r.id);
      await api.supportTrains.confirmDelivered(id, r.id);
    },
    'Delivery confirmed',
  );

  const submitRemove = async () => {
    if (!removing || busy) return;
    const r = removing;
    setBusy(`remove:${r.id}`);
    try {
      await api.supportTrains.cancelReservation(id, r.id, { organizer_reason: removeReason.trim() || null } as any);
      toast.success('Signup removed. The date is open again.');
      setRemoving(null);
      setRemoveReason('');
      await afterChange();
    } catch (err) {
      toast.error(apiMessage(err, 'Couldn’t remove this signup.'));
    } finally {
      setBusy(null);
    }
  };

  const draftNudge = async () => {
    setNudgeBusy('draft');
    try {
      const res = await api.supportTrains.draftOpenSlotsNudge(id);
      setNudge(res.message || '');
    } catch (err) {
      toast.error(apiMessage(err, 'Couldn’t write a reminder right now. Write your own below.'));
    } finally {
      setNudgeBusy(null);
    }
  };
  const sendNudge = async () => {
    const message = nudge.trim();
    if (!message) return;
    setNudgeBusy('send');
    try {
      await api.supportTrains.sendNudge(id, { message });
      setNudge('');
      toast.success('Reminder posted in the train’s chat');
    } catch (err) {
      toast.error(apiMessage(err, 'Couldn’t send the reminder.'));
    } finally {
      setNudgeBusy(null);
    }
  };

  const sortedReservations = useMemo(() => [...reservations]
    .filter((r) => r.status !== 'canceled')
    .sort((a, b) => {
      const va = a[sortField] || '';
      const vb = b[sortField] || '';
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    }), [reservations, sortField, sortAsc]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 flex justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <button
          onClick={() => router.push(`/app/support-trains/${id}`)}
          className="text-sm text-app-text-secondary hover:text-app-text mb-6 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to the train
        </button>
        <ErrorState
          title="Couldn't load Support Train"
          message={error || 'This Support Train could not be loaded. Please try again.'}
          onRetry={() => fetchAll()}
        />
      </div>
    );
  }

  const status: string = data.status;
  const isPrimary = data.viewer_support_train_role === 'primary';
  const ended = status === 'completed' || status === 'archived';
  const today = trainTodayKey(data);
  const slots: any[] = data.slots || [];
  const activeReservations = reservations.filter((r) => ['reserved', 'delivered', 'confirmed'].includes(String(r?.status || '')));
  const signedSlotIds = new Set<string>(activeReservations.map((r) => r.slot_id));
  const openAhead = slots.filter((s) => s.status === 'open' && !signedSlotIds.has(s.id) && !isSlotPast(s, today)).length;
  const goalAmount = fund?.goal_amount;
  const totalRaised = fund?.total_amount || 0;
  const goalPct = goalAmount ? Math.min(100, Math.round((totalRaised / goalAmount) * 100)) : null;
  const deleteDisabledReason = reservationsLoading || reservationsError
    ? 'Delete is unavailable until signups can be checked.'
    : activeReservations.length > 0
    ? 'Delete is unavailable because people have signed up. Close the train instead.'
    : null;
  const audience = AUDIENCES.find((a) => a.key === data.sharing_mode);
  const hasAddress = Boolean(data.address?.address);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <button
        onClick={() => router.push(`/app/support-trains/${id}`)}
        className="text-sm text-app-text-secondary hover:text-app-text mb-6 flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to the train
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-app-text">Manage: {data.title}</h1>
          <p className="mt-1 text-sm text-app-text-secondary">
            <span className="font-medium text-app-text">{trainStatusLabel(status)}</span>
            {status === 'draft' && ' · Only you and co-organizers can see it.'}
            {status === 'paused' && ' · Not taking signups.'}
            {ended && ' · Ended.'}
          </p>
        </div>
        {/* What the train can do next (A3). */}
        <div className="flex flex-wrap gap-2">
          {status === 'draft' && (
            <StepButton busy={busy === 'publish'} primary onClick={() => runStep('publish', () => api.supportTrains.publishSupportTrain(id), 'Published')}>
              Publish
            </StepButton>
          )}
          {LIVE.has(status) && (
            <StepButton busy={busy === 'pause'} onClick={() => runStep('pause', () => api.supportTrains.pauseSupportTrain(id), 'Paused', {
              title: 'Pause signups?', description: 'People can still see the train, but no one can sign up until you resume it. Signed-up helpers keep their dates.', confirmLabel: 'Pause',
            })}>
              Pause signups
            </StepButton>
          )}
          {status === 'paused' && (
            <StepButton busy={busy === 'resume'} primary onClick={() => runStep('resume', () => api.supportTrains.resumeSupportTrain(id), 'Signups are open again')}>
              Resume signups
            </StepButton>
          )}
          {isPrimary && LIVE.has(status) && activeReservations.length === 0 && (
            <StepButton busy={busy === 'unpublish'} onClick={() => runStep('unpublish', () => api.supportTrains.unpublishSupportTrain(id), 'Back to a draft', {
              title: 'Unpublish this train?', description: 'It goes back to a draft that only you and co-organizers can see. The link stops working until you publish again.', confirmLabel: 'Unpublish',
            })}>
              Unpublish
            </StepButton>
          )}
          {isPrimary && (LIVE.has(status) || status === 'paused') && (
            <StepButton busy={busy === 'close'} danger onClick={() => runStep('close', () => api.supportTrains.completeSupportTrain(id), 'The train is closed', {
              title: 'Close this train?', description: 'Signups stop for good. Helpers with dates still ahead are told they are no longer needed, and everyone gets a thank-you.', confirmLabel: 'Close train', destructive: true,
            })}>
              Close train
            </StepButton>
          )}
          {isPrimary && status === 'completed' && (
            <StepButton busy={busy === 'archive'} onClick={() => runStep('archive', () => api.supportTrains.archiveSupportTrain(id), 'Archived', {
              title: 'Archive this train?', description: 'It moves out of your active trains. Its history stays.', confirmLabel: 'Archive',
            })}>
              Archive
            </StepButton>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── Share & audience ── */}
        <section className="bg-app-surface border border-app-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-app-text mb-4 flex items-center gap-2">
            <Link className="w-5 h-5 text-app-text-muted" />
            Share
          </h2>
          <div className="flex gap-2 mb-3">
            <input
              readOnly
              aria-label="Share link"
              value={buildSupportTrainShareUrl(id)}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 p-2.5 bg-app-surface-sunken border border-app-border rounded-lg text-sm text-app-text truncate"
            />
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 flex items-center gap-1.5"
            >
              {copied ? <><CheckCircle2 className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy</>}
            </button>
          </div>
          <p className="text-sm text-app-text">
            Who can open it: <span className="font-medium">{audience?.label || 'Not set'}</span>
          </p>
          <p className="text-xs text-app-text-muted mt-0.5">{audience?.desc}</p>
          {data.sharing_mode === 'invited_only' && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              People who aren’t your connections can’t open this link, and nobody signed out can. Invite them below, or
              change who can open it.
            </p>
          )}
          {status === 'draft' && (
            <p className="mt-2 text-xs text-app-text-muted">The link works once you publish.</p>
          )}
        </section>

        {/* ── The train itself ── */}
        <section className="bg-app-surface border border-app-border rounded-xl p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-app-text flex items-center gap-2">
              <Pencil className="w-5 h-5 text-app-text-muted" />
              The train
            </h2>
            {!ended && (
              <button onClick={() => setEditOpen(true)} className="px-3 py-1.5 border border-app-border text-sm rounded-lg text-app-text hover:bg-app-surface-sunken">
                Edit
              </button>
            )}
          </div>
          <dl className="space-y-2 text-sm">
            <Row label="Ways to help">
              {[data.support_modes?.home_cooked_meals && 'Home-cooked meals', data.support_modes?.takeout && 'Takeout', data.support_modes?.groceries && 'Groceries']
                .filter(Boolean).join(', ') || 'None yet'}
            </Row>
            <Row label="Delivery address">
              {hasAddress
                ? [data.address.address, data.address.city, data.address.state].filter(Boolean).join(', ')
                : <span className="text-amber-700 dark:text-amber-300">Not set. Helpers can’t get the address until you add one.</span>}
            </Row>
          </dl>
          {!ended && (
            <button onClick={() => setRecipientOpen(true)} className="mt-4 text-sm font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1.5">
              <Utensils className="w-4 h-4" /> Details for helpers (allergies, household, drop-off)
            </button>
          )}
        </section>

        <ManageDates
          trainId={id}
          slots={slots}
          today={today}
          signedSlotIds={signedSlotIds}
          editable={!ended}
          onChanged={afterChange}
        />

        <ManagePeople
          trainId={id}
          isPrimary={isPrimary}
          editable={!ended}
          organizers={organizers}
          invites={invites}
          primaryUserId={(data.organizers || []).find((o: any) => o.role === 'primary')?.user?.id || null}
          recipientUserId={null}
          onChanged={afterChange}
        />

        {/* ── Send an update ── (as the apps' Manage screen) */}
        {!ended && (
          <section className="bg-app-surface border border-app-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-app-text mb-4 flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-app-text-muted" />
              Send an update
            </h2>
            <label htmlFor="train-update-body" className="block text-sm font-medium text-app-text mb-1.5">
              Message
            </label>
            <textarea
              id="train-update-body"
              value={updateBody}
              onChange={(e) => setUpdateBody(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="How is the recipient doing? Anything helpers should know?"
              className="w-full p-2.5 bg-app-surface-sunken border border-app-border rounded-lg text-sm text-app-text placeholder:text-app-text-muted"
            />
            <div className="flex justify-between gap-3 text-xs text-app-text-muted mt-1">
              <span>Shows on the train&apos;s Updates tab to the people on it. Helpers and organizers with an account get a notification.</span>
              <span className="shrink-0">{updateBody.length} / 500</span>
            </div>
            <label className="flex items-center gap-2 mt-3 text-sm text-app-text">
              <input
                type="checkbox"
                checked={pushToPhones}
                onChange={(e) => setPushToPhones(e.target.checked)}
                className="rounded border-app-border"
              />
              Push to phones
              <span className="text-app-text-muted">(otherwise it lands in their inbox only)</span>
            </label>
            <button
              onClick={handleSendUpdate}
              disabled={!updateBody.trim() || sendingUpdate}
              className="mt-4 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {sendingUpdate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sendingUpdate ? 'Sending…' : 'Send update'}
            </button>
          </section>
        )}

        {/* ── Open-date reminder ── */}
        {LIVE.has(status) && data.chat_thread_id && (
          <section className="bg-app-surface border border-app-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-app-text mb-1 flex items-center gap-2">
              <Bell className="w-5 h-5 text-app-text-muted" />
              Remind people about open dates
            </h2>
            <p className="text-sm text-app-text-secondary mb-3">
              {openAhead === 0
                ? 'Every date ahead has someone signed up.'
                : `${openAhead} ${openAhead === 1 ? 'date ahead is' : 'dates ahead are'} still open. A reminder goes to the train’s chat.`}
            </p>
            {openAhead > 0 && (
              <>
                <textarea
                  value={nudge}
                  onChange={(e) => setNudge(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  aria-label="Reminder message"
                  placeholder="A few dinners next week are still open. Can anyone take one?"
                  className="w-full p-2.5 bg-app-surface-sunken border border-app-border rounded-lg text-sm text-app-text placeholder:text-app-text-muted"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={draftNudge} disabled={nudgeBusy !== null} className="px-3 py-2 border border-app-border text-sm rounded-lg text-app-text hover:bg-app-surface-sunken disabled:opacity-60">
                    {nudgeBusy === 'draft' ? 'Writing…' : 'Write one for me'}
                  </button>
                  <button onClick={sendNudge} disabled={!nudge.trim() || nudgeBusy !== null} className="px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-60">
                    {nudgeBusy === 'send' ? 'Sending…' : 'Send reminder'}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {/* ── Donation Summary ── (launch cut #9: shown only once gift funds are on) */}
        {launchFeatures.giftFunds && (
        <section className="bg-app-surface border border-app-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-app-text mb-4 flex items-center gap-2">
            <Heart className="w-5 h-5 text-app-text-muted" />
            Gift Fund
          </h2>

          {!fund?.enabled ? (
            <p className="text-sm text-app-text-muted italic">
              Gift funds are not enabled for this train.
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-3xl font-bold text-app-text">
                  ${(totalRaised / 100).toFixed(2)}
                </span>
                {goalAmount && (
                  <span className="text-sm text-app-text-secondary">
                    of ${(goalAmount / 100).toFixed(2)} goal
                  </span>
                )}
              </div>

              {goalPct !== null && (
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mb-4">
                  <div
                    className="bg-primary-600 h-2.5 rounded-full transition-all"
                    style={{ width: `${goalPct}%` }}
                  />
                </div>
              )}

              <p className="text-xs font-semibold text-app-text-muted uppercase tracking-wider mb-2">
                Contributions ({contributions.length})
              </p>
              {contributions.length === 0 ? (
                <p className="text-sm text-app-text-muted italic">No contributions yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {contributions.map((c: any) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between py-2 px-2 rounded-lg bg-app-surface-sunken"
                    >
                      <div>
                        <span className="text-sm text-app-text">
                          {c.contributor?.name || 'Anonymous'}
                        </span>
                        {c.note && (
                          <p className="text-xs text-app-text-muted mt-0.5 truncate max-w-[200px]">
                            {c.note}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-app-text">
                        ${(c.amount / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
        )}
      </div>

      {/* ── Signups ── */}
      <section className="mt-8 bg-app-surface border border-app-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-app-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-app-text flex items-center gap-2">
            <Users className="w-5 h-5 text-app-text-muted" />
            Signups{!reservationsLoading && !reservationsError && ` (${sortedReservations.length})`}
          </h2>
        </div>

        {reservationsLoading ? (
          <div className="p-8 text-center text-app-text-muted">Loading signups…</div>
        ) : reservationsError ? (
          <ErrorState
            title="Couldn't load signups"
            message={reservationsError}
            onRetry={fetchReservations}
          />
        ) : sortedReservations.length === 0 ? (
          <div className="p-8 text-center text-app-text-muted">No one has signed up yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-app-surface-sunken text-app-text-muted text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Helper</th>
                  <th className="text-left px-4 py-3">Bringing</th>
                  <th
                    className="text-left px-4 py-3 cursor-pointer select-none"
                    onClick={() => toggleSort('slot_date')}
                  >
                    <span className="flex items-center gap-1">
                      Date <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="text-left px-4 py-3 cursor-pointer select-none"
                    onClick={() => toggleSort('status')}
                  >
                    <span className="flex items-center gap-1">
                      Status <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedReservations.map((r: any) => {
                  const arrives = formatTrainTime(r.estimated_arrival_at, data.timezone);
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-app-border align-top"
                    >
                      <td className="px-4 py-3 text-app-text font-medium">
                        {r.user?.name || r.guest_name || '—'}
                        {!r.user && r.guest_email && <div className="text-xs font-normal text-app-text-muted">{r.guest_email} · by email</div>}
                        {r.private_note_to_organizer && (
                          <div className="text-xs font-normal text-app-text-muted mt-0.5">Note to you: “{r.private_note_to_organizer}”</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-app-text-secondary">
                        {CONTRIBUTION_LABELS[r.contribution_mode] || r.contribution_mode}
                        {(r.dish_title || r.restaurant_name) && <div className="text-xs">{r.dish_title || r.restaurant_name}</div>}
                        {/* The helper's note to the recipient, which the organizer reads on their behalf. */}
                        {typeof r.note_to_recipient === 'string' && r.note_to_recipient.trim() && (
                          <div className="text-xs text-app-text-muted mt-0.5">“{r.note_to_recipient.trim()}”</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-app-text-muted text-xs">
                        {r.slot_date
                          ? new Date(r.slot_date + 'T00:00:00Z').toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              timeZone: 'UTC',
                            })
                          : '—'}
                        {arrives && <div>arrives {arrives}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClasses(r.status)}`}
                        >
                          {SIGNUP_STATUS[r.status] || r.status}
                        </span>
                        {r.status === 'reserved' && (
                          <div className="text-xs text-app-text-muted mt-1">
                            {r.exact_address_shared ? 'Has the address' : 'Address not shared yet'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {r.status === 'reserved' && !r.exact_address_shared && hasAddress && (
                            <RowButton busy={busy === `share:${r.id}`} onClick={() => shareAddress(r)}>Share address</RowButton>
                          )}
                          {(r.status === 'delivered' || (r.status === 'reserved' && !r.user && r.slot_date && r.slot_date <= today)) && (
                            <RowButton busy={busy === `confirm:${r.id}`} onClick={() => confirmDelivery(r)}>Confirm delivery</RowButton>
                          )}
                          {r.status === 'reserved' && (
                            <RowButton danger busy={busy === `remove:${r.id}`} onClick={() => { setRemoveReason(''); setRemoving(r); }}>Remove</RowButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isPrimary && (status === 'draft' || !ended) && (
        <section className="mt-8 border border-red-200 dark:border-red-900/60 rounded-xl bg-red-50/60 dark:bg-red-950/20">
          <div className="p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-100 dark:bg-red-950/60 p-2">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-300" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-red-700 dark:text-red-200">
                  Danger zone
                </h2>
                <p className="mt-1 text-sm text-red-700/90 dark:text-red-200/90">
                  Delete is for trains made by mistake. Once people sign up
                  {launchFeatures.giftFunds ? ' or gifts arrive' : ''}, the train can&apos;t be
                  deleted, so its history stays.
                </p>
              </div>
            </div>

            <button
              onClick={handleDeleteSupportTrain}
              disabled={busy === 'delete' || !!deleteDisabledReason}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-red-300 dark:border-red-800 px-4 py-2.5 text-sm font-medium text-red-700 dark:text-red-200 hover:bg-red-100/70 dark:hover:bg-red-950/40 disabled:opacity-50"
            >
              {busy === 'delete' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {busy === 'delete' ? 'Deleting…' : 'Delete Support Train'}
            </button>
            {deleteDisabledReason && (
              <p className="mt-3 text-sm text-red-700/90 dark:text-red-200/90">{deleteDisabledReason}</p>
            )}
          </div>
        </section>
      )}

      <EditTrainModal
        open={editOpen}
        train={data}
        homes={homes}
        onClose={() => setEditOpen(false)}
        onSaved={afterChange}
      />
      <RecipientDetailsModal
        open={recipientOpen}
        trainId={id}
        train={data}
        onClose={() => setRecipientOpen(false)}
        onSaved={afterChange}
      />
      <ModalShell
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onCancel={() => setRemoving(null)}
        cancelLabel="Keep"
        title={`Remove ${removing?.user?.name || removing?.guest_name || 'this helper'}?`}
        subtitle="The date opens again for someone else, and they are told."
        submitLabel="Remove signup"
        onSubmit={submitRemove}
        submitting={Boolean(removing && busy === `remove:${removing.id}`)}
      >
        <label className="block text-sm font-medium text-app-text">
          Reason (optional, they see it)
          <textarea
            value={removeReason}
            onChange={(e) => setRemoveReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full p-2.5 bg-app-surface-sunken border border-app-border rounded-lg text-sm text-app-text"
            placeholder="We have this date covered by family."
          />
        </label>
      </ModalShell>
    </div>
  );
}

const SIGNUP_STATUS: Record<string, string> = {
  reserved: 'Signed up',
  delivered: 'Delivered',
  confirmed: 'Confirmed',
  canceled: 'Cancelled',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-app-text-muted">{label}</dt>
      <dd className="flex-1 min-w-0 text-app-text">{children}</dd>
    </div>
  );
}

function StepButton({ children, onClick, busy, primary, danger }: {
  children: React.ReactNode; onClick: () => void; busy?: boolean; primary?: boolean; danger?: boolean;
}) {
  const tone = primary
    ? 'bg-primary-600 text-white hover:bg-primary-700 border-primary-600'
    : danger
      ? 'border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 hover:bg-red-50 dark:hover:bg-red-950/30'
      : 'border-app-border text-app-text hover:bg-app-surface-sunken';
  return (
    <button onClick={onClick} disabled={busy} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-60 ${tone}`}>
      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

function RowButton({ children, onClick, busy, danger }: { children: React.ReactNode; onClick: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`px-2.5 py-1 text-xs font-semibold rounded-lg border disabled:opacity-50 ${danger
        ? 'border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30'
        : 'border-app-border text-app-text hover:bg-app-surface-sunken'}`}
    >
      {busy ? '…' : children}
    </button>
  );
}

function EditTrainModal({ open, train, homes, onClose, onSaved }: {
  open: boolean; train: any; homes: HomeInfo[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [sharingMode, setSharingMode] = useState('direct_share_only');
  const [meals, setMeals] = useState(true);
  const [takeout, setTakeout] = useState(true);
  const [groceries, setGroceries] = useState(true);
  const [locationOption, setLocationOption] = useState<LocationOption>(null);
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !train) return;
    setTitle(train.title || '');
    setStory(train.story || '');
    setSharingMode(train.sharing_mode || 'direct_share_only');
    setMeals(Boolean(train.support_modes?.home_cooked_meals));
    setTakeout(Boolean(train.support_modes?.takeout));
    setGroceries(Boolean(train.support_modes?.groceries));
    setLocationOption(null);
    setLocation(null);
    setError(null);
  }, [open, train]);

  const save = async () => {
    if (saving) return;
    if (!title.trim()) { setError('Give the train a title.'); return; }
    if (!meals && !takeout && !groceries) { setError('Pick at least one way to help.'); return; }
    setSaving(true);
    setError(null);
    try {
      const delivery = location
        ? (location.mode === 'home' && location.homeId
          ? { mode: 'home' as const, home_id: location.homeId }
          : toSupportTrainDeliveryLocation(location))
        : undefined;
      await api.supportTrains.updateSupportTrain(train.id, {
        title: title.trim(),
        story: story.trim() || null,
        sharing_mode: sharingMode as any,
        enable_home_cooked_meals: meals,
        enable_takeout: takeout,
        enable_groceries: groceries,
        ...(delivery ? { delivery_location: delivery } : {}),
      });
      toast.success('Saved');
      onClose();
      await onSaved();
    } catch (err) {
      setError(apiMessage(err, 'Couldn’t save. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} onCancel={onClose} cancelLabel="Cancel" title="Edit the train" submitLabel="Save" onSubmit={save} submitting={saving} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <label className="block text-sm font-medium text-app-text">
          Title
          <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full p-2.5 bg-app-surface-sunken border border-app-border rounded-lg text-sm text-app-text" />
        </label>
        <label className="block text-sm font-medium text-app-text">
          Story
          <textarea value={story} maxLength={2000} rows={4} onChange={(e) => setStory(e.target.value)} className="mt-1 w-full p-2.5 bg-app-surface-sunken border border-app-border rounded-lg text-sm text-app-text" />
        </label>
        <fieldset>
          <legend className="text-sm font-medium text-app-text">Who can open it</legend>
          <div className="mt-1 space-y-2">
            {AUDIENCES.map((a) => (
              <button key={a.key} type="button" aria-pressed={sharingMode === a.key} onClick={() => setSharingMode(a.key)}
                className={`w-full text-left p-3 rounded-lg border ${sharingMode === a.key ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-app-border hover:border-primary-300'}`}>
                <p className={`text-sm font-medium ${sharingMode === a.key ? 'text-primary-700 dark:text-primary-300' : 'text-app-text'}`}>{a.label}</p>
                <p className="text-xs text-app-text-muted mt-0.5">{a.desc}</p>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium text-app-text">Ways to help</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {([['Home-cooked meals', meals, setMeals], ['Takeout', takeout, setTakeout], ['Groceries', groceries, setGroceries]] as const).map(([label, on, set]) => (
              <button key={label} type="button" aria-pressed={on} onClick={() => set(!on)}
                className={`px-3 py-1.5 rounded-full border text-sm ${on ? 'bg-primary-600 border-primary-600 text-white' : 'border-app-border text-app-text-secondary'}`}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <p className="text-sm font-medium text-app-text">Delivery address</p>
          <p className="text-xs text-app-text-muted mb-2">
            {train?.address?.address
              ? `Now: ${[train.address.address, train.address.city, train.address.state].filter(Boolean).join(', ')}. Pick another to change it. Helpers who already have the address are told it changed.`
              : 'Not set yet.'}
          </p>
          <WhereSection
            homes={homes}
            locationOption={locationOption}
            onLocationOptionChange={setLocationOption}
            resolvedLocation={location}
            onResolvedLocationChange={setLocation}
          />
        </div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      </div>
    </ModalShell>
  );
}

function RecipientDetailsModal({ open, trainId, train, onClose, onSaved }: {
  open: boolean; trainId: string; train: any; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [household, setHousehold] = useState('');
  const [allergies, setAllergies] = useState('');
  const [diet, setDiet] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [contactless, setContactless] = useState(false);
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !train) return;
    setHousehold(train.household_size ? String(train.household_size) : '');
    setAllergies((train.dietary_restrictions || []).map((x: string) => x.replace(/_/g, ' ')).join(', '));
    setDiet((train.dietary_preferences || []).map((x: string) => x.replace(/_/g, ' ')).join(', '));
    setFrom(String(train.preferred_dropoff_window?.start_time || '').slice(0, 5));
    setUntil(String(train.preferred_dropoff_window?.end_time || '').slice(0, 5));
    setContactless(Boolean(train.contactless_preferred));
    setDeliveryInstructions(train.delivery_instructions || '');
    setInstructions(train.special_instructions || '');
    setError(null);
  }, [open, train]);

  const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50);
  const save = async () => {
    if (saving) return;
    const size = household ? Number(household) : null;
    if (size !== null && (!Number.isInteger(size) || size < 1 || size > 50)) { setError('Household size is a number from 1 to 50.'); return; }
    if (from && until && until <= from) { setError('Pick a drop-off end after its start.'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.supportTrains.upsertRecipientProfile(trainId, {
        household_size: size,
        allergies: list(allergies),
        dietary_styles: list(diet),
        preferred_dropoff_start_time: from || null,
        preferred_dropoff_end_time: until || null,
        contactless_preferred: contactless,
        delivery_instructions: deliveryInstructions.trim() || null,
        special_instructions: instructions.trim() || null,
      } as any);
      toast.success('Saved');
      onClose();
      await onSaved();
    } catch (err) {
      setError(apiMessage(err, 'Couldn’t save. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const field = 'mt-1 w-full p-2.5 bg-app-surface-sunken border border-app-border rounded-lg text-sm text-app-text';
  return (
    <ModalShell open={open} onClose={onClose} onCancel={onClose} cancelLabel="Cancel" title="Details for helpers" subtitle="Allergies, household and drop-off show to anyone who can open the train; instructions only to people you share the address with." submitLabel="Save" onSubmit={save} submitting={saving}>
      <div className="space-y-3">
        <label className="block text-sm font-medium text-app-text">Household size
          <input type="number" min={1} max={50} value={household} onChange={(e) => setHousehold(e.target.value)} className={field} />
        </label>
        <label className="block text-sm font-medium text-app-text">Allergies (separate with commas)
          <input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="peanuts, shellfish" className={field} />
        </label>
        <label className="block text-sm font-medium text-app-text">Diet (separate with commas)
          <input value={diet} onChange={(e) => setDiet(e.target.value)} placeholder="vegetarian" className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-app-text">Drop-off from
            <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
          </label>
          <label className="block text-sm font-medium text-app-text">Until
            <input type="time" value={until} onChange={(e) => setUntil(e.target.value)} className={field} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-app-text">
          <input type="checkbox" checked={contactless} onChange={(e) => setContactless(e.target.checked)} className="rounded border-app-border" />
          Contactless drop-off
        </label>
        <label className="block text-sm font-medium text-app-text">Delivery instructions
          <textarea rows={2} maxLength={2000} value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} placeholder="Leave it on the porch bench." className={field} />
        </label>
        <label className="block text-sm font-medium text-app-text">Other instructions
          <textarea rows={2} maxLength={2000} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Gate code, doorbell note, etc." className={field} />
        </label>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      </div>
    </ModalShell>
  );
}

function statusBadgeClasses(status: string): string {
  switch (status) {
    case 'reserved':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200';
    case 'delivered':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
    case 'confirmed':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
    case 'canceled':
      return 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
}
