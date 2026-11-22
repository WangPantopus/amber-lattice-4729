import { del, get, post } from '../client';

export const kindNames = {
  watch_party: 'Watch party',
  playdate: 'Playdate',
  pickup_game: 'Pickup game',
  walk_coffee: 'Walk & coffee',
  study_group: 'Study group',
  food_drinks: 'Food & drinks',
  game_night: 'Game night',
  outdoors: 'Outdoors',
  something_else: 'Something else',
} as const;

export type Kind = keyof typeof kindNames;
export type TimeWindow = 'now' | 'today' | 'week' | 'weekend';
export interface Point {
  latitude: number;
  longitude: number;
}
export interface GPS extends Point {
  timestamp: string;
}
export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}
type RequestStatus = 'pending' | 'accepted' | 'waitlisted' | 'withdrawn' | 'left' | 'declined' | 'removed';
export interface Card {
  id: string;
  kind: Kind;
  title: string;
  about: string;
  starts_at: string | null;
  ends_at: string | null;
  starts_on: string;
  day_part: string;
  timezone: string;
  area: { label: string; city: string | null };
  audience: 'nearby' | 'invited';
  place_kind: 'home' | 'public' | 'online';
  host: { display_name: string };
  spots_left: number;
  going_count: number;
  is_full: boolean;
  kids_welcome?: boolean;
  how_people_get_in: 'automatic' | 'host_approves';
  state: 'upcoming' | 'live' | 'ended' | 'cancelled';
  viewer: {
    role: 'host' | 'guest' | 'none';
    request_status: RequestStatus | null;
    waitlist_position: number | null;
    can_ask: boolean;
    cannot_ask_reason: string | null;
  };
  my_request?: { reconfirm_needed: boolean } | null;
}

export interface Detail extends Card {
  place?: {
    name: string;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    note: string | null;
    link?: string | null;
    link_host?: string | null;
  };
  people?: {
    user_id: string | null;
    guest_id?: string;
    display_name: string;
    is_host: boolean;
    party_size: number;
    kids_count?: number | null;
  }[];
  chat_room_id?: string | null;
  chat_open?: boolean;
  cancel_note?: string | null;
}

export interface JoinRequest {
  id: string;
  user: { display_name: string };
  party_size: number;
  note: string | null;
  kids_count: number | null;
  kids_age_bands: string[] | null;
}

export interface NewPlan {
  kind: Kind;
  title: string;
  about: string;
  starts_at: string;
  ends_at: string;
  spots: number;
  place: Point & { kind: 'public'; name: string; address: string; place_id?: string };
  guest_note: string;
  details: { walk_kind?: string; sport?: string; subject?: string; game?: { label: string } };
  gps?: GPS;
}
export interface Ask {
  party_size: number;
  note: string;
  gps?: GPS;
  kids_count?: number;
  kids_age_bands?: string[];
  stays_with_kids?: boolean;
}

// All personal kinds, including online meeting details. The server's basic guest
// roster applies until the web supports account-free RSVP and household management.
const capabilities = { more: '1' };
const root = '/api/plans';
const path = (id: string) => root + '/' + encodeURIComponent(id);
const config = { params: capabilities };

export function nearby(point: Point, window: TimeWindow, kind: Kind | '', cursor?: string) {
  return get<{ items: Card[]; next_cursor: string | null }>(root, {
    ...capabilities,
    ...point,
    window,
    kinds: kind || undefined,
    cursor,
  });
}
export function mine() {
  return get<Record<'hosting' | 'going' | 'asked' | 'waitlisted' | 'invited' | 'recent', Card[]>>(
    root + '/mine',
    capabilities,
  );
}
export function pins(bounds: Bounds, window: TimeWindow, kind: Kind | '') {
  return get<{ markers: (Point & Pick<Card, 'id' | 'kind' | 'title'>)[] }>('/api/posts/map', {
    ...capabilities,
    ...bounds,
    window,
    kinds: kind || undefined,
    layers: 'plans',
  });
}
export function detail(id: string, gps?: GPS) {
  return get<Detail>(path(id), {
    ...capabilities,
    gps_latitude: gps?.latitude,
    gps_longitude: gps?.longitude,
    gps_timestamp: gps?.timestamp,
  });
}
export function create(input: NewPlan) {
  return post<Detail>(root, { ...input, auto_rules: [], audience: 'nearby' }, config);
}
export interface PublicPlace extends Point {
  place_id: string;
  name: string;
  address: string | null;
}
export function places(point: Point, kind: Kind) {
  return get<{ places: PublicPlace[]; loading: boolean; attribution: string }>(root + '/places/nearby', {
    ...point,
    kind,
    wait: '0',
  });
}
export function requests(id: string) {
  return get<{ pending: JoinRequest[]; waitlisted: JoinRequest[] }>(path(id) + '/requests', capabilities);
}
export function ask(id: string, input: Ask) {
  return post(path(id) + '/requests', input, config);
}
export function withdraw(id: string) {
  return del(path(id) + '/requests/mine', undefined, config);
}
export function decide(
  id: string,
  requestId: string,
  answer: 'accept' | 'decline',
  confirmSharesAddress = false,
) {
  return post(
    path(id) + '/requests/' + encodeURIComponent(requestId) + '/' + answer,
    { confirm_shares_address: confirmSharesAddress },
    config,
  );
}
export function stillComing(id: string, coming: boolean) {
  return post(path(id) + '/still-coming', { coming }, config);
}
