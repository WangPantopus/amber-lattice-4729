'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MapPin, MessageCircle, Users } from 'lucide-react';
import { blocks, plans } from '@pantopus/api';
import { KindGlyph, kindColors } from '@/components/plans/planKind';
import {
  buttonClass,
  detailPath,
  fieldClass,
  plansPath,
  planTime,
  secondaryClass,
  usePlansArea,
} from '@/components/plans/PlansWorkspace';

import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { toast } from '@/components/ui/toast-store';
import { ages, labelFor } from '@/components/plans/PlanKindFields';
import PlanDatePoll, { type ParticipationProps } from '@/components/plans/PlanDatePoll';
import PlanInvitations, { InviteFriend } from '@/components/plans/PlanInvitations';
import { BringList, ChipInCard, GiftCard, downloadCalendar } from '@/app/(site)/plans/[id]/GuestAnswer';
import PlanPhotoAlbum from '@/components/plans/PlanPhotoAlbum';
import { PlanAfterActions, isPlanToday } from '@/components/plans/PlanFollowUp';
import PayToJoin from '@/app/(site)/plans/[id]/PayToJoin';
import { PlanChecks, TipLater } from '@/components/plans/PlanChecks';
import { PlanPaymentReturn } from '@/components/plans/PlanPayment';

const reasons: Record<string, string> = {
  too_far: 'You can ask to join when you’re closer to this plan.',
  needs_location: 'Add a saved place or use your location to ask to join.',
  declined: 'The host declined your request.',
  removed: 'You’re no longer on the guest list.',
  ended: 'This plan is closed to new requests.',
  too_many_requests: 'You’ve reached the limit for join requests.',
  blocked: 'You can’t ask to join this plan.',
};

