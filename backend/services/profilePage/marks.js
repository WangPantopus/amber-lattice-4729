/**
 * GET /api/profile-page/marks?ids=… (CONTRACT.md section 7, board 6): the ring an avatar wears anywhere in the app,
 * for up to 100 people at once. For each person: `since`, the first month with anything in a lane that reaches this
 * viewer, and `seen`, whether any such month is Seen. Worked out with the page's own record (compose.buildRecord) and
 * the same parts and views, so an avatar never tells more than that person's page shows the viewer.
 *
 * Left out (no ring): anyone the viewer may not open (a private profile, "Who can find you" narrower than the viewer,
 * a block either way), a business, an unknown id, and a person with nothing shown. Content reads are bounded like
 * the page's; a failed privacy read fails the request.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const { loadUserSearchAccess } = require('../../utils/visibilityPolicy');
const { bounded } = require('./sources');
const { readShare, reaches } = require('./parts');
const { buildRecord } = require('./compose');

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;
const ROW_LIMIT = 2000;
const LANE_PART = { home: 'record_home', work: 'record_work', others: 'record_others' };
const PAID_STATUSES = ['captured_hold', 'succeeded', 'transfer_pending', 'transfer_scheduled', 'transferred', 'paid'];
const VERIFIED_BUSINESS = ['document_verified', 'government_verified'];
const HELPER_RESERVATION_STATUSES = ['reserved', 'delivered', 'confirmed'];

function rows(result) {
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

function groupBy(list, key) {
  const out = new Map();
  for (const row of list) {
    const k = String(typeof key === 'function' ? key(row) : row[key]);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(row);
  }
  return out;
}

/** Parse `ids=a,b,c` into unique account ids, or null when it isn't a list of at most 100 ids. */
function parseIds(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
  if (!ids.length || ids.length > MAX_IDS || !ids.every((id) => ID_RE.test(id))) return null;
  return ids;
}

// ---------- privacy: who may be seen, and as which view ----------

async function readPeople(ids) {
  const withShare = await supabaseAdmin.from('User').select('id, account_type, profile_visibility, profile_share').in('id', ids);
  if (!withShare.error) return rows(withShare);
  if (withShare.error.code !== '42703') throw withShare.error;
  return rows(await supabaseAdmin.from('User').select('id, account_type, profile_visibility').in('id', ids));
}

// Profile blocks of any scope, both ways (canAccessPublicUserProfile's isScopedBlocked(…, 'any')); the batched search
// access covers the full and search-only scopes, this adds business-context ones.
async function readAnyScopeBlocks(viewerId, ids) {
  const [mine, theirs] = await Promise.all([
    supabaseAdmin.from('UserProfileBlock').select('blocked_user_id').eq('user_id', viewerId).in('blocked_user_id', ids),
    supabaseAdmin.from('UserProfileBlock').select('user_id').eq('blocked_user_id', viewerId).in('user_id', ids),
  ]);
  return new Set([...rows(mine).map((r) => String(r.blocked_user_id)), ...rows(theirs).map((r) => String(r.user_id))]);
}

// People among `ids` who share an active home with the viewer (visibilityPolicy.shareHome, batched).
async function readHousehold(viewerId, ids) {
  const homes = rows(await supabaseAdmin.from('HomeOccupancy').select('home_id').eq('user_id', viewerId)
    .eq('is_active', true).is('end_at', null));
  if (!homes.length) return new Set();
  const shared = rows(await supabaseAdmin.from('HomeOccupancy').select('user_id').in('user_id', ids)
    .in('home_id', homes.map((h) => h.home_id)).eq('is_active', true).is('end_at', null));
  return new Set(shared.map((r) => String(r.user_id)));
}

// ---------- content: each person's rows, in the shapes sources.js gives the page ----------

