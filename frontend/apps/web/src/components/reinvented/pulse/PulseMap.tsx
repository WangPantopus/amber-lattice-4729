'use client';

// The one map behind the Pulse list (phase 1, board B4, flat). It draws its own read for the box in view and the time
// row's choice (GET /api/reinvented/map, coord/CONTRACT.md §6b), each at the point everyone sees: a ring is a Moment,
// a mark on the ground is a post that stays, a ticket is a plan, and a Heads-up is red, pulsing and always on top.
// Before its first read it fits the list's first page, so one request still draws the first screen.
// Leaflet touches `window` at import: this file is loaded with next/dynamic and `ssr: false` only.

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import '@/components/map/leaflet-setup';
import { MAP_PUBLIC_TOKEN, RETINA_TILE_URL, TILE_ATTRIBUTION } from '@/components/map/constants';
import { createCachedTileLayer } from '@/components/map/CachedTileLayer';
import { colors } from '@/components/moments/momentState';
import { ticketWhen, type Box, type ListItem, type Point } from './listApi';
import type { Pin } from './pins';

export interface FlyTarget extends Point {
  serial: number;
  /** Pan without zooming in (the peek deck gliding from pin to pin). */
  keepZoom?: boolean;
}

interface Props {
  pins: Pin[];
  /** The list's first page, for the map's first view only. */
  listItems: ListItem[];
  /** Changes when the list is read afresh (reach, chip, place): the map fits the list once more. */
  fitKey: string;
  /** Where to look when nothing in the list has a point: the person's home. */
  fallback: Point | null;
  /** Changes when the list's height or the layout changes: the map keeps what was in view centred in the part left open. */
  layoutKey: string;
  flyTo: FlyTarget | null;
  selected: string | null;
  onBox(box: Box): void;
  onPick(key: string): void;
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

const TICKET_PATH = 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z';

function pinElement(pin: Pin, now: number): { el: HTMLElement; size: [number, number] | null } {
  if (pin.type === 'ring') {
    const r = pin.ring;
    const el = document.createElement('span');
    const live = Date.parse(r.live_until || '') > now;
    el.className = 'rp-ring' + (live ? ' rp-ring-live' : r.unseen_count > 0 ? '' : ' rp-ring-seen');
    const inner = document.createElement('span');
    inner.className = 'rp-ring-face';
    if (r.author.avatar_url) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = r.author.avatar_url;
      img.onerror = () => {
        img.remove();
        inner.textContent = r.author.initials || '';
      };
      inner.appendChild(img);
    } else inner.textContent = r.author.initials || '';
    el.appendChild(inner);
    if (live) {
      const tag = document.createElement('span');
      tag.className = 'rp-ring-tag';
      tag.textContent = 'Live';
      el.appendChild(tag);
    }
    return { el, size: [44, 44] };
  }
  if (pin.type === 'kept' || pin.type === 'explore') {
    const m = pin.moment;
    const el = document.createElement('span');
    el.className = 'rp-ring rp-ring-kept';
    const inner = document.createElement('span');
    inner.className = 'rp-ring-face';
    const src = m.kind === 'video' ? m.poster_url : m.kind === 'photo' ? m.media_url : null;
    if (src) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = src;
      inner.appendChild(img);
    } else inner.style.background = colors[m.background || 'teal'];
    el.appendChild(inner);
    return { el, size: [44, 44] };
  }
  if (pin.type === 'mark') {
    const el = document.createElement('span');
    const headsUp = pin.mark.heads_up;
    el.className = 'rp-mark' + (headsUp ? ' rp-mark-heads-up' : '');
    el.dataset.kind = String(pin.mark.post.post_type || 'general');
    el.textContent = headsUp ? '!' : '';
    return { el, size: headsUp ? [34, 34] : [18, 18] };
  }
  const t = pin.ticket;
  const el = document.createElement('span');
  el.className = 'rp-ticket';
  el.innerHTML = `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${TICKET_PATH}"/></svg>`;
  const words = document.createElement('span');
  const going = t.going_count ? ` · ${t.going_count} going` : '';
  words.textContent = `${ticketWhen(t, now)}${going}`;
  el.appendChild(words);
  return { el, size: null };
}

function pinTitle(pin: Pin): string {
  if (pin.type === 'kept') return 'Your Moment';
  if (pin.type === 'explore') return `${pin.moment.author.name}’s Moment`;
  if (pin.type === 'ring') return `${pin.ring.author.name}’s Moments`;
  if (pin.type === 'mark') return pin.mark.heads_up ? 'Heads-up' : pin.mark.post.title || 'Post';
  return `Plan: ${pin.ticket.title}`;
}

/** How far the controls over the top of the map and the list over its bottom reach into it, in pixels. */
function coveredInsets(mapEl: HTMLElement | null): { top: number; bottom: number } {
  const board = mapEl?.closest('.rp-board');
  if (!mapEl || !board) return { top: 0, bottom: 0 };
  const m = mapEl.getBoundingClientRect();
  const overlaps = (r: DOMRect) => r.width > 0 && r.left < m.right - 1 && r.right > m.left + 1;
  let top = 0, bottom = 0;
  const above = board.querySelector('.rp-map-top');
  if (above) {
    const r = above.getBoundingClientRect();
    if (overlaps(r)) top = Math.max(0, Math.min(m.height, r.bottom - m.top));
  }
  const sheet = board.querySelector('.rp-sheet');
  if (sheet) {
    const r = sheet.getBoundingClientRect();
    if (overlaps(r) && r.top < m.bottom) bottom = Math.max(0, Math.min(m.height, m.bottom - r.top));
  }
  return { top, bottom };
}

