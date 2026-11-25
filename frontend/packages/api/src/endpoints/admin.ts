// ============================================================
// ADMIN ENDPOINTS — Platform admin operations
// ============================================================

import apiClient, { get, post } from '../client';
import type { ClaimReviewApproval } from './homeOwnership';

export interface AdminClaim {
  id: string;
  home_id: string;
  claimant_user_id: string;
  claim_type: string;
  state: string;
  method: string;
  risk_score: number;
  created_at: string;
  updated_at: string;
  home: {
    id: string;
    address: string;
    city: string;
    state: string;
    zipcode: string;
    name: string;
  } | null;
  claimant: {
    id: string;
    username: string;
    name: string;
    email: string;
    created_at: string;
    profile_picture_url: string | null;
  } | null;
  evidence_count: number;
  /** When the last review action (approve, reject, flag, Request info) happened. */
  reviewed_at?: string | null;
  /** On a claim waiting on the claimant (Request info): documents they sent after the request. */
  documents_since_request?: number;
}

export interface ClaimEvidence {
  available?: boolean;
  eligible_for_review?: boolean;
  availability_code?: string;
  id: string;
  evidence_type: string;
  provider: string;
  status: string;
  storage_ref: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface ClaimDetail {
  evidence_archived?: boolean;
  claim: any;
  home: any;
  claimant: any;
  evidence: ClaimEvidence[];
  /** Null when it couldn't be read; approval itself still decides. */
  approval?: ClaimReviewApproval | null;
  claim_session: { actor_id: string; session_scope: string; home_id: string; claim_id: string };
}

export async function getPendingClaims(): Promise<{ claims: AdminClaim[]; total: number; review_session: { actor_id: string; session_scope: string } }> {
  return get('/api/admin/pending-claims');
}

export async function getClaimDetail(claimId: string, sessionScope?: string): Promise<ClaimDetail> {
  return get(`/api/admin/claims/${claimId}`, undefined, { headers: sessionScope ? { 'x-pantopus-session-scope': sessionScope } : undefined });
}

/** Household roles a platform admin may approve a claim as (`approve_as`); omit it to grant what the claim type gives. */
export type ClaimApprovalRole = 'owner' | 'admin' | 'manager' | 'member' | 'lease_resident' | 'restricted_member' | 'guest';

export async function reviewClaim(
  claimId: string,
  data: {
    action: 'approve' | 'reject' | 'request_more_info';
    review_token: string;
    note?: string;
    approve_as?: ClaimApprovalRole;
    identity_confirmed?: boolean;
  },
  sessionScope?: string,
): Promise<{ message: string }> {
  return post(`/api/admin/claims/${claimId}/review`, data, { headers: sessionScope ? { 'x-pantopus-session-scope': sessionScope } : undefined });
}

// ── Report review queue ─────────────────────────────────────

export type ReportKind = 'user' | 'post' | 'reply' | 'gig' | 'message';
export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

export interface ReportPerson {
  id: string;
  username: string | null;
  name: string | null;
}

export interface AdminReport {
  kind: ReportKind;
  id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  resolved_at: string | null;
  target_id: string;
  /**
   * The reported person, or a post or neighbor message ({ title, excerpt, author }), a reply ({ excerpt, author,
   * moderation_state, post }) or task ({ title, status, poster }). A post or reply under a made-up name has
   * `made_up_name` and no author.
   */
  target: (ReportPerson & Record<string, unknown>) | {
    id: string;
    title?: string | null;
    excerpt?: string;
    post_type?: string | null;
    archived?: boolean;
    status?: string | null;
    author?: ReportPerson | null;
    poster?: ReportPerson | null;
    made_up_name?: string;
    moderation_state?: 'live' | 'held' | 'removed';
    deleted?: boolean;
    post?: { id: string; title: string | null; excerpt: string; archived: boolean; missing?: boolean };
  } | null;
  reporter: ReportPerson | null;
  /** False for neighbor-message reports, which have no review status yet. */
  closable: boolean;
  /** "Report this card" (launch key holiday_card_memories): the report shares that one card, opened with getReportedCard. */
  shared_card?: { kind: 'card' | 'reply' } | null;
}

export async function getReports(status: ReportStatus = 'pending'): Promise<{
  status: ReportStatus;
  reports: AdminReport[];
  counts: Record<ReportKind, number>;
  total: number;
}> {
  return get('/api/admin/reports', { status });
}

export async function resolveReport(
  kind: ReportKind,
  reportId: string,
  outcome: 'resolved' | 'dismissed',
): Promise<{ report: AdminReport }> {
  return post(`/api/admin/reports/${kind}/${reportId}/resolve`, { outcome });
}

/** The one card a "Report this card" shares, as the admins see it: never covered, both names, its dates. */
export interface ReportedCard {
  id: string;
  kind: 'card' | 'reply' | null;
  from_name: string | null;
  to_name: string | null;
  sent_on: string | null;
  delivered_on: string | null;
  card: {
    design: string;
    number: number | null;
    caption: string | null;
    paper: string | null;
    year: number | null;
    verse?: string | null;
    signature?: { w: number; h: number; strokes: number[][] } | null;
    photo?: { file_id: string; width: number | null; height: number | null; alt: string | null } | null;
    voice?: { file_id: string; duration_ms: number | null } | null;
  } | null;
  note: string;
}

/**
 * GET /api/admin/reports/user/:reportId/card: that card and nothing else. Every opening is logged on the server
 * (admin_opened_reported_card); 404 REPORT_CARD_NOT_FOUND when the report shares none.
 */
export async function getReportedCard(reportId: string): Promise<{
  report: { id: string; reason: string; details: string | null; status: ReportStatus; created_at: string };
  card: ReportedCard;
}> {
  return get(`/api/admin/reports/user/${encodeURIComponent(reportId)}/card`);
}

/** The shared card's own photo or voice greeting, as a Blob (private, no-store), through the report's route only. */
export async function getReportedCardMediaBlob(reportId: string, fileId: string, signal?: AbortSignal): Promise<Blob> {
  const response = await apiClient.get<Blob>(
    `/api/admin/reports/user/${encodeURIComponent(reportId)}/card/media/${encodeURIComponent(fileId)}`,
    { responseType: 'blob', signal },
  );
  return response.data;
}

/** Take a reported reply down (moderation) and close every open report on it; its writer is told. */
export async function removeReportedReply(reportId: string): Promise<{
  removed: boolean;
  comment_id: string;
  post_id: string;
  reports_closed: number;
}> {
  return post(`/api/admin/reports/reply/${reportId}/remove`, {});
}

/** Take a reported post down (moderation) and close every open report on it. */
export async function removeReportedPost(reportId: string): Promise<{
  removed: boolean;
  post_id: string;
  reports_closed: number;
}> {
  return post(`/api/admin/reports/post/${reportId}/remove`, {});
}

// ── Business verification documents (platform admins) ───────

export interface VerificationQueueItem {
  id: string;
  business_user_id: string;
  business: {
    id: string;
    username: string | null;
    name: string | null;
    profile_picture_url: string | null;
    /** The type the business says it is; approving verifies it. */
    business_type?: string | null;
  } | null;
  evidence_type: string;
  file_id: string | null;
  /** A link to the document that works for about ten minutes; null when the file is gone. */
  document_url: string | null;
  document_mime_type: string | null;
  /** The platform fee approving sets for the business (a reduced rate for its type), or null when it sets none. */
  fee_on_approval_pct?: number | null;
  /** Unverified pages with this business's name at one of its addresses; approving settles who keeps the name there. */
  same_name_pages?: { business_user_id: string; name: string; username: string | null }[];
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Documents businesses submitted for verification, oldest first. */
export async function getVerificationQueue(): Promise<{ items: VerificationQueueItem[]; total: number }> {
  return get('/api/admin/verification/queue');
}

/** Approve (business becomes document verified) or reject a submitted document. */
export async function reviewVerificationEvidence(
  evidenceId: string,
  decision: 'approve' | 'reject',
  notes?: string,
): Promise<Record<string, unknown>> {
  return post(`/api/admin/verification/${evidenceId}/${decision}`, notes ? { notes } : {});
}

// ── Creator links for Christmas cards (platform admins) ───────

/** A creator's account as the founder sees it on the creators page. */
export interface CreatorAccount {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  /** The creator code this account already has, if any. */
  creator_code: string | null;
}

/** Book sizes (5, 20, 50) to how many. */
export type CreatorBookCounts = Record<string, number>;

/** One creator code and what it brought in. Counts and sums only: nothing about any buyer. */
export interface CreatorSales {
  code: string;
  /** The link to give the creator: the Christmas cards page carrying the code. */
  link: string;
  since: string;
  account: CreatorAccount | null;
  /** People who created an account through this code. */
  joined: number;
  /** Of those, how many bought at least one book that wasn't refunded. */
  buyers: number;
  books: CreatorBookCounts;
  refunded: CreatorBookCounts;
  books_total: number;
  refunded_total: number;
  /** Books not refunded, at list price, in cents. */
  sales_cents: number;
}

export async function getCreatorSales(): Promise<{ creators: CreatorSales[]; books: { credits: number; price_cents: number }[] }> {
  return get('/api/admin/creators');
}

/** Find the account to give a code: an exact email address or username, sent in the body (never in the address). */
export async function findCreatorAccounts(q: string): Promise<{ accounts: CreatorAccount[] }> {
  return post('/api/admin/creators/accounts', { q });
}

/** Give an account its creator code (6–12 letters and digits; kept in capitals). */
export async function giveCreatorCode(userId: string, code: string): Promise<{ account: CreatorAccount; code: string; link: string }> {
  return post('/api/admin/creators', { user_id: userId, code });
}

// ── Funnel summary (platform admins) ───────────────────────────

/** Book sizes (5, 20, 50) to how many; null when the books couldn't be read. */
export type FunnelBookCounts = Record<string, number> | null;

/** Christmas cards for a window or one UTC day. Counts only: nobody is listed. */
export interface FunnelCardCounts {
  senders: number;
  cards_sent: number;
  cards_per_sender: number | null;
  by_via: { person: number; email: number; link: number };
  by_stamp: { free: number; paid: number; none: number };
  travels: number;
  taken_back: number;
  /** Link pages read signed out by a browser or an app (a ceiling: the same person can open it again). */
  pages_seen: number;
  /** The web page's own server reads: one per web visit, and one per link preview. Not in pages_seen. */
  page_server_reads: number;
  codes_sent: number;
  claimed: number;
  /** Claims by an account made after the card was sealed. */
  joined: number;
  replies: number;
  /** Cards passed on, one person each. */
  passed_on: number;
  /** People who passed a card on. */
  passers: number;
  /** Joiners who sent a card of their own within 7 days of taking theirs. */
  joiners_who_sent: number;
  books: FunnelBookCounts;
  refunded: FunnelBookCounts;
  sales_cents: number | null;
  /** Joiners who sent their own, per sender. */
  loop: number | null;
}

/** Around you for the last 7 or 30 days: distinct people who opened it, opens, and what its posts got. */
export interface FunnelAroundYouCounts {
  people: number;
  opens: number;
  reactions: number;
  replies: number;
  saves: number;
  /** Reposts and reposts with the person's own words. */
  reposts: number;
}

export interface FunnelLadder {
  previews: number; aha_views: number; shares: number; walls: number; registers: number; accounts: number;
  /** The lookup's record taps, Ask opens and visitors who reached its end (LOOKUPORDER); absent from older servers. */
  record_opens?: number; ask_opens?: number; ends_reached?: number;
}

export interface FunnelSummary {
  days: number;
  since: string;
  rows: number;
  truncated: boolean;
  ladder: FunnelLadder;
  rates: Record<string, number | null>;
  events: Record<string, number>;
  /** The same ladder per `?r=` code the visitor arrived with, most lookups first; `(direct)` is no code. */
  by_route: { route: string; ladder: FunnelLadder; rates: Record<string, number | null> }[];
  /** The same ladder per order the web drew the lookup in (v1, v2), only the layouts seen; absent from older servers. */
  by_layout?: { layout: 'v1' | 'v2'; ladder: FunnelLadder; rates: Record<string, number | null> }[];
  plans: { events: Record<string, number>; rates: Record<string, number | null> };
  activation: { cohort_users: number; activated_users: number; matured_users: number; activated_matured_users: number;
    pending_users: number; matured_rate: number | null; truncated: boolean };
  cards: FunnelCardCounts & { days: (FunnelCardCounts & { day: string })[] };
  /** Null when it couldn't be read; absent from older servers. */
  around_you?: { last_7_days: FunnelAroundYouCounts; last_30_days: FunnelAroundYouCounts } | null;
}

export async function getFunnelSummary(days = 30): Promise<FunnelSummary> {
  return get(`/api/admin/funnel/summary?days=${encodeURIComponent(String(days))}`);
}

// ── Around you: sources for a new county (platform admins) ─────

/** What the server's own check of one address found (seeder_sources.check_note). */
export interface AroundSourceNote {
  /** proposed: it reads. refused: the site refuses automated readers. no_feed / unreadable: nothing to read. */
  status: 'proposed' | 'refused' | 'no_feed' | 'unreadable' | 'dropped';
  checked_at: string;
  kind: string | null;
  why: string | null;
  home_page: string | null;
  reason: string | null;
  format: string | null;
  feed_title: string | null;
  items: number | null;
  /** Items from the last 7 days (a calendar: events in the next 7 days). */
  recent_7d: number | null;
  /** Items from the last 2 days: what the content fetcher keeps today (it reads a story for 48 hours). */
  recent_2d?: number | null;
  /** Items naming the city or county (the words are in place_words). */
  names_place: number | null;
  place_words: string | null;
  newest_at: string | null;
  samples: string[];
  subscription: { asked: boolean | null; sign: string } | null;
  tried: string[];
  reviewed_at?: string;
}

export interface AroundSource {
  id: string;
  source_id: string;
  source_type: 'rss' | 'ical';
  url: string | null;
  display_name: string;
  category: string;
  active: boolean;
  review_state: 'proposed' | 'approved' | 'rejected' | null;
  proposed_by: 'finder' | 'hand' | null;
  access: 'free' | 'subscription' | null;
  keep_hours: number | null;
  /** An Around you topic id when the source is about one thing; null or absent: general news. */
  topic?: string | null;
  note: AroundSourceNote | null;
}

export interface AroundSourceRun {
  state: 'running' | 'done' | 'failed';
  trigger: 'job' | 'button';
  started_at: string;
  finished_at: string | null;
  error: string | null;
  summary: {
    claude: { outcome: string; candidates?: number; input?: number; output?: number; cache_read?: number; searches?: number; requests?: number } | null;
    proposed: number;
    noted: number;
    known: number;
    dropped: { name: string; reason: string }[];
    ms: number;
    /** The Claude step gave no answer, so the feeds job will hand this place to the finder again. */
    retry?: boolean;
  } | null;
}

export interface AroundSourceRegion {
  region: string;
  display_name: string | null;
  state: string | null;
  county_name: string | null;
  provisioned_by: string;
  sources_checked_at: string | null;
  run: AroundSourceRun | null;
  sources: AroundSource[];
}

export async function getAroundSources(): Promise<{ finder_on: boolean; kinds: { id: string; label: string }[]; regions: AroundSourceRegion[] }> {
  return get('/api/admin/around-sources');
}

/** Runs the finder for one region in the background. */
export async function findAroundSources(region: string): Promise<{ started: boolean; finder_on: boolean; run: AroundSourceRun | null }> {
  return post(`/api/admin/around-sources/regions/${encodeURIComponent(region)}/find`, {});
}

/** Tests one address and proposes it by hand. */
export async function addAroundSource(region: string, body: { kind: string; name: string; url: string }): Promise<{
  outcome: 'proposed' | 'noted' | 'known' | 'dropped';
  result: { status: string; url: string | null; reason: string | null };
}> {
  return post(`/api/admin/around-sources/regions/${encodeURIComponent(region)}/sources`, body);
}

export async function approveAroundSource(
  id: string,
  body: {
    access: 'free' | 'subscription';
    keep_hours: number | null;
    display_name?: string | null;
    /** What the source is about when it is about one thing (an Around you topic id); null: general news. */
    topic?: string | null;
  },
): Promise<{ source: AroundSource }> {
  return post(`/api/admin/around-sources/sources/${encodeURIComponent(id)}/approve`, body);
}

export async function rejectAroundSource(id: string): Promise<{ source: AroundSource }> {
  return post(`/api/admin/around-sources/sources/${encodeURIComponent(id)}/reject`, {});
}
