'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import '@/components/map/leaflet-setup';
import type { Point } from '@pantopus/api/endpoints/moments';
import { MAP_PUBLIC_TOKEN, RETINA_TILE_URL, TILE_ATTRIBUTION } from '@/components/map/constants';
import { createCachedTileLayer } from '@/components/map/CachedTileLayer';

export default function MomentPlacePreview({ point, radius }: { point: Point; radius?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(!MAP_PUBLIC_TOKEN);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, {
      zoomControl: false,
      dragging: false,
      keyboard: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
    });
    const here: L.LatLngTuple = [point.latitude, point.longitude];
    map.setView(here, radius ? 13 : 15);
    if (MAP_PUBLIC_TOKEN) {
      createCachedTileLayer(RETINA_TILE_URL, TILE_ATTRIBUTION)
        .on('tileerror', () => setTileError(true))
        .on('tileload', () => setTileError(false))
        .addTo(map);
    }
    if (radius) {
      const area = L.circle(here, { radius, color: '#117d83', weight: 2, fillOpacity: 0.18 }).addTo(map);
      map.fitBounds(area.getBounds(), { padding: [12, 12], maxZoom: 15 });
    } else
      L.circleMarker(here, {
        radius: 7,
        color: '#fff',
        weight: 3,
        fillColor: '#087e81',
        fillOpacity: 1,
      }).addTo(map);
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(ref.current);
    return () => {
      resize.disconnect();
      map.remove();
    };
  }, [point.latitude, point.longitude, radius]);
  return (
    <div className="relative">
      <div
        className="mo-post-map"
        ref={ref}
        role="img"
        aria-label={radius ? 'Area shown to viewers' : 'Pin shown to viewers'}
      />
      {tileError && (
        <span className="mo-tile-note" role="status">
          Map preview unavailable
        </span>
      )}
    </div>
  );
}
