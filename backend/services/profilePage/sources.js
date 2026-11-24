/**
 * The rows a profile page is composed from (CONTRACT.md section 9), read in parallel. Every read here is content, not
 * a privacy check: one that fails or is slow comes back `null`, and the composer leaves its lines out (SPEC 4.13).
 * Privacy checks (who may open the page, who sees the city) live in person.js and fail the request instead.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { NOT_HELPFUL_POST_TYPES } = require('../../utils/postReaction');

const SOURCE_LIMIT_MS = 1500;

// A sign-up that wasn't canceled, as GET /api/activities/support-trains/:id and profileContributions count a helper.
const HELPER_RESERVATION_STATUSES = ['reserved', 'delivered', 'confirmed'];
// A worker's job the poster paid for and that wasn't refunded or disputed.
const PAID_STATUSES = ['captured_hold', 'succeeded', 'transfer_pending', 'transfer_scheduled', 'transferred', 'paid'];
// A business Pantopus checked (BusinessProfile.verification_status).
const VERIFIED_BUSINESS = ['document_verified', 'government_verified'];

const MONTH_ROW_LIMIT = 1000;

/** Resolves to the read's value, or null when it fails or takes longer than the limit. */
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

function rows(result) {
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

async function readHomes(userId) {
  const { FAST_CHECK_COLUMNS, verifiedRows } = require('../../utils/homePermissions');
  const [occupancies, owners] = await Promise.all([
    supabaseAdmin
      .from('HomeOccupancy')
      .select(`home_id, user_id, is_active, verification_status, verification_source, verified_at, start_at, end_at,
        created_at, ${FAST_CHECK_COLUMNS}, home:home_id ( id, city, state )`)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('HomeOwner')
      .select('home_id, subject_type, created_at, updated_at')
      .eq('subject_id', userId)
      .eq('subject_type', 'user')
      .eq('owner_status', 'verified'),
  ]);
  const occ = rows(occupancies).filter((row) => row.home && !row.end_at);
  const ownerRows = rows(owners);
  const isVerifiedRow = await verifiedRows(occ);
  const owned = new Set(ownerRows.map((row) => row.home_id));
  return occ
    .map((row) => ({
      home_id: row.home_id,
      city: row.home.city || null,
      state: row.home.state || null,
      verified: isVerifiedRow(row) || owned.has(row.home_id),
      source: isVerifiedRow(row) ? (row.verification_source === 'claim' ? `fast_${row.fast_check_kind}` : 'mail') : 'owner',
      verified_at: row.verified_at || row.fast_check_at
        || ownerRows.find((o) => o.home_id === row.home_id)?.updated_at || row.created_at,
    }))
    .filter((home) => home.verified);
}

async function readPaidJobs(userId) {
  return rows(await supabaseAdmin
    .from('Gig')
    .select('id, owner_confirmed_at, worker_completed_at, updated_at')
    .eq('accepted_by', userId)
    .eq('status', 'completed')
    .in('payment_status', PAID_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(MONTH_ROW_LIMIT));
}

// Reviews with words, each with what its writer did (`role`: hired the person, or the person did a job for them) and,
// for a signed-in reader, the writer's name as others see it (services/chatPeople.js, as the old read names them).
async function readReviews(userId, { names = false } = {}) {
  const reviews = rows(await supabaseAdmin
    .from('Review')
    .select('id, gig_id, reviewer_id, comment, created_at')
    .eq('reviewee_id', userId)
    .not('comment', 'is', null)
    .neq('comment', '')
    .order('created_at', { ascending: false })
    .limit(20));
  if (!reviews.length) return { rows: [] };
  const gigIds = [...new Set(reviews.map((r) => r.gig_id).filter(Boolean))];
  const reviewerIds = [...new Set(reviews.map((r) => r.reviewer_id).filter(Boolean))];
  const { loadChatPeople, reviewerRow } = require('../chatPeople');
  const [gigs, users, people] = await Promise.all([
    gigIds.length ? supabaseAdmin.from('Gig').select('id, user_id, accepted_by').in('id', gigIds) : { data: [] },
    names ? supabaseAdmin.from('User').select('id, username, name, first_name, last_name, profile_picture_url').in('id', reviewerIds) : { data: [] },
    names ? loadChatPeople(reviewerIds) : new Map(),
  ]);
  const gigById = new Map(rows(gigs).map((g) => [g.id, g]));
  const nameById = new Map(rows(users).map((u) => {
    const shown = reviewerRow(u, people);
    return [u.id, shown?.name || null];
  }));
  return {
    rows: reviews.map((r) => {
      const gig = gigById.get(r.gig_id);
      let role = null;
      if (gig && String(gig.accepted_by) === String(userId)) role = 'hired';
      else if (gig && String(gig.user_id) === String(userId)) role = 'worked_for';
      return { ...r, role, reviewer_name: names ? nameById.get(r.reviewer_id) || null : null };
    }),
  };
}

async function readCertifications(userId) {
  return rows(await supabaseAdmin
    .from('UserCertification')
    .select('id, certification_name, issuing_organization, issue_date, expiry_date, is_verified, created_at')
    .eq('user_id', userId)
    .eq('show_on_profile', true)
    .order('issue_date', { ascending: false, nullsFirst: false })
    .limit(30));
}

async function readProfessional(userId) {
  const { data, error } = await supabaseAdmin
    .from('UserProfessionalProfile')
    .select('verification_status, verification_completed_at, is_public, is_active')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.is_public !== true || data.is_active === false || data.verification_status !== 'verified') return null;
  return data;
}

async function readBusinesses(userId) {
  const team = rows(await supabaseAdmin
    .from('BusinessTeam')
    .select('business_user_id, joined_at, created_at')
    .eq('user_id', userId)
    .eq('role_base', 'owner')
    .eq('is_active', true)
    .limit(10));
  if (!team.length) return [];
  const ids = team.map((row) => row.business_user_id);
  const [profiles, accounts] = await Promise.all([
    supabaseAdmin
      .from('BusinessProfile')
      .select('business_user_id, verified_at, published_at')
      .in('business_user_id', ids)
      .eq('is_published', true)
      .in('verification_status', VERIFIED_BUSINESS),
    supabaseAdmin
      .from('User')
      .select('id, name, username, account_type, profile_picture_url')
      .in('id', ids)
      .eq('account_type', 'business'),
  ]);
  const profileById = new Map(rows(profiles).map((row) => [row.business_user_id, row]));
  const accountById = new Map(rows(accounts).map((row) => [row.id, row]));
  return team
    .filter((row) => profileById.has(row.business_user_id) && accountById.has(row.business_user_id))
    .map((row) => {
      const account = accountById.get(row.business_user_id);
      return {
        id: account.id,
        name: account.name || account.username,
        username: account.username,
        picture_url: account.profile_picture_url || null,
        since: row.joined_at || row.created_at,
      };
    });
}

async function readSkills(userId) {
  return rows(await supabaseAdmin
    .from('UserSkill')
    .select('id, skill_name, is_verified, verified_at, created_at')
    .eq('user_id', userId)
    .or('show_on_profile.is.null,show_on_profile.eq.true')
    .order('display_order', { ascending: true })
    .limit(40));
}

async function readPieces(userId) {
  return rows(await supabaseAdmin
    .from('UserPortfolio')
    .select('id, title, description, portfolio_type, media_urls, thumbnail_url, file_ids, skills_used, external_url, '
      + 'github_url, demo_url, completed_at, display_order, is_featured, created_at')
    .eq('user_id', userId)
    .eq('is_visible', true)
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(60));
}

async function readPlansHosted(userId) {
  return rows(await supabaseAdmin
    .from('Plan')
    .select('post_id, ended_at, updated_at')
    .eq('host_user_id', userId)
    .eq('status', 'ended')
    .limit(MONTH_ROW_LIMIT));
}

async function readSupportTrains(userId) {
  return rows(await supabaseAdmin
    .from('SupportTrainReservation')
    .select('support_train_id, created_at, slot:slot_id ( slot_date ), train:support_train_id!inner ( status )')
    .eq('user_id', userId)
    .in('status', HELPER_RESERVATION_STATUSES)
    .neq('train.status', 'draft')
    .limit(MONTH_ROW_LIMIT));
}

// Helpful marks as profileContributions counts them: others' marks on the person's own posts (not for a business or
// as a persona), not archived or removed, only the kinds whose reaction is Helpful. The exact count, and the months of
// the newest marks.
async function readHelpfulMarks(userId) {
  const result = await supabaseAdmin
    .from('PostLike')
    .select('created_at, post:post_id!inner ( user_id )', { count: 'exact' })
    .eq('post.user_id', userId)
    .is('post.archived_at', null)
    .neq('post.moderation_state', 'removed')
    .or('post_as.is.null,post_as.not.in.(business,persona)', { referencedTable: 'post' })
    .or('identity_context_type.is.null,identity_context_type.neq.persona', { referencedTable: 'post' })
    .or(`post_type.is.null,post_type.not.in.(${NOT_HELPFUL_POST_TYPES.join(',')})`, { referencedTable: 'post' })
    .neq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MONTH_ROW_LIMIT);
  if (result.error) throw result.error;
  if (!Number.isInteger(result.count)) throw new Error('Missing Helpful count');
  return { count: result.count, months: (result.data || []).map((row) => row.created_at) };
}

