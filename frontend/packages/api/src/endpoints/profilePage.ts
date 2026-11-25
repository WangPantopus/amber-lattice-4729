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

import { del, get, patch, post, put, uploadFile } from '../client';
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
  id?: string;
  /** On a link the name, portrait and id are null and `did` says what they did ("Someone who learned from Maria"). */
  who?: { name: string | null; portrait_url: string | null; user_id: string | null; username?: string | null; did: string | null } | null;
  when?: string | null;
  /** What the line is tied to, in the server's words ("Tied to the piece Rebuilt a 1912 porch"); a piece by its id. */
  tied_to?: { kind: 'gig' | 'plan' | 'train' | 'piece' | string; id: string | null; text: string } | null;
  on_top?: boolean;
  /** The writer's own line (any state; never says which): they can take it back (P3.2). */
  mine?: { take_back: boolean } | null;
  /** The person's own list (GET /me/known-for) and "Lines for you". */
  status?: 'waiting' | 'shown' | 'hidden' | string;
};

/** "Write a line about Maria" (P3.2): only for a signed-in viewer the server lets write. */
export interface ProfileKnownForWrite {
  text: string;
  left_this_year: number;
  of: number;
  link?: ProfileLink | null;
}

export interface ProfileKnownForBlock extends BlockBase {
  kind: 'known_for';
  lines: ProfileKnownForLine[];
  more?: ProfileMore | null;
  write?: ProfileKnownForWrite | null;
}

/** No shown lines, but this viewer may write one (P3.2): a kind older apps skip. */
export interface ProfileKnownForWriteBlock extends BlockBase, ProfileKnownForWrite {
  kind: 'known_for_write';
}

/** The person's own page, while lines wait for them to show or keep hidden (P3.2). */
export interface ProfileLinesForYouBlock extends BlockBase {
  kind: 'lines_for_you';
  lines: ProfileKnownForLine[];
}

/** What the viewer and the person share: exactly the body of GET /api/users/:id/in-common. */
export type ProfileInCommonBlock = BlockBase & { kind: 'in_common' } & UserInCommon;

export interface ProfileDoor {
  /** hire | ask | borrow | invite | send_card | see_work */
  key: string;
  text: string;
  note?: string | null;
  /** P3.3: who the door is open to; the owner's own view says which. */
  open_to?: 'anyone' | 'connections' | string;
  /** `message` (the sentence goes in the composer, unsent), `send_card`, or null signed out. */
  link?: ProfileLink | null;
}

/** P3.3: "Leave your card" for a signed-in visitor (never the person, never on a link). */
export interface ProfileLeaveCard {
  text: string;
  note: string | null;
  /** The visitor's own last card to this person in the last 30 days. */
  left_at?: string | null;
  /** The visitor as the person will see them on the card, when the server sends it. */
  you?: { name: string | null; portrait_url: string | null; seen_as: string | null } | null;
}

/** P3.3 doors, as the new kind (released apps skip it): the same keys as the v1 `doors` block. */
export interface ProfileOpenDoorsBlock extends BlockBase {
  kind: 'open_doors';
  doors: ProfileDoor[];
  leave_card?: ProfileLeaveCard | null;
  sign_in_note?: string | null;
}

/** A card left for the person (P3.3): only theirs, never counted on any page. */
export interface ProfileCard {
  id: string;
  from: { name: string | null; user_id: string | null; username: string | null; portrait_url: string | null; seen_as: string | null };
  /** The visitor's own words, or null. */
  text: string | null;
  left_at: string;
  written_back: boolean;
}

export interface ProfileCardsBlock extends BlockBase {
  kind: 'cards';
  cards: ProfileCard[];
}

export interface ProfileDoorsBlock extends BlockBase {
  kind: 'doors';
  doors: ProfileDoor[];
  leave_card?: { text: string; note: string | null } | null;
  /** On a link: "Sign in or join to use a door." */
  sign_in_note?: string | null;
}

