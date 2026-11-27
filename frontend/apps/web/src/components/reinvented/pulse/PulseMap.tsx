'use client';

// The live map behind the one Pulse list (phase 1, board B1). It draws what the list has loaded, at the point everyone
// sees: a ring is a Moment, a mark on the ground is a post that stays, and a Heads-up is red, pulsing and on top. The
// full map (its own read for the box and time, tickets, the time row, the peek deck) is the next step.
// Leaflet touches `window` at import: this file is loaded with next/dynamic and `ssr: false` only.

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import '@/components/map/leaflet-setup';
import { MAP_PUBLIC_TOKEN, RETINA_TILE_URL, TILE_ATTRIBUTION } from '@/components/map/constants';
import { createCachedTileLayer } from '@/components/map/CachedTileLayer';
import { isLiveHere, type ListItem, type Point } from './listApi';

export interface FlyTarget extends Point {
  serial: number;
}

interface Props {
  items: ListItem[];
  /** Changes when the list is read afresh (reach, chip, place): the map fits the new items once. */
  fitKey: string;
  /** Where to look when nothing in the list has a point: the person's home, else the whole country. */
  fallback: Point | null;
  /** The share of the map's height the list covers at its bottom, so a fit keeps the marks in the part one sees. */
  coveredBelow: number;
  flyTo: FlyTarget | null;
  onOpenMoment(id: string): void;
  onOpenPost(id: string): void;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** The point everyone sees, as the list sent it; null for a Moment with no place. */
export function itemPoint(item: ListItem): Point | null {
  if (item.type === 'moment') {
    const m = item.moment;
    if (m.no_location) return null;
    const lat = num(m.latitude), lng = num(m.longitude);
    return lat === null || lng === null ? null : { latitude: lat, longitude: lng };
  }
  const p = item.post as unknown as Record<string, unknown>;
  const lat = num(p.effective_latitude) ?? num(p.latitude), lng = num(p.effective_longitude) ?? num(p.longitude);
  return lat === null || lng === null ? null : { latitude: lat, longitude: lng };
}

function ringIcon(item: Extract<ListItem, { type: 'moment' }>, now: number): L.DivIcon {
  const m = item.moment;
  const el = document.createElement('span');
  el.className = 'rp-ring' + (isLiveHere(m, now) ? ' rp-ring-live' : '');
  const inner = document.createElement('span');
  inner.className = 'rp-ring-face';
  if (m.author.avatar_url) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = m.author.avatar_url;
    img.onerror = () => {
      img.remove();
      inner.textContent = m.author.initials || '';
    };
    inner.appendChild(img);
  } else inner.textContent = m.author.initials || '';
  el.appendChild(inner);
  return L.divIcon({ html: el, className: 'rp-leaflet-icon', iconSize: [44, 44], iconAnchor: [22, 22] });
}

function markIcon(item: Extract<ListItem, { type: 'post' }>): L.DivIcon {
  const el = document.createElement('span');
  const headsUp = item.post.post_type === 'alert';
  el.className = 'rp-mark' + (headsUp ? ' rp-mark-heads-up' : '');
  el.dataset.kind = String(item.post.post_type || 'general');
  el.textContent = headsUp ? '!' : '';
  const size = headsUp ? 34 : 18;
  return L.divIcon({ html: el, className: 'rp-leaflet-icon', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

export default function PulseMap({ items, fitKey, fallback, coveredBelow, flyTo, onOpenMoment, onOpenPost }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fitted = useRef<string | null>(null);
  const latest = useRef({ onOpenMoment, onOpenPost, coveredBelow });
  latest.current = { onOpenMoment, onOpenPost, coveredBelow };
  const [tilesMissing, setTilesMissing] = useState(!MAP_PUBLIC_TOKEN);

  useEffect(() => {
    if (!ref.current) return undefined;
    const map = L.map(ref.current, { zoomControl: false, minZoom: 2, maxZoom: 19, worldCopyJump: true }).setView(
      [39.5, -98.35],
      4,
    );
    if (MAP_PUBLIC_TOKEN)
      createCachedTileLayer(RETINA_TILE_URL, TILE_ATTRIBUTION)
        .on('tileerror', () => setTilesMissing(true))
        .on('tileload', () => setTilesMissing(false))
        .addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(ref.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // The marks: Heads-ups last, so they sit on top.
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const now = Date.now();
    const points: L.LatLngExpression[] = [];
    const ordered = [...items].sort((a, b) => Number(a.type === 'post' && a.post.post_type === 'alert') - Number(b.type === 'post' && b.post.post_type === 'alert'));
    for (const item of ordered) {
      const point = itemPoint(item);
      if (!point) continue;
      points.push([point.latitude, point.longitude]);
      const headsUp = item.type === 'post' && item.post.post_type === 'alert';
      const marker = L.marker([point.latitude, point.longitude], {
        icon: item.type === 'moment' ? ringIcon(item, now) : markIcon(item),
        zIndexOffset: headsUp ? 2000 : item.type === 'moment' ? 1000 : 0,
        keyboard: true,
        title: item.type === 'moment' ? `${item.moment.author.name}’s Moment` : item.post.title || 'Post',
      });
      marker.on('click', () => (item.type === 'moment' ? latest.current.onOpenMoment(item.id) : latest.current.onOpenPost(item.id)));
      marker.addTo(layer);
    }
    if (fitted.current === fitKey) return;
    if (points.length) {
      fitted.current = fitKey;
      const height = map.getSize().y;
      map.fitBounds(L.latLngBounds(points), {
        maxZoom: 14,
        paddingTopLeft: [40, 40],
        paddingBottomRight: [40, 40 + Math.round(height * latest.current.coveredBelow)],
        animate: false,
      });
    } else if (fallback) {
      fitted.current = fitKey;
      map.setView([fallback.latitude, fallback.longitude], 12, { animate: false });
    }
  }, [items, fitKey, fallback]);

  useEffect(() => {
    const map = mapRef.current;
    if (!flyTo || !map) return;
    // Centre the place in the part of the map the list leaves open.
    const zoom = Math.max(map.getZoom(), 15);
    const at = map.project([flyTo.latitude, flyTo.longitude], zoom).add([0, (map.getSize().y * latest.current.coveredBelow) / 2]);
    map.flyTo(map.unproject(at, zoom), zoom, { duration: 0.6 });
  }, [flyTo]);

  return (
    <div className="rp-map" aria-label="Map of what the list shows">
      <div ref={ref} className="rp-leaflet" role="application" aria-label="Map" />
      {tilesMissing && <p className="rp-map-note">Map pictures can’t load here</p>}
    </div>
  );
}
