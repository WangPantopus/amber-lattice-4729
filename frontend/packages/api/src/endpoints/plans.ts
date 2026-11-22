import { del, get, patch, post, put } from '../client';

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
  spots: number;
  spots_left: number;
  details: KindDetails;
  time_text?: string;
  dates?: DatePoll;
  repeat?: RepeatRule | null;
  guests_can_invite?: boolean;
  invites?: { can_invite: boolean; invited: number; said_yes: number; cant_make_it: number };
  my_invite?: { id: string; status: string; needs_host_ok: boolean } | null;
  headcount?: { adults: number; kids: number };
  answers?: { in: number; maybe: number; no_answer: number };
  auto_rules?: string[];
  join_requirement?: string;
  going_count: number;
  is_full: boolean;
  kids_welcome?: boolean;
  how_people_get_in: 'automatic' | 'host_approves';
  state: 'upcoming' | 'live' | 'ended' | 'cancelled';
  viewer: {
    role: 'host' | 'guest' | 'none';
    request_status: RequestStatus | null;
    waitlist_position: number | null;
    friend_invite?: { can_invite: boolean; used: boolean } | null;
    can_ask: boolean;
    cannot_ask_reason: string | null;
  };
  my_request?: { reconfirm_needed: boolean; party_size: number; kids_count?: number; note?: string } | null;
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
    request_id?: string;
    reconfirm_needed?: boolean;
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

export interface KindDetails {
  walk_kind?: string;
  sport?: string;
  level?: string;
  extra_gear?: boolean;
  subject?: string;
  study_style?: string;
  game?: { id?: string; label?: string };
  food_kind?: string;
  game_kind?: string;
  outdoor_kind?: string;
  pace?: string;
  dogs_welcome?: boolean;
  kids_age_bands?: string[];
}
export interface TimeOption {
  starts_at: string;
  ends_at: string;
}
export interface DatePoll {
  answered_text: string;
  mine_text?: string;
  mine?: { answered: boolean; party_size?: number; kids_count?: number };
  options: (TimeOption & {
    id: string;
    text: string;
    can_text: string;
    mine?: boolean;
    most?: boolean;
    who?: string[];
    pick_text?: string;
    pick_note?: string;
  })[];
}
export interface RepeatRule {
  freq: 'weekly' | 'biweekly' | 'monthly';
  weekdays?: number[];
  month_days?: ({ day: number } | { week: number; weekday: number })[];
  count?: number | null;
  until?: string | null;
  text?: string;
}
export type MeetingPlace =
  | (Point & { kind: 'public'; name: string; address: string; place_id?: string })
  | { kind: 'online'; link: string }
  | { kind: 'home'; home_id: string };
export interface NewPlan extends TimeOption {
  kind: Kind;
  title: string;
  about: string;
  spots: number;
  audience: 'nearby' | 'invited';
  join_requirement?: string;
  place: MeetingPlace;
  guest_note: string;
  details: KindDetails;
  auto_rules?: string[];
  guests_can_invite?: boolean;
  kids_welcome?: boolean;
  date_options?: TimeOption[];
  repeat?: RepeatRule | null;
  gps?: GPS;
}
export interface InviteRow {
  id: string;
  channel: string;
  state: string;
  person?: { display_name: string } | null;
  email?: string | null;
  email_failed?: boolean;
  name?: string | null;
  known_name?: string | null;
  guest?: { name: string; adults: number; kids: number } | null;
  party?: { adults: number; kids: number } | null;
  can_cancel: boolean;
  can_ok?: boolean;
  request_id?: string | null;
}
export interface InviteList {
  invites: InviteRow[];
  can_invite: boolean;
  unopened_links: number;
  emails_left?: number;
  open_link?: { on: boolean; url: string | null; host_says_yes_first: boolean } | null;
  remind?: { count: number; unopened_links: number; reminded_today: boolean } | null;
  results?: { user_id?: string; email?: string; outcome: string }[];
}
export interface Candidate {
  user_id: string;
  display_name: string;
  reason?: string;
  state?: string;
}
export interface PastPlan {
  post_id: string;
  title: string;
  date_text: string;
  count: number;
}

export interface Ask {
  party_size: number;
  note: string;
  gps?: GPS;
  kids_count?: number;
  kids_age_bands?: string[];
  stays_with_kids?: boolean;
}

// Personal plan kinds, guest answers, and date polls use the same contracts as mobile.
const capabilities = { more: '1', guests: '1', extras: '1' };
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
  return post<Detail>(root, input, config);
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
  answer: 'accept' | 'decline' | 'remove',
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

export function edit(id: string, changes: Partial<Omit<NewPlan, 'kind' | 'audience'>>) {
  return patch<Detail>(path(id), changes, config);
}
export function cancel(id: string, note: string, repeat?: 'keep' | 'stop') {
  return post(path(id) + '/cancel', { note, repeat }, config);
}
export function invitations(id: string) {
  return get<InviteList>(path(id) + '/invites', capabilities);
}
export function invitePeople(id: string, q: string) {
  return get<{ people: Candidate[] }>(path(id) + '/invites/people', { ...capabilities, q });
}
export function invite(id: string, user_ids: string[], emails: string[], confirm_shares_address: boolean) {
  return post<InviteList>(path(id) + '/invites', { user_ids, emails, confirm_shares_address }, config);
}
export function inviteLink(id: string, confirm_shares_address: boolean) {
  return post<{ url: string; message: string }>(
    path(id) + '/invites/link',
    { confirm_shares_address },
    config,
  );
}
export function openLink(
  id: string,
  host_says_yes_first: boolean,
  confirm_shares_address: boolean,
  rotate = false,
) {
  return post<{ url: string }>(
    path(id) + '/invites/open-link',
    { host_says_yes_first, confirm_shares_address, rotate },
    config,
  );
}
export function closeLink(id: string) {
  return del(path(id) + '/invites/open-link', undefined, config);
}
export function remind(id: string) {
  return post(path(id) + '/invites/remind', {}, config);
}
export function revokeInvite(id: string, inviteId: string) {
  return del(path(id) + '/invites/' + encodeURIComponent(inviteId), undefined, config);
}
export function approveInvite(id: string, inviteId: string, confirm_shares_address: boolean) {
  return post(
    path(id) + '/invites/' + encodeURIComponent(inviteId) + '/ok',
    { confirm_shares_address },
    config,
  );
}
export function answerInvitation(id: string, answer: 'maybe' | 'decline') {
  return post(path(id) + '/invites/' + answer, {}, config);
}
export function claimInvitation(id: string, value: { token: string } | { open: string }) {
  return post<{ plan: Detail }>(path(id) + '/invites/claim', value, config);
}
export function pastPlans() {
  return get<{ plans: PastPlan[] }>(root + '/past-people', capabilities);
}
export function pastPeople(id: string) {
  return get<{ people: { key: string; name: string; can_invite: boolean }[] }>(
    root + '/past-people/' + encodeURIComponent(id),
    capabilities,
  );
}
export function invitePast(
  id: string,
  from_post_id: string,
  skip: string[],
  confirm_shares_address: boolean,
) {
  return post<InviteList & { text: string }>(
    path(id) + '/invites/from-plan',
    { from_post_id, skip, confirm_shares_address },
    config,
  );
}
export function vote(id: string, options: string[], party_size: number, kids_count: number) {
  return put<Detail>(path(id) + '/dates/mine', { options, party_size, kids_count }, config);
}
export function pickDate(id: string, option_id: string) {
  return post<Detail>(path(id) + '/dates/pick', { option_id }, config);
}