/**
 * Something waiting for the person that their app doesn't draw (CONTRACT "On by default"): at the top of their own
 * first tab, with the full web address. The web names every part it draws, so it should never get one.
 */
export interface ProfileNoticeBlock extends BlockBase {
  kind: 'notice';
  text: string;
  link?: ProfileLink | null;
}

/** One thing on the shelf (P3.1): its `id` is its picture's file id. */
export interface ProfileShelfObject {
  id: string;
  picture_url: string;
  caption: string | null;
  ink?: ProfileInk | null;
}

/** At most five, in the person's order. Sent only when it holds objects, for the owner too (P3.1, after review). */
export interface ProfileShelfBlock extends BlockBase {
  kind: 'shelf';
  objects: ProfileShelfObject[];
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
  /** Phase 2 (P2.1): the months it ran (`YYYY-MM`), city and state only (null unless the city part reaches the viewer). */
  from?: string | null;
  to?: string | null;
  place?: string | null;
  pinned?: boolean | null;
  /** On someone else's Work: a piece they signed a credit on, kept once on its owner's page (P2.5). */
  with?: { name: string | null; user_id: string | null; username: string | null } | null;
  /** The owner's view only. */
  audience?: 'anyone' | 'members' | 'connections' | null;
  draft?: boolean | null;
  hidden?: boolean | null;
  /** On the signer's own Work, a "With <owner>" piece: their tie, to take their name off (p2.5). */
  tie_id?: string | null;
}

/** A link on a piece (P2.4): words only, never a picture from the page. */
export interface ProfileLinkCard {
  id?: string | null;
  url: string;
  site: string | null;
  kind?: 'site' | 'video' | 'code' | 'app' | 'article' | 'paper' | string | null;
  title: string | null;
  description?: string | null;
  picture_url?: string | null;
  ink?: ProfileInk | null;
  how?: string | null;
  /** The owner's card only: false for pages anyone can edit (wikis), which can't be proven (p2.5). */
  provable?: boolean | null;
}

/** A person, business or typed name on a piece (P2.5). Others see only signed people and typed names. */
export interface ProfileCredit {
  id: string;
  party: {
    name: string | null;
    user_id: string | null;
    username: string | null;
    portrait_url: string | null;
    typed?: boolean | null;
    /** What to show when `name` is null ("A carpenter"). */
    did?: string | null;
  };
  role: string | null;
  relation?: 'with' | 'led' | 'learned_from' | 'for' | string | null;
  ink: ProfileInk;
  how: string | null;
  /** The owner's view only: `asked`, `signed`, `did_not_confirm`. */
  status?: string | null;
  /** The signer's own signed credit only (p2.7): what they chose, to change with `updateTie`. */
  mine?: { show_on_my_work: boolean; show_name_on_links: boolean } | null;
}

/** An attachment on a piece (P2.2). */
export interface ProfileAttachment {
  id?: string | null;
  kind: 'photo' | 'video' | 'document' | string;
  url: string;
  thumbnail_url: string | null;
  title?: string | null;
  detail?: string | null;
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
  /** Each piece's month; phase 2 adds the piece's ink. */
  dots?: Array<{ piece_id: string; month: string; ink?: ProfileInk | null }> | null;
  years?: Array<{ year: number; pieces: number }> | null;
}

export interface ProfileCirclePerson {
  user_id: string | null;
  name: string | null;
  username?: string | null;
  portrait_url: string | null;
  did: string | null;
  ink: ProfileInk;
  /** Pieces the two share that this viewer may open (p2.6). */
  shared_pieces?: number | null;
  /** A person, a business on Pantopus or a place typed as words (asked of profile-server); absent: a person. */
  kind?: 'person' | 'business' | 'place' | string | null;
}

export interface ProfileCircleGroup { key: string; title: string; count: number; people: ProfileCirclePerson[] }

