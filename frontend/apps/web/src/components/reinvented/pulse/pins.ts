// What the one map draws and its peek deck shows, from the map's read (coord/CONTRACT.md §6b). One list of pins, so the
// map and the deck always agree on what is there and in which order.

import type { Ring } from '@pantopus/api/endpoints/moments';
import type { Box, MapData, MapMark, MapTicket, Point } from './listApi';

export type Pin =
  | { key: string; type: 'ring'; ring: Ring; point: Point }
  | { key: string; type: 'mark'; mark: MapMark; point: Point }
  | { key: string; type: 'ticket'; ticket: MapTicket; point: Point };

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
