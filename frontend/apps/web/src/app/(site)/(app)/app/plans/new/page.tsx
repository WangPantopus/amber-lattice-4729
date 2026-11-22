'use client';

import { useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MapPin } from 'lucide-react';
import { plans } from '@pantopus/api';
import {
  buttonClass,
  detailPath,
  fieldClass,
  plansPath,
  usePlansArea,
} from '@/components/plans/PlansWorkspace';

const MeetingMap = dynamic(() => import('@/components/plans/PlansMap').then((m) => m.MeetingMap), {
  ssr: false,
});
const kinds = ['walk_coffee', 'pickup_game', 'watch_party', 'study_group'] as const;
const sports = ['pickleball', 'basketball', 'soccer', 'tennis', 'volleyball', 'running', 'other'];

export default function HostPlan() {
  const router = useRouter();
  const client = useQueryClient();
  const { point, gps, refreshGPS } = usePlansArea();
  const [kind, setKind] = useState<(typeof kinds)[number]>('walk_coffee');
  const [venue, setVenue] = useState('');
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState<plans.Point | null>(null);
  const [placeId, setPlaceId] = useState<string>();
  const [error, setError] = useState('');
  const choices = useQuery({
    queryKey: ['plans', 'places', point, kind],
    queryFn: () => plans.places(point!, kind),
    enabled: !!point,
    refetchInterval: (q) => (q.state.data?.loading && q.state.dataUpdateCount < 6 ? 4_000 : false),
  });
  const post = useMutation({
    mutationFn: async (input: plans.NewPlan) => {
      const fix = gps && Date.now() - Date.parse(gps.timestamp) < 240_000 ? gps : await refreshGPS();
      return plans.create({ ...input, gps: fix ?? undefined });
    },
    onSuccess: async (plan) => {
      await client.invalidateQueries({ queryKey: ['plans'] });
      router.replace(detailPath(plan.id));
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pin) {
      setError('Choose a nearby place, use your current location, or mark the meeting point on the map.');
      return;
    }
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) || '').trim();
    const start = new Date(value('start'));
    const end = new Date(start.getTime() + Number(value('duration')) * 60_000);
    if (!Number.isFinite(end.getTime())) {
      setError('Choose a start date and time.');
      return;
    }
    const details: plans.NewPlan['details'] = {};
    if (kind === 'study_group') details.subject = value('subject');
    if (kind === 'pickup_game') details.sport = value('sport');
    if (kind === 'walk_coffee') details.walk_kind = value('walk');
    if (kind === 'watch_party' && value('game')) details.game = { label: value('game') };
    setError('');
    post.mutate({
      kind,
      title: value('title'),
      about: value('about'),
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      spots: Number(value('spots')),
      details,
      guest_note: value('note'),
      place: { kind: 'public', ...pin, name: venue.trim(), address: address.trim(), place_id: placeId },
    });
  }
  function choose(place: plans.PublicPlace) {
    setPin({ latitude: place.latitude, longitude: place.longitude });
    setVenue(place.name);
    setAddress(place.address || '');
    setPlaceId(place.place_id);
    setError('');
  }
  return (
    <div className="space-y-4">
      <Link href={plansPath} className="inline-flex items-center gap-2 text-sm font-medium text-primary-700">
        <ArrowLeft size={16} />
        All plans
      </Link>
      <h2 className="text-2xl font-bold">Host a plan</h2>
      <form className="space-y-5" onSubmit={submit}>
        <label className="block text-sm font-medium">
          Kind of plan
          <select
            className={fieldClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {plans.kindNames[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Plan title
          <input className={fieldClass} name="title" maxLength={80} required />
        </label>
        {kind === 'walk_coffee' && (
          <label className="block text-sm font-medium">
            Activity
            <select className={fieldClass} name="walk">
              <option value="walk">Walk</option>
              <option value="coffee">Coffee</option>
              <option value="dog_walk">Dog walk</option>
              <option value="stroller_walk">Stroller walk</option>
            </select>
          </label>
        )}
        {kind === 'pickup_game' && (
          <label className="block text-sm font-medium">
            Sport
            <select className={fieldClass} name="sport">
              {sports.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'watch_party' && (
          <label className="block text-sm font-medium">
            What are you watching? (optional)
            <input className={fieldClass} name="game" maxLength={60} />
          </label>
        )}
        {kind === 'study_group' && (
          <label className="block text-sm font-medium">
            What are you studying?
            <input className={fieldClass} name="subject" maxLength={60} required />
          </label>
        )}
        <label className="block text-sm font-medium">
          About the plan (optional)
          <textarea className={fieldClass} name="about" maxLength={500} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Starts ({Intl.DateTimeFormat().resolvedOptions().timeZone})
            <input className={fieldClass} type="datetime-local" name="start" required />
          </label>
          <label className="block text-sm font-medium">
            Duration (minutes)
            <input
              className={fieldClass}
              name="duration"
              type="number"
              min="15"
              max="480"
              defaultValue="60"
              required
            />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Spots for guests
          <input
            className={fieldClass}
            type="number"
            name="spots"
            min="1"
            max="30"
            defaultValue="4"
            required
          />
        </label>
        <fieldset className="space-y-3 border-t border-app pt-4">
          <legend className="float-left mb-2 w-full font-semibold">Meeting details</legend>
          <p className="clear-both text-sm text-app-secondary">
            Choose a public place. People nearby see the area. Approved guests get the meeting point and your
            note.
          </p>
          {!!choices.data?.places.length && (
            <label className="block text-sm font-medium">
              Nearby places
              <select
                className={fieldClass}
                value={placeId || ''}
                onChange={(e) => {
                  const selected = choices.data.places.find((p) => p.place_id === e.target.value);
                  if (selected) choose(selected);
                }}
              >
                <option value="">Choose a place or set a pin below</option>
                {choices.data.places.map((p) => (
                  <option key={p.place_id} value={p.place_id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {choices.data?.places.length ? (
            <p className="text-xs text-app-muted">{choices.data.attribution}</p>
          ) : null}
          {point ? (
            <MeetingMap
              center={pin || point}
              value={pin}
              onPick={(pos) => {
                setPin(pos);
                setPlaceId(undefined);
                setError('');
              }}
            />
          ) : (
            <button
              type="button"
              className="text-primary-700"
              onClick={async () => {
                const fix = await refreshGPS();
                if (fix) {
                  setPin({ latitude: fix.latitude, longitude: fix.longitude });
                  setError('');
                } else {
                  setError(
                    'Location is unavailable. Open All plans and choose an area to find a meeting point.',
                  );
                }
              }}
            >
              Use my location to choose a meeting point
            </button>
          )}
          {pin && (
            <p className="flex items-center gap-1 text-sm text-app-secondary">
              <MapPin size={15} />
              Meeting point selected
            </p>
          )}
          <label className="block text-sm font-medium">
            Public place name
            <input
              className={fieldClass}
              value={venue}
              onChange={(e) => {
                setVenue(e.target.value);
                setPlaceId(undefined);
              }}
              maxLength={120}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Meeting address (optional)
            <input
              className={fieldClass}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setPlaceId(undefined);
              }}
              maxLength={300}
            />
          </label>
          <label className="block text-sm font-medium">
            Note for approved guests (optional)
            <textarea className={fieldClass} name="note" maxLength={500} />
          </label>
        </fieldset>
        {(error || post.isError) && (
          <p role="alert" className="text-sm text-red-700">
            {error || post.error?.message}
          </p>
        )}
        <button className={buttonClass} disabled={post.isPending || post.isSuccess}>
          {post.isPending ? 'Posting…' : 'Post plan'}
        </button>
      </form>
    </div>
  );
}
