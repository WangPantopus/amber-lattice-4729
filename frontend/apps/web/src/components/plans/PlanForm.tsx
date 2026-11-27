'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { homes, plans } from '@pantopus/api';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { buttonClass, detailPath, fieldClass, plansPath, usePlansArea } from './PlansWorkspace';
import PlanExtraFields, { readExtras } from './PlanExtraFields';
import PlanPreview, { PlanReviewActions, type DealQuote } from './PlanPreview';
import PlanKindFields, { readKindDetails } from './PlanKindFields';
import PlanPublicPlace from './PlanPublicPlace';
import PlanScheduleFields, { readRepeat, readTimes } from './PlanScheduleFields';
import PlanBusinessFields, { readBusinessFields } from './PlanBusinessFields';
import { startPlanFromMoment, useMomentPlanSeed, type MomentPlanSeed } from '@/components/reinvented/plan/WantToCome';

const newer: plans.Kind[] = ['food_drinks', 'game_night', 'outdoors', 'something_else'];
const onlineKinds: plans.Kind[] = [
  'watch_party',
  'walk_coffee',
  'study_group',
  'game_night',
  'something_else',
  'food_drinks',
];
type PlaceMode = plans.MeetingPlace['kind'] | 'keep';
type Changes = Parameters<typeof plans.edit>[1];
const inputLabel = 'block text-sm font-medium';

