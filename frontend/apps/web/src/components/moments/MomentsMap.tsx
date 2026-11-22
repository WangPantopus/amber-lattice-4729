'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import L from 'leaflet';
import '@/components/map/leaflet-setup';
import {
  MAP_PUBLIC_TOKEN,
  MAPBOX_STANDARD,
  MAP_STYLE_TIMEOUT_MS,
  RETINA_TILE_URL,
  TILE_ATTRIBUTION,
} from '@/components/map/constants';
import { createCachedTileLayer } from '@/components/map/CachedTileLayer';
import { clusterMarkers } from '@/components/map/clustering';
import { LocateFixed, Maximize2, Minimize2, Minus, Plane, Plus } from 'lucide-react';
import type { Box, Point, Ring, MapResult } from '@pantopus/api/endpoints/moments';
import { heightColor } from './momentState';
import { MomentFace, PinFace } from './MomentFace';

export interface MapTarget extends Point {
  zoom: number;
  serial: number;
}
interface Camera {
  project(p: Point): { x: number; y: number } | null;
  move(p: MapTarget): void;
  zoomBy(delta: number): void;
  bounds(): Box;
}
interface Props {
  onGesture(): void;
  target: MapTarget;
  rings: Ring[];
  focused: string[];
  elevation: boolean;
  float: boolean;
  sun?: MapResult['sun'];
  onBounds(box: Box): void;
  onOpen(ring: Ring, opener: HTMLButtonElement): void;
  onCluster(rings: Ring[], point: Point, zoom: number): void;
  onLocate(): void;
  fullWindow: boolean;
  onToggleFullWindow(): void;
}
const hasPoint = (r: Ring): r is Ring & Point => Number.isFinite(r.latitude) && Number.isFinite(r.longitude);