export default function PlanPage() {
  const { id } = useParams<{ id: string }>();
  const previousId = useSearchParams().get('peopleFrom') || undefined;
  const router = useRouter();
  const { gps, refreshGPS } = usePlansArea();
  const client = useQueryClient();
  const detail = useQuery({
    queryKey: ['plans', 'detail', id, gps],
    queryFn: () => plans.detail(id, gps),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: 'always',
    refetchInterval: 30_000,
  });
  const plan = detail.isError ? undefined : detail.data;
  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: ['plans'] });
  }, [client]);
  const samePeople = useFeatureFlag('plans_same_people');
  const past = useQuery({
    queryKey: ['plans', 'past-people'],
    queryFn: plans.pastPlans,
    gcTime: 0,
    retry: false,
    enabled: samePeople && plan?.state === 'ended' && plan.viewer.role === 'host' && !plan.business,
  });
  const isHost = plan?.viewer.role === 'host';
  const action = useMutation({
    mutationFn: (perform: () => Promise<unknown>) => perform(),
    onSettled: () => client.invalidateQueries({ queryKey: ['plans'] }),
  });
  const busy = action.isPending;
  const active = plan?.state === 'upcoming' || plan?.state === 'live';
  const role = plan?.viewer.role;
  const status = plan?.viewer.request_status;
  const isIn = isHost || role === 'guest';
  const reason = plan?.viewer.cannot_ask_reason;
  const invited = !!plan?.my_invite && ['pending', 'declined', 'maybe'].includes(plan.my_invite.status);
  const waitlist = reason === 'full_use_waitlist';
  const back = (
    <Link className="inline-flex items-center gap-2 text-sm font-medium text-primary-700" href={plansPath}>
      <ArrowLeft size={16} />
      All plans
    </Link>
  );

  if (!plan)
    return (
      <div className="space-y-4">
        {back}
        <p role="status">
          {detail.isError
            ? 'This plan couldn’t be opened. It may no longer be available to you.'
            : 'Loading plan…'}
        </p>
        {detail.isError && (
          <button className={secondaryClass} onClick={() => void detail.refetch()}>
            Try again
          </button>
        )}
        {detail.isError && (
          <Link className="block text-sm text-primary-700" href={'/plans/' + encodeURIComponent(id)}>
            Open shared plan page
          </Link>
        )}
      </div>
    );

  const cancel = () => {
    if (
      role === 'guest' &&
      !window.confirm(['Leave this plan and its chat?', plan.paid?.leave_text].filter(Boolean).join(' '))
    )
      return;
    action.mutate(() =>
      role === 'guest' && plan.my_invite && !plan.price
        ? plans.answerInvitation(id, 'decline')
        : plans.withdraw(id),
    );
  };
  const businessPath = plan.business?.page_url?.match(/\/b\/[\w.-]+\/?$/)?.[0];
  return (
    <article className="space-y-5">
      {back}
      <header className="space-y-2">
        <span
          style={kindColors(plan.kind)}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--plan-cs)] px-3 py-1 text-sm font-semibold text-[var(--plan-c)]"
        >
          <KindGlyph className="h-4 w-4" kind={plan.kind} />
          {plan.label_text || plans.kindNames[plan.kind]}
        </span>
        <h2 className="break-words text-2xl font-bold">{plan.title}</h2>
        <p className="font-medium">{planTime(plan, true)}</p>
        <p className="text-sm text-app-secondary">
          {plan.place_kind === 'online' ? 'Online' : plan.area.label} · Hosted by{' '}
          {businessPath ? (
            <Link className="text-primary-700" href={businessPath}>
              {plan.host.display_name}
            </Link>
          ) : (
            plan.host.display_name
          )}
        </p>
        {plan.business && (
          <p className="text-sm font-medium">
            {plan.business.verified ? 'Verified business' : 'Business'} · {plan.price?.text || 'Free'}
          </p>
        )}
        <p className="text-sm text-app-muted">
          {plan.spots_left} {plan.spots_left === 1 ? 'spot' : 'spots'} left
          {plan.audience === 'invited' ? ' · Private plan' : ''}
        </p>
      </header>
      {plan.business && <PlanPaymentReturn key={'PlanPaymentReturn-' + id} id={id} onComplete={refresh} />}
      {plan.deal && (
        <section className="space-y-1 rounded-xl bg-surface-muted p-3">
          <h3 className="font-semibold">{plan.deal.text}</h3>
          {[plan.deal.condition_text, plan.deal.state_text, plan.deal.if_short_text, plan.deal.mine?.text]
            .filter(Boolean)
            .map((line) => (
              <p key={line}>{line}</p>
            ))}
        </section>
      )}
      {plan.repeat?.text && <p className="text-sm">{plan.repeat.text}</p>}
      {plan.details && (
        <p className="text-sm text-app-secondary">
          {[
            plan.details.food_kind,
            plan.details.game_kind,
            plan.details.outdoor_kind,
            plan.details.walk_kind,
            plan.details.sport,
            plan.details.level,
            plan.details.pace,
            plan.details.study_style,
          ]
            .filter((v): v is string => !!v)
            .map(labelFor)
            .concat(
              [
                plan.details.game?.label,
                plan.details.subject,
                plan.details.kids_age_bands?.map((b) => ages[b as keyof typeof ages]).join(', '),
                plan.details.dogs_welcome ? 'Dogs welcome' : null,
                plan.details.extra_gear ? 'Extra gear available' : null,
              ].filter((v): v is string => !!v),
            )
            .join(' · ')}
        </p>
      )}
      {plan.about && <p className="whitespace-pre-wrap break-words">{plan.about}</p>}
      {!active && (
        <p className="rounded-xl bg-surface-muted p-3 font-medium">
          {plan.state === 'cancelled' ? 'This plan was cancelled.' : 'This plan has ended.'}{' '}
          {plan.cancel_note}
        </p>
      )}
      {action.isError && (
        <p role="alert" className="text-sm text-red-700">
          {action.error instanceof Error ? action.error.message : 'That change couldn’t be saved.'}
        </p>
      )}
      {(isIn ||
        !!plan.business ||
        (plan.kind !== 'playdate' &&
          plan.audience === 'invited' &&
          plan.place_kind === 'public' &&
          invited)) &&
        plan.place && (
          <section className="space-y-2 rounded-2xl bg-surface-muted p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <MapPin size={18} />
              Meeting details
            </h3>
            <p className="font-medium">{plan.place.name}</p>
            {plan.place.address && <p className="text-sm">{plan.place.address}</p>}
            {plan.place.latitude != null && plan.place.longitude != null && (
              <a
                className="inline-block text-sm font-semibold text-primary-700"
                href={
                  'https://www.google.com/maps/dir/?api=1&destination=' +
                  encodeURIComponent(plan.place.latitude + ',' + plan.place.longitude)
                }
                target="_blank"
                rel="noreferrer"
              >
                Get directions
              </a>
            )}
            {plan.place.link && /^https?:\/\//i.test(plan.place.link) && (
              <a
                className="text-primary-700 underline"
                href={plan.place.link}
                target="_blank"
                rel="noreferrer"
              >
                Join online{plan.place.link_host ? ' at ' + plan.place.link_host : ''}
              </a>
            )}
            {plan.place.note && <p className="whitespace-pre-wrap break-words text-sm">{plan.place.note}</p>}
          </section>
        )}
      {isIn && active && !plan.dates && plan.starts_at && (
        <div className="flex flex-wrap gap-2">
          <button
            className={secondaryClass}
            onClick={() =>
              downloadCalendar(
                id,
                plan,
                plan.place?.link || plan.place?.address || plan.place?.name || '',
                window.location.origin + detailPath(id),
              )
            }
          >
            Add to calendar
          </button>
          {role === 'guest' && isPlanToday(plan) && plan.place_kind !== 'online' && (
            <button
              className={secondaryClass}
              disabled={busy || plan.my_request?.on_my_way}
              onClick={() => action.mutate(() => plans.onMyWay(id))}
            >
              {plan.my_request?.on_my_way ? 'On the way' : 'On my way'}
            </button>
          )}
        </div>
      )}
      {isIn && active && plan.bring && (
        <BringList
          key={'bring-' + id}
          planId={id}
          initial={plan.bring}
          isHost={isHost}
          hostFirst={plan.host.display_name.split(' ')[0]}
          onChanged={refresh}
        />
      )}
      {isIn && active && plan.chip_in && (
        <ChipInCard key={'chip-' + id} planId={id} initial={plan.chip_in} onChanged={refresh} />
      )}
      {isIn && active && plan.gift && (
        <GiftCard key={'gift-' + id} planId={id} initial={plan.gift} onChanged={refresh} isHost={isHost} />
      )}
      {isIn && plan.state === 'ended' && plan.photos && (
        <PlanPhotoAlbum key={'photos-' + id} id={id} summary={plan.photos} />
      )}
      {isIn && plan.state === 'ended' && (
        <PlanAfterActions card={plan} samePeople={!!past.data?.plans.some((p) => p.post_id === id)} />
      )}
      {isIn && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold">
            <Users size={18} />
            Who’s going
          </h3>
          <ul className="text-sm">
            {plan.people?.map((person) => (
              <li className="py-1" key={person.user_id || person.guest_id}>
                {person.display_name}
                {person.is_host ? ' · Host' : ''}
                {person.on_my_way && ' · On the way'}
                {isHost && person.chip_in && plan.state !== 'cancelled' && (
                  <button
                    className="ml-2 text-primary-700"
                    disabled={busy}
                    onClick={() =>
                      action.mutate(() => plans.chipPaid(id, !person.chip_in!.paid, person.chip_in!.who))
                    }
                  >
                    {person.chip_in.paid ? 'Paid · Undo' : 'Mark paid'}
                  </button>
                )}
                {person.party_size > 1 ? ' · Party of ' + person.party_size : ''}
                {person.kids_count ? ' · Kids: ' + person.kids_count : ''}
                {person.paid && ' · Paid ' + person.paid.text}
                {plan.business?.can_manage && person.deal?.state === 'ready' && person.request_id && (
                  <button
                    className="ml-2 text-sm text-primary-700"
                    disabled={busy}
                    onClick={() => action.mutate(() => plans.markDealUsed(id, person.request_id!))}
                  >
                    Mark deal used
                  </button>
                )}
                {person.deal?.state === 'used' && ' · Deal used'}
                {isHost && person.reconfirm_needed && ' · Reconfirmation requested'}
                {isHost && active && person.request_id && (
                  <button
                    className="ml-3 text-sm text-primary-700"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Remove ' +
                            person.display_name +
                            ' from this plan and its chat?' +
                            (person.paid ? ' Their paid spot will be refunded.' : ''),
                        )
                      )
                        action.mutate(() => plans.decide(id, person.request_id!, 'remove'));
                    }}
                  >
                    Remove guest
                  </button>
                )}
              </li>
            ))}
          </ul>
          {plan.chat_open && plan.chat_room_id && (
            <Link
              className={buttonClass}
              href={
                '/app/chat/' +
                encodeURIComponent(plan.chat_room_id) +
                '?returnTo=' +
                encodeURIComponent(detailPath(id))
              }
            >
              <MessageCircle size={17} />
              Open plan chat
            </Link>
          )}
          {isHost && active && !plan.chat_room_id && (
            <p className="text-sm text-app-muted">Plan chat opens when your first guest joins.</p>
          )}
        </section>
      )}
      {isHost && plan.headcount && (
        <p className="text-sm font-medium">
          {plan.headcount.adults} adults · {plan.headcount.kids} kids
          {plan.answers
            ? ' · ' + plan.answers.maybe + ' maybe · ' + plan.answers.no_answer + ' unanswered'
            : ''}
        </p>
      )}
      {active && plan.dates && <PlanDatePoll plan={plan} busy={busy} run={action.mutate} />}
      {isHost &&
      plan.invites &&
      (plan.invites.can_invite ||
        plan.invites.invited ||
        plan.invites.said_yes ||
        plan.invites.cant_make_it) ? (
        <PlanInvitations key={'PlanInvitations-' + id} plan={plan} previousId={previousId} />
      ) : null}
      {role === 'guest' && active && <InviteFriend key={'InviteFriend-' + id} plan={plan} />}
      {plan.paid && (
        <div className="space-y-2">
          <p className="font-semibold">{plan.paid.text}</p>
          {plan.paid.receipt?.link && (
            <Link className="text-primary-700" href={plan.paid.receipt.link}>
              View booking receipt
            </Link>
          )}
        </div>
      )}
      {plan.group_pay && (
        <section className="space-y-2">
          <h3 className="font-semibold">{plan.group_pay.text}</h3>
          <p>{[plan.group_pay.taken_text, plan.group_pay.note].filter(Boolean).join(' · ')}</p>
          {plan.group_pay.url && (
            <label className="block text-sm">
              Share prepaid spots
              <input
                className={fieldClass}
                value={plan.group_pay.url}
                readOnly
                onFocus={(e) => e.target.select()}
              />
            </label>
          )}
          {plan.group_pay.give_back && (
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => {
                if (window.confirm(plan.group_pay!.give_back!.text))
                  action.mutate(() => plans.giveBackSpots(id));
              }}
            >
              {plan.group_pay.give_back.label}
            </button>
          )}
        </section>
      )}
      {plan.pay_here && (role === 'guest' || (isHost && plan.business?.can_manage)) && (
        <PlanChecks key={'PlanChecks-' + id} plan={plan} />
      )}
      {plan.business && role === 'guest' && plan.state === 'ended' && (
        <TipLater key={'TipLater-' + id} plan={plan} onComplete={refresh} />
      )}
      {isHost && active && <HostTools plan={plan} busy={busy} run={action.mutate} />}
      {isHost && active && !plan.dates && <JoinRequests plan={plan} busy={busy} run={action.mutate} />}
      {role === 'guest' && active && (
        <div className="space-y-2">
          <p className="font-semibold">You’re going</p>
          {plan.my_request?.reconfirm_needed && (
            <button
              className={buttonClass}
              disabled={busy}
              onClick={() => action.mutate(() => plans.stillComing(id, true))}
            >
              I’m still coming
            </button>
          )}
          {plan.my_invite && !plan.price && typeof plan.kids_welcome === 'boolean' && (
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => {
                if (window.confirm('Change your answer to Maybe and release your spots?'))
                  action.mutate(() => plans.answerInvitation(id, 'maybe'));
              }}
            >
              Maybe
            </button>
          )}
          <button className={secondaryClass} disabled={busy} onClick={cancel}>
            {plan.my_invite ? 'Can’t make it' : 'Leave plan'}
          </button>
          {plan.paid?.leave_text && <p className="text-sm text-app-muted">{plan.paid.leave_text}</p>}
        </div>
      )}
      {role === 'none' && (status === 'pending' || status === 'waitlisted') && (
        <div className="space-y-2 rounded-xl bg-surface-muted p-4">
          <p className="font-semibold">
            {status === 'pending' ? 'Requested' : 'On the waitlist'}
            {plan.viewer.waitlist_position ? ' · #' + plan.viewer.waitlist_position : ''}
          </p>
          <p className="text-sm">
            {plan.business
              ? 'Chat opens when you’re in.'
              : 'Meeting details and chat will appear when you’re in.'}
          </p>
          {active && (
            <button className={secondaryClass} disabled={busy} onClick={cancel}>
              Withdraw request
            </button>
          )}
        </div>
      )}
      {role === 'none' && invited && active && !plan.dates && (
        <p className="font-semibold">
          {plan.my_invite?.status === 'maybe'
            ? 'You answered Maybe'
            : plan.my_invite?.status === 'declined'
              ? 'You answered Can’t make it'
              : plan.host.display_name + ' invited you'}
        </p>
      )}
      {role === 'none' &&
        !plan.dates &&
        active &&
        status !== 'pending' &&
        status !== 'waitlisted' &&
        (plan.viewer.can_ask ||
          status === 'paying' ||
          waitlist ||
          (invited && plan.my_invite?.status === 'declined')) &&
        (plan.price ? (
          <PayToJoin
            key={id}
            planId={id}
            plan={plan}
            gps={gps}
            signedIn
            joinNow={false}
            priceText={plan.price.text}
            refundText={plan.price.refund_text ?? null}
            returnPath={detailPath(id)}
            title={plan.title}
            startsAt={plan.starts_at}
            endsAt={plan.ends_at}
            place={plan.place?.name || ''}
            paid={null}
            waiting={false}
            onChanged={refresh}
          />
        ) : (
          <AskForm key={'AskForm-' + id} plan={plan} busy={busy} run={action.mutate} />
        ))}
      {role === 'none' && invited && active && !plan.dates && (
        <div className="flex flex-wrap gap-2">
          {typeof plan.kids_welcome === 'boolean' && plan.my_invite?.status !== 'maybe' && (
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => action.mutate(() => plans.answerInvitation(id, 'maybe'))}
            >
              Maybe
            </button>
          )}
          {plan.my_invite?.status !== 'declined' && (
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => action.mutate(() => plans.answerInvitation(id, 'decline'))}
            >
              Can’t make it
            </button>
          )}
        </div>
      )}
      {role === 'none' && reason && status !== 'paying' && !waitlist && active && !plan.dates && !invited && (
        <div className="space-y-2">
          <p className="text-sm text-app-muted">
            {reasons[reason] || 'You can’t ask to join this plan right now.'}
          </p>
          {(reason === 'needs_location' || reason === 'too_far') && (
            <button className={secondaryClass} onClick={() => void refreshGPS()}>
              Use my location
            </button>
          )}
        </div>
      )}
      {!isHost && (
        <details className="space-y-2 border-t border-app pt-3">
          <summary className="cursor-pointer text-sm font-medium">Report or block</summary>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const reason = String(new FormData(e.currentTarget).get('reason'));
              action.mutate(async () => {
                await plans.report(id, reason);
                toast.success('Thanks. We’ll look into it.');
              });
            }}
          >
            <label className="block text-sm">
              Reason for reporting
              <select required name="reason" className={fieldClass} defaultValue="">
                <option value="" disabled>
                  Choose a reason
                </option>
                {Object.entries({
                  safety: 'Something unsafe',
                  harassment: 'Harassment',
                  inappropriate: 'Inappropriate',
                  spam: 'Spam or a scam',
                  misinformation: 'Not a real plan',
                  other: 'Something else',
                }).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy} className={secondaryClass}>
              Report this plan
            </button>
          </form>
          <button
            disabled={busy}
            className={secondaryClass}
            onClick={() => {
              if (
                window.confirm('Block ' + plan.host.display_name + '? Their plans will be hidden from you.')
              )
                action.mutate(async () => {
                  await blocks.blockUser(plan.host.user_id);
                  router.replace(plansPath);
                });
            }}
          >
            Block {plan.host.display_name}
          </button>
        </details>
      )}
    </article>
  );
}

