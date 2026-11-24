// ============================================================
// PROFILE PAGE — "a profile with sources" (contract frozen v1.1, ~/pantopus-profile-sources/CONTRACT.md)
//
// The server draws the page for the viewer; a client draws each block and skips a kind, a link kind, an action kind or
// a key it doesn't know, so later pieces arrive with a server release. Every line says how we know it: Seen
// (Pantopus's own records), Signed (a named other party confirmed it) or Said (the person's own words). Text is final.
//
//   GET  /api/profile-page/:username   and  /id/:id     the page, for whoever asks (?as=link|member|connection: owner)
//   GET  …/piece/:pieceId,  …/month/:month               one piece or one month, opened
//   GET  /api/profile-page/me/share,  PUT the same       the owner's parts and what a visitor sees
//   GET  /api/profile-page/marks?ids=…                    the avatar ring for up to 100 people
//   GET  /api/profile-page/:username/v/:key (+ piece, month)   a link for one purpose (v1.3; PROFILE_LINKS)
//   POST | PATCH | DELETE /api/profile-page/me/links[/:id]   the owner's links for one purpose
//
// Behind the backend's PROFILE_SOURCES switch: while it is off every route answers 404 PROFILE_SOURCES_OFF and the apps
// show today's profile.
// ============================================================

import { del, get, patch, post, put } from '../client';
import type { UserInCommon } from './users';

export type ProfileInk = 'seen' | 'signed' | 'said';
/** The three lines through a year: the app's home, business and personal colours. */
export type ProfileLane = 'home' | 'work' | 'others';
export type ProfileView = 'owner' | 'household' | 'connection' | 'member' | 'link';
/** Preview as (the owner only): exactly what that viewer gets. `link` is a signed-out visitor. */
export type ProfilePreviewView = 'link' | 'member' | 'connection';

/** What tapping something opens (contract 3.3). An unknown kind: draw it without a tap. */
export type ProfileLink =
  | { kind: 'tab'; tab: string }
  | { kind: 'record' }
  | { kind: 'month'; month: string }
  | { kind: 'piece'; id: string }
  | { kind: 'business'; username: string }
  | { kind: 'profile'; user_id: string | null; username: string | null }
  | { kind: 'plan'; id: string }
  | { kind: 'gig'; id: string }
  | { kind: 'support_train'; id: string }
  | { kind: 'posts'; user_id: string }
  | { kind: 'moments'; user_id: string }
  | { kind: 'url'; url: string; site?: string | null }
  | { kind: string; [key: string]: unknown };

/** Every line anywhere on the page. `how` follows the ink's word ("By mail, June 2026"). */
export interface ProfileLine {
  ink: ProfileInk;
  text: string;
  how: string;
  lane?: ProfileLane | null;
  link?: ProfileLink | null;
}

/**
 * One string a year from `from`, twelve characters each, January first: 0 none, 1 said, 2 signed, 3 seen. In the
 * header all three lanes are always sent (a lane whose part is off comes as zeros), so the mark is whole.
 */
export interface ProfileRings {
  from: number;
  /** YYYY-MM-DD: the growing edge of this year's ring. */
  now: string;
  home?: string[] | null;
  work?: string[] | null;
  others?: string[] | null;
}

export interface ProfilePlace {
  /** "Camas, WA": city and state only, never more. */
  label: string;
  tz?: string | null;
  /** The city's time when the page was composed, "7:12 PM"; null when unknown (draw the label alone). */
  time?: string | null;
  /** dawn | day | evening | night; later values may add "_rain" and the like (draw the part before "_"). */
  sky?: string | null;
}

export interface ProfilePageHeader {
  user_id: string;
  username: string | null;
  /** The name others see, never the account name, in every view. */
  name: string;
  /** Owner view only: the account's own name, for the gray "stays private" line. */
  account_name?: string | null;
  first_name?: string | null;
  /** Their tagline, said; null when they have none. */
  headline?: string | null;
  portrait_url?: string | null;
  /** One short phrase for the view; null on a link. */
  seen_as?: string | null;
  /** Null unless the city reaches this viewer. */
  place?: ProfilePlace | null;
  rings: ProfileRings;
}

/** Worked out from the shown lanes only. */
export interface ProfilePageSummary {
  years: number;
  seen_months: number;
  signed_months: number;
  said_months: number;
}

// ── Blocks ──────────────────────────────────────────────────

