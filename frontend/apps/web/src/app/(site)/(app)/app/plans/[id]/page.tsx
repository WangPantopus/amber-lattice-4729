'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MapPin, MessageCircle, Users } from 'lucide-react';
import { plans } from '@pantopus/api';
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

const reasons: Record<string, string> = {
  too_far: 'You can ask to join when you’re closer to this plan.',
  needs_location: 'Add a saved place or use your location to ask to join.',
  declined: 'The host declined your request.',
  removed: 'You’re no longer on the guest list.',
  ended: 'This plan is closed to new requests.',
  too_many_requests: 'You’ve reached the limit for join requests.',
  blocked: 'You can’t ask to join this plan.',
};
const ages = { under_2: 'Under 2', '2_3': '2–3', '4_5': '4–5', '6_8': '6–8', '9_12': '9–12' };

export default function PlanPage() {
  const { id } = useParams<{ id: string }>();
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
    if (role === 'guest' && !window.confirm('Leave this plan and its chat?')) return;
    action.mutate(() => plans.withdraw(id));
  };
  return (
    <article className="space-y-5">
      {back}
      <header className="space-y-2">
        <span
          style={kindColors(plan.kind)}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--plan-cs)] px-3 py-1 text-sm font-semibold text-[var(--plan-c)]"
        >
          <KindGlyph className="h-4 w-4" kind={plan.kind} />
          {plans.kindNames[plan.kind]}
        </span>
        <h2 className="break-words text-2xl font-bold">{plan.title}</h2>
        <p className="font-medium">{planTime(plan, true)}</p>
        <p className="text-sm text-app-secondary">
          {plan.place_kind === 'online' ? 'Online' : plan.area.label} · Hosted by {plan.host.display_name}
        </p>
        <p className="text-sm text-app-muted">
          {plan.spots_left} {plan.spots_left === 1 ? 'spot' : 'spots'} left
          {plan.audience === 'invited' ? ' · Private plan' : ''}
        </p>
      </header>
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
      {isIn && plan.place && (
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
            <a className="text-primary-700 underline" href={plan.place.link} target="_blank" rel="noreferrer">
              Join online{plan.place.link_host ? ' at ' + plan.place.link_host : ''}
            </a>
          )}
          {plan.place.note && <p className="whitespace-pre-wrap break-words text-sm">{plan.place.note}</p>}
        </section>
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
                {person.party_size > 1 ? ' · Party of ' + person.party_size : ''}
                {person.kids_count ? ' · Kids: ' + person.kids_count : ''}
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
      {isHost && active && <JoinRequests plan={plan} busy={busy} run={action.mutate} />}
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
          <button className={secondaryClass} disabled={busy} onClick={cancel}>
            Leave plan
          </button>
        </div>
      )}
      {role === 'none' && (status === 'pending' || status === 'waitlisted') && (
        <div className="space-y-2 rounded-xl bg-surface-muted p-4">
          <p className="font-semibold">
            {status === 'pending' ? 'Requested' : 'On the waitlist'}
            {plan.viewer.waitlist_position ? ' · #' + plan.viewer.waitlist_position : ''}
          </p>
          <p className="text-sm">Meeting details and chat will appear when you’re in.</p>
          {active && (
            <button className={secondaryClass} disabled={busy} onClick={cancel}>
              Withdraw request
            </button>
          )}
        </div>
      )}
      {role === 'none' && active && (plan.viewer.can_ask || waitlist) && (
        <AskForm key={id} plan={plan} busy={busy} run={action.mutate} />
      )}
      {role === 'none' && reason && !waitlist && active && (
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
    </article>
  );
}

interface ParticipationProps {
  plan: plans.Detail;
  busy: boolean;
  run: (perform: () => Promise<unknown>) => void;
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
