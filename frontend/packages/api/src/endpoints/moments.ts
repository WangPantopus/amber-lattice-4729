import { del, get, post, put } from '../client';

const root = '/api/moments';
const item = (id: string) => `${root}/${encodeURIComponent(id)}`;
export type Kind = 'text' | 'photo' | 'video';
export type Background = 'teal' | 'sky' | 'green' | 'amber' | 'rose' | 'slate';
export type Hours = 1 | 6 | 24 | 48;
export type Audience = 'nearby' | 'connections';
export interface Point {
  latitude: number;
  longitude: number;
}
export interface Box {
  south: number;
  north: number;
  west: number;
  east: number;
  zoom: number;
}
export interface Author {
  id: string;
  name: string;
  first_name: string;
  avatar_url: string | null;
  initials: string;
  verified: boolean;
  kind: 'person' | 'business' | 'pantopus';
}
export interface Brief {
  id: string;
  kind: Kind;
  created_at: string;
  expires_at: string;
  seen: boolean;
}
export interface Ring {
  id: string;
  author: Author;
  moments: Brief[];
  mine: boolean;
  newest_at: string;
  place_label: string | null;
  no_location?: boolean;
  latitude?: number;
  longitude?: number;
  unseen_count: number;
  live_until?: string | null;
  altitude_ft?: number | null;
  flying?: boolean;
  floating?: boolean;
  preview?: { moment_id: string; kind: Kind; thumb_url: string | null; background: Background | null } | null;
}
interface Weather {
  temp_f: number;
  kind: string;
  label: string;
}
export interface Moment extends Brief {
  author: Author;
  state: 'uploading' | 'checking' | 'held' | 'scheduled' | 'live' | 'ended';
  caption: string | null;
  text: string | null;
  background: Background | null;
  media_url: string | null;
  poster_url: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  latitude: number | null;
  longitude: number | null;
  place_label: string | null;
  no_location: boolean;
  show_area: boolean;
  floating?: boolean;
  area?: { radius_m: number } | null;
  audience: Audience;
  hours: Hours;
  earlier?: boolean;
  share_at?: string | null;
  taken_at?: string | null;
  taken_here?: boolean;
  live_until?: string | null;
  altitude_ft?: number | null;
  flying?: boolean;
  weather?: Weather | null;
  series?: { id: string; index: number; count: number } | null;
  my_reaction: string | null;
  viewer_count: number | null;
  reaction_counts: { emoji: string; count: number }[] | null;
}
export interface MapResult {
  rings: Ring[];
  unplaced: Ring[];
  scheduled?: Moment[];
  heights_on: boolean;
  float_on: boolean;
  sun?: { azimuth_deg: number; elevation_deg: number } | null;
}
export interface Place {
  key: string;
  label: string;
}
export interface Preview {
  area_label: string | null;
  place_label: string | null;
  places: Place[];
  at_home: boolean;
  can_show_height: boolean;
  adult_confirmed: boolean;
  has_connections?: boolean;
  pick_within_m: number;
  sky?: boolean;
  area?: (Point & { label: string; radius_m: number }) | null;
  place?: Place | null;
  can_pin?: boolean;
  share_later?: { key: string; label: string; at: string }[];
  weather?: Weather | null;
}
export type Location =
  | { source: 'none' }
  | (Point & { source: 'gps'; fix_at: string })
  | (Point & { source: 'capture'; taken_at: string });
export interface NewMoment {
  client_request_id: string;
  kind: Kind;
  hours: Hours;
  audience: Audience;
  location: Location;
  text?: string;
  background?: Background;
  caption?: string;
  taken_at?: string;
  show_area?: boolean;
  place_key?: string;
  venue_id?: string;
  pin?: 'place';
  share_later?: string;
  taken_here?: boolean;
  show_weather?: boolean;
  altitude?: { meters: number; accuracy_m?: number | null; speed_mps?: number | null };
  series?: { id: string; count: number; index: number };
}
export interface VideoLimits {
  max_seconds: number;
  max_parts: number;
  max_bytes: number;
}
export interface Viewer {
  user: Author;
  viewed_at: string;
  reaction: string | null;
  replied: boolean;
}

export const readMap = (box: Box, signal?: AbortSignal) => get<MapResult>(root + '/map', box, { signal });
export const unseen = (box: Box, since?: string) =>
  get<{ count: number }>(root + '/unseen', { ...box, include_unplaced: true, since });
export const mine = () => get<{ moments: Moment[] }>(root + '/mine');
export const people = (ids: string[]) => get<{ rings: Ring[] }>(root + '/people', { ids: ids.join(',') });
export const batch = (ids: string[]) => get<{ moments: Moment[] }>(root + '/batch', { ids: ids.join(',') });
export const read = (id: string, signal?: AbortSignal) =>
  get<{ moment: Moment }>(item(id), undefined, { signal });
export const view = (id: string) => post(item(id) + '/view', {});
export const viewers = (id: string) => get<{ count: number; viewers: Viewer[] }>(item(id) + '/viewers');
export const react = (id: string, emoji: string | null) =>
  put<{ my_reaction: string | null }>(item(id) + '/reaction', { emoji });
export const reply = (id: string, text: string) =>
  post<{ room_id: string; message_id: string }>(item(id) + '/reply', { text });
export const report = (id: string, reason: string, details?: string) =>
  post(item(id) + '/report', { reason, details });
export const remove = (id: string) => del(item(id));
export const mute = (id: string) => put(root + '/authors/' + encodeURIComponent(id) + '/mute', {});
export const unmute = (id: string) => del(root + '/authors/' + encodeURIComponent(id) + '/mute');
export const limits = () => get<{ video: VideoLimits; daily_limit: number }>(root + '/limits');
export const preview = (point: Point | null, weather = false, signal?: AbortSignal) =>
  post<Preview>(root + '/place-preview', { ...point, weather }, { signal });
export const confirmAdult = () => post(root + '/adult-confirm', {});
export const create = (body: NewMoment, signal?: AbortSignal) =>
  post<{ moment: Moment }>(root, body, { signal });
export function upload(id: string, file: Blob, poster?: Blob, frames: Blob[] = [], signal?: AbortSignal) {
  const data = new FormData();
  data.append('file', file, file instanceof File ? file.name : 'moment');
  if (poster) data.append('poster', poster, 'poster.jpg');
  frames.forEach((frame, index) => data.append('frames[]', frame, `frame-${index}.jpg`));
  return post<{ moment: Moment }>(item(id) + '/media', data, {
    timeout: 180_000,
    signal,
  });
}