interface BlockBase {
  kind: string;
  id: string;
  title?: string | null;
}

/** "All 6 lines": counts only what this viewer can open. */
export interface ProfileMore { text: string; link: ProfileLink | null }

export type ProfileBadgeLine = ProfileLine & {
  badge?: { initials: string | null; picture_url: string | null } | null;
  /** Review lines (v1.2): who wrote it. Signed out, only `did` ("Someone who hired Maria"). */
  who?: { name: string | null; user_id: string | null; username?: string | null; portrait_url: string | null; did: string | null } | null;
  when?: string | null;
};

export interface ProfileLinesBlock extends BlockBase {
  kind: 'lines';
  lines: ProfileBadgeLine[];
  more?: ProfileMore | null;
}

export interface ProfileSaysBlock extends BlockBase {
  kind: 'says';
  line: ProfileLine;
}

export type ProfileKnownForLine = ProfileLine & {
  /** On a link the name, portrait and id are null and `did` says what they did ("Someone who learned from Maria"). */
  who?: { name: string | null; portrait_url: string | null; user_id: string | null; did: string | null } | null;
  when?: string | null;
  tied_to?: { kind: string; id: string; title: string } | null;
};

export interface ProfileKnownForBlock extends BlockBase {
  kind: 'known_for';
  lines: ProfileKnownForLine[];
  more?: ProfileMore | null;
}

/** What the viewer and the person share: exactly the body of GET /api/users/:id/in-common. */
export type ProfileInCommonBlock = BlockBase & { kind: 'in_common' } & UserInCommon;

export interface ProfileDoor {
  /** hire | ask | borrow | invite | send_card | see_work */
  key: string;
  text: string;
  note?: string | null;
  link?: ProfileLink | null;
}

export interface ProfileDoorsBlock extends BlockBase {
  kind: 'doors';
  doors: ProfileDoor[];
  leave_card?: { text: string; note: string | null } | null;
  /** On a link: "Sign in or join to use a door." */
  sign_in_note?: string | null;
}

export interface ProfileShelfBlock extends BlockBase {
  kind: 'shelf';
  objects: Array<{ id: string; picture_url: string; caption: string | null }>;
}

/** Get to know: said lines with the prompt's catalog key (skip a key the app doesn't know). */
export interface ProfilePromptsBlock extends BlockBase {
  kind: 'prompts';
  prompts: Array<ProfileLine & { key: string; answer: string }>;
}

/** Up to three pinned posts, drawn with the app's own Pulse card. */
export interface ProfilePinnedPostsBlock extends BlockBase {
  kind: 'pinned_posts';
  user_id: string;
  source?: string | null;
}

export interface ProfileRowsBlock extends BlockBase {
  kind: 'rows';
  /** `key`: posts, moments. */
  rows: Array<{ key: string; title: string; detail: string | null; link: ProfileLink | null }>;
}

export type ProfileSkill = ProfileLine & { name: string; pieces: number; inks?: Partial<Record<ProfileInk, number>> | null };

export interface ProfileCanDoBlock extends BlockBase {
  kind: 'can_do';
  subtitle?: string | null;
  skills: ProfileSkill[];
}

export interface ProfilePiece extends ProfileLine {
  id: string;
  title: string;
  /** did | built | owns | null (null: no kind word). */
  kind?: string | null;
  when?: string | null;
  cover_url?: string | null;
  media?: { photos?: number; videos?: number; documents?: number; links?: number } | null;
}

export interface ProfilePiecesBlock extends BlockBase {
  kind: 'pieces';
  style?: 'pinned' | 'list' | null;
  subtitle?: string | null;
  pieces: ProfilePiece[];
  filters?: string[] | null;
  more?: ProfileMore | null;
}

/** The work line of the rings, opened flat, with a dot per piece. */
export interface ProfileWorkRingsBlock extends BlockBase {
  kind: 'work_rings';
  from: number;
  now: string;
  months: string[];
  dots?: Array<{ piece_id: string; month: string }> | null;
  years?: Array<{ year: number; pieces: number }> | null;
}

export interface ProfileCirclePerson {
  user_id: string | null;
  name: string | null;
  portrait_url: string | null;
  did: string | null;
  ink: ProfileInk;
}

export interface ProfileCircleBlock extends BlockBase {
  kind: 'circle';
  text?: string | null;
  groups: Array<{ key: string; title: string; count: number; people: ProfileCirclePerson[] }>;
  link?: ProfileLink | null;
}