export interface ProfileCircleBlock extends BlockBase {
  kind: 'circle';
  text?: string | null;
  groups: ProfileCircleGroup[];
  hired_by?: ProfileLine | null;
  link?: ProfileLink | null;
}

/** The work circle opened (board 9): everyone, by group, and how many households and businesses hired the person. */
export interface ProfileCircleRead {
  v: number;
  groups: ProfileCircleGroup[];
  hired_by: ProfileLine | null;
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
  | ProfileKnownForWriteBlock
  | ProfileOpenDoorsBlock
  | ProfileCardsBlock
  | ProfileLinesForYouBlock
  | ProfileInCommonBlock
  | ProfileDoorsBlock
  | ProfileShelfBlock
  | ProfileNoticeBlock
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
  piece: Omit<ProfilePiece, 'media'> & {
    description: ProfileLine | null;
    /** v1: the piece's pictures and files. A phase 2 server may send the counts here instead; read both. */
    media: ProfileAttachment[] | ProfilePiece['media'];
    links: ProfileLinkCard[];
    skills?: string[];
    /** Phase 2 (P2.2). */
    how_we_know?: ProfileLine[] | null;
    shows_can?: string[] | null;
    attachments?: ProfileAttachment[] | null;
    /** Only with PROFILE_TIES on. */
    credits?: ProfileCredit[] | null;
    written?: Array<ProfileLine & { who?: { name: string | null; user_id: string | null; username: string | null; portrait_url: string | null; did: string | null } | null; when?: string | null }> | null;
    kept_once?: string | null;
    owner_role?: string | null;
    /** The owner's view only. */
    how_it_will_show?: string[] | null;
    suggested_credits?: ProfileSuggestedCredit[] | null;
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
  /** Phase 2 (P2.5): the Work row's "<shown> of your <total> pieces". */
  work_pieces?: { shown: number; total: number } | null;
  /** "Let people name me on their work"; absent while the server's PROFILE_TIES is off. */
  ties_enabled?: boolean;
  /** "Let people write lines about me" (P3.2); absent while the server's Known for is off. */
  known_for_enabled?: boolean;
  /** "Let people leave me a card" (P3.3). */
  cards_enabled?: boolean;
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

/** The ring an avatar wears (board 6): since when anything is on record for this viewer, and whether any of it is Seen. */
export interface ProfileMark {
  user_id: string;
  /** YYYY-MM: the first month with anything in a lane that reaches this viewer. */
  since: string;
  seen: boolean;
}

/** Signed in, at most 100 account ids. A person with no ring for this viewer is simply not in `marks`. */
export async function getMarks(ids: string[]): Promise<{ marks: ProfileMark[] }> {
  return get<{ marks: ProfileMark[] }>('/api/profile-page/marks', { ids: ids.join(',') });
}

/** The owner's parts and what a visitor would see. */
export async function getShare(): Promise<ProfileShare> {
  return get<ProfileShare>('/api/profile-page/me/share');
}

/** Save parts and the search setting; parts not sent keep theirs. The answer is the share as saved. */
export async function saveShare(body: { parts?: Partial<Record<ProfileSharePartKey, ProfilePartSetting>>; search_engines?: boolean; links_enabled?: boolean; ties_enabled?: boolean; known_for_enabled?: boolean; cards_enabled?: boolean }): Promise<ProfileShare> {
  return put<ProfileShare>('/api/profile-page/me/share', body);
}

// ── Phase 2: the owner's pieces (CONTRACT P2.3, P2.4) ──

/** The person who hired the owner, offered to ask in one tap (owner only, p2.6). Never in anyone else's read. */
export interface ProfileSuggestedCredit {
  user_id: string;
  name: string | null;
  username: string | null;
  portrait_url: string | null;
  relation: 'for' | string;
  role: string | null;
  why: string;
}

/** A job or plan Pantopus saw that isn't a piece yet (board 10's top). `with` is for the owner's eyes only. */
export interface ProfilePieceOffer {
  kind: 'gig' | 'plan' | string;
  id: string;
  title: string;
  when: string | null;
  with: string | null;
  text: string;
  suggested_credits?: ProfileSuggestedCredit[] | null;
}

/** What the owner writes on a piece. Fields not sent keep theirs on a change. */
export interface ProfilePieceFields {
  title?: string;
  kind?: 'did' | 'built' | 'owns' | null;
  from?: string | null;
  to?: string | null;
  city?: string | null;
  state?: string | null;
  description?: string | null;
  role?: string | null;
  skills?: string[];
  audience?: 'anyone' | 'members' | 'connections';
  pinned?: boolean;
  hidden?: boolean;
  draft?: boolean;
  started_from?: { kind: 'gig' | 'plan' | string; id: string };
  /** Files from `POST /api/files/portfolio`, the owner's own, in order (cover first). */
  attachments?: Array<{ file_id: string }>;
  links?: Array<{ url: string }>;
}

export interface ProfileMyPieces {
  pieces: ProfilePiece[];
  offered: ProfilePieceOffer[];
  counts: { shown_on_link: number; total: number } | null;
}

const ME_PIECES = '/api/profile-page/me/pieces';

/** The owner's pieces (drafts and hidden ones too), the jobs and plans offered, and how many a link shows. */
export async function getMyPieces(): Promise<ProfileMyPieces> {
  return get<ProfileMyPieces>(ME_PIECES);
}

/** A new piece; the answer is the piece as saved, with `how_it_will_show`. */
export async function createPiece(fields: ProfilePieceFields): Promise<ProfilePiece & { how_it_will_show?: string[] | null }> {
  return post<ProfilePiece & { how_it_will_show?: string[] | null }>(ME_PIECES, fields);
}

/** "How this piece will show", worked out by the server for these fields; nothing is saved. */
export async function previewPiece(fields: ProfilePieceFields): Promise<{ how_it_will_show: string[] }> {
  return post<{ how_it_will_show: string[] }>(`${ME_PIECES}/preview`, fields);
}

export async function updatePiece(id: string, fields: ProfilePieceFields): Promise<ProfilePiece & { how_it_will_show?: string[] | null }> {
  return patch<ProfilePiece & { how_it_will_show?: string[] | null }>(`${ME_PIECES}/${encodeURIComponent(id)}`, fields);
}

/** Removes the piece and ends its credits. */
export async function deletePiece(id: string): Promise<{ id: string; deleted: boolean }> {
  return del<{ id: string; deleted: boolean }>(`${ME_PIECES}/${encodeURIComponent(id)}`);
}

/** The line to put in a linked page's title or description to prove it's the owner's, and a meta tag for one's own site (P2.4, p2.4). */
export async function proveLink(pieceId: string, linkId: string): Promise<{ line: string; how: string; meta?: string | null }> {
  return post<{ line: string; how: string; meta?: string | null }>(`${ME_PIECES}/${encodeURIComponent(pieceId)}/links/${encodeURIComponent(linkId)}/proof`, {});
}

/** Reads the page for the line; Seen when it is there, else 409 PROOF_NOT_FOUND. */
export async function checkLink(pieceId: string, linkId: string): Promise<ProfileLinkCard> {
  return post<ProfileLinkCard>(`${ME_PIECES}/${encodeURIComponent(pieceId)}/links/${encodeURIComponent(linkId)}/check`, {});
}

// ── Phase 2: credits, signing and "Asked of you" (CONTRACT P2.5, p2.5; behind PROFILE_TIES) ──

/** Someone asked to sign: a credit on a piece, or a role. */
export interface ProfileAsk {
  id: string;
  kind: 'credit' | 'role' | string;
  from: { name: string | null; user_id: string | null; username: string | null; portrait_url: string | null };
  piece: { id: string; title: string; kind: string | null; when: string | null; cover_url: string | null } | null;
  role: string | null;
  relation?: string | null;
  asked_at: string;
  /** A role ask (p2.6): the business the person owns, asked to confirm, and the years. */
  business?: { name: string | null; user_id: string | null; username: string | null; picture_url: string | null } | null;
  when?: string | null;
}

/** Name a person (`user_id`: a connection, or the other party of the job or plan; they are asked) or type a name. */
export async function addCredit(pieceId: string, body: { user_id?: string; name?: string; role: string | null; relation: 'with' | 'led' | 'learned_from' | 'for' }): Promise<ProfileCredit> {
  return post<ProfileCredit>(`${ME_PIECES}/${encodeURIComponent(pieceId)}/credits`, body);
}

export async function removeCredit(pieceId: string, creditId: string): Promise<{ id: string; removed: boolean }> {
  return del<{ id: string; removed: boolean }>(`${ME_PIECES}/${encodeURIComponent(pieceId)}/credits/${encodeURIComponent(creditId)}`);
}

export async function getAsks(): Promise<{ asks: ProfileAsk[] }> {
  return get<{ asks: ProfileAsk[] }>('/api/profile-page/me/asks');
}

export async function signAsk(id: string, body: { show_on_my_work: boolean; show_name_on_links: boolean }): Promise<{ id: string; status: string }> {
  return post<{ id: string; status: string }>(`/api/profile-page/me/asks/${encodeURIComponent(id)}/sign`, body);
}

/** "Not me". */
export async function declineAsk(id: string): Promise<{ id: string; status: string }> {
  return post<{ id: string; status: string }>(`/api/profile-page/me/asks/${encodeURIComponent(id)}/decline`, {});
}

/** The signer changes their two choices later (p2.6). */
export async function updateTie(id: string, body: { show_on_my_work?: boolean; show_name_on_links?: boolean }): Promise<{ id: string; show_on_my_work: boolean; show_name_on_links: boolean }> {
  return patch<{ id: string; show_on_my_work: boolean; show_name_on_links: boolean }>(`/api/profile-page/me/ties/${encodeURIComponent(id)}`, body);
}

/** The signer takes their name off a piece (or a role). */
export async function removeTie(id: string): Promise<{ id: string; removed: boolean }> {
  return del<{ id: string; removed: boolean }>(`/api/profile-page/me/ties/${encodeURIComponent(id)}`);
}

// ── Phase 2: roles and schools ("Worked and learned", CONTRACT P2.6, p2.6; behind PROFILE_TIES) ──

/** A role line in the `worked_learned` block (and Record's work lines). The owner's view adds `status`. */
export interface ProfileRoleLine extends ProfileLine {
  id: string;
  title: string;
  relation: 'worked' | 'learned' | string;
  from: string | null;
  to: string | null;
  where: { name: string | null; user_id: string | null; username: string | null; picture_url: string | null; typed: boolean | null } | null;
  status?: string | null;
  /**
   * Only for a viewer who owns the business that signed this role (p2.11): its name on pages opened by a link. The
   * line's `id` is the tie, for `updateTie` and `removeTie`.
   */
  mine?: { show_name_on_links: boolean } | null;
}

export interface ProfileRoleFields {
  title: string;
  /** A business on Pantopus (asked to confirm through its owners) or a typed place, which stays Said. */
  where?: { business_user_id: string } | { name: string };
  relation: 'worked' | 'learned';
  from: string;
  to: string | null;
}

export async function createRole(fields: ProfileRoleFields): Promise<ProfileRoleLine> {
  return post<ProfileRoleLine>('/api/profile-page/me/roles', fields);
}

/** Title, relation, from and to; the place can't change (remove the role and add it again). */
export async function updateRole(id: string, fields: Partial<Omit<ProfileRoleFields, 'where'>>): Promise<ProfileRoleLine> {
  return patch<ProfileRoleLine>(`/api/profile-page/me/roles/${encodeURIComponent(id)}`, fields);
}

export async function deleteRole(id: string): Promise<{ id: string; removed: boolean }> {
  return del<{ id: string; removed: boolean }>(`/api/profile-page/me/roles/${encodeURIComponent(id)}`);
}

// ── Phase 2: the work circle (board 9, CONTRACT p2.6; behind PROFILE_TIES) ──

export async function getCircle(identifier: string, options?: { as?: ProfilePreviewView }): Promise<ProfileCircleRead> {
  return get<ProfileCircleRead>(`${base(identifier)}/circle`, options?.as ? { as: options.as } : undefined);
}

/** The pieces the person and that account share, each only if this viewer can open it. */
export async function getCirclePieces(identifier: string, userId: string, options?: { as?: ProfilePreviewView }): Promise<{ v: number; pieces: ProfilePiece[] }> {
  return get<{ v: number; pieces: ProfilePiece[] }>(`${base(identifier)}/circle/${encodeURIComponent(userId)}`, options?.as ? { as: options.as } : undefined);
}

export async function getLinkCircle(username: string, key: string): Promise<ProfileCircleRead> {
  return get<ProfileCircleRead>(`${linkBase(username, key)}/circle`);
}

export async function getLinkCirclePieces(username: string, key: string, userId: string): Promise<{ v: number; pieces: ProfilePiece[] }> {
  return get<{ v: number; pieces: ProfilePiece[] }>(`${linkBase(username, key)}/circle/${encodeURIComponent(userId)}`);
}

// ── Phase 3: the shelf (board 1, CONTRACT P3.1; under PROFILE_SOURCES, the `shelf` part) ──

/** A shelf picture through today's upload and its checks (kept as a kind the portfolio grid never lists). */
export async function uploadShelfPicture(file: File): Promise<{ file: { id: string; url: string } }> {
  return uploadFile<{ file: { id: string; url: string } }>('/api/files/upload', file, { file_type: 'profile_shelf', visibility: 'public' });
}

export async function getMyShelf(): Promise<{ objects: ProfileShelfObject[] }> {
  return get<{ objects: ProfileShelfObject[] }>('/api/profile-page/me/shelf');
}

/** The whole shelf in order: reorder by sending the new order, remove by leaving out. At most five. */
export async function saveShelf(objects: Array<{ file_id: string; caption: string }>): Promise<{ objects: ProfileShelfObject[] }> {
  return put<{ objects: ProfileShelfObject[] }>('/api/profile-page/me/shelf', { objects });
}

// ── Phase 3: Known for (board 14, CONTRACT P3.2) ──

export interface ProfileKnownForRead { v: number; lines: ProfileKnownForLine[] }

/** All shown lines, the "on top" ones first, for anyone the `known_for` part reaches. */
export async function getKnownFor(identifier: string, options?: { as?: ProfilePreviewView }): Promise<ProfileKnownForRead> {
  return get<ProfileKnownForRead>(`${base(identifier)}/known-for`, options?.as ? { as: options.as } : undefined);
}

export async function getLinkKnownFor(username: string, key: string): Promise<ProfileKnownForRead> {
  return get<ProfileKnownForRead>(`${linkBase(username, key)}/known-for`);
}

/** The writer's sheet: why they may write (one or more reasons) and how many lines they have left this year. */
export interface ProfileKnownForSheet {
  reasons: Array<{ kind: string; id: string; text: string }>;
  left_this_year: number;
  of: number;
  max_chars: number;
}

export async function getKnownForWrite(identifier: string): Promise<ProfileKnownForSheet> {
  return get<ProfileKnownForSheet>(`${base(identifier)}/known-for/write`);
}

export async function writeKnownFor(identifier: string, body: { text: string; reason: { kind: string; id: string }; show_name_on_links: boolean }): Promise<ProfileKnownForLine> {
  return post<ProfileKnownForLine>(`${base(identifier)}/known-for`, body);
}

/** The writer takes their line back: it leaves everywhere at once. */
export async function takeBackLine(id: string): Promise<{ id: string; removed: boolean }> {
  return del<{ id: string; removed: boolean }>(`/api/profile-page/me/lines-written/${encodeURIComponent(id)}`);
}

/** The person's own lines, every status, and which are on top. */
export async function getMyKnownFor(): Promise<{ lines: ProfileKnownForLine[]; on_top: string[] }> {
  return get<{ lines: ProfileKnownForLine[]; on_top: string[] }>('/api/profile-page/me/known-for');
}

export async function showLine(id: string): Promise<{ id: string; status: string }> {
  return post<{ id: string; status: string }>(`/api/profile-page/me/known-for/${encodeURIComponent(id)}/show`, {});
}

export async function hideLine(id: string): Promise<{ id: string; status: string }> {
  return post<{ id: string; status: string }>(`/api/profile-page/me/known-for/${encodeURIComponent(id)}/hide`, {});
}

/** Up to two shown lines on top of the first tab. */
export async function setLinesOnTop(ids: string[]): Promise<{ on_top: string[] }> {
  return put<{ on_top: string[] }>('/api/profile-page/me/known-for/on-top', { ids });
}

// ── Phase 3: doors and "Leave your card" (board 1 and board 20, CONTRACT P3.3) ──

/** The person's doors as they set them: key, the end of the sentence (none for send_card), who it's open to. */
export interface ProfileDoorSetting { key: string; end?: string | null; open_to: 'anyone' | 'connections' | string }

export async function getMyDoors(): Promise<{ doors: Array<ProfileDoor & { end?: string | null }> }> {
  return get<{ doors: Array<ProfileDoor & { end?: string | null }> }>('/api/profile-page/me/doors');
}

/** At most five, in order; each key once. */
export async function saveDoors(doors: ProfileDoorSetting[]): Promise<{ doors: ProfileDoor[] }> {
  return put<{ doors: ProfileDoor[] }>('/api/profile-page/me/doors', { doors });
}

/** Leave a card on a person's page (a few words, or none). */
/** The Leave your card sheet (P3.3, board 20), read when it opens: the visitor as the person will see them. */
export interface ProfileCardSheet {
  you: { name: string | null; portrait_url: string | null; seen_as: string | null } | null;
  /** The visitor's own last card to this person in the last 30 days, YYYY-MM-DD. */
  left_at: string | null;
  max_chars: number;
}

/** Signed in, not the person: 404 `CARD_CANNOT_LEAVE` when no card can be left (the same answer as leaving one). */
export async function getCardSheet(username: string): Promise<ProfileCardSheet> {
  return get<ProfileCardSheet>(`/api/profile-page/${encodeURIComponent(username)}/card`);
}

export async function leaveCard(username: string, text: string | null): Promise<{ left: boolean; left_at: string }> {
  return post<{ left: boolean; left_at: string }>(`/api/profile-page/${encodeURIComponent(username)}/card`, { text });
}

export async function getMyCards(): Promise<{ cards: ProfileCard[] }> {
  return get<{ cards: ProfileCard[] }>('/api/profile-page/me/cards');
}

/** Marks a card answered once; its link opens today's conversation with the visitor. */
export async function writeBackCard(id: string): Promise<{ id: string; written_back: boolean; link: ProfileLink }> {
  return post<{ id: string; written_back: boolean; link: ProfileLink }>(`/api/profile-page/me/cards/${encodeURIComponent(id)}/write-back`);
}

export async function removeCard(id: string): Promise<{ id: string; removed: boolean }> {
  return del<{ id: string; removed: boolean }>(`/api/profile-page/me/cards/${encodeURIComponent(id)}`);
}
