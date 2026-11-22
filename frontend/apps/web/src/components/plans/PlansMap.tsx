'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import L from 'leaflet';
import { Marker, useMapEvents } from 'react-leaflet';
import { useQuery } from '@tanstack/react-query';
import { plans } from '@pantopus/api';
import { BaseMap } from '@/components/map/BaseMap';
import { RETINA_TILE_URL } from '@/components/map/constants';
import { useCluster } from '@/components/map/useCluster';
import { initialMapRenderer, MAP_PUBLIC_TOKEN, StandardGlMap } from '@/components/map/mapRenderer';
import type { PulseCamera, PulseMarker } from '@/components/map/mapView';
import { useReducedMotion } from '@/components/scheduling/polish/a11y';
import { detailPath, secondaryClass, usePlansArea } from './PlansWorkspace';

type Pin = plans.Point & Pick<plans.Card, 'id' | 'kind' | 'title'>;
const emptyPins: Pin[] = [];
type MapActions = {
  onPick?: (point: plans.Point) => void;
  onBounds?: (bounds: plans.Bounds, zoom: number) => void;
};

function FlatMapEvents({ onPick }: MapActions) {
  const map = useMapEvents({ click: (e) => onPick?.({ latitude: e.latlng.lat, longitude: e.latlng.lng }) });
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function marker(
  id: string,
  point: plans.Point,
  label: string,
  count: number,
  selected: boolean,
): PulseMarker {
  // Only the numeric count goes into the marker HTML. User titles are plain accessible labels.
  const cls =
    'grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-primary-700 text-sm font-bold text-white shadow-md';
  const badge = selected ? cls + ' ring-4 ring-primary-300' : cls;
  return {
    id,
    lat: point.latitude,
    lng: point.longitude,
    label,
    selected,
    html: '<span class="' + badge + '">' + count + '</span>',
    animCls: '',
    exiting: false,
  };
}

function MapSurface({
  center,
  zoom,
  markers,
  onMarkerClick,
  onPick,
  onBounds,
}: {
  center: plans.Point;
  zoom: number;
  markers: PulseMarker[];
  onMarkerClick: (id: string) => void;
} & MapActions) {
  const [renderer, setRenderer] = useState(initialMapRenderer);
  const flat = useRef<L.Map | null>(null);
  const gl = useRef<PulseCamera | null>(null);
  const previousCenter = useRef(center);
  const reducedMotion = useReducedMotion();
  const fallback = useCallback(() => setRenderer('flat'), []);
  useEffect(() => {
    const previous = previousCenter.current;
    previousCenter.current = center;
    if (previous.latitude !== center.latitude || previous.longitude !== center.longitude) {
      gl.current?.flyTo(center.latitude, center.longitude, zoom, reducedMotion ? 0 : 0.35);
    }
  }, [center, zoom, reducedMotion]);

  if (!MAP_PUBLIC_TOKEN)
    return (
      <div
        className="grid h-full place-items-center rounded-xl bg-surface-muted p-4 text-sm text-app-muted"
        role="status"
      >
        Map imagery is unavailable.{' '}
        {onPick ? 'Choose a nearby place or use your current location.' : 'Browse plans in the list.'}
      </div>
    );

  return (
    <>
      {renderer === '3d' ? (
        <StandardGlMap
          token={MAP_PUBLIC_TOKEN}
          center={[center.latitude, center.longitude]}
          zoom={zoom}
          markers={markers}
          cameraRef={gl}
          reducedMotion={reducedMotion}
          onUnavailable={fallback}
          onView={(v) => onBounds?.(v.bounds, v.zoom)}
          onMarkerClick={onMarkerClick}
          onMapClick={onPick ? (latitude, longitude) => onPick({ latitude, longitude }) : undefined}
        />
      ) : (
        <BaseMap
          center={[center.latitude, center.longitude]}
          zoom={zoom}
          mapRef={flat}
          tileUrl={RETINA_TILE_URL}
          recenterOnChange
          onBoundsChange={onBounds}
        >
          <FlatMapEvents onPick={onPick} />
          {markers.map((m) => (
            <Marker
              key={m.id}
              position={[m.lat, m.lng]}
              alt={m.label}
              title={m.label}
              icon={L.divIcon({ html: m.html, className: '', iconSize: [32, 32], iconAnchor: [16, 16] })}
              eventHandlers={{
                add: (event) => event.target.getElement()?.setAttribute('aria-label', m.label),
                click: () => onMarkerClick(m.id),
              }}
            />
          ))}
        </BaseMap>
      )}
      {onPick && (
        <button
          type="button"
          className={secondaryClass + ' absolute bottom-5 right-2 z-[450]'}
          onClick={() => {
            const current = renderer === '3d' ? gl.current?.getCenter() : flat.current?.getCenter();
            if (current) onPick({ latitude: current.lat, longitude: current.lng });
          }}
        >
          Set pin at map center
        </button>
      )}
    </>
  );
}

export default function PlansMap({
  point,
  time,
  kind,
  selectedId,
}: {
  point: plans.Point;
  time: plans.TimeWindow;
  kind: plans.Kind | '';
  selectedId?: string;
}) {
  const router = useRouter();
  const { host } = usePlansArea();
  const [view, setView] = useState<{ bounds: plans.Bounds; zoom: number } | null>(null);
  const onBounds = useCallback((bounds: plans.Bounds, zoom: number) => setView({ bounds, zoom }), []);
  const box = view?.bounds;
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const pins = useQuery({
    queryKey: ['plans', 'pins', box, time, kind, host],
    queryFn: () => plans.pins(box!, time, kind, host),
    enabled: !!box,
    gcTime: 0,
    refetchOnWindowFocus: 'always',
  });
  // A shared area pin may stand for several plans, even at the closest zoom.
  const groups = useCluster(
    pins.isError ? emptyPins : (pins.data?.markers ?? emptyPins),
    view?.zoom ?? 14,
    box ?? null,
    { maxZoom: 24 },
  );
  const markers = groups.map((group) =>
    marker(
      group.id,
      group,
      group.count === 1 ? group.items[0].title : group.count + ' plans here',
      group.count,
      group.items.some((pin) => pin.id === selectedId),
    ),
  );
  const opened = openGroup && groups.find((group) => group.items.some((pin) => pin.id === openGroup));
  return (
    <div className="relative h-full" aria-label="Nearby plans map">
      <MapSurface
        center={point}
        zoom={14}
        markers={markers}
        onBounds={onBounds}
        onMarkerClick={(key) => {
          const group = groups.find((g) => g.id === key);
          if (!group) return;
          if (group.count === 1) {
            setOpenGroup(null);
            router.push(detailPath(group.items[0].id));
          } else setOpenGroup(group.items[0].id);
        }}
      />
      {opened && (
        <div className="absolute inset-x-3 bottom-5 z-[450] max-h-40 overflow-y-auto rounded-xl border border-app bg-surface p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <strong>Plans here</strong>
            <button aria-label="Close plans here" onClick={() => setOpenGroup(null)}>
              Close
            </button>
          </div>
          {opened.items.map((pin) => (
            <Link
              className="block py-1 text-primary-700"
              href={detailPath(pin.id)}
              key={pin.id}
              onClick={() => setOpenGroup(null)}
            >
              {pin.title}
            </Link>
          ))}
        </div>
      )}
      {pins.isError && (
        <button
          className={secondaryClass + ' absolute left-3 top-3 z-[450]'}
          onClick={() => void pins.refetch()}
        >
          Retry map pins
        </button>
      )}
    </div>
  );
}

export function MeetingMap({
  center,
  value,
  onPick,
}: {
  center: plans.Point;
  value: plans.Point | null;
  onPick: (point: plans.Point) => void;
}) {
  const { refreshGPS } = usePlansArea();
  const [locationError, setLocationError] = useState(false);
  return (
    <div className="space-y-2">
      <div
        className="relative h-52 overflow-hidden rounded-xl border border-app"
        aria-label="Meeting point map"
      >
        <MapSurface
          center={center}
          zoom={16}
          markers={value ? [marker('meeting', value, 'Meeting point', 1, true)] : []}
          onMarkerClick={() => {}}
          onPick={onPick}
        />
      </div>
      <button
        type="button"
        className={secondaryClass}
        onClick={async () => {
          const fix = await refreshGPS();
          setLocationError(!fix);
          if (fix) onPick({ latitude: fix.latitude, longitude: fix.longitude });
        }}
      >
        Use my current location
      </button>
      {locationError && (
        <p role="alert" className="text-sm text-app-muted">
          Allow location access or choose a nearby place.
        </p>
      )}
    </div>
  );
}
