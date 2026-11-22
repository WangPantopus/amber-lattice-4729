'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import '@/components/map/leaflet-setup';
import type { Point } from '@pantopus/api/endpoints/moments';
import { TILE_URL, TILE_ATTRIBUTION } from '@/components/map/constants';

export default function MomentPlacePreview({ point, radius }: { point: Point; radius?: number }) {
  const ref = useRef<HTMLDivElement>(null);
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
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    L.tileLayer(token ? TILE_URL : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: token
        ? TILE_ATTRIBUTION
        : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
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
    <div
      className="mo-post-map"
      ref={ref}
      role="img"
      aria-label={radius ? 'Area shown to viewers' : 'Pin shown to viewers'}
    />
  );
}