function HostTools({ plan, busy, run }: ParticipationProps) {
  const [cancelling, setCancelling] = useState(false);
  return (
    <section className="space-y-3 border-t border-app pt-4">
      <div className="flex flex-wrap gap-2">
        <Link className={secondaryClass} href={detailPath(plan.id) + '/edit'}>
          Edit plan
        </Link>
        <button
          className={secondaryClass}
          aria-expanded={cancelling}
          onClick={() => setCancelling(!cancelling)}
        >
          Cancel plan
        </button>
      </div>
      {cancelling && (
        <form
          className="space-y-2 rounded-xl bg-surface-muted p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const repeat = data.get('repeat') as 'keep' | 'stop' | null;
            if (
              window.confirm(
                repeat === 'stop'
                  ? 'Cancel this plan and stop future dates?'
                  : 'Cancel this plan and tell the guests?',
              )
            )
              run(() => plans.cancel(plan.id, String(data.get('note') || ''), repeat || undefined));
          }}
        >
          {plan.repeat && (
            <label className="block text-sm">
              Dates to cancel
              <select className={fieldClass} name="repeat">
                <option value="keep">Only this date</option>
                <option value="stop">This date and all future dates</option>
              </select>
            </label>
          )}
          <label className="block text-sm">
            Note for guests (optional)
            <textarea className={fieldClass} name="note" maxLength={280} />
          </label>
          {plan.price && <p className="text-sm">Cancelling refunds guests’ paid spots.</p>}
          <button disabled={busy} className={buttonClass}>
            Confirm cancellation
          </button>
        </form>
      )}
    </section>
  );
}

