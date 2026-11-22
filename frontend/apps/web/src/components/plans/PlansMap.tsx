'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import L from 'leaflet';
import { Marker, useMapEvents, ZoomControl } from 'react-leaflet';
import { ChevronRight, Map as MapIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { plans } from '@pantopus/api';
import { BaseMap } from '@/components/map/BaseMap';
import { RETINA_TILE_URL } from '@/components/map/constants';
import { useCluster } from '@/components/map/useCluster';
import { initialMapRenderer, MAP_PUBLIC_TOKEN, StandardGlMap } from '@/components/map/mapRenderer';
import type { PulseCamera, PulseMarker } from '@/components/map/mapView';
import { useReducedMotion } from '@/components/scheduling/polish/a11y';
import BottomSheet from '@/components/ui/BottomSheet';
import { kindColors, KindGlyph } from './planKind';
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
  content: string,
  selected: boolean,
): PulseMarker {
  return {
    id,
    lat: point.latitude,
    lng: point.longitude,
    label,
    selected,
    html: `<span class="plans-pin${selected ? ' plans-pin-selected' : ''}">${content}</span>`,
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
  onShowList,
}: {
  center: plans.Point;
  zoom: number;
  markers: PulseMarker[];
  onMarkerClick: (id: string) => void;
  onShowList?: () => void;
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
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface-muted p-4 text-center text-sm text-app-secondary">
        <MapIcon size={28} aria-hidden />
        <p role="status">Map imagery is unavailable.</p>
        {onPick && <p>Choose a nearby place or use your current location.</p>}
        {onShowList && (
          <button className={secondaryClass} onClick={onShowList}>
            Browse plans in the list
          </button>
        )}
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
          showZoomControls={!onPick}
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
          {!onPick && <ZoomControl position="topright" />}
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
  onShowList,
}: {
  point: plans.Point;
  time: plans.TimeWindow;
  kind: plans.Kind | '';
  selectedId?: string;
  onShowList?: () => void;
}) {
  const router = useRouter();
  const { host } = usePlansArea();
  const glyphPrefix = useId();
  const [view, setView] = useState<{ bounds: plans.Bounds; zoom: number } | null>(null);
  // The shell animates its width. Read pins for the settled map, once per resize.
  const boundsTimer = useRef<number | undefined>(undefined);
  const onBounds = useCallback((bounds: plans.Bounds, zoom: number) => {
    window.clearTimeout(boundsTimer.current);
    boundsTimer.current = window.setTimeout(() => setView({ bounds, zoom }), 150);
  }, []);
  useEffect(() => () => window.clearTimeout(boundsTimer.current), []);
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
  const markers = groups.map((group) => {
    const pin = group.items[0];
    const kind = Object.hasOwn(plans.kindNames, pin.kind) ? pin.kind : 'something_else';
    // Only a known glyph reference or a numeric count enters the marker's HTML.
    const content =
      group.count === 1
        ? `<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><use href="#${glyphPrefix}-${kind}"/></svg>`
        : String(group.count);
    return marker(
      group.id,
      group,
      group.count === 1 ? pin.title : group.count + ' plans here',
      content,
      group.items.some((item) => item.id === selectedId),
    );
  });
  const opened = openGroup && groups.find((group) => group.items.some((pin) => pin.id === openGroup));
  return (
    <div className="plans-map relative h-full" role="region" aria-label="Nearby plans map">
      <svg width="0" height="0" className="pointer-events-none absolute" aria-hidden="true">
        <defs>
          {Object.keys(plans.kindNames).map((kind) => (
            <g key={kind} id={glyphPrefix + '-' + kind} style={kindColors(kind)}>
              <circle cx="14" cy="14" r="14" fill="var(--plan-cs)" />
              <g transform="translate(5 5)" color="var(--plan-c)">
                <KindGlyph kind={kind} className="h-[18px] w-[18px]" />
              </g>
            </g>
          ))}
        </defs>
      </svg>
      <MapSurface
        center={point}
        zoom={14}
        markers={markers}
        onBounds={onBounds}
        onShowList={onShowList}
        onMarkerClick={(key) => {
          const group = groups.find((g) => g.id === key);
          if (!group) return;
          if (group.count === 1) {
            setOpenGroup(null);
            router.push(detailPath(group.items[0].id));
          } else setOpenGroup(group.items[0].id);
        }}
      />
      <BottomSheet
        open={!!opened}
        onClose={() => setOpenGroup(null)}
        title="Plans here"
        className="flex max-h-dvh flex-col"
      >
        {opened && (
          <ul className="divide-y divide-app">
            {opened.items.map((pin) => (
              <li key={pin.id}>
                <Link
                  className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 font-medium text-app hover-bg-app"
                  href={detailPath(pin.id)}
                  onClick={() => setOpenGroup(null)}
                >
                  <span
                    style={kindColors(pin.kind)}
                    className="rounded-lg bg-[var(--plan-cs)] p-2 text-[var(--plan-c)]"
                  >
                    <KindGlyph kind={pin.kind} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 break-words">{pin.title}</span>
                  <ChevronRight size={16} className="shrink-0 text-app-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </BottomSheet>
      {pins.isError ? (
        <button className={'plans-map-feedback ' + secondaryClass} onClick={() => void pins.refetch()}>
          Retry map pins
        </button>
      ) : (
        onShowList &&
        pins.isSuccess &&
        groups.length === 0 && (
          <p
            className="plans-map-feedback plans-map-empty plans-surface rounded-full px-3 py-1 text-xs font-medium text-app-secondary"
            role="status"
          >
            No plans in this view
          </p>
        )
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
          markers={
            value
              ? [marker('meeting', value, 'Meeting point', '<span class="plans-pin-dot"></span>', true)]
              : []
          }
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
