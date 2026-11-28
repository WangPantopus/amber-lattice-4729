/**
 * People search candidates from the "PersonSearch" index (supabase/migrations/20261128010000_person_search.sql).
 *
 * One call to the database answers who matches what was typed, best first: exact, starts with, a word that starts
 * with it, a word that contains it, then close spellings when nothing else matched. The index already leaves out the
 * searcher, blocks either way, and people only their connections may find.
 *
 * It only finds candidates. checkedSearchPeople reads every one again from today's tables (blocks, search visibility,
 * private profiles, unpublished businesses) before a route shows it, so a row that is out of step can cost a result
 * but never show someone who chose not to be found.
 */
const supabaseAdmin = require('../config/supabaseAdmin');
const { loadUserSearchAccess, unpublishedBusinessIds } = require('../utils/visibilityPolicy');
const { localProfileVisibilityFor } = require('../utils/identityProfiles');

const ACCOUNT_SELECT = 'id, username, account_type, profile_visibility, name, first_name, middle_name, last_name, profile_picture_url';

// A search answers in a few milliseconds. One that takes this long is refused, and the person can try again.
const SEARCH_TIMEOUT_MS = 3000;
// The index answers a few more than asked for, so a candidate the second check drops doesn't leave a short page.
const SPARE_CANDIDATES = 10;
const MAX_CANDIDATES = 60;

const counts = { searches: 0, found_no_one: 0, from_index: 0, from_fallback: 0, failed: 0, total_ms: 0, slowest_ms: 0 };

/**
 * True when this database has no search index yet: PostgREST answers PGRST202 for a function it doesn't know, and
 * PostgreSQL 42883. Callers then search the way they did before the index (a local stack that hasn't had the
 * migration, or the moment between a release and the schema reload).
 */
function indexMissing(error) {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

/**
 * The accounts that match `query` for `viewerId`, best first.
 *
 * @param {object} options
 * @param {string} options.viewerId - the person searching
 * @param {string} options.query - what they typed
 * @param {'all'|'people'|'business'|'profiles'} [options.kind] - 'all' is people and businesses; 'profiles' adds the
 *   curator account, for the profile search
 * @param {number} options.limit - how many results the caller will show
 * @returns {Promise<Array<{userId: string, tier: number, connected: boolean}>|null>} null when this database has no
 *   index yet. Throws when the read fails or takes too long, so the caller refuses the search rather than guess.
 */
async function findPersonCandidates({ viewerId, query, kind = 'all', limit }) {
  const call = supabaseAdmin.rpc('person_search', {
    p_viewer: viewerId,
    p_query: query,
    p_kind: kind,
    p_limit: Math.min(limit + SPARE_CANDIDATES, MAX_CANDIDATES),
  });
  // The real client can give up on a call; the test stand-in answers at once and has nothing to give up on.
  const { data, error } = await (typeof call.abortSignal === 'function'
    ? call.abortSignal(AbortSignal.timeout(SEARCH_TIMEOUT_MS))
    : call);
  if (error) {
    if (indexMissing(error)) return null;
    throw Object.assign(new Error(error.message || 'people search failed'), { code: error.code || null });
  }
  if (!Array.isArray(data)) throw new Error('people search returned no list');
  return [...data]
    .sort((a, b) => a.ord - b.ord)
    .map((row) => ({ userId: row.person_id, tier: row.tier, connected: row.is_connected === true }));
}

/**
 * The candidates this viewer may be shown, in the index's order, each with its account and its Local Profile row
 * (null for a person who has none yet). One round of reads for all of them, and the same rules as before the index
 * (routes/users.js canDiscoverLocalProfileForUserSearch, routes/identitySearch.js canDiscoverLocalProfile):
 *
 * - no system account, and no business that isn't published (or a closed one);
 * - no block either way, and the account's search visibility (loadUserSearchAccess);
 * - the Local Profile's own search visibility, and the stricter of the account's and the profile's visibility.
 *
 * A failed read throws, so the route refuses the search rather than skip a check.
 *
 * @param {object} options
 * @param {Array<{userId: string, tier: number, connected: boolean}>} options.candidates - from findPersonCandidates
 * @param {string} options.viewerId
 * @returns {Promise<Array<{userId: string, tier: number, account: object, profile: object|null}>>}
 */
async function checkedSearchPeople({ candidates, viewerId }) {
  const wanted = candidates.filter((candidate) => candidate.userId && candidate.userId !== viewerId);
  const ids = [...new Set(wanted.map((candidate) => candidate.userId))];
  if (!ids.length) return [];
  const [profiles, accounts, accessById, unpublishedBusinesses] = await Promise.all([
    supabaseAdmin.from('LocalProfile').select('*').in('user_id', ids),
    supabaseAdmin.from('User').select(ACCOUNT_SELECT).in('id', ids),
    loadUserSearchAccess(viewerId, ids),
    unpublishedBusinessIds(ids),
  ]);
  if (profiles.error) throw profiles.error;
  if (accounts.error) throw accounts.error;
  const profileByUserId = new Map((profiles.data || []).map((profile) => [profile.user_id, profile]));
  const accountById = new Map((accounts.data || []).map((account) => [account.id, account]));

  const people = [];
  const seen = new Set();
  for (const candidate of wanted) {
    const id = candidate.userId;
    if (seen.has(id)) continue;
    seen.add(id);
    const account = accountById.get(id);
    if (!account || account.account_type === 'system') continue;
    if (unpublishedBusinesses.has(String(id))) continue;
    // The batched read covers every candidate's blocks and settings; one it didn't cover is left out.
    const access = accessById.get(id);
    if (!access || !access.searchable) continue;
    const profile = profileByUserId.get(id) || null;
    const searchVisibility = profile?.search_visibility || 'everyone';
    if (searchVisibility === 'nobody') continue;
    if (searchVisibility === 'mutuals' && !access.connected) continue;
    // The account was read above, so this reads nothing more.
    const profileVisibility = await localProfileVisibilityFor(profile || {}, viewerId, account);
    if (profileVisibility === 'private') continue;
    // Legacy 'followers' is treated as 'connections' since peer follows were removed.
    if ((profileVisibility === 'connections' || profileVisibility === 'followers') && !access.connected) continue;
    people.push({ userId: id, tier: candidate.tier, account, profile });
  }
  return people;
}

/** Counts one finished search for GET /api/health/metrics. Never holds what was typed or who searched. */
function recordSearch({ results, ms, fromIndex }) {
  counts.searches += 1;
  if (!results) counts.found_no_one += 1;
  if (fromIndex) counts.from_index += 1;
  else counts.from_fallback += 1;
  counts.total_ms += ms;
  if (ms > counts.slowest_ms) counts.slowest_ms = ms;
}

function recordFailure() {
  counts.failed += 1;
}

/** People search since this process started: how many, how many found no one, and how long they took. */
function getSnapshot() {
  return {
    ...counts,
    average_ms: counts.searches ? Math.round(counts.total_ms / counts.searches) : 0,
  };
}

module.exports = { findPersonCandidates, checkedSearchPeople, recordSearch, recordFailure, getSnapshot };