async function readContent(ids) {
  const { FAST_CHECK_COLUMNS, verifiedRows } = require('../../utils/homePermissions');
  const read = (label, run) => bounded(`marks:${label}`, null, run);
  const [homes, owners, jobs, reviews, certs, pros, team, skills, pieces, plans, trains, likes] = await Promise.all([
    read('homes', async () => rows(await supabaseAdmin.from('HomeOccupancy')
      .select(`home_id, user_id, is_active, verification_status, verification_source, verified_at, end_at, created_at, ${FAST_CHECK_COLUMNS}`)
      .in('user_id', ids).eq('is_active', true).eq('verification_status', 'verified'))),
    read('owners', async () => rows(await supabaseAdmin.from('HomeOwner').select('home_id, subject_id, updated_at')
      .in('subject_id', ids).eq('subject_type', 'user').eq('owner_status', 'verified'))),
    read('jobs', async () => rows(await supabaseAdmin.from('Gig')
      .select('accepted_by, owner_confirmed_at, worker_completed_at, updated_at')
      .in('accepted_by', ids).eq('status', 'completed').in('payment_status', PAID_STATUSES)
      .order('updated_at', { ascending: true }).limit(ROW_LIMIT))),
    read('reviews', async () => rows(await supabaseAdmin.from('Review').select('reviewee_id, gig_id, comment, created_at')
      .in('reviewee_id', ids).not('comment', 'is', null).neq('comment', '')
      .order('created_at', { ascending: true }).limit(ROW_LIMIT))),
    read('certifications', async () => rows(await supabaseAdmin.from('UserCertification')
      .select('user_id, certification_name, issuing_organization, issue_date, expiry_date, is_verified, created_at')
      .in('user_id', ids).eq('show_on_profile', true).limit(ROW_LIMIT))),
    read('professional', async () => rows(await supabaseAdmin.from('UserProfessionalProfile')
      .select('user_id, verification_status, verification_completed_at, is_public, is_active').in('user_id', ids))),
    read('businesses', async () => {
      const owned = rows(await supabaseAdmin.from('BusinessTeam').select('user_id, business_user_id, joined_at, created_at')
        .in('user_id', ids).eq('role_base', 'owner').eq('is_active', true));
      if (!owned.length) return [];
      const bizIds = [...new Set(owned.map((r) => r.business_user_id))];
      const [profiles, accounts] = await Promise.all([
        supabaseAdmin.from('BusinessProfile').select('business_user_id').in('business_user_id', bizIds)
          .eq('is_published', true).in('verification_status', VERIFIED_BUSINESS),
        supabaseAdmin.from('User').select('id, name, username').in('id', bizIds).eq('account_type', 'business'),
      ]);
      const ok = new Set(rows(profiles).map((r) => r.business_user_id));
      const names = new Map(rows(accounts).map((r) => [r.id, r]));
      return owned.filter((r) => ok.has(r.business_user_id) && names.has(r.business_user_id)).map((r) => ({
        user_id: r.user_id, id: r.business_user_id, name: names.get(r.business_user_id).name || names.get(r.business_user_id).username,
        username: names.get(r.business_user_id).username, picture_url: null, since: r.joined_at || r.created_at,
      }));
    }),
    read('skills', async () => rows(await supabaseAdmin.from('UserSkill').select('user_id, skill_name, is_verified, verified_at, created_at')
      .in('user_id', ids).or('show_on_profile.is.null,show_on_profile.eq.true').limit(ROW_LIMIT))),
    read('pieces', async () => rows(await supabaseAdmin.from('UserPortfolio')
      .select('id, user_id, title, skills_used, completed_at, created_at, is_featured')
      .in('user_id', ids).eq('is_visible', true).limit(ROW_LIMIT))),
    read('plans', async () => rows(await supabaseAdmin.from('Plan').select('host_user_id, ended_at, updated_at')
      .in('host_user_id', ids).eq('status', 'ended').order('ended_at', { ascending: true }).limit(ROW_LIMIT))),
    read('trains', async () => rows(await supabaseAdmin.from('SupportTrainReservation')
      .select('user_id, support_train_id, created_at, slot:slot_id ( slot_date ), train:support_train_id!inner ( status )')
      .in('user_id', ids).in('status', HELPER_RESERVATION_STATUSES).neq('train.status', 'draft').limit(ROW_LIMIT))),
    // Helpful marks as profileContributions counts them, oldest first (a long list may stop early: then fewer months,
    // never more).
    read('helpful', async () => rows(await supabaseAdmin.from('PostLike')
      .select('user_id, created_at, post:post_id!inner ( user_id )')
      .in('post.user_id', ids)
      .is('post.archived_at', null)
      .neq('post.moderation_state', 'removed')
      .or('post_as.is.null,post_as.not.in.(business,persona)', { referencedTable: 'post' })
      .or('identity_context_type.is.null,identity_context_type.neq.persona', { referencedTable: 'post' })
      .or(`post_type.is.null,post_type.not.in.(${require('../../utils/postReaction').NOT_HELPFUL_POST_TYPES.join(',')})`, { referencedTable: 'post' })
      .order('created_at', { ascending: true })
      .limit(ROW_LIMIT))),
  ]);

  // Verified homes, as the page counts them (homePermissions.isVerified, or a verified ownership of that home).
  const occ = (homes || []).filter((r) => !r.end_at);
  const isVerifiedRow = occ.length ? await verifiedRows(occ) : () => false;
  const ownedBy = groupBy(owners || [], 'subject_id');

  const byUser = new Map(ids.map((id) => [String(id), {}]));
  const put = (key, list, userKey) => {
    for (const [uid, list2] of groupBy(list || [], userKey)) if (byUser.has(uid)) byUser.get(uid)[key] = list2;
  };
  for (const [uid, list] of groupBy(occ, 'user_id')) {
    if (!byUser.has(uid)) continue;
    const owned = new Map((ownedBy.get(uid) || []).map((o) => [o.home_id, o]));
    byUser.get(uid).homes = list
      .filter((r) => isVerifiedRow(r) || owned.has(r.home_id))
      .map((r) => ({
        home_id: r.home_id, city: null, state: null, verified: true,
        source: isVerifiedRow(r) ? (r.verification_source === 'claim' ? `fast_${r.fast_check_kind}` : 'mail') : 'owner',
        verified_at: r.verified_at || r.fast_check_at || owned.get(r.home_id)?.updated_at || r.created_at,
      }));
  }
  put('paidJobs', jobs, 'accepted_by');
  for (const [uid, list] of groupBy(reviews || [], 'reviewee_id')) if (byUser.has(uid)) byUser.get(uid).reviews = { rows: list };
  put('certifications', certs, 'user_id');
  for (const p of pros || []) {
    if (byUser.has(String(p.user_id)) && p.is_public === true && p.is_active !== false && p.verification_status === 'verified') {
      byUser.get(String(p.user_id)).professional = p;
    }
  }
  put('businesses', team, 'user_id');
  put('skills', skills, 'user_id');
  put('pieces', pieces, 'user_id');
  put('plansHosted', plans, 'host_user_id');
  put('supportTrains', trains, 'user_id');
  for (const [uid, list] of groupBy((likes || []).filter((r) => String(r.user_id) !== String(r.post?.user_id)), (r) => r.post?.user_id)) {
    if (byUser.has(uid)) byUser.get(uid).helpful = { count: list.length, months: list.map((r) => r.created_at) };
  }
  return byUser;
}

