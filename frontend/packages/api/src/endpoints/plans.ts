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
export type HostFilter = 'all' | 'neighbors' | 'businesses';
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
type RequestStatus =
  | 'pending'
  | 'paying'
  | 'expired'
  | 'accepted'
  | 'waitlisted'
  | 'withdrawn'
  | 'left'
  | 'declined'
  | 'removed';
export interface BusinessHost {
  user_id: string;
  name: string;
  locations: { id: string; label: string | null; address: string; is_primary: boolean }[];
  kinds: { kind: Kind; name: string; labels: { key: string; text: string }[] }[];
  limits: { spots_max: number; days_ahead: number };
  can?: { price: boolean; pay_here: boolean; deals: boolean };
  payouts_ready?: boolean;
}
export interface DealBenefit {
  kind: 'free_item' | 'percent' | 'amount';
  item?: string;
  value?: number;
  applies_to?: string;
}
export interface DealInput extends DealBenefit {
  scope: 'everyone' | 'group';
  group_size?: number;
  group_by?: string;
  if_short?: DealBenefit | null;
}
interface Receipt {
  link: string;
}
export interface PaidSpot {
  text: string;
  leave_text?: string | null;
  leave_back_cents?: number;
  receipt?: Receipt | null;
}
export interface TipChoice {
  label: string;
  tip_text: string;
  tip_cents: number;
}
export interface PlanPayment {
  client_secret: string;
  publishable_key?: string | null;
  amount_text: string;
}
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
  business?: { user_id: string; name: string; verified: boolean; page_url: string | null; can_manage?: boolean };
  label?: string | null;
  label_text?: string | null;
  price?: { cents: number; text: string; was_cents?: number; refund_text?: string } | null;
  paid?: PaidSpot;
  more_times?: {
    count: number;
    items: { id: string; title: string; starts_at: string; timezone: string }[];
  } | null;
  pay_here?: { tips_on: boolean; text: string };
  tip_later?: { choices: TipChoice[] };
  deal?: {
    text: string;
    tag: string;
    condition_text?: string;
    state_text?: string;
    if_short_text?: string;
    mine?: { text?: string; short?: string };
    form?: DealInput;
    can_change?: boolean;
  };
  group_pay?: {
    text: string;
    taken_text?: string;
    note?: string;
    url?: string;
    open: boolean;
    give_back?: { label: string; text: string };
  };
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
  my_request?: {
    reconfirm_needed: boolean;
    party_size: number;
    kids_count?: number;
    note?: string;
    hold_expires_at?: string;
  } | null;
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
    paid?: { text: string };
    deal?: { state: string };
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
export interface BusinessFields {
  label?: string;
  business_location_id?: string;
  price_cents?: number | null;
  pay_here?: boolean;
  tips_on?: boolean;
  deal?: DealInput | null;
}
export type NewBusinessPlan = Omit<NewPlan, 'place' | 'audience'> &
  BusinessFields & {
    host_as: { business_user_id: string };
    business_location_id: string;
    label: string;
  };
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

const capabilities = { biz: '1', more: '1', guests: '1', extras: '1' };
const root = '/api/plans';
const path = (id: string) => root + '/' + encodeURIComponent(id);
const config = { params: capabilities };

