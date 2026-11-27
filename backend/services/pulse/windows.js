'use strict';

// Pulse, reinvented, phase 4: homes talk to homes (coord CONTRACT 9f). "Your family's homes are lit windows; one lights
// when someone there shared today." A window is a circle member's own choice, per circle (8d's member entry), shown
// only to that circle, and it never has a place: nothing about the home itself (its place, address, name, who else lives
// there) is read or answered. Lit says only "shared today": never what, where, how many or when.

const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');

// eslint-disable-next-line global-require
const play = () => require('./play');
// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');

const ZONE = 'America/Los_Angeles';
const MAX_LABEL = 30;
const MAX_PEOPLE = 60;

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/**
 * The window a member asks to show (`{ label }`), checked, or null to stop. Only a member who lives at a home (today's
 * household rule) may show one.
 */
async function windowOf(userId, value) {
  if (value == null) return null;
  const label = typeof value?.label === 'string' ? value.label.trim().replace(/\s+/g, ' ') : '';
  if (!label || label.length > MAX_LABEL) throw fail(400, 'WINDOW_INVALID', `Name the window in up to ${MAX_LABEL} characters.`);
  // eslint-disable-next-line global-require
  const { householdHomeIds } = require('../../utils/homeMailAccess');
  if (!(await householdHomeIds(userId)).length) throw fail(400, 'WINDOW_NO_HOME', 'A window needs a home you live at.');
  return { label, at: new Date().toISOString() };
}

/**
 * Of these people, the ones who shared today (Pacific) a Moment or a Pulse post that `readerId` may see (LEAD-3 08:57: a
 * window lights only from a share the reader can see, never from one they can't, so it is never a sign of being merely
 * active). Never under a made-up name: those are stored under the one system account, never under these people's ids.
 */
async function sharedToday(readerId, userIds, now = Date.now()) {
  const lit = new Set();
  if (!userIds.length) return lit;
  const store = momentStore();
  const start = DateTime.fromMillis(now, { zone: ZONE }).startOf('day').toUTC().toISO();
  // eslint-disable-next-line global-require
  const { canReadPost, POST_READ_SELECT } = require('./readAccess');
  const [moments, posts] = await Promise.all([
    supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true).in('user_id', userIds)
      .gte('created_at', start).is('archived_at', null).eq('moderation_state', 'live').limit(1000),
    supabaseAdmin.from('Post').select(POST_READ_SELECT).not('is_story', 'is', true).in('user_id', userIds)
      .gte('created_at', start).is('archived_at', null).eq('moderation_state', 'live').limit(1000),
  ]);
  if (moments.error) throw new Error(`Failed to read today's Moments: ${moments.error.message}`);
  if (posts.error) throw new Error(`Failed to read today's posts: ${posts.error.message}`);
  const rows = moments.data || [];
  if (rows.length) {
    await store.markOwn(rows, readerId);
    const [ctx, reported] = await Promise.all([store.viewerContext(readerId, rows.map((r) => r.user_id), null, rows), store.reportedIds(readerId)]);
    for (const row of rows) {
      if (store.isOwn(row, readerId) || (store.canSee(row, ctx) && store.listedFor(row, readerId) && !reported.has(row.id))) lit.add(String(row.user_id));
    }
  }
  const unlit = (posts.data || []).filter((post) => !lit.has(String(post.user_id)));
  const readable = await Promise.all(unlit.map((post) => canReadPost(post, readerId).catch(() => false)));
  unlit.forEach((post, i) => { if (readable[i]) lit.add(String(post.user_id)); });
  return lit;
}

/** GET /windows for `userId`: the windows members of the reader's circles show to those circles, theirs included. */
async function windowsFor(userId, now = Date.now()) {
  const { data, error } = await supabaseAdmin.from('Circle').select('id, name, members').contains('member_ids', [userId]).limit(200);
  if (error) throw new Error(`Failed to load circles: ${error.message}`);
  const me = String(userId);
  const entries = [];
  for (const circle of data || []) {
    const mine = (circle.members || []).find((m) => String(m.user_id) === me);
    if (mine?.state !== 'in') continue;
    for (const m of circle.members || []) {
      if (m.state === 'in' && m.window?.label) entries.push({ circle, member: String(m.user_id), label: m.window.label });
    }
  }
  if (!entries.length) return { windows: [] };
  const people = [...new Set(entries.map((e) => e.member).filter((id) => id !== me))].slice(0, MAX_PEOPLE);
  const [mineHidden, theirs, lit] = await Promise.all([
    play().hiddenPeople(userId),
    Promise.all(people.map((id) => play().hiddenPeople(id).then((set) => [id, set]))),
    sharedToday(userId, [...new Set(entries.map((e) => e.member))], now),
  ]);
  const hidden = new Set([...mineHidden].map(String));
  for (const [id, set] of theirs) if (set.has(me)) hidden.add(id);
  const allowed = new Set([me, ...people]);
  return {
    windows: entries.filter((e) => allowed.has(e.member) && !hidden.has(e.member)).map((e) => ({
      circle_id: e.circle.id,
      circle: e.circle.name,
      label: e.label,
      lit: lit.has(e.member),
      mine: e.member === me,
    })),
  };
}

module.exports = { windowOf, windowsFor, sharedToday };
