'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { plans } from '@pantopus/api';
import { fieldClass, usePlansArea } from './PlansWorkspace';

const MeetingMap = dynamic(() => import('./PlansMap').then((m) => m.MeetingMap), { ssr: false });

export default function PlanPublicPlace({ kind }: { kind: plans.Kind }) {
  const { point, refreshGPS } = usePlansArea();
  const [locationError, setLocationError] = useState('');
  const [venue, setVenue] = useState('');
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState<plans.Point | null>(null);
  const [placeId, setPlaceId] = useState<string>();
  const choices = useQuery({
    queryKey: ['plans', 'places', point, kind],
    queryFn: () => plans.places(point!, kind),
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
