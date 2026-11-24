// ============================================================
// HOME RECORD — "This home's record" / "Your home's record"
//
// The server draws the page as a list of blocks (contract v1, docs/product/home-record/README.md); a client draws each
// block and skips a kind it doesn't know, so later pieces arrive with a server release. Strings are final words.
//
//   GET /api/public/home-record?address=…   `lookup` signed out, `buyer` signed in (the public half opened)
//   GET /api/saved-places/:id/record         `buyer` for a saved address
//   GET /api/homes/:id/record                `member` or `owner`, from the viewer's standing on the Home
// ============================================================

import { get } from '../client';

export type HomeRecordState = 'lookup' | 'buyer' | 'member' | 'owner';
/** A buyer's row of actions under the header. A client skips an id it doesn't know. */
export type HomeRecordAction = { id: 'save' | 'share' | 'claim' | string; label: string; url: string };
export type HomeRecordChip = { tone: 'success' | 'warning' | 'neutral'; text: string };
export type HomeRecordLink = { label: string; url: string };
export type HomeRecordTone = 'low' | 'mid' | 'high';
export type HomeRecordIcon = 'history' | 'trend' | 'tag' | 'bank' | 'bars' | 'shield' | 'image' | 'wrench' | 'bell' | 'layers'
  | 'home' | 'alert' | 'file' | 'mail' | 'percent' | 'eye_off';

/** `[x, y]` fractions of the image, 0 to 1. */
export type HomeRecordOutline = Array<[number, number]>;

export interface PictureBlock {
  kind: 'picture'; id: string;
  above: { image_url: string; outline: HomeRecordOutline | null; chips: Array<{ at: 'bl' | 'br'; text: string }> } | null;
  street: { lat: number; lng: number } | null;
  caption: string | null;
}
export interface FactsBlock { kind: 'facts'; id: string; tiles: Array<{ label: string; value: string; unit: string | null }>; line: string | null; source: string | null }
export interface MetersBlock {
  kind: 'meters'; id: string; title: string;
  groups: Array<{ title: string; rows: Array<{ label: string; level: number; tone: HomeRecordTone; word: string }> }>;
  note: string | null;
}
export interface IntroBlock { kind: 'intro'; id: string; title: string; body: string }
export interface ClosedGroupBlock { kind: 'closed_group'; id: string; title: string; chip: string | null; items: Array<{ icon: HomeRecordIcon | string; title: string; line: string }> }
export interface PromiseBlock {
  kind: 'promise'; id: string; title: string; body: string;
  steps: Array<{ title: string; line: string }>;
  button: HomeRecordLink;
  alt: { lead: string; label: string; url: string } | null;
}
export interface NoteBlock { kind: 'note'; id: string; icon: HomeRecordIcon | string; text: string }
export interface SectionLabelBlock { kind: 'section_label'; id: string; text: string }
export interface ValueBlock {
  kind: 'value'; id: string; label: string; value: string; chip: HomeRecordChip | null;
  bars: Array<{ year: string; amount: number }>;
  source: string | null;
  estimate: { label: string; text: string; low: number; high: number; mark: number; note: string | null } | null;
}
export interface PhotoYearsBlock {
  kind: 'photo_years'; id: string; title: string; count: string | null;
  photos: Array<{ year: string; label: string; image_url: string; outline: HomeRecordOutline | null }>;
  note: string | null;
}
export interface TimelineBlock {
  kind: 'timeline'; id: string; title: string;
  items: Array<{ title: string; right: string | null; strong: boolean; line: string | null; mono: string | null }>;
  note: string | null;
}
export interface NoticeBlock { kind: 'notice'; id: string; eyebrow: string; title: string; line: string | null }
export interface RowsBlock {
  kind: 'rows'; id: string; title: string; lead: string | null;
  rows: Array<{ label: string; value: string | null; mono: boolean; chip: HomeRecordChip | null }>;
  note: string | null; action: HomeRecordLink | null;
}
export interface TilesBlock {
  kind: 'tiles'; id: string; title: string;
  tiles: Array<{ label: string; value: string; line: string | null }>;
  rows: Array<{ label: string; value: string }>;
  note: string | null;
}
export interface BarsBlock {
  kind: 'bars'; id: string; title: string;
  items: Array<{ title: string; right: string | null; tone: HomeRecordTone; fill: number; line: string | null }>;
  note: string | null;
}
export interface CardBlock {
  kind: 'card'; id: string; title: string; chip: HomeRecordChip | null; lead: string | null;
  rows: Array<{ id: string; label: string; value: string }>;
  notes: string[]; source: string | null; action: HomeRecordLink | null;
}

export type HomeRecordBlock = PictureBlock | FactsBlock | MetersBlock | IntroBlock | ClosedGroupBlock | PromiseBlock | NoteBlock
  | SectionLabelBlock | ValueBlock | PhotoYearsBlock | TimelineBlock | NoticeBlock | RowsBlock | TilesBlock | BarsBlock | CardBlock;

export interface HomeRecord {
  v: number;
  state: HomeRecordState;
  header: { chip: HomeRecordChip | null; title: string; subtitle: string | null };
  /** The buyer state only. */
  actions?: HomeRecordAction[];
  /** In order. A kind this build doesn't know arrives as an object it skips. */
  blocks: Array<HomeRecordBlock | { kind: string; id: string }>;
  footer: string | null;
}

/** GET /api/public/home-record?address=… — the record's open part for a looked-up address (backend/routes/public.js). */
export async function getPublicHomeRecord(address: string): Promise<HomeRecord> {
  return get<HomeRecord>('/api/public/home-record', { address });
}

/** GET /api/homes/:id/record — the record for a person's Home (backend/routes/homeRecordPage.js). */
export async function getHomeRecord(homeId: string): Promise<HomeRecord> {
  return get<HomeRecord>(`/api/homes/${encodeURIComponent(homeId)}/record`);
}

/** GET /api/saved-places/:id/record — a saved address's public record, the `buyer` state (backend/routes/savedPlaces.js). */
export async function getSavedPlaceRecord(savedPlaceId: string): Promise<HomeRecord> {
  return get<HomeRecord>(`/api/saved-places/${encodeURIComponent(savedPlaceId)}/record`);
}
