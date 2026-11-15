import { get, post, del } from '../client';
import type { PlaceIntelligence } from '@pantopus/types';
import type { PlacePreview } from './place';

export interface SavedPlace {
  id: string;
  user_id: string;
  label: string;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  place_type: string;
}

export async function getSavedPlaces() {
  return get<{ savedPlaces: SavedPlace[] }>('/api/saved-places');
}

export async function create(data: {
  label: string;
  placeType?: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  state?: string | null;
  sourceId?: string | null;
  /** Refuse a save if the browser changed accounts while confirming. */
  expectedUserId?: string;
}) {
  return post<{ savedPlace: SavedPlace }>('/api/saved-places', data);
}

/** The public address preview for the saved point (not a lookup of its label). */
export async function getPreview(id: string) {
  return get<PlacePreview>(`/api/saved-places/${encodeURIComponent(id)}/preview`);
}

export async function remove(id: string) {
  return del(`/api/saved-places/${encodeURIComponent(id)}`);
}

/** The city or town around a point, named by the server; `city` and `state` are null when it found none ("Near you"). */
export interface TodayArea {
  label: string;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
}

/** Today for the area around a point (tier T1, as a saved address shows it), with the area it named. */
export type AreaToday = PlaceIntelligence & {
  area: TodayArea;
  /** The area's IANA time zone. */
  time_zone?: string;
};

/**
 * POST /api/saved-places/area/today: Today for the city around a point, for someone with no address yet. Send the
 * point already rounded to 2 decimal places (the server rounds again); nothing is stored on the server.
 */
export async function getAreaToday(point: { latitude: number; longitude: number }) {
  return post<AreaToday>('/api/saved-places/area/today', { latitude: point.latitude, longitude: point.longitude });
}

/** One line on Today's "Around you" half: an outlet's own headline and where to read it. */
export interface AroundYouItem {
  id: string;
  title: string;
  /** Who published it ("The Columbian"); null when unknown. */
  source: string | null;
  /** The story at its outlet; null for a tip that is its own text. */
  url: string | null;
  /** When Pantopus first saw it (ISO). */
  seen_at: string;
}

export interface AroundYouSection {
  id: string;
  title: string;
  items: AroundYouItem[];
}

/** Today's second half. `available` false: show no switch (the feature is off, or the area has nothing to show). */
export interface AroundYou {
  available: boolean;
  /** The content region's name ("Clark County, WA"); null when unavailable. */
  area: string | null;
  sections: AroundYouSection[];
}

/** POST /api/saved-places/area/around: Around you for the city around a point (rounded here and again on the server; nothing is stored). */
export async function getAreaAround(point: { latitude: number; longitude: number }) {
  return post<AroundYou>('/api/saved-places/area/around', { latitude: point.latitude, longitude: point.longitude });
}

/** GET /api/saved-places/:id/around: Around you for a saved address. */
export async function getSavedPlaceAround(id: string) {
  return get<AroundYou>(`/api/saved-places/${id}/around`);
}
