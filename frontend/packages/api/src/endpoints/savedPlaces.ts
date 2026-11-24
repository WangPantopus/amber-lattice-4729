import { get, post, del } from '../client';
import type { PlaceIntelligence, Post } from '@pantopus/types';
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
  /** The item's post (each item is a post by the Pantopus curator account); absent from servers before the posts. */
  post_id?: string;
}

export interface AroundYouSection {
  id: string;
  title: string;
  items: AroundYouItem[];
  /**
   * The same items as posts, in the feed's shape and order, to draw with the Pulse card (reactions, replies, the post
   * page). Absent when the server could not make or read them, or is from before the posts: draw `items` then.
   */
  posts?: Post[];
}

/** A list Around you offers as a chip: 'all', 'talked' (what people replied or reacted to) or a topic. */
export interface AroundYouList {
  id: string;
  title: string;
}

/** Today's second half. `available` false: show no switch (the feature is off, or the area has nothing to show). */
export interface AroundYou {
  available: boolean;
  /** The content region's name ("Clark County, WA"); null when unavailable. */
  area: string | null;
  sections: AroundYouSection[];
  /**
   * The chips to offer over the page, 'all' first; a topic is listed only where the region has stories for it. Absent
   * from servers before the lists (and when the posts could not be made): show no chips then.
   */
  lists?: AroundYouList[];
}

/**
 * One page of a list behind the first page: 'all' is every earlier story that is not on the first page, a topic's
 * list its stories (Events: what is coming, soonest first), newest first. `next` goes back as `before` for the page
 * after; null at the list's end.
 */
export interface AroundYouListPage {
  available: boolean;
  area: string | null;
  lists: AroundYouList[];
  list: string;
  posts: Post[];
  next: string | null;
}

/** Which list to read, and where it continues. */
export interface AroundYouListQuery {
  list: string;
  before?: string | null;
}

function listParams(query: AroundYouListQuery) {
  return { list: query.list, ...(query.before ? { before: query.before } : {}) };
}

/** POST /api/saved-places/area/around: Around you for the city around a point (rounded here and again on the server; nothing is stored). */
export async function getAreaAround(point: { latitude: number; longitude: number }) {
  return post<AroundYou>('/api/saved-places/area/around', { latitude: point.latitude, longitude: point.longitude });
}

/** POST /api/saved-places/area/around with `list`: a page of one of Around you's lists for the city around a point. */
export async function getAreaAroundList(point: { latitude: number; longitude: number }, query: AroundYouListQuery) {
  return post<AroundYouListPage>('/api/saved-places/area/around', {
    latitude: point.latitude, longitude: point.longitude, ...listParams(query),
  });
}

/** GET /api/saved-places/:id/around: Around you for a saved address. */
export async function getSavedPlaceAround(id: string) {
  return get<AroundYou>(`/api/saved-places/${id}/around`);
}

/** GET /api/saved-places/:id/around?list=: a page of one of Around you's lists for a saved address. */
export async function getSavedPlaceAroundList(id: string, query: AroundYouListQuery) {
  return get<AroundYouListPage>(`/api/saved-places/${id}/around`, listParams(query));
}