type Draft = plans.NewPlan | plans.NewBusinessPlan;
export default function PlanForm({
  initial,
  againId,
  samePeople,
  fromMoment,
}: {
  initial?: plans.Detail;
  againId?: string;
  samePeople?: boolean;
  /** Pulse, reinvented "Want to come?" (CONTRACT 6g): the author's own Moment the plan starts from. Unset: today's form. */
  fromMoment?: string;
}) {
  const seed = useMomentPlanSeed(fromMoment);
  const again = useQuery({
    queryKey: ['plans', 'again', againId],
    queryFn: () => plans.detail(againId!),
    enabled: !!againId,
    gcTime: 0,
    retry: false,
  });
  const [occasion, setOccasion] = useState<plans.Occasion>();
  const occasionFlag = useFeatureFlag('plans_occasions');
  const privateFlag = useFeatureFlag('plans_private');
  const kindsFlag = useFeatureFlag('plans_kinds');
  const [hostId, setHostId] = useState(initial?.business?.user_id || '');
  const choices = useQuery({
    queryKey: ['plans', 'host-as'],
    queryFn: plans.hostAs,
    enabled: !initial || !!initial.business,
  });
  const business = choices.data?.businesses.find((item) => item.user_id === hostId);
  const occasions = useQuery({
    queryKey: ['plans', 'occasions'],
    queryFn: plans.occasions,
    enabled: !initial && !hostId && !againId && occasionFlag && kindsFlag && privateFlag,
    retry: false,
  });
  if (fromMoment && !seed.data) {
    return <p role="status">{seed.isPending ? 'Loading your Moment…' : 'This Moment can’t start a plan.'}</p>;
  }
  if (
    againId &&
    (!again.data || again.data.viewer.role !== 'host' || again.data.state !== 'ended' || again.data.business)
  ) {
    return (
      <p role="status">
        {again.isPending ? 'Loading your past plan…' : 'This plan is unavailable to host again.'}
      </p>
    );
  }
  return (
    <>
      {!initial && !fromMoment && !!choices.data?.businesses.length && (
        <label className="mb-4 block text-sm font-medium">
          Host as
          <select className={fieldClass} value={hostId} onChange={(e) => setHostId(e.target.value)}>
            <option value="">Myself</option>
            {choices.data.businesses.map((item) => (
              <option key={item.user_id} value={item.user_id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {choices.isError && (
        <button className="mb-3 text-sm text-primary-700" onClick={() => void choices.refetch()}>
          Retry business hosting options
        </button>
      )}
      {!initial && !hostId && !againId && !fromMoment && !!occasions.data?.occasions.length && (
        <label className={inputLabel}>
          Coming up
          <select
            className={fieldClass}
            value={occasion?.key || ''}
            onChange={(e) => setOccasion(occasions.data.occasions.find((o) => o.key === e.target.value))}
          >
            <option value="">Choose an occasion (optional)</option>
            {occasions.data.occasions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.text}
              </option>
            ))}
          </select>
        </label>
      )}
      <PlanEditor
        key={hostId || againId || occasion?.key || 'personal'}
        initial={initial}
        business={business}
        again={again.data}
        samePeople={samePeople}
        occasion={hostId ? undefined : occasion}
        fromMoment={seed.data}
      />
    </>
  );
}

function PlanEditor({
  initial: current,
  business,
  again,
  samePeople,
  occasion,
  fromMoment,
}: {
  initial?: plans.Detail;
  business?: plans.BusinessHost;
  again?: plans.Detail;
  samePeople?: boolean;
  occasion?: plans.Occasion;
  fromMoment?: MomentPlanSeed;
}) {
  const [initial] = useState(current);
  const defaults = initial ?? again;
  const [preview, setPreview] = useState<Draft>();
  const [dealEdit, setDealEdit] = useState<{ changes: Changes; quote: DealQuote }>();
  const gameId = useSearchParams().get('game');
  const isBusiness = !!business || !!initial?.business;
  const router = useRouter();
  const client = useQueryClient();
  const { gps, refreshGPS } = usePlansArea();
  const more = useFeatureFlag('plans_kinds');
  const playdates = useFeatureFlag('plans_playdates');
  const privatePlans = useFeatureFlag('plans_private');
  const online = useFeatureFlag('plans_online');
  const guestAnswers = useFeatureFlag('plans_guest_answers');
  const datePolls = useFeatureFlag('plans_find_date');
  const repeats = useFeatureFlag('plans_repeat');
  const [kind, setKind] = useState<plans.Kind>(
    defaults?.kind || occasion?.kind || business?.kinds[0]?.kind || (gameId ? 'watch_party' : 'walk_coffee'),
  );
  const [audience, setAudience] = useState(
    initial?.audience || (privatePlans && (again?.audience || occasion?.fills.audience)) || 'nearby',
  );
  const [placeMode, setPlaceMode] = useState<PlaceMode>(
    initial ? 'keep' : again?.place_kind || occasion?.fills.place_kind || 'public',
  );
  const [offerDates, setOfferDates] = useState(!!initial?.dates);
  const poll =
    !!initial?.dates ||
    (!initial && audience === 'invited' && kind !== 'playdate' && datePolls && offerDates);
  const atHome = kind === 'watch_party' || kind === 'walk_coffee' || newer.includes(kind);
  const onlineAllowed = online && onlineKinds.includes(kind);
  const effectivePlace: PlaceMode =
    (placeMode === 'home' && !atHome) || (placeMode === 'online' && !onlineAllowed) ? 'public' : placeMode;
  const effectiveKind = effectivePlace === 'keep' ? initial?.place_kind : effectivePlace;
  const preset = occasion?.kind === kind ? occasion : undefined;
  const [nextTime] = useState(() => {
    if (!again?.starts_at || !again.ends_at) return undefined;
    const start = new Date(again.starts_at),
      end = new Date(again.ends_at);
    const week = 7 * 86400_000;
    const weeks = Math.max(1, Math.ceil((Date.now() - start.getTime() + 1) / week));
    return {
      starts_at: new Date(start.getTime() + weeks * week).toISOString(),
      ends_at: new Date(end.getTime() + weeks * week).toISOString(),
    };
  });
  const dirty = useRef(new Set<string>());
  const [error, setError] = useState('');
  const myHomes = useQuery({
    queryKey: ['plans', 'host-homes'],
    queryFn: homes.getMyHomes,
    enabled: effectivePlace === 'home',
    gcTime: 0,
  });
  const save = useMutation({
    mutationFn: async (input: { changes: Changes } | { create: plans.NewPlan | plans.NewBusinessPlan }) => {
      if ('create' in input && 'host_as' in input.create) return plans.create(input.create);
      if ('changes' in input && isBusiness) return plans.edit(initial!.id, input.changes);
      const needsLocation =
        'create' in input
          ? 'audience' in input.create && input.create.audience === 'nearby'
          : !!input.changes.place && initial?.audience === 'nearby';
      const fix =
        needsLocation && (!gps || Date.now() - Date.parse(gps.timestamp) > 240_000)
          ? await refreshGPS()
          : gps;
      if ('create' in input && fromMoment && !('host_as' in input.create))
        return startPlanFromMoment(fromMoment.id, { ...input.create, gps: fix ?? undefined });
      if ('create' in input) return plans.create({ ...input.create, gps: fix ?? undefined });
      return plans.edit(initial!.id, { ...input.changes, gps: fix ?? undefined });
    },
    onSuccess: async (plan) => {
      await client.invalidateQueries({ queryKey: ['plans'] });
      router.replace(
        detailPath(plan.id) +
          (again && samePeople ? '?peopleFrom=' + encodeURIComponent(again.id) + '#invitations' : ''),
      );
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (save.isPending) return;
    const data = new FormData(e.currentTarget);
    const value = (key: string) => String(data.get(key) || '').trim();
    setError('');
    try {
      const times = readTimes(data);
      const repeat = readRepeat(data);
      const details = readKindDetails(
        kind,
        data,
        defaults?.kind === kind ? defaults.details : preset?.details,
      );
      let place: plans.MeetingPlace | undefined;
      if (!isBusiness && effectivePlace === 'public') {
        if (!value('latitude') || !value('longitude'))
          throw new Error('Choose the meeting point on the map or use your current location.');
        place = {
          kind: 'public',
          name: value('placeName'),
          address: value('placeAddress'),
          place_id: value('placeId') || undefined,
          latitude: Number(value('latitude')),
          longitude: Number(value('longitude')),
        };
      } else if (effectivePlace === 'home') place = { kind: 'home', home_id: value('home') };
      else if (effectivePlace === 'online') place = { kind: 'online', link: value('link') };
      const title = value('title'),
        about = value('about'),
        spots = Number(value('spots')),
        guest_note = value('note');
      const guests_can_invite = data.has('friend'),
        kids_welcome = data.has('kidsWelcome');
      const auto_rules = isBusiness
        ? data.get('admission') === 'open' || data.has('price')
          ? ['open']
          : []
        : data.getAll('rule').map(String);
      const extras =
        audience === 'invited' && !isBusiness && kind !== 'playdate'
          ? readExtras(data, initial, dirty.current)
          : {};
      const businessFields = isBusiness ? readBusinessFields(data, initial, dirty.current) : {};
      if (business && !initial) {
        setPreview({
          ...businessFields,
          host_as: { business_user_id: business.user_id },
          business_location_id: value('businessLocation'),
          label: value('label'),
          kind,
          title,
          about,
          spots,
          details,
          guest_note,
          auto_rules,
          join_requirement: 'located',
          ...times[0],
        });
      } else if (!initial && place) {
        setPreview({
          kind,
          audience,
          title,
          about,
          spots,
          details,
          guest_note,
          place,
          ...times[0],
          date_options: poll ? times : undefined,
          repeat,
          guests_can_invite,
          kids_welcome,
          auto_rules,
          occasion: preset?.key,
          hosted_again_from: again?.id,
          ...extras,
        });
      } else if (initial) {
        const changes: Changes = { ...businessFields, ...extras };
        if (title !== initial.title) changes.title = title;
        if (about !== (initial.about || '')) changes.about = about;
        if (spots !== initial.spots) changes.spots = spots;
        if (guest_note !== (initial.place?.note || '')) changes.guest_note = guest_note;
        if (dirty.current.has('details')) changes.details = details;
        if (place) changes.place = place;
        if (poll && dirty.current.has('times')) changes.date_options = times;
        if (!poll && (dirty.current.has('times') || dirty.current.has('gameSelection'))) {
          if (Date.parse(times[0].starts_at) !== Date.parse(initial.starts_at || ''))
            changes.starts_at = times[0].starts_at;
          if (Date.parse(times[0].ends_at) !== Date.parse(initial.ends_at || ''))
            changes.ends_at = times[0].ends_at;
        }
        if (repeat !== undefined && (repeat || initial.repeat)) changes.repeat = repeat;
        if (dirty.current.has('friend')) changes.guests_can_invite = guests_can_invite;
        if (dirty.current.has('kidsWelcome')) changes.kids_welcome = kids_welcome;
        if (dirty.current.has('rule') || dirty.current.has('admission')) changes.auto_rules = auto_rules;
        const moved =
          changes.place ||
          changes.business_location_id ||
          (changes.starts_at &&
            Math.abs(Date.parse(changes.starts_at) - Date.parse(initial.starts_at || '')) > 30 * 60_000);
        if (
          initial.going_count &&
          moved &&
          !window.confirm('Save these changes and ask guests to confirm they’re still coming?')
        )
          return;
        if (initial.business && changes.deal) {
          setDealEdit({
            changes,
            quote: {
              host_as: { business_user_id: initial.business.user_id },
              deal: changes.deal,
              spots,
              starts_at: times[0].starts_at,
              price_cents: data.has('price')
                ? Math.round(Number(data.get('priceAmount')) * 100)
                : changes.price_cents === undefined
                  ? initial.price?.cents
                  : null,
              pay_here: changes.pay_here ?? !!initial.pay_here,
            },
          });
        } else save.mutate({ changes });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check the plan details and try again.');
    }
  }
  return (
    <div className="space-y-4">
      <Link
        href={initial ? detailPath(initial.id) : plansPath}
        className="inline-flex items-center gap-2 text-sm font-medium text-primary-700"
      >
        <ArrowLeft size={16} />
        {initial ? 'Back to plan' : 'All plans'}
      </Link>
      <h2 className="text-2xl font-bold">{initial ? 'Edit plan' : 'Host a plan'}</h2>
      <form
        hidden={!!preview || !!dealEdit}
        className="space-y-5"
        onSubmit={submit}
        onChange={(e) => {
          const field = e.target;
          if (
            field instanceof HTMLInputElement ||
            field instanceof HTMLSelectElement ||
            field instanceof HTMLTextAreaElement
          )
            dirty.current.add(field.name);
        }}
      >
        {!initial && (
          <label className={inputLabel}>
            Kind of plan
            <select
              className={fieldClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as plans.Kind)}
            >
              {business
                ? business.kinds.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.name}
                    </option>
                  ))
                : (Object.keys(plans.kindNames) as plans.Kind[])
                    .filter((k) => (k !== 'playdate' || playdates) && (!newer.includes(k) || more))
                    .map((k) => (
                      <option key={k} value={k}>
                        {plans.kindNames[k]}
                      </option>
                    ))}
            </select>
          </label>
        )}
        {!initial && !isBusiness && privatePlans && (
          <label className={inputLabel}>
            Who can see this plan?
            <select
              className={fieldClass}
              value={audience}
              onChange={(e) => setAudience(e.target.value as typeof audience)}
            >
              <option value="nearby">People nearby</option>
              <option value="invited">Only people I invite</option>
            </select>
          </label>
        )}
        <label className={inputLabel}>
          Plan title
          <input
            className={fieldClass}
            name="title"
            maxLength={80}
            defaultValue={defaults?.title || fromMoment?.title || occasion?.fills.title}
            required
          />
        </label>
        <div key={kind} className="space-y-3" onChange={() => dirty.current.add('details')}>
          <PlanKindFields
            kind={kind}
            details={defaults?.kind === kind ? defaults.details : preset?.details}
          />
        </div>
        <label className={inputLabel}>
          About the plan (optional)
          <textarea className={fieldClass} name="about" maxLength={500} defaultValue={defaults?.about} />
        </label>
        {!initial && !isBusiness && datePolls && audience === 'invited' && kind !== 'playdate' && (
          <label className="block">
            <input type="checkbox" checked={offerDates} onChange={(e) => setOfferDates(e.target.checked)} />{' '}
            Find a date together
          </label>
        )}
        <PlanScheduleFields
          initial={initial}
          suggested={
            nextTime ??
            (preset?.fills.starts_at &&
            preset.fills.ends_at &&
            Date.parse(preset.fills.starts_at) > Date.now()
              ? { starts_at: preset.fills.starts_at, ends_at: preset.fills.ends_at }
              : undefined)
          }
          poll={poll}
          canRepeat={!isBusiness && repeats}
          onTimesChange={() => dirty.current.add('times')}
        />
        <label className={inputLabel}>
          {kind === 'playdate' ? 'Spots for families' : 'Spots for guests'}
          <input
            className={fieldClass}
            type="number"
            name="spots"
            min="1"
            max={business?.limits.spots_max ?? (audience === 'invited' && guestAnswers ? 100 : 30)}
            defaultValue={defaults?.spots ?? preset?.fills.spots ?? 4}
            required
          />
        </label>
        {!isBusiness && kind !== 'playdate' && guestAnswers && (
          <label className="block">
            <input
              type="checkbox"
              name="kidsWelcome"
              defaultChecked={defaults?.kids_welcome ?? preset?.fills.kids_welcome}
            />{' '}
            Kids welcome
          </label>
        )}
        {audience === 'invited' && (
          <label className="block">
            <input type="checkbox" name="friend" defaultChecked={defaults?.guests_can_invite} /> Guests can
            invite a friend
          </label>
        )}
        {audience === 'invited' && !isBusiness && kind !== 'playdate' && (
          <PlanExtraFields
            initial={initial}
            kind={kind}
            starter={preset?.fills.bring}
            touch={(key) => dirty.current.add(key)}
          />
        )}
        <fieldset className="space-y-3 border-t border-app pt-4">
          <legend className="font-semibold">Meeting details</legend>
          {isBusiness ? (
            <PlanBusinessFields key={kind} business={business} kind={kind} initial={initial} />
          ) : (
            <>
              <label className={inputLabel}>
                Where are you meeting?
                <select
                  className={fieldClass}
                  value={effectivePlace}
                  onChange={(e) => setPlaceMode(e.target.value as PlaceMode)}
                >
                  {initial && <option value="keep">Keep current meeting place</option>}
                  <option value="public">At a public place</option>
                  {atHome && <option value="home">At my home</option>}
                  {onlineAllowed && <option value="online">Online</option>}
                </select>
              </label>
              {effectivePlace === 'keep' && (
                <p className="text-sm text-app-secondary">
                  {initial?.place?.name || initial?.place?.link_host || initial?.area.label}
                </p>
              )}
              {effectivePlace === 'public' && (
                <PlanPublicPlace
                  kind={kind}
                  previous={again?.place_kind === 'public' ? again.place : (fromMoment?.place as plans.Detail['place'] | undefined)}
                />
              )}
              {effectivePlace === 'online' && (
                <label className={inputLabel}>
                  Meeting link
                  <input
                    className={fieldClass}
                    type="url"
                    name="link"
                    placeholder="https://"
                    maxLength={300}
                    defaultValue={defaults?.place?.link ?? ''}
                    required
                  />
                  <span className="text-xs text-app-muted">Only confirmed guests see the link.</span>
                </label>
              )}
              {effectivePlace === 'home' && (
                <label className={inputLabel}>
                  Your home
                  <select className={fieldClass} name="home" defaultValue="" required>
                    <option value="">Choose your home</option>
                    {myHomes.data?.homes
                      .filter((h) => h.location && h.access_kind !== 'verification')
                      .map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name || h.address || h.city}
                        </option>
                      ))}
                  </select>
                  <span className="text-xs text-app-muted">Guests see the address after they’re in.</span>
                </label>
              )}
            </>
          )}
          <label className={inputLabel}>
            Note for approved guests (optional)
            <textarea
              className={fieldClass}
              name="note"
              maxLength={500}
              defaultValue={defaults?.place?.note ?? ''}
            />
          </label>
        </fieldset>
        {!isBusiness && audience === 'nearby' && kind !== 'playdate' && (
          <fieldset className="space-y-2 border-t border-app pt-4">
            <legend className="font-semibold">Joining this plan</legend>
            <p className="text-sm">You approve requests. Who can join automatically?</p>
            {Object.entries({
              hosted_before: 'People I’ve hosted',
              ...(effectiveKind !== 'home' ? { verified: 'People with a verified address' } : {}),
              ...(effectiveKind === 'public' && ['walk_coffee', 'pickup_game'].includes(kind)
                ? { anyone_nearby: 'Anyone nearby' }
                : {}),
            }).map(([v, l]) => (
              <label key={v} className="block text-sm">
                <input
                  type="checkbox"
                  name="rule"
                  value={v}
                  defaultChecked={defaults?.auto_rules?.includes(v)}
                />{' '}
                {l}
              </label>
            ))}
          </fieldset>
        )}
        {(error || save.isError) && (
          <p role="alert" className="text-sm text-red-700">
            {error || save.error?.message}
          </p>
        )}
        <button className={buttonClass} disabled={save.isPending || save.isSuccess}>
          {save.isPending ? 'Saving…' : initial ? 'Save changes' : 'Preview plan'}
        </button>
      </form>
      {dealEdit && (
        <section className="space-y-3 rounded-xl border border-app p-4">
          <h3 className="text-lg font-semibold">Review your deal</h3>
          <PlanReviewActions
            label="Save changes"
            quote={dealEdit.quote}
            saving={save.isPending || save.isSuccess}
            error={save.error?.message}
            onBack={() => {
              save.reset();
              setDealEdit(undefined);
            }}
            onPost={() => save.mutate({ changes: dealEdit.changes })}
          />
        </section>
      )}
      {preview && (
        <PlanPreview
          draft={preview}
          business={business}
          saving={save.isPending || save.isSuccess}
          error={save.error?.message}
          onBack={() => {
            save.reset();
            setPreview(undefined);
          }}
          onPost={() => save.mutate({ create: preview })}
        />
      )}
    </div>
  );
}