// ---------- the answer ----------

async function marksFor(viewerId, ids) {
  const others = ids.filter((id) => String(id) !== String(viewerId));
  const [people, access, anyScope, household, content] = await Promise.all([
    readPeople(ids),
    others.length ? loadUserSearchAccess(viewerId, others) : new Map(),
    others.length ? readAnyScopeBlocks(viewerId, others) : new Set(),
    others.length ? readHousehold(viewerId, others) : new Set(),
    readContent(ids),
  ]);
  const personById = new Map(people.map((p) => [String(p.id), p]));
  const now = new Date();
  const marks = [];
  for (const id of ids) {
    const key = String(id);
    const person = personById.get(key);
    if (!person || person.account_type === 'business' || person.account_type === 'curator') continue;
    const self = key === String(viewerId);
    let view = 'owner';
    if (!self) {
      const a = access.get(id);
      // A private profile opens to no one else; "registered" opens to anyone signed in (users.js canViewProfile).
      if ((person.profile_visibility || 'public') === 'private' || !a?.searchable || anyScope.has(key)) continue;
      view = household.has(key) ? 'household' : (a.connected ? 'connection' : 'member');
    }
    const { parts } = readShare(person.profile_share);
    const on = (part) => reaches(parts, part, view);
    const record = buildRecord({ firstName: 'them', userData: { id } }, content.get(key) || {}, { now });
    const months = record.months.filter((m) => on(LANE_PART[m.lane]) && m.parts.every(on));
    if (!months.length) continue;
    marks.push({
      user_id: id,
      since: months.reduce((min, m) => (m.month < min ? m.month : min), months[0].month),
      seen: months.some((m) => m.level === 3),
    });
  }
  return { marks };
}

module.exports = { marksFor, parseIds, MAX_IDS };
