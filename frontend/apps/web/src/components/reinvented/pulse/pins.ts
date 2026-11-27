// What the one map draws and its peek deck shows, from the map's read (coord/CONTRACT.md §6b). One list of pins, so the
// map and the deck always agree on what is there and in which order.

import type { Ring } from '@pantopus/api/endpoints/moments';
import type { Box, ExploreItem, ListMoment, MapData, MapMark, MapTicket, Point } from './listApi';

export type Pin =
  | { key: string; type: 'ring'; ring: Ring; point: Point }
  | { key: string; type: 'mark'; mark: MapMark; point: Point }
  | { key: string; type: 'ticket'; ticket: MapTicket; point: Point }
  | { key: string; type: 'kept'; moment: ListMoment; point: Point }
  | { key: string; type: 'explore'; moment: ListMoment; point: Point };

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Every pin with a point. The order is the deck's: Heads-ups first (always on top), then west to east, so a swipe
 * glides to the next thing over and the order holds while the map pans under the deck.
 */
export function pinsOf(data: MapData | undefined): Pin[] {
  if (!data) return [];
  const pins: Pin[] = [];
  for (const ring of data.rings || [])
    if (!ring.no_location && finite(ring.latitude) && finite(ring.longitude))
      pins.push({ key: `ring:${ring.id}`, type: 'ring', ring, point: { latitude: ring.latitude, longitude: ring.longitude } });
  for (const mark of data.marks || [])
    if (finite(mark.latitude) && finite(mark.longitude))
      pins.push({ key: `mark:${mark.id}`, type: 'mark', mark, point: { latitude: mark.latitude, longitude: mark.longitude } });
  for (const ticket of data.tickets || [])
    if (finite(ticket.latitude) && finite(ticket.longitude))
      pins.push({ key: `ticket:${ticket.id}`, type: 'ticket', ticket, point: { latitude: ticket.latitude, longitude: ticket.longitude } });
  const headsUp = (p: Pin) => (p.type === 'mark' && p.mark.heads_up ? 0 : 1);
  return pins.sort((a, b) => headsUp(a) - headsUp(b) || a.point.longitude - b.point.longitude || a.key.localeCompare(b.key));
}

/** The box rounded, so a map nudged by a few metres reads from the cache. */
export function roundBox(b: Box): Box {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { south: r(b.south), west: r(b.west), north: r(b.north), east: r(b.east) };
}

/** My Atlas on the map: the person's own kept Moments with a place, oldest west to newest east as above. */
export function keptPins(moments: ListMoment[] | undefined): Pin[] {
  const pins: Pin[] = [];
  for (const m of moments || [])
    if (!m.no_location && finite(m.latitude) && finite(m.longitude))
      pins.push({ key: `kept:${m.id}`, type: 'kept', moment: m, point: { latitude: m.latitude, longitude: m.longitude } });
  return pins.sort((a, b) => a.point.longitude - b.point.longitude || a.key.localeCompare(b.key));
}

/**
 * Explore on the map: what is in view in Explore, at the point everyone sees, west to east as above. A Moment is its
 * ring; a post is drawn as the map's own post mark, and opens as one.
 */
export function explorePins(items: ExploreItem[]): Pin[] {
  const pins: Pin[] = [];
  for (const it of items) {
    if (it.type === 'moment') {
      const m = it.moment;
      if (!m.no_location && finite(m.latitude) && finite(m.longitude))
        pins.push({ key: `explore:${m.id}`, type: 'explore', moment: m, point: { latitude: m.latitude, longitude: m.longitude } });
      continue;
    }
    const p = it.post as unknown as Record<string, unknown>;
    const lat = p.effective_latitude ?? p.latitude,
      lng = p.effective_longitude ?? p.longitude;
    const latitude = typeof lat === 'string' ? Number(lat) : lat,
      longitude = typeof lng === 'string' ? Number(lng) : lng;
    if (finite(latitude) && finite(longitude))
      pins.push({
        key: `mark:${it.post.id}`,
        type: 'mark',
        mark: { id: it.post.id, latitude, longitude, heads_up: false, post: it.post },
        point: { latitude, longitude },
      });
  }
  return pins.sort((a, b) => a.point.longitude - b.point.longitude || a.key.localeCompare(b.key));
}
