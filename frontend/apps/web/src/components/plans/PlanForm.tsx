'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { homes, plans } from '@pantopus/api';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { buttonClass, detailPath, fieldClass, plansPath, usePlansArea } from './PlansWorkspace';
import PlanKindFields, { readKindDetails } from './PlanKindFields';
import PlanPublicPlace from './PlanPublicPlace';
import PlanScheduleFields, { readRepeat, readTimes } from './PlanScheduleFields';

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

export default function PlanForm({ initial: current }: { initial?: plans.Detail }) {
  const [initial] = useState(current);
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
  const [kind, setKind] = useState<plans.Kind>(initial?.kind || 'walk_coffee');
  const [audience, setAudience] = useState(initial?.audience || 'nearby');
  const [placeMode, setPlaceMode] = useState<PlaceMode>(initial ? 'keep' : 'public');
  const [offerDates, setOfferDates] = useState(!!initial?.dates);
  const poll =
    !!initial?.dates ||
    (!initial && audience === 'invited' && kind !== 'playdate' && datePolls && offerDates);
  const atHome = kind === 'watch_party' || kind === 'walk_coffee' || newer.includes(kind);
  const onlineAllowed = online && onlineKinds.includes(kind);
  const effectivePlace: PlaceMode =
    (placeMode === 'home' && !atHome) || (placeMode === 'online' && !onlineAllowed) ? 'public' : placeMode;
  const effectiveKind = effectivePlace === 'keep' ? initial?.place_kind : effectivePlace;
  const dirty = useRef(new Set<string>());
  const [error, setError] = useState('');
  const myHomes = useQuery({
    queryKey: ['plans', 'host-homes'],
    queryFn: homes.getMyHomes,
    enabled: effectivePlace === 'home',
    gcTime: 0,
  });
  const save = useMutation({
    mutationFn: async (input: { changes: Changes } | { create: plans.NewPlan }) => {
      const needsLocation =
        'create' in input
          ? input.create.audience === 'nearby'
          : !!input.changes.place && initial?.audience === 'nearby';
      const fix =
        needsLocation && (!gps || Date.now() - Date.parse(gps.timestamp) > 240_000)
          ? await refreshGPS()
          : gps;
      if ('create' in input) return plans.create({ ...input.create, gps: fix ?? undefined });
      return plans.edit(initial!.id, { ...input.changes, gps: fix ?? undefined });
    },
    onSuccess: async (plan) => {
      await client.invalidateQueries({ queryKey: ['plans'] });
      router.replace(detailPath(plan.id));
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
      const details = readKindDetails(kind, data, initial?.details);
      let place: plans.MeetingPlace | undefined;
      if (effectivePlace === 'public') {
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
      const auto_rules = data.getAll('rule').map(String);
      if (!initial && place) {
        save.mutate({
          create: {
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
          },
        });
      } else if (initial) {
        const changes: Changes = {};
        if (title !== initial.title) changes.title = title;
        if (about !== (initial.about || '')) changes.about = about;
        if (spots !== initial.spots) changes.spots = spots;
        if (guest_note !== (initial.place?.note || '')) changes.guest_note = guest_note;
        if (dirty.current.has('details')) changes.details = details;
        if (place) changes.place = place;
        if (poll && dirty.current.has('times')) changes.date_options = times;
        if (!poll && dirty.current.has('times')) {
          if (Date.parse(times[0].starts_at) !== Date.parse(initial.starts_at || ''))
            changes.starts_at = times[0].starts_at;
          if (Date.parse(times[0].ends_at) !== Date.parse(initial.ends_at || ''))
            changes.ends_at = times[0].ends_at;
        }
        if (repeat !== undefined && (repeat || initial.repeat)) changes.repeat = repeat;
        if (dirty.current.has('friend')) changes.guests_can_invite = guests_can_invite;
        if (dirty.current.has('kidsWelcome')) changes.kids_welcome = kids_welcome;
        if (dirty.current.has('rule')) changes.auto_rules = auto_rules;
        const moved =
          changes.place ||
          (changes.starts_at &&
            Math.abs(Date.parse(changes.starts_at) - Date.parse(initial.starts_at || '')) > 30 * 60_000);
        if (
          initial.going_count &&
          moved &&
          !window.confirm('Save these changes and ask guests to confirm they’re still coming?')
        )
          return;
        save.mutate({ changes });
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
              {(Object.keys(plans.kindNames) as plans.Kind[])
                .filter((k) => (k !== 'playdate' || playdates) && (!newer.includes(k) || more))
                .map((k) => (
                  <option key={k} value={k}>
                    {plans.kindNames[k]}
                  </option>
                ))}
            </select>
          </label>
        )}
        {!initial && privatePlans && (
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
          <input className={fieldClass} name="title" maxLength={80} defaultValue={initial?.title} required />
        </label>
        <div key={kind} className="space-y-3" onChange={() => dirty.current.add('details')}>
          <PlanKindFields kind={kind} details={initial?.details} />
        </div>
        <label className={inputLabel}>
          About the plan (optional)
          <textarea className={fieldClass} name="about" maxLength={500} defaultValue={initial?.about} />
        </label>
        {!initial && datePolls && audience === 'invited' && kind !== 'playdate' && (
          <label className="block">
            <input type="checkbox" checked={offerDates} onChange={(e) => setOfferDates(e.target.checked)} />{' '}
            Find a date together
          </label>
        )}
        <PlanScheduleFields
          initial={initial}
          poll={poll}
          canRepeat={repeats}
          onTimesChange={() => dirty.current.add('times')}
        />
        <label className={inputLabel}>
          {kind === 'playdate' ? 'Spots for families' : 'Spots for guests'}
          <input
            className={fieldClass}
            type="number"
            name="spots"
            min="1"
            max={audience === 'invited' && guestAnswers ? 100 : 30}
            defaultValue={initial?.spots ?? 4}
            required
          />
        </label>
        {kind !== 'playdate' && guestAnswers && (
          <label className="block">
            <input type="checkbox" name="kidsWelcome" defaultChecked={initial?.kids_welcome} /> Kids welcome
          </label>
        )}
        {audience === 'invited' && (
          <label className="block">
            <input type="checkbox" name="friend" defaultChecked={initial?.guests_can_invite} /> Guests can
            invite a friend
          </label>
        )}
        <fieldset className="space-y-3 border-t border-app pt-4">
          <legend className="font-semibold">Meeting details</legend>
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
          {effectivePlace === 'public' && <PlanPublicPlace kind={kind} />}
          {effectivePlace === 'online' && (
            <label className={inputLabel}>
              Meeting link
              <input
                className={fieldClass}
                type="url"
                name="link"
                placeholder="https://"
                maxLength={300}
                defaultValue={initial?.place?.link ?? ''}
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
          <label className={inputLabel}>
            Note for approved guests (optional)
            <textarea
              className={fieldClass}
              name="note"
              maxLength={500}
              defaultValue={initial?.place?.note ?? ''}
            />
          </label>
        </fieldset>
        {audience === 'nearby' && kind !== 'playdate' && (
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
                  defaultChecked={initial?.auto_rules?.includes(v)}
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
          {save.isPending ? 'Saving…' : initial ? 'Save changes' : 'Post plan'}
        </button>
      </form>
    </div>
  );
}