export default function PulseMap({ pins, listItems, fitKey, fallback, layoutKey, flyTo, selected, onBox, onPick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const fitted = useRef<string | null>(null);
  const latest = useRef({ onPick, onBox, selected });
  latest.current = { onPick, onBox, selected };
  const insets = useRef({ top: 0, bottom: 0 });
  const [tilesMissing, setTilesMissing] = useState(!MAP_PUBLIC_TOKEN);

  useEffect(() => {
    if (!ref.current) return undefined;
    const map = L.map(ref.current, { zoomControl: false, minZoom: 2, maxZoom: 19, worldCopyJump: true }).setView([39.5, -98.35], 4);
    if (MAP_PUBLIC_TOKEN)
      createCachedTileLayer(RETINA_TILE_URL, TILE_ATTRIBUTION)
        .on('tileerror', () => setTilesMissing(true))
        .on('tileload', () => setTilesMissing(false))
        .addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // The box in view, once the map has its first view; the map reads it again after each move.
    let timer = 0;
    map.on('moveend', () => {
      if (!fitted.current) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const b = map.getBounds();
        latest.current.onBox({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
      }, 250);
    });
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(ref.current);
    return () => {
      window.clearTimeout(timer);
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // The first view: the list's points (or home), once per fresh list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitted.current === fitKey) return;
    const points = listItems.map(itemPoint).filter((p): p is Point => !!p);
    if (!points.length && !fallback && !listItems.length) return;
    fitted.current = fitKey;
    const cover = (insets.current = coveredInsets(ref.current));
    if (points.length) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as L.LatLngTuple)), {
        maxZoom: 14,
        paddingTopLeft: [40, 40 + Math.round(cover.top)],
        paddingBottomRight: [40, 40 + Math.round(cover.bottom)],
        animate: false,
      });
    } else if (fallback) {
      map.setView([fallback.latitude, fallback.longitude], 12, { animate: false });
      map.panBy([0, (cover.bottom - cover.top) / 2], { animate: false });
    }
    map.fire('moveend');
  }, [listItems, fitKey, fallback]);

  // The pins: tickets under marks under rings, and Heads-ups over everything.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    elements.current.clear();
    const now = Date.now();
    for (const pin of pins) {
      const { el, size } = pinElement(pin, now);
      el.dataset.pin = pin.key;
      if (pin.key === latest.current.selected) el.classList.add('rp-pin-selected');
      elements.current.set(pin.key, el);
      const headsUp = pin.type === 'mark' && pin.mark.heads_up;
      const marker = L.marker([pin.point.latitude, pin.point.longitude], {
        icon: L.divIcon({
          html: el,
          className: 'rp-leaflet-icon' + (size ? '' : ' rp-leaflet-free'),
          iconSize: size ?? undefined,
          iconAnchor: size ? [size[0] / 2, size[1] / 2] : undefined,
        }),
        zIndexOffset: headsUp ? 3000 : pin.type === 'ring' || pin.type === 'kept' || pin.type === 'explore' ? 2000 : pin.type === 'mark' ? 1000 : 0,
        keyboard: true,
        title: pinTitle(pin),
      });
      marker.on('click', () => latest.current.onPick(pin.key));
      marker.addTo(layer);
    }
  }, [pins]);

  useEffect(() => {
    elements.current.forEach((el, key) => el.classList.toggle('rp-pin-selected', key === selected));
  }, [selected]);

  // The list moved to another height (or the window to another layout): what was in the middle of the open part of the
  // map stays in the middle of the open part, once the list has finished moving.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const map = mapRef.current;
      if (!map || !fitted.current) return;
      const before = insets.current, after = coveredInsets(ref.current);
      insets.current = after;
      const dy = (after.bottom - after.top - (before.bottom - before.top)) / 2;
      if (Math.abs(dy) > 2) map.panBy([0, dy], { animate: false });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [layoutKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!flyTo || !map) return;
    // Centre the place in the part of the map left open.
    const cover = coveredInsets(ref.current);
    const zoom = flyTo.keepZoom ? map.getZoom() : Math.max(map.getZoom(), 15);
    const at = map.project([flyTo.latitude, flyTo.longitude], zoom).add([0, (cover.bottom - cover.top) / 2]);
    if (flyTo.keepZoom) map.panTo(map.unproject(at, zoom), { duration: 0.45 });
    else map.flyTo(map.unproject(at, zoom), zoom, { duration: 0.6 });
  }, [flyTo]);

  return (
    <div className="rp-map" aria-label="Map">
      <div ref={ref} className="rp-leaflet" role="application" aria-label="Map" />
      {tilesMissing && <p className="rp-map-note">Map pictures can’t load here</p>}
    </div>
  );
}