export function nearby(
  point: Point,
  window: TimeWindow,
  kind: Kind | '',
  cursor?: string,
  host: HostFilter = 'all',
) {
  return get<{ items: Card[]; next_cursor: string | null }>(root, {
    ...capabilities,
    ...point,
    window,
    host,
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
export function pins(bounds: Bounds, window: TimeWindow, kind: Kind | '', host: HostFilter = 'all') {
  return get<{ markers: (Point & Pick<Card, 'id' | 'kind' | 'title'>)[] }>('/api/posts/map', {
    ...capabilities,
    ...bounds,
    window,
    kinds: kind || undefined,
    layers: 'plans',
    host,
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
export function hostAs() {
  return get<{ businesses: BusinessHost[] }>(root + '/host-as', capabilities);
}
export function forBusiness(id: string) {
  return get<{ items: Card[] }>('/api/businesses/' + encodeURIComponent(id) + '/plans', capabilities);
}
export function create(input: NewPlan | NewBusinessPlan) {
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

export function edit(id: string, changes: Partial<Omit<NewPlan, 'kind' | 'audience'>> & BusinessFields) {
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

export type Booking = Partial<Ask> & { for?: 'link'; spots?: number };
export interface SpotQuote {
  spots_text: string;
  each_text: string;
  total_text: string;
  refund_text?: string;
  group?: { text: string; state: string; in: number; size: number };
  group_pay?: { max_spots: number; title: string; for: { id: string; label: string }[] };
}
export function quoteSpot(id: string, input: Booking) {
  return post<SpotQuote>(path(id) + '/requests/quote', input, config);
}
export function holdSpot(id: string, input: Booking) {
  return post<{
    payment?: PlanPayment & Partial<Pick<SpotQuote, 'spots_text' | 'each_text'>>;
    request?: { status: RequestStatus; hold_expires_at?: string };
    plan: Detail;
  }>(path(id) + '/requests', input, config);
}
export function confirmSpot(id: string) {
  return post<Detail>(path(id) + '/requests/mine/confirm', {}, config);
}
export function giveBackSpots(id: string) {
  return post<Detail>(path(id) + '/requests/mine/give-back-spots', {}, config);
}
export function markDealUsed(id: string, requestId: string) {
  return post(path(id) + '/requests/' + encodeURIComponent(requestId) + '/deal-used', {}, config);
}
export interface Check {
  id: string;
  state: 'open' | 'paid' | 'refunded';
  heading: string;
  amount_cents: number;
  total_text: string;
  lines: { key: string; label: string; text: string }[];
  tips_on: boolean;
  tip_choices?: TipChoice[];
  tip_base_text?: string;
  note_text?: string;
  paid_text?: string;
  paid_total_text?: string;
  method_text?: string;
  refunded_text?: string;
  receipt?: Receipt | null;
}
export interface CheckRow {
  request_id: string;
  name: string;
  brought_by_text?: string;
  state: 'none' | 'sent' | 'paid' | 'refunded';
  check?: {
    id: string;
    text: string;
    state_text: string;
    total_cents: number;
    refunded_cents: number;
  } | null;
}
export interface CheckList {
  totals: { in_text: string; paid_text: string; tips_text: string };
  rows: CheckRow[];
  deal_on_bill: boolean;
  refund_until: string;
}
const checksPath = (id: string) => path(id) + '/checks';
const checkPath = (id: string, checkId: string) => checksPath(id) + '/' + encodeURIComponent(checkId);
export function staffChecks(id: string) {
  return get<CheckList>(checksPath(id), capabilities);
}
export function sendCheck(id: string, request_id: string, amount_cents: number, no_deal_cents: number) {
  return post<{ check: Check }>(checksPath(id), { request_id, amount_cents, no_deal_cents }, config);
}
export function myCheck(id: string) {
  return get<{ check: Check | null; can_start: boolean }>(checksPath(id) + '/mine', capabilities);
}
export function startCheck(id: string, amount_cents: number) {
  return post<{ check: Check }>(checksPath(id) + '/mine', { amount_cents }, config);
}
export function quoteCheck(id: string, checkId: string, tip_cents: number) {
  return post<{ check: Check }>(checkPath(id, checkId) + '/quote', { tip_cents }, config);
}
export function payCheck(id: string, checkId: string, tip_cents: number) {
  return post<{ check: Check; payment: PlanPayment }>(checkPath(id, checkId) + '/pay', { tip_cents }, config);
}
export function confirmCheck(id: string, checkId: string) {
  return post<{ check: Check }>(checkPath(id, checkId) + '/confirm', {}, config);
}
export function refundCheck(id: string, checkId: string, amount_cents?: number) {
  return post(checkPath(id, checkId) + '/refund', { amount_cents }, config);
}
export function startTip(id: string, amount_cents: number) {
  return post<{ payment: PlanPayment }>(path(id) + '/tip', { amount_cents }, config);
}
export function confirmTip(id: string) {
  return post<{ state: string; text: string }>(path(id) + '/tip/confirm', {}, config);
}