function JoinRequests({ plan, busy, run }: ParticipationProps) {
  const id = plan.id;
  const home = plan.place_kind === 'home';
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash === '#requests') section.current?.scrollIntoView({ block: 'start' });
  }, [id]);
  const requests = useQuery({
    queryKey: ['plans', 'requests', id],
    queryFn: () => plans.requests(id),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: 'always',
    refetchInterval: 30_000,
  });
  return (
    <section ref={section} id="requests" className="space-y-2 border-t border-app pt-4">
      <h3 className="font-semibold">Join requests</h3>
      {requests.isError ? (
        <button className={secondaryClass} onClick={() => void requests.refetch()}>
          Retry requests
        </button>
      ) : requests.isLoading ? (
        <p role="status">Loading requests…</p>
      ) : (
        <>
          {requests.data?.pending.length === 0 && (
            <p className="text-sm text-app-muted">No pending requests.</p>
          )}
          {requests.data?.pending.map((request) => (
            <div key={request.id} className="space-y-2 rounded-xl border border-app p-3">
              <p className="font-semibold">{request.user.display_name}</p>
              <p className="text-sm">
                Party of {request.party_size}
                {request.kids_count ? ' · Kids: ' + request.kids_count : ''}
                {request.kids_age_bands?.length
                  ? ' · ' + request.kids_age_bands.map((b) => ages[b as keyof typeof ages]).join(', ')
                  : ''}
              </p>
              {request.note && <p className="whitespace-pre-wrap break-words text-sm">{request.note}</p>}
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  className={buttonClass}
                  onClick={() => {
                    if (
                      !home ||
                      window.confirm('Accept and share your home address and meeting note with this guest?')
                    )
                      run(() => plans.decide(id, request.id, 'accept', home));
                  }}
                >
                  Approve
                </button>
                <button
                  disabled={busy}
                  className={secondaryClass}
                  onClick={() => run(() => plans.decide(id, request.id, 'decline'))}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
          {!!requests.data?.waitlisted.length && (
            <>
              <h4 className="font-semibold">Waitlist</h4>
              <ol className="list-inside list-decimal text-sm">
                {requests.data.waitlisted.map((r) => (
                  <li key={r.id}>
                    {r.user.display_name} · Party of {r.party_size}
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </section>
  );
}

function AskForm({ plan, busy, run }: ParticipationProps) {
  const id = plan.id;
  const { gps, refreshGPS } = usePlansArea();
  const waitlist = plan.viewer.cannot_ask_reason === 'full_use_waitlist';
  const joinLabel = waitlist
    ? 'Join waitlist'
    : plan.my_invite
      ? plan.my_invite.needs_host_ok
        ? 'Ask to join'
        : 'I’m in'
      : plan.how_people_get_in === 'automatic'
        ? 'Join plan'
        : 'Ask to join';
  return (
    <form
      key={id}
      className="space-y-3 border-t border-app pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const input: plans.Ask = {
          party_size: Number(data.get('party') ?? 1),
          note: String(data.get('note') ?? ''),
        };
        if (data.has('kids')) input.kids_count = Number(data.get('kids'));
        if (plan.kind === 'playdate') {
          input.kids_age_bands = data.getAll('ages').map(String);
          input.stays_with_kids = data.has('staying');
        }
        run(async () => {
          const fix = gps && Date.now() - Date.parse(gps.timestamp) > 240_000 ? await refreshGPS() : gps;
          return plans.ask(id, { ...input, gps: fix ?? undefined });
        });
      }}
    >
      <h3 className="font-semibold">Who’s coming?</h3>
      {plan.kind !== 'playdate' && (
        <label className="block text-sm">
          Party size, including you
          <input
            className={fieldClass}
            name="party"
            type="number"
            min="1"
            max={plan.audience === 'invited' ? 10 : 4}
            defaultValue="1"
            required
          />
        </label>
      )}
      {(plan.kind === 'playdate' || plan.kids_welcome) && (
        <label className="block text-sm">
          Kids
          <input
            className={fieldClass}
            name="kids"
            type="number"
            min={plan.kind === 'playdate' ? 1 : 0}
            max={plan.kind === 'playdate' ? 8 : 10}
            defaultValue={plan.kind === 'playdate' ? 1 : 0}
            required
          />
        </label>
      )}
      {plan.kind === 'playdate' && (
        <>
          <fieldset>
            <legend>Kids’ ages</legend>
            <div className="flex flex-wrap gap-3">
              {Object.entries(ages).map(([v, label]) => (
                <label key={v}>
                  <input type="checkbox" name="ages" value={v} /> {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <input name="staying" type="checkbox" required /> I’ll stay with my kids.
          </label>
        </>
      )}
      <label className="block text-sm">
        Say hello (optional)
        <textarea className={fieldClass} name="note" maxLength={280} />
      </label>
      <button className={buttonClass} disabled={busy}>
        {joinLabel}
      </button>
    </form>
  );
}