export interface ProfileOwnsBlock extends BlockBase {
  kind: 'owns';
  lines: ProfileBadgeLine[];
}

/** The full rings: only the lanes this viewer may see (a part that is off drops its line). */
export interface ProfileRecordChartBlock extends BlockBase {
  kind: 'record_chart';
  subtitle?: string | null;
  from: number;
  now: string;
  lanes: Array<{ lane: ProfileLane; months: string[] }>;
  note?: string | null;
  as_of?: string | null;
}

/** "Maria shows more to her connections": never on a link. */
export interface ProfileMoreCloserBlock extends BlockBase {
  kind: 'more_closer';
  text?: string | null;
  action?: { kind: string } | null;
}

export type ProfileKnownBlock =
  | ProfileLinesBlock
  | ProfileSaysBlock
  | ProfileKnownForBlock
  | ProfileInCommonBlock
  | ProfileDoorsBlock
  | ProfileShelfBlock
  | ProfilePromptsBlock
  | ProfilePinnedPostsBlock
  | ProfileRowsBlock
  | ProfileCanDoBlock
  | ProfilePiecesBlock
  | ProfileWorkRingsBlock
  | ProfileCircleBlock
  | ProfileOwnsBlock
  | ProfileRecordChartBlock
  | ProfileMoreCloserBlock;

/** A block of a kind this client may not know yet: skipped. */
export type ProfileBlock = ProfileKnownBlock | (BlockBase & Record<string, unknown>);

export interface ProfilePageTab {
  /** person, work, record; later versions may add keys. */
  key: string;
  title: string;
  blocks: ProfileBlock[];
}

/** edit, preview_as, share, connect, message, call, email, leave_card; skip a kind you don't know. */
export interface ProfilePageAction {
  kind: string;
  state?: 'none' | 'requested' | 'incoming' | string | null;
  views?: ProfilePreviewView[] | null;
  url?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
}

export interface ProfilePage {
  v: number;
  view: ProfileView;
  /** Search engines may list the page; the web sets noindex when false. */
  listed: boolean;
  header: ProfilePageHeader;
  summary: ProfilePageSummary;
  tabs: ProfilePageTab[];
  actions: ProfilePageAction[];
  /** Links only: "Maria chose what this page shows."; null in every app view. */
  footer: { text: string; as_of: string | null } | null;
  /** Only on an owner's ?as= read. */
  preview_as?: ProfilePreviewView | null;
}

/** One piece, opened (contract 5). */
export interface ProfilePieceRead {
  v: number;
  view: ProfileView;
  piece: ProfilePiece & {
    description: ProfileLine | null;
    media: Array<{ kind: 'photo' | 'video' | 'document' | string; url: string; thumbnail_url: string | null }>;
    links: Array<{ url: string; title: string | null; site: string | null }>;
    skills: string[];
  };
}

/** One month of the rings, opened (contract 5). */
export interface ProfileMonthRead {
  v: number;
  view: ProfileView;
  month: string;
  title: string;
  subtitle: string | null;
  lines: ProfileLine[];
}

// ── Sharing ─────────────────────────────────────────────────

/** Who a part reaches: anyone with the link, people signed in, or connections (and household). */
export type ProfilePartSetting = 'anyone' | 'members' | 'connections';

/** The switches on board 21, in its order. Portrait, name, headline and rings are always shown. */
export type ProfileSharePartKey =
  | 'says' | 'prompts' | 'shelf' | 'city' | 'work' | 'known_for' | 'record_work' | 'record_home' | 'record_others'
  | 'met' | 'doors' | 'reviews';

export interface ProfileSharePart {
  key: ProfileSharePartKey | string;
  setting: ProfilePartSetting | string;
  /** Whether the part has anything to show today (a part with nothing may leave out its switch). */
  has_content: boolean;
}

export interface ProfileShare {
  v: number;
  username: string;
  /** True: the username prompt comes first; a made-up name is never shared. */
  username_is_made_up: boolean;
  /** The main link, https://pantopus.com/<username>. */
  url: string;
  /** False until the first save; the parts are then the defaults. */
  saved: boolean;
  parts: ProfileSharePart[];
  search_engines: boolean;
  /** The widest "Who sees your city" lets the city go. */
  city_limit: 'anyone' | 'connections' | 'none' | string;
  /** The page exactly as a signed-out visitor gets it; null when a signed-out visitor couldn't open it at all. */
  visitor: ProfilePage | null;
  /** Links for one purpose (v1.3). Absent while the server's PROFILE_LINKS is off: no section is drawn. */
  links_enabled?: boolean;
  links?: ProfileShareLink[];
}

