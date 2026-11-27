'use client';

// The map a guess is dropped on (Pulse, reinvented, step 8; coord/CONTRACT.md §5c). Loaded only when the reader opens
// it: Leaflet needs a window.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import '@/components/map/leaflet-setup';
import { MapPin, X } from 'lucide-react';
import { post } from '@pantopus/api/client';
import type { Box, Moment } from '@pantopus/api/endpoints/moments';
import { MAP_PUBLIC_TOKEN, RETINA_TILE_URL, TILE_ATTRIBUTION } from '@/components/map/constants';
import { createCachedTileLayer } from '@/components/map/CachedTileLayer';
import { useDialogFocusTrap } from '@/lib/useDialogFocusTrap';
import { messageOf } from '@/components/moments/momentState';
import { isSwitchedOff, useRereadSwitch } from '../switchOff';
import { isRouteGone, markServerBehind } from '../serverBehind';
import './guess.css';

/** Where the guess map opens: where the reader's Moments map was last, else a wide view. */
function lastView(client: ReturnType<typeof useQueryClient>, account: string): { center: L.LatLngTuple; zoom: number } {
  const last = client
    .getQueryCache()
    .findAll({ queryKey: ['moments', 'map', account] })
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0];
  const box = last?.queryKey[3] as Box | undefined;
  if (!box || !(box.north > box.south)) return { center: [39.5, -98.35], zoom: 4 };
  return { center: [(box.north + box.south) / 2, (box.east + box.west) / 2], zoom: Math.max(3, Math.min(15, box.zoom)) };
}

/** The map to drop a pin on. */
export default function GuessMap({
  moment,
  account,
  container,
  onClose,
}: {
  moment: Moment;
  account: string;
  container: Element;
  onClose(): void;
}) {
  const client = useQueryClient();
  const reread = useRereadSwitch();
  const ref = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [tileError, setTileError] = useState(!MAP_PUBLIC_TOKEN);
  const trap = useDialogFocusTrap<HTMLDivElement>(() => {
    if (!busy) onClose();
  });
  useEffect(() => {
    if (!ref.current) return;
    const view = lastView(client, account);
    const map = L.map(ref.current, { zoomControl: true }).setView(view.center, view.zoom);
    if (MAP_PUBLIC_TOKEN)
      createCachedTileLayer(RETINA_TILE_URL, TILE_ATTRIBUTION)
        .on('tileerror', () => setTileError(true))
        .on('tileload', () => setTileError(false))
        .addTo(map);
    let marker: L.CircleMarker | null = null;
    map.on('click', (e: L.LeafletMouseEvent) => {
      const at = e.latlng.wrap();
      if (marker) marker.setLatLng(at);
      else
        marker = L.circleMarker(at, { radius: 9, color: '#fff', weight: 3, fillColor: '#c81e1e', fillOpacity: 1 }).addTo(map);
      setPin({ lat: at.lat, lng: at.lng });
    });
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(ref.current);
    return () => {
      resize.disconnect();
      map.remove();
    };
  }, [client, account]);
  async function send() {
    if (!pin || busy) return;
    setBusy(true);
    setError('');
    try {
      const answer = await post<{ guess: { distance_m: number; label: string }; moment: Moment }>(
        `/api/moments/${encodeURIComponent(moment.id)}/guess`,
        { latitude: pin.lat, longitude: pin.lng },
      );
      client.setQueryData<{ moment: Moment }>(['moments', 'watch', account, moment.id], (old) =>
        old ? { ...old, moment: answer.moment } : old,
      );
      void client.invalidateQueries({ queryKey: ['moments', 'map', account] });
      onClose();
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (isSwitchedOff(e)) {
        void reread();
        onClose();
      } else if (code === 'MOMENT_ENDED' || code === 'MOMENT_NOT_FOUND') {
        void client.invalidateQueries({ queryKey: ['moments', 'watch', account, moment.id] });
        onClose();
      } else if (isRouteGone(e)) {
        // A server older than this website: today's screens until it catches up.
        markServerBehind();
        onClose();
      } else setError(messageOf(e, 'Couldn’t send your guess. Try again.'));
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <div
      ref={trap}
      className="gs-map"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gs-title"
      // Drawn from inside the viewer's picture: its taps and holds stay here, never stepping or pausing the viewer.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerCancel={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <header>
        <button type="button" className="gs-round" aria-label="Close without guessing" disabled={busy} onClick={() => onClose()}>
          <X size={20} strokeWidth={2.4} />
        </button>
        <h2 id="gs-title">Drop a pin where you think it was taken</h2>
      </header>
      <div className="gs-leaflet" ref={ref} role="application" aria-label="Map: click to drop your pin" />
      {tileError && (
        <span className="gs-tiles" role="status">
          Map tiles unavailable
        </span>
      )}
      <footer>
        {error && (
          <p role="alert" className="gs-error">
            {error}
          </p>
        )}
        <button type="button" className="gs-send" disabled={!pin || busy} onClick={() => void send()}>
          <MapPin size={18} aria-hidden="true" />
          {busy ? 'Guessing…' : pin ? 'Guess here' : 'Tap the map to drop your pin'}
        </button>
      </footer>
    </div>,
    container,
  );
}