export default function MomentsMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [frame, setFrame] = useState({ zoom: props.target.zoom, serial: 0 });
  const [flat, setFlat] = useState(!MAP_PUBLIC_TOKEN);
  const [tileError, setTileError] = useState(!MAP_PUBLIC_TOKEN);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let active = true;
    const gesture = () => latest.current.onGesture();
    el.addEventListener('wheel', gesture, { passive: true });
    el.addEventListener('pointerdown', gesture, { passive: true });
    let raf = 0;
    let timer: ReturnType<typeof setTimeout>;
    const draw = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (active && camera.current)
          setFrame((prev) => ({ zoom: camera.current!.bounds().zoom, serial: prev.serial + 1 }));
      });
    };
    const settled = () => {
      draw();
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (active && camera.current) latest.current.onBounds(camera.current.bounds());
      }, 180);
    };
    const p = latest.current.target;
    let release: (() => void) | undefined;
    if (flat) {
      const map = L.map(el, {
        zoomControl: false,
        minZoom: 2,
        maxZoom: 19,
        worldCopyJump: true,
        maxBounds: [
          [-85, -720],
          [85, 720],
        ],
        maxBoundsViscosity: 1,
      }).setView([p.latitude, p.longitude], p.zoom);
      map.on('dragstart', () => latest.current.onGesture());
      if (MAP_PUBLIC_TOKEN) {
        createCachedTileLayer(RETINA_TILE_URL, TILE_ATTRIBUTION)
          .on('tileerror', () => setTileError(true))
          .on('tileload', () => setTileError(false))
          .addTo(map);
      }
      camera.current = {
        project: (point) =>
          map.latLngToContainerPoint([
            point.latitude,
            point.longitude + 360 * Math.round((map.getCenter().lng - point.longitude) / 360),
          ]),
        move: (to) => map.setView([to.latitude, to.longitude], to.zoom, { animate: false }),
        zoomBy: (delta) => map.setZoom(map.getZoom() + delta),
        bounds: () => {
          const b = map.getBounds();
          return {
            south: Math.max(-85, b.getSouth()),
            north: Math.min(85, b.getNorth()),
            east: b.getEast(),
            west: b.getWest(),
            zoom: map.getZoom(),
          };
        },
      };
      const observer = new ResizeObserver(() => {
        map.invalidateSize();
        settled();
      });
      observer.observe(el);
      map.on('move zoom', draw).on('moveend zoomend', settled);
      release = () => {
        observer.disconnect();
        map.remove();
      };
      settled();
    } else {
      void import('mapbox-gl')
        .then(({ default: gl }) => {
          if (!active) return;
          if (!gl.supported()) {
            setFlat(true);
            return;
          }
          const map = new gl.Map({
            container: el,
            accessToken: MAP_PUBLIC_TOKEN,
            ...MAPBOX_STANDARD,
            center: [p.longitude, p.latitude],
            zoom: p.zoom - 1,
            projection: 'globe',
            pitch: 0,
            minZoom: 1,
            maxZoom: 18,
            performanceMetricsCollection: false,
            attributionControl: true,
          });
          let styleLoaded = false;
          const useFlatMap = () => {
            if (active && !styleLoaded) setFlat(true);
          };
          const fallback = setTimeout(useFlatMap, MAP_STYLE_TIMEOUT_MS);
          map.on('error', useFlatMap);
          map.once('style.load', () => {
            styleLoaded = true;
            clearTimeout(fallback);
          });
          camera.current = {
            project: (point) => {
              const coordinates = new gl.LngLat(point.longitude, point.latitude);
              const pixel = map.project(coordinates);
              // Mapbox projects the far side of the globe onto pixels on the near side, too.
              // Only place a button where the visible surface maps back to this location.
              if (map.getZoom() < 5 && map.unproject(pixel).distanceTo(coordinates) > 1000) return null;
              return pixel;
            },
            move: (to) => map.jumpTo({ center: [to.longitude, to.latitude], zoom: to.zoom - 1 }),
            zoomBy: (delta) => map.zoomTo(map.getZoom() + delta, { duration: 180 }),
            bounds: () => {
              const b = map.getBounds();
              return b
                ? {
                    south: Math.max(-90, b.getSouth()),
                    north: Math.min(90, b.getNorth()),
                    west: b.getWest(),
                    east: b.getEast(),
                    zoom: Math.round(map.getZoom() + 1),
                  }
                : { south: -80, north: 80, west: -180, east: 180, zoom: 2 };
            },
          };
          const observer = new ResizeObserver(() => {
            map.resize();
            settled();
          });
          observer.observe(el);
          map.on('dragstart', () => latest.current.onGesture());
          map.on('move', draw).on('moveend', settled).on('load', settled);
          release = () => {
            clearTimeout(fallback);
            observer.disconnect();
            map.remove();
          };
          camera.current.move(latest.current.target);
          settled();
        })
        .catch(() => {
          if (active) setFlat(true);
        });
    }
    return () => {
      active = false;
      el.removeEventListener('wheel', gesture);
      el.removeEventListener('pointerdown', gesture);
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      camera.current = null;
      release?.();
    };
  }, [flat]);

  useEffect(() => {
    camera.current?.move(props.target);
  }, [props.target]);
  const clusters = useMemo(
    () => clusterMarkers(props.rings.filter(hasPoint), Math.floor(frame.zoom), 21, 44),
    [props.rings, frame.zoom],
  );
  const select = useCallback(
    (rings: Ring[], center: [number, number], zoom: number, opener: HTMLButtonElement) => {
      if (rings.length === 1) latest.current.onOpen(rings[0], opener);
      else latest.current.onCluster(rings, { latitude: center[0], longitude: center[1] }, Math.min(19, zoom));
    },
    [],
  );
  function pin(rings: Ring[], x: number, y: number, center: [number, number], zoom: number) {
    const first = rings[0],
      group = rings.length > 1;
    const height = !group && props.elevation ? first.altitude_ft : null;
    const lifted = height != null && props.float && (props.sun?.elevation_deg ?? 0) > 0;
    const approximate = rings.every((ring) => ring.floating);
    const live = Date.parse(first.live_until || '') > Date.now();
    const lift = lifted ? (first.flying ? 1 : Math.min(1, Math.sqrt(Math.max(height || 0, 0) / 15000))) : 0;
    const sunLength =
      (4 + 30 * lift) *
      Math.max(
        0.55,
        Math.min(
          1.9,
          Math.tan(Math.PI / 6) / Math.tan((Math.max(props.sun?.elevation_deg || 30, 4) * Math.PI) / 180),
        ),
      );
    const place = first.place_label || (approximate ? 'this area' : 'this spot');
    const label =
      (group
        ? `${rings.length} rings at ${place}`
        : `${first.mine ? 'Your Moments' : first.author.name}, ${place}`) +
      (approximate ? ', approximate area' : '');
    return (
      <button
        type="button"
        key={first.id}
        aria-label={label}
        title={label}
        className={`mo-marker ${group ? 'mo-cluster' : ''} ${lifted ? 'mo-floating' : ''} ${approximate ? 'mo-area-pin' : ''}`}
        style={
          {
            left: x,
            top: y,
            '--mo-lift-scale': 1 + 0.25 * lift,
            '--mo-height-color': heightColor(height || 0, first.flying),
            '--mo-sun-x': `${-Math.sin(((props.sun?.azimuth_deg || 0) * Math.PI) / 180) * sunLength}px`,
            '--mo-sun-y': `${Math.cos(((props.sun?.azimuth_deg || 0) * Math.PI) / 180) * sunLength}px`,
          } as CSSProperties
        }
        onClick={(event) => select(rings, center, zoom, event.currentTarget)}
      >
        {group ? (
          <>
            <span className="mo-stack">
              {rings.slice(0, 3).map((r) => (
                <MomentFace key={r.id} author={r.author} fresh={r.unseen_count > 0} />
              ))}
            </span>
            <strong>{rings.length}</strong>
          </>
        ) : (
          <>
            <PinFace ring={first} />
            {live && <i className="mo-live-dot" />}
            {height != null && (
              <span className="mo-meter">
                {first.flying && <Plane size={12} />} {first.floating ? '≈ ' : ''}
                {height.toLocaleString()} ft
              </span>
            )}
          </>
        )}
      </button>
    );
  }
  return (
    <div className="mo-map-frame" aria-label="Moments map">
      <div ref={container} className="mo-map-canvas" />
      <div className="mo-marker-layer">
        {camera.current &&
          clusters.map((cluster) => {
            const point = camera.current!.project({
              latitude: cluster.center[0],
              longitude: cluster.center[1],
            });
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
            const rings = cluster.items;
            if (rings.length > 1 && rings.length <= 6 && rings.every((r) => props.focused.includes(r.id))) {
              return rings.map((r, i) => {
                const angle = (2 * Math.PI * i) / rings.length - Math.PI / 2;
                return pin(
                  [r],
                  point.x + 38 * Math.cos(angle),
                  point.y + 38 * Math.sin(angle),
                  cluster.center,
                  frame.zoom,
                );
              });
            }
            return pin(
              rings,
              point.x,
              point.y,
              cluster.center,
              Math.max(frame.zoom + 1, cluster.expansionZoom ?? 17),
            );
          })}
      </div>
      {tileError && (
        <span className="mo-tile-note" role="status">
          Map tiles unavailable
        </span>
      )}
      <div className="mo-map-controls" role="group" aria-label="Map controls">
        <button
          className="mo-full-map"
          title={props.fullWindow ? 'Exit full window' : 'Expand map to full window'}
          aria-label={props.fullWindow ? 'Exit full window' : 'Expand map to full window'}
          onClick={props.onToggleFullWindow}
        >
          {props.fullWindow ? <Minimize2 /> : <Maximize2 />}
        </button>
        <button title="Find my location" aria-label="Find my location" onClick={props.onLocate}>
          <LocateFixed />
        </button>
        <div>
          <button
            aria-label="Zoom in"
            onClick={() => {
              latest.current.onGesture();
              camera.current?.zoomBy(1);
            }}
          >
            <Plus />
          </button>
          <button
            aria-label="Zoom out"
            onClick={() => {
              latest.current.onGesture();
              camera.current?.zoomBy(-1);
            }}
          >
            <Minus />
          </button>
        </div>
      </div>
    </div>
  );
}