/** A link for one purpose: its own parts, an optional last day, and how often it was opened (never by whom). */
export interface ProfileShareLink {
  id: string;
  name: string;
  /** https://pantopus.com/<username>/v/<key>: the key is shown only to the owner. */
  url: string;
  parts: Partial<Record<ProfileSharePartKey, boolean>>;
  /** YYYY-MM-DD: the link works through that Pacific day; null for no end. */
  ends_on: string | null;
  switched_off: boolean;
  /** Not switched off, not ended, and links are on for the person. */
  live: boolean;
  opens: number;
  last_opened_on: string | null;
  created_at: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `/api/profile-page/<username>` or `/api/profile-page/id/<id>` for an account id. */
function base(identifier: string): string {
  const value = String(identifier || '').trim().replace(/^@+/, '');
  return UUID.test(value)
    ? `/api/profile-page/id/${encodeURIComponent(value)}`
    : `/api/profile-page/${encodeURIComponent(value)}`;
}

/** The page for whoever is asking (signed in or not), by username or account id. `as`: the owner's Preview as. */
export async function getPage(identifier: string, options?: { as?: ProfilePreviewView }): Promise<ProfilePage> {
  return get<ProfilePage>(base(identifier), options?.as ? { as: options.as } : undefined);
}

export async function getPiece(identifier: string, pieceId: string, options?: { as?: ProfilePreviewView }): Promise<ProfilePieceRead> {
  return get<ProfilePieceRead>(`${base(identifier)}/piece/${encodeURIComponent(pieceId)}`, options?.as ? { as: options.as } : undefined);
}

export async function getMonth(identifier: string, month: string, options?: { as?: ProfilePreviewView }): Promise<ProfileMonthRead> {
  return get<ProfileMonthRead>(`${base(identifier)}/month/${encodeURIComponent(month)}`, options?.as ? { as: options.as } : undefined);
}

/** `/api/profile-page/<username>/v/<key>`: a link for one purpose (never needs sign-in). */
function linkBase(username: string, key: string): string {
  return `/api/profile-page/${encodeURIComponent(username)}/v/${encodeURIComponent(key)}`;
}

export async function getLinkMonth(username: string, key: string, month: string): Promise<ProfileMonthRead> {
  return get<ProfileMonthRead>(`${linkBase(username, key)}/month/${encodeURIComponent(month)}`);
}

export async function getLinkPiece(username: string, key: string, pieceId: string): Promise<ProfilePieceRead> {
  return get<ProfilePieceRead>(`${linkBase(username, key)}/piece/${encodeURIComponent(pieceId)}`);
}

/** Make a link for one purpose: parts not sent are off. */
export async function createLink(body: { name: string; parts: Partial<Record<ProfileSharePartKey, boolean>>; ends_on: string | null }): Promise<ProfileShareLink> {
  return post<ProfileShareLink>('/api/profile-page/me/links', body);
}

/** Rename, change parts (merged), change or clear the last day, switch off or on. */
export async function updateLink(id: string, body: { name?: string; parts?: Partial<Record<ProfileSharePartKey, boolean>>; ends_on?: string | null; switched_off?: boolean }): Promise<ProfileShareLink> {
  return patch<ProfileShareLink>(`/api/profile-page/me/links/${encodeURIComponent(id)}`, body);
}

export async function deleteLink(id: string): Promise<{ id: string; deleted: boolean }> {
  return del<{ id: string; deleted: boolean }>(`/api/profile-page/me/links/${encodeURIComponent(id)}`);
}

/** The owner's parts and what a visitor would see. */
export async function getShare(): Promise<ProfileShare> {
  return get<ProfileShare>('/api/profile-page/me/share');
}

/** Save parts and the search setting; parts not sent keep theirs. The answer is the share as saved. */
export async function saveShare(body: { parts?: Partial<Record<ProfileSharePartKey, ProfilePartSetting>>; search_engines?: boolean; links_enabled?: boolean }): Promise<ProfileShare> {
  return put<ProfileShare>('/api/profile-page/me/share', body);
}
