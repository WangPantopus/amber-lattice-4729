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

const { readRows, sourcesFrom, relationshipStatus } = require('./sources');
const { readShare, reaches } = require('./parts');
const { buildRecord } = require('./compose');

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;
const LANE_PART = { home: 'record_home', work: 'record_work', others: 'record_others' };

/** Parse `ids=a,b,c` into unique account ids, or null when it isn't a list of at most 100 ids. */
function parseIds(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
  if (!ids.length || ids.length > MAX_IDS || !ids.every((id) => ID_RE.test(id))) return null;
  return ids;
}

// ---------- privacy: who may be seen, and as which view ----------

/**
 * Whether this viewer may see the person in a list, from their rows, as visibilityPolicy.loadUserSearchAccess and
 * canAccessPublicUserProfile decide: not private; no block of any kind either way (Block in the app, a profile block of
 * any scope, a personal block by them); and "Who can find you" allows the viewer (nobody: no one; only connections:
 * connections). Returns the view ('connection', 'household' or 'member'), or null when they may not.
 */
function viewFor(rows, viewerId) {
  if ((rows.profile_visibility || 'public') === 'private') return null;
  const status = relationshipStatus(rows.relationship, viewerId);
  if (status === 'blocked' || (rows.profile_blocks || []).length > 0 || rows.blocked_by_them === true) return null;
  const connected = status === 'connected';
  const policy = rows.privacy?.search_visibility || 'everyone';
  if (policy === 'nobody' || (policy === 'mutuals' && !connected)) return null;
  if (rows.shares_home === true) return 'household';
  return connected ? 'connection' : 'member';
}

// ---------- the answer ----------

async function marksFor(viewerId, ids) {
  // One database call for everyone: their rows, oldest first (the mark wants the first month), with this viewer's side.
  const byId = await readRows(ids, viewerId, { oldestFirst: true, rowLimit: 200 });
  const now = new Date();
  const marks = [];
  for (const id of ids) {
    const rows = byId.get(String(id));
    if (!rows || rows.account_type === 'business' || rows.account_type === 'curator') continue;
    const view = String(id) === String(viewerId) ? 'owner' : viewFor(rows, viewerId);
    if (!view) continue;
    const { parts } = readShare(rows.share);
    const on = (part) => reaches(parts, part, view);
    const sources = await sourcesFrom(id, rows, { pinned: false });
    const record = buildRecord({ firstName: 'them', userData: { id } }, sources, { now });
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