async function hasPinnedPosts(userId) {
  const { count, error } = await supabaseAdmin
    .from('Post')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('profile_pinned_at', 'is', null)
    .is('archived_at', null);
  if (error) throw error;
  return (count || 0) > 0;
}

/**
 * Every content read for one person, started at once. `want` limits it to what the view can show (a signed-out
 * read skips pinned posts, for example). Returns an object of values, each null when its read failed.
 */
function readSources(userId, want = {}) {
  const skip = (key) => want[key] === false;
  const start = (key, run) => (skip(key) ? Promise.resolve(null) : bounded(key, userId, () => run(userId)));
  const reads = {
    homes: start('homes', readHomes),
    paidJobs: start('paidJobs', readPaidJobs),
    reviews: skip('reviews') ? Promise.resolve(null)
      : bounded('reviews', userId, () => readReviews(userId, { names: want.reviewerNames === true })),
    certifications: start('certifications', readCertifications),
    professional: start('professional', readProfessional),
    businesses: start('businesses', readBusinesses),
    skills: start('skills', readSkills),
    pieces: start('pieces', readPieces),
    plansHosted: start('plansHosted', readPlansHosted),
    supportTrains: start('supportTrains', readSupportTrains),
    helpful: start('helpful', readHelpfulMarks),
    pinned: start('pinned', hasPinnedPosts),
  };
  const keys = Object.keys(reads);
  return Promise.all(keys.map((key) => reads[key]))
    .then((values) => Object.fromEntries(keys.map((key, i) => [key, values[i]])));
}

module.exports = { readSources, bounded, SOURCE_LIMIT_MS };
