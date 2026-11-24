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

// Reviews with words, each with what its writer did (`role`: hired the person, or the person did a job for them) and,
// when the writers were read, their name as others see it (services/chatPeople.js, as the old read names them).
function reviewsFrom(userId, rows) {
  const reviews = rows.reviews || [];
  let writerById = new Map();
  if ((rows.reviewers || []).length) {
    const { chatPeopleFrom, reviewerRow } = require('../chatPeople');
    const { chosenUsernameOrNull } = require('../../utils/personalUsername');
    const users = rows.reviewers.map((r) => r.user);
    const people = chatPeopleFrom(users, rows.reviewers.map((r) => r.profile).filter(Boolean));
    writerById = new Map(users.map((u) => {
      const shown = reviewerRow(u, people) || {};
      return [String(u.id), { name: shown.name || null, username: chosenUsernameOrNull(shown.username), avatar: shown.profile_picture_url || null }];
    }));
  }
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

/** One person's rows, shaped as the composer reads them (compose.buildRecord). */
async function sourcesFrom(userId, rows, { pinned = true } = {}) {
  if (!rows) return {};
  return {
    homes: await homesFrom(rows),
    paidJobs: rows.paid_jobs || [],
    reviews: reviewsFrom(userId, rows),
    certifications: rows.certifications || [],
    professional: professionalFrom(rows.professional),
    businesses: rows.businesses || [],
    skills: rows.skills || [],
    pieces: rows.pieces || [],
    plansHosted: rows.plans || [],
    supportTrains: (rows.trains || []).map((t) => ({ support_train_id: t.support_train_id, created_at: t.created_at, slot: { slot_date: t.slot_date } })),
    helpful: { count: Number(rows.helpful_count) || 0, months: rows.helpful_months || [] },
    pinned: pinned ? Boolean(rows.pinned) : null,
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

module.exports = { readRows, sourcesFrom, relationshipStatus, bounded, SOURCE_LIMIT_MS };
