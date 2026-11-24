/**
 * The rows a profile page or an avatar mark is composed from (CONTRACT.md section 9), for one person or up to 100, in
 * one database call: public.profile_page_rows (migration 20261124*_profile_page_rows.sql). Production serves REST calls
 * made with the server key one at a time, so a page read is one call for every person's content, their saved parts,
 * privacy settings and Local Profile, and the viewer's relationship, shared home and blocks.
 *
 * The function decides nothing. This file shapes its rows the way the composer reads them, and the rules stay in
 * JavaScript: who may open a page (person.js, through routes/users.js's own checks), the inks and the parts
 * (compose.js). A failed read throws: the rows carry the privacy facts the view depends on.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { NOT_HELPFUL_POST_TYPES } = require('../../utils/postReaction');
const { profileTiesEnabled } = require('../../utils/featureFlags');
const { readShare } = require('./parts');

const SOURCE_LIMIT_MS = 1500;
const MONTH_ROW_LIMIT = 1000;

/** Resolves to the read's value, or null when it fails or takes longer than the limit (content reads only). */
function bounded(label, userId, run, limitMs = SOURCE_LIMIT_MS) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      logger.warn('Profile page source slow; left out', { source: label, userId });
      resolve(null);
    }, limitMs);
  });
  const read = Promise.resolve()
    .then(run)
    .catch((err) => {
      logger.warn('Profile page source unavailable; left out', { source: label, userId, error: err.message });
      return null;
    });
  return Promise.race([read, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The raw rows for these people, keyed by account id (a person with no account isn't in it). `viewerId`: the signed-in
 * viewer whose side to read, or null. `oldestFirst`: keep a person's oldest rows when a list is long (the marks, which
 * want the first month), else the newest (the page). `reviewers`: also the writers of the reviews, for their names.
 */
async function readRows(ids, viewerId = null, { oldestFirst = false, reviewers = false, rowLimit = MONTH_ROW_LIMIT } = {}) {
  const { data, error } = await supabaseAdmin.rpc('profile_page_rows', {
    p_ids: ids,
    p_viewer: viewerId,
    p_not_helpful: NOT_HELPFUL_POST_TYPES,
    p_row_limit: rowLimit,
    p_oldest_first: oldestFirst,
    p_reviewers: reviewers,
  });
  if (error) throw error;
  return new Map(Object.entries(data || {}));
}

// Verified homes, as the page counts them (homePermissions.isVerified: the mail level or a standing fast check; or a
// verified ownership of that home as a person). Ended occupancies don't count.
async function homesFrom(rows) {
  const { verifiedRows } = require('../../utils/homePermissions');
  const occ = (rows.occupancies || []).filter((row) => !row.end_at);
  if (!occ.length) return [];
  const isVerifiedRow = await verifiedRows(occ);
  const owned = new Map((rows.owners || []).map((o) => [o.home_id, o]));
  return occ
    .map((row) => ({
      home_id: row.home_id,
      city: row.city || null,
      state: row.state || null,
      verified: isVerifiedRow(row) || owned.has(row.home_id),
      source: isVerifiedRow(row) ? (row.verification_source === 'claim' ? `fast_${row.fast_check_kind}` : 'mail') : 'owner',
      verified_at: row.verified_at || row.fast_check_at || owned.get(row.home_id)?.updated_at || row.created_at,
    }))
    .filter((home) => home.verified);
}

/**
 * People read as `{ user, profile }` (the account and its Local Profile), named as others see them
 * (services/chatPeople.js, as the old reads name a review's writer): account id → { name, username, avatar }.
 */
function namesOf(read) {
  const list = (read || []).filter((p) => p?.user?.id);
  if (!list.length) return new Map();
  const { chatPeopleFrom, reviewerRow } = require('../chatPeople');
  const { chosenUsernameOrNull } = require('../../utils/personalUsername');
  const users = list.map((p) => p.user);
  const people = chatPeopleFrom(users, list.map((p) => p.profile).filter(Boolean));
  return new Map(users.map((u) => {
    const shown = reviewerRow(u, people) || {};
    return [String(u.id), { name: shown.name || null, username: chosenUsernameOrNull(shown.username), avatar: shown.profile_picture_url || null }];
  }));
}

// Reviews with words, each with what its writer did (`role`: hired the person, or the person did a job for them) and,
// when the writers were read, their name as others see it.
function reviewsFrom(userId, rows) {
  const reviews = rows.reviews || [];
  const writerById = namesOf(rows.reviewers || []);
  return {
    rows: reviews.map((r) => {
      let role = null;
      if (r.gig_accepted_by && String(r.gig_accepted_by) === String(userId)) role = 'hired';
      else if (r.gig_user_id && String(r.gig_user_id) === String(userId)) role = 'worked_for';
      const writer = writerById.get(String(r.reviewer_id));
      return {
        id: r.id, gig_id: r.gig_id, reviewer_id: r.reviewer_id, comment: r.comment, created_at: r.created_at, role,
        reviewer_name: writer?.name || null, reviewer_username: writer?.username || null, reviewer_avatar: writer?.avatar || null,
      };
    }),
  };
}

function professionalFrom(row) {
  if (!row || row.is_public !== true || row.is_active === false || row.verification_status !== 'verified') return null;
  return row;
}

/**
 * Credits on the person's pieces (phase 2B), none while PROFILE_TIES is off. Typed names and signed credits for
 * everyone (the composer decides what each view names); asked and "did not confirm" only for the owner, and an ask for
 * the one asked. A credit whose party turned off "Let people name me on their work", or with a block either way
 * between the two, is gone for everyone. Each person credit carries `party_shown`, their name as others see it.
 */
function creditsFrom(rows, { owner = false, viewerId = null } = {}) {
  if (!rows || !profileTiesEnabled()) return [];
  const extra = (rows.owner_only_credits || []).filter((c) => owner
    || (viewerId && c.status === 'asked' && String(c.party_user_id) === String(viewerId)));
  const list = [...(rows.credits || []), ...extra]
    .filter((c) => !c.party_user_id || (c.party_ties_enabled !== false && c.party_blocked !== true));
  const names = namesOf(list.map((c) => c.party));
  return list.map(({ party, ...c }) => ({ ...c, party_shown: c.party_user_id ? (names.get(String(c.party_user_id)) || {}) : null }));
}

/**
 * Others' pieces this person signed and shows on their Work ("With <owner>"), none while PROFILE_TIES is off or the
 * person's own switch is off. Each carries `owner_shown` (the owner's name as others see it); the composer shows each
 * only to a viewer who may open the owner's piece.
 */
function withTiesFrom(rows) {
  if (!rows || !profileTiesEnabled() || !readShare(rows.share).ties_enabled) return [];
  const list = rows.signed_ties || [];
  const names = namesOf(list.map((t) => t.owner));
  return list.map(({ owner, ...t }) => ({ ...t, owner_shown: names.get(String(t.owner_id)) || {} }));
}

/**
 * One person's rows, shaped as the composer reads them (compose.buildRecord). `viewerId`: the signed-in viewer whose
 * side the rows were read for (null for a preview or a link), so an ask shows to the one asked.
 */
async function sourcesFrom(userId, rows, { pinned = true, owner = false, viewerId = null } = {}) {
  if (!rows) return {};
  // Hidden and draft pieces are the owner's alone (SPEC phase 2A): nobody else's rows ever carry them.
  return {
    homes: await homesFrom(rows),
    paidJobs: rows.paid_jobs || [],
    reviews: reviewsFrom(userId, rows),
    certifications: rows.certifications || [],
    professional: professionalFrom(rows.professional),
    businesses: rows.businesses || [],
    skills: rows.skills || [],
    pieces: owner ? [...(rows.pieces || []), ...(rows.owner_only_pieces || [])] : (rows.pieces || []),
    tools: rows.tools || null,
    plansHosted: rows.plans || [],
    supportTrains: (rows.trains || []).map((t) => ({ support_train_id: t.support_train_id, created_at: t.created_at, slot: { slot_date: t.slot_date } })),
    helpful: { count: Number(rows.helpful_count) || 0, months: rows.helpful_months || [] },
    pinned: pinned ? Boolean(rows.pinned) : null,
    credits: creditsFrom(rows, { owner, viewerId }),
    withTies: withTiesFrom(rows),
  };
}

/** Relationship status from the viewer's side, as visibilityPolicy.getRelationshipStatus reads it. */
function relationshipStatus(row, viewerId, { forViewer = false } = {}) {
  if (!row || !viewerId) return 'none';
  if (row.status === 'blocked') return !forViewer || String(row.blocked_by) === String(viewerId) ? 'blocked' : 'none';
  if (row.status === 'accepted') return 'connected';
  if (row.status === 'pending') return String(row.requester_id) === String(viewerId) ? 'pending_sent' : 'pending_received';
  return 'none';
}

module.exports = { readRows, sourcesFrom, creditsFrom, namesOf, relationshipStatus, bounded, SOURCE_LIMIT_MS };
