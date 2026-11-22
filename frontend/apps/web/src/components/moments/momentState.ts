import { moments } from '@pantopus/api';
import type { Background, Box, Point, Ring, MapResult } from '@pantopus/api/endpoints/moments';

export const colors: Record<Background, string> = {
  teal: 'linear-gradient(155deg,#138580,#094a48)',
  sky: 'linear-gradient(155deg,#287fc0,#193e77)',
  green: 'linear-gradient(155deg,#34865a,#17492f)',
  amber: 'linear-gradient(155deg,#ab6926,#693316)',
  rose: 'linear-gradient(155deg,#be576e,#752b4b)',
  slate: 'linear-gradient(155deg,#515f73,#263146)',
};

export const world: Box = { south: -80, north: 80, west: -180, east: 180, zoom: 2 };
export const around = ({ latitude, longitude }: Point): Box => ({
  south: Math.max(-90, latitude - 0.015),
  north: Math.min(90, latitude + 0.015),
  west: longitude - 0.025,
  east: longitude + 0.025,
  zoom: 14,
});

// A map can pan across the date line. Each server request takes an ordinary west-to-east box.
export async function readViewport(box: Box, signal?: AbortSignal): Promise<MapResult> {
  const span = box.east - box.west;
  if (span >= 360) return moments.readMap({ ...box, west: -180, east: 180 }, signal);
  const west = ((((box.west + 180) % 360) + 360) % 360) - 180;
  const east = west + span;
  if (east <= 180) return moments.readMap({ ...box, west, east }, signal);
  const [left, right] = await Promise.all([
    moments.readMap({ ...box, west, east: 180 }, signal),
    moments.readMap({ ...box, west: -180, east: east - 360 }, signal),
  ]);
  return {
    ...left,
    rings: [...new Map([...left.rings, ...right.rings].map((ring) => [ring.id, ring])).values()],
  };
}

/** Frame nearby unread Moments once on arrival, preserving the user's center and only zooming out. */
export async function openingZoom(point: Point, box: Box, signal: AbortSignal) {
  const height = box.north - box.south,
    width = box.east - box.west;
  if (!(height > 0 && width > 0) || box.zoom < 10) return box.zoom;
  for (const factor of [2, 8, 32]) {
    if (width * factor > 5 || height * factor > 5) break;
    const result = await readViewport(
      {
        south: Math.max(-85, point.latitude - (height * factor) / 2),
        north: Math.min(85, point.latitude + (height * factor) / 2),
        west: point.longitude - (width * factor) / 2,
        east: point.longitude + (width * factor) / 2,
        zoom: box.zoom,
      },
      signal,
    );
    const distances = result.rings.flatMap((r) =>
      r.latitude == null || r.longitude == null
        ? []
        : [
            {
              fresh: !r.mine && r.unseen_count > 0,
              extent: Math.max(
                (Math.abs(r.latitude - point.latitude) * 2) / height,
                (Math.abs(((r.longitude - point.longitude + 540) % 360) - 180) * 2) / width,
              ),
            },
          ],
    );
    const fresh = distances.filter((r) => r.fresh);
    const near = distances.filter((r) => r.extent <= 1);
    if (near.length && !fresh.length) break;
    const candidates = fresh.length ? fresh : distances;
    if (!candidates.length) continue;
    const closest = Math.min(...candidates.map((v) => v.extent));
    const reach = Math.max(
      ...candidates.filter((v) => factor === 2 || v.extent <= closest * 1.5 + 0.08).map((v) => v.extent),
    );
    return reach > 1 ? Math.max(2, box.zoom - Math.ceil(Math.log2(reach * 1.2))) : box.zoom;
  }
  return box.zoom;
}

export function visibleRings(rings: Ring[], now: number, minutes: number, live: boolean) {
  return rings.flatMap((ring) => {
    if (live && !(Date.parse(ring.live_until || '') > now)) return [];
    const remaining = ring.moments.filter(
      (m) =>
        Date.parse(m.expires_at) > now && (!minutes || Date.parse(m.created_at) >= now - minutes * 60_000),
    );
    return remaining.length
      ? [
          {
            ...ring,
            preview: remaining.some((m) => m.id === ring.preview?.moment_id) ? ring.preview : null,
            moments: remaining,
            unseen_count: remaining.filter((m) => !m.seen).length,
          },
        ]
      : [];
  });
}

export function peopleInView(rings: Ring[], center?: Point) {
  const distance = (r: Ring) =>
    center && r.latitude != null && r.longitude != null
      ? Math.hypot(
          r.latitude - center.latitude,
          (r.longitude - center.longitude) * Math.cos((center.latitude * Math.PI) / 180),
        )
      : Infinity;
  const groups = new Map<string, Ring[]>();
  for (const ring of [...rings].sort((a, b) => distance(a) - distance(b))) {
    const list = groups.get(ring.author.id) || [];
    list.push(ring);
    groups.set(ring.author.id, list);
  }
  return [...groups.values()].sort(
    (a, b) => Number(b.some((r) => r.unseen_count > 0)) - Number(a.some((r) => r.unseen_count > 0)),
  );
}

export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function heightColor(feet: number, flying = false) {
  if (flying) return '#287fbe';
  if (feet < 500) return '#16a34a';
  if (feet < 2000) return '#84b91c';
  if (feet < 6000) return '#d99213';
  return '#c94872';
}
export function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
export async function deviceFix(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) throw new Error('Location is unavailable in this browser.');
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      resolve,
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? 'Location is off. Allow location in your browser, or share with connections without a pin.'
              : 'Your location could not be found. Try again.',
          ),
        ),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    ),
  );
}
