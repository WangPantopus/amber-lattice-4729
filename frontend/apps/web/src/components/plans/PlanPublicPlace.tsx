'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { plans } from '@pantopus/api';
import { readKindDetails } from './PlanKindFields';
import { readTimes } from './PlanScheduleFields';
import { fieldClass, secondaryClass, usePlansArea } from './PlansWorkspace';

const MeetingMap = dynamic(() => import('./PlansMap').then((m) => m.MeetingMap), { ssr: false });

export default function PlanPublicPlace({
  kind,
  previous,
}: {
  kind: plans.Kind;
  previous?: plans.Detail['place'];
}) {
  const { point, refreshGPS } = usePlansArea();
  const [locationError, setLocationError] = useState('');
  const [venue, setVenue] = useState(previous?.name || '');
  const [address, setAddress] = useState(previous?.address || '');
  const [pin, setPin] = useState<plans.Point | null>(
    previous?.latitude != null && previous.longitude != null
      ? { latitude: previous.latitude, longitude: previous.longitude }
      : null,
  );
  const [placeId, setPlaceId] = useState<string>();
  const [search, setSearch] = useState('');
  const suggestions = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      const times = data.get('start') ? readTimes(data)[0] : {};
      return plans.suggestPlaces(
        point!,
        kind,
        {
          ...times,
          title: String(data.get('title') || ''),
          about: String(data.get('about') || ''),
          spots: Number(data.get('spots')),
          details: readKindDetails(kind, data),
        },
        search,
      );
    },
  });
  const choices = useQuery({
    queryKey: ['plans', 'places', point, kind, search],
    queryFn: () => plans.places(point!, kind, search),
    enabled: !!point,
    refetchInterval: (q) => (q.state.data?.loading && q.state.dataUpdateCount < 6 ? 4_000 : false),
  });
  function choose(place: plans.PublicPlace) {
    setPin({ latitude: place.latitude, longitude: place.longitude });
    setVenue(place.name);
    setAddress(place.address || '');
    setPlaceId(place.place_id);
  }
  return (
    <>
      <input type="hidden" name="latitude" value={pin?.latitude ?? ''} />
      <input type="hidden" name="longitude" value={pin?.longitude ?? ''} />
      <input type="hidden" name="placeId" value={placeId ?? ''} />
      {point && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Find a public place
            <input
              className={fieldClass}
              value={search}
              maxLength={100}
              onChange={(e) => {
                setSearch(e.target.value);
                suggestions.reset();
              }}
            />
          </label>
          <button
            type="button"
            className={secondaryClass}
            disabled={suggestions.isPending}
            onClick={(e) => {
              if (e.currentTarget.form) suggestions.mutate(e.currentTarget.form);
            }}
          >
            {suggestions.isPending
              ? 'Finding places…'
              : search
                ? 'Ask Pantopus about these places'
                : 'Suggest places'}
          </button>
          {suggestions.isError && <p role="alert">{suggestions.error.message}</p>}
          {suggestions.data && (
            <div className="space-y-2" role="status">
              {suggestions.data.loading
                ? 'Gathering nearby places. Try again in a moment.'
                : !suggestions.data.picks.length
                  ? 'No matching public places.'
                  : null}
              {suggestions.data.picks.map((place) => (
                <button
                  key={place.place_id}
                  type="button"
                  className="block text-left text-sm text-primary-700"
                  onClick={() => choose(place)}
                >
                  <strong>{place.name}</strong> · {place.why}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
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
              setPlaceId(undefined);
            } else {
              setLocationError(
                'Location is unavailable. Choose an area in All plans to set a meeting point.',
              );
            }
          }}
        >
          Use my current location
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
          name="placeName"
          required
        />
      </label>
      <label className="block text-sm font-medium">
        Meeting address (optional)
        <input
          className={fieldClass}
          name="placeAddress"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setPlaceId(undefined);
          }}
          maxLength={300}
        />
      </label>
      {locationError && !pin && <p role="alert">{locationError}</p>}
    </>
  );
}
