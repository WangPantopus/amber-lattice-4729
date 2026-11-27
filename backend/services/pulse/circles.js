'use strict';

// Pulse, reinvented, phase 3: circles of 2 to 8 close people and each circle's weekly magazine (coord CONTRACT 8d;
// "circles", a table the founder approved). A person is in a circle only by their own yes; only connections are asked;
// nobody outside a circle learns it exists. The magazine is made on read from what each reader may see; nothing is
// stored but the circle and, per reader, which week they last opened (PersonChoice `magazine_seen`). No notices yet.

const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const blockService = require('../blockService');
const penName = require('../penName');

const MAX_OTHERS = 7;
const MAX_OWNED = 10;
const MAX_IN = 20;
const MAX_ITEMS = 24;
const WEEKS_BACK = 8;
const ZONE = 'America/Los_Angeles';
const SEEN_CHOICE = 'magazine_seen';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECT = 'id, owner_id, name, members, member_ids, week_day, created_at, updated_at';

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');
// eslint-disable-next-line global-require
const play = () => require('./play');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

const notFound = () => fail(404, 'CIRCLE_NOT_FOUND', 'This circle could not be found.');
const memberOf = (circle, userId) => (circle.members || []).find((m) => String(m.user_id) === String(userId)) || null;
const inside = (circle, userId) => memberOf(circle, userId)?.state === 'in';
const peopleIn = (circle) => (circle.members || []).filter((m) => m.state === 'in').map((m) => String(m.user_id));

function nameOf(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 40) throw fail(400, 'CIRCLE_INVALID', 'Name the circle in up to 40 characters.');
  return name;
}

function idsOf(value, { min = 0 } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value) || !value.every((id) => UUID.test(String(id)))) throw fail(400, 'CIRCLE_INVALID', 'Send people as a list of ids.');
  const ids = [...new Set(value.map((id) => String(id).toLowerCase()))];
  if (ids.length < min || ids.length > MAX_OTHERS) throw fail(400, 'CIRCLE_INVALID', `Choose 1 to ${MAX_OTHERS} people.`);
  return ids;
}

/** Of `ids`, the owner's accepted connections not blocked either way (others are dropped). */
async function askable(ownerId, ids) {
  const [connections, blocked] = await Promise.all([momentStore().connectionIds(ownerId), blockService.blockedUserIds(ownerId)]);
  const linked = new Set(connections.map(String));
  return ids.filter((id) => id !== String(ownerId).toLowerCase() && linked.has(id) && !blocked.has(id));
}

async function load(id) {
  if (!UUID.test(String(id || ''))) throw notFound();
  const { data, error } = await supabaseAdmin.from('Circle').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load the circle: ${error.message}`);
  if (!data) throw notFound();
  return data;
}

async function save(circle, changes) {
  const members = changes.members || circle.members;
  const { data, error } = await supabaseAdmin.from('Circle').update({
    ...changes, members, member_ids: members.map((m) => m.user_id), updated_at: new Date().toISOString(),
  }).eq('id', circle.id).eq('updated_at', circle.updated_at).select(SELECT).maybeSingle();
  if (error) throw new Error(`Failed to keep the circle: ${error.message}`);
  if (!data) throw fail(409, 'CIRCLE_BUSY', 'This circle just changed. Try again.');
  return data;
}

async function countsFor(userId) {
  const { data, error } = await supabaseAdmin.from('Circle').select('owner_id, members').contains('member_ids', [userId]).limit(200);
  if (error) throw new Error(`Failed to count circles: ${error.message}`);
  const rows = data || [];
  return { owned: rows.filter((c) => String(c.owner_id) === String(userId)).length, in: rows.filter((c) => inside(c, userId)).length };
}

// ─── The week ───────────────────────────────────────────────────────────────

/**
 * The magazine's week: the 7 days before the newest `week_day` on or before today (or before `week`), in the reader's
 * own time zone when the app sends it (`tz`), Pacific otherwise (LEAD-3 06:33).
 */
function zoneOf(tz) {
  return typeof tz === 'string' && tz && DateTime.now().setZone(tz).isValid ? tz : ZONE;
}

function weekOf(circle, week = null, now = DateTime.now(), tz = null) {
  const zone = zoneOf(tz);
  const today = now.setZone(zone).startOf('day');
  let day = week ? DateTime.fromISO(String(week), { zone }).startOf('day') : today;
  if (!day.isValid) throw fail(400, 'CIRCLE_INVALID', 'Send the week as YYYY-MM-DD.');
  if (day > today) day = today;
  // luxon weekday: 1 Monday … 7 Sunday; ours: 0 Sunday … 6 Saturday.
  while (day.weekday % 7 !== circle.week_day) day = day.minus({ days: 1 });
  if (today.diff(day, 'weeks').weeks > WEEKS_BACK) throw fail(400, 'CIRCLE_INVALID', `A magazine goes back ${WEEKS_BACK} weeks.`);
  return { day: day.toISODate(), from: day.minus({ days: 7 }), to: day };
}

async function seenWeeks(userId) {
  const { data, error } = await supabaseAdmin.from('PersonChoice').select('value').eq('user_id', userId).eq('choice', SEEN_CHOICE).maybeSingle();
  if (error) throw new Error(`Failed to read the magazines seen: ${error.message}`);
  return data?.value && typeof data.value === 'object' ? data.value : {};
}

async function markSeen(userId, circleId, day, before) {
  const value = Object.fromEntries(Object.entries({ ...before, [circleId]: day }).slice(-MAX_IN * 2));
  const { error } = await supabaseAdmin.from('PersonChoice').upsert({
    user_id: userId, choice: SEEN_CHOICE, value, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,choice' });
  if (error) logger.warn('circles.seen_not_kept', { error: error.message });
}

// ─── Answers ────────────────────────────────────────────────────────────────

/** A circle as `viewerId` reads it; an invitee sees its name, its owner and who is in. People the viewer blocked or
 * muted, or who blocked them, are left out. */
function shapeOf(circle, viewerId, { authors, hidden, seen, tz }) {
  const me = memberOf(circle, viewerId);
  const shown = (circle.members || []).filter((m) => (me?.state === 'in' || m.state === 'in')
    && (String(m.user_id) === String(viewerId) || !hidden.has(String(m.user_id))));
  const week = weekOf(circle, null, DateTime.now(), tz);
  return {
    id: circle.id,
    name: circle.name,
    owner: authors.get(String(circle.owner_id)) || null,
    members: shown.map((m) => ({ person: authors.get(String(m.user_id)) || null, state: m.state })),
    mine: String(circle.owner_id) === String(viewerId),
    my_state: me?.state || null,
    // "Keep my Moments in this circle's magazine after they fade": the reader's own choice for this circle, off by default.
    my_keep_faded: Boolean(me?.keep_faded),
    // Homes talk to homes (CONTRACT 9f): the window the reader shows this circle, or null.
    my_window: me?.window?.label ? { label: me.window.label } : null,
    week_day: circle.week_day,
    magazine_ready: me?.state === 'in' && seen[circle.id] !== week.day,
  };
}

async function shaped(circles, viewerId, tz = null) {
  const [authors, hidden, seen] = await Promise.all([
    momentStore().loadAuthors(circles.flatMap((c) => [c.owner_id, ...(c.members || []).map((m) => m.user_id)])),
    play().hiddenPeople(viewerId),
    seenWeeks(viewerId).catch(() => ({})),
  ]);
  return circles.map((c) => shapeOf(c, viewerId, { authors, hidden, seen, tz }));
}

/** GET /circles — the circles the reader is in, and the ones they are invited to. */
async function list(userId, { tz = null } = {}) {
  const { data, error } = await supabaseAdmin.from('Circle').select(SELECT).contains('member_ids', [userId])
    .order('created_at', { ascending: true }).limit(200);
  if (error) throw new Error(`Failed to load circles: ${error.message}`);
  const all = await shaped(data || [], userId, tz);
  return { circles: all.filter((c) => c.my_state === 'in'), invites: all.filter((c) => c.my_state === 'invited') };
}

async function one(circle, userId) {
  const [shape] = await shaped([circle], userId);
  return { circle: shape };
}

/** POST /circles — { name, people }: the owner is in; the others are invited. */
async function create(userId, body) {
  const name = nameOf(body?.name);
  const asked = await askable(userId, idsOf(body?.people, { min: 1 }));
  if (!asked.length) throw fail(400, 'CIRCLE_INVALID', 'Choose 1 to 7 of your connections.');
  const counts = await countsFor(userId);
  if (counts.owned >= MAX_OWNED) throw fail(409, 'CIRCLE_LIMIT', `You can make up to ${MAX_OWNED} circles.`);
  if (counts.in >= MAX_IN) throw fail(409, 'CIRCLE_LIMIT', `You can be in up to ${MAX_IN} circles.`);
  const at = new Date().toISOString();
  const members = [{ user_id: String(userId), state: 'in', at }, ...asked.map((id) => ({ user_id: id, state: 'invited', at }))];
  const { data, error } = await supabaseAdmin.from('Circle').insert({
    owner_id: userId, name, members, member_ids: members.map((m) => m.user_id), week_day: DateTime.now().setZone(ZONE).weekday % 7,
  }).select(SELECT).single();
  if (error) throw new Error(`Failed to make the circle: ${error.message}`);
  logger.info('circles.made', { invited: asked.length });
  return one(data, userId);
}

/** POST /circles/:id/join — an invitee says yes. */
async function join(userId, id, body = {}) {
  const circle = await load(id);
  const me = memberOf(circle, userId);
  if (!me) throw notFound();
  if (me.state === 'in') return one(circle, userId);
  if ((await countsFor(userId)).in >= MAX_IN) throw fail(409, 'CIRCLE_LIMIT', `You can be in up to ${MAX_IN} circles.`);
  const members = circle.members.map((m) => (String(m.user_id) === String(userId)
    ? { ...m, state: 'in', at: new Date().toISOString(), keep_faded: body?.keep_faded === true } : m));
  return one(await save(circle, { members }), userId);
}

/** POST /circles/:id/me — { keep_faded }: the member's own choice for this circle (off by default). */
async function setMine(userId, id, body = {}) {
  const hasKeep = typeof body?.keep_faded === 'boolean';
  const hasWindow = Object.prototype.hasOwnProperty.call(body || {}, 'window');
  if (!hasKeep && !hasWindow) throw fail(400, 'CIRCLE_INVALID', 'Send keep_faded as true or false, or a window.');
  if (body?.keep_faded !== undefined && !hasKeep) throw fail(400, 'CIRCLE_INVALID', 'Send keep_faded as true or false.');
  // Homes talk to homes (CONTRACT 9f): a window for the member's home, shown to this circle, with no place at all.
  // eslint-disable-next-line global-require
  const window = hasWindow ? await require('./windows').windowOf(userId, body.window) : undefined;
  const circle = await load(id);
  if (!memberOf(circle, userId)) throw notFound();
  const members = circle.members.map((m) => {
    if (String(m.user_id) !== String(userId)) return m;
    const next = { ...m, ...(hasKeep ? { keep_faded: body.keep_faded } : {}) };
    if (hasWindow) {
      if (window) next.window = window; else delete next.window;
    }
    return next;
  });
  return one(await save(circle, { members }), userId);
}

/** POST /circles/:id/leave — any member, an invitee saying no included. The owner leaving hands it on; under 2 in, it ends. */
async function leave(userId, id) {
  const circle = await load(id);
  if (!memberOf(circle, userId)) throw notFound();
  const members = circle.members.filter((m) => String(m.user_id) !== String(userId));
  const stillIn = members.filter((m) => m.state === 'in');
  if (stillIn.length < 2 && !members.some((m) => m.state === 'invited' && stillIn.length === 1)) {
    const { error } = await supabaseAdmin.from('Circle').delete().eq('id', circle.id);
    if (error) throw new Error(`Failed to end the circle: ${error.message}`);
    return null;
  }
  const owner = String(circle.owner_id) === String(userId)
    ? [...stillIn].sort((a, b) => String(a.at).localeCompare(String(b.at)))[0].user_id : circle.owner_id;
  const ordered = [...members.filter((m) => String(m.user_id) === String(owner)), ...members.filter((m) => String(m.user_id) !== String(owner))];
  await save(circle, { members: ordered, owner_id: owner });
  return null;
}

/** PATCH /circles/:id — the owner: { name?, add?, remove? }. */
async function change(userId, id, body) {
  const circle = await load(id);
  if (String(circle.owner_id) !== String(userId)) throw notFound();
  const name = body?.name !== undefined ? nameOf(body.name) : circle.name;
  const remove = new Set(idsOf(body?.remove).filter((rid) => rid !== String(userId).toLowerCase()));
  let members = circle.members.filter((m) => !remove.has(String(m.user_id)));
  const add = (await askable(userId, idsOf(body?.add))).filter((aid) => !members.some((m) => String(m.user_id) === aid));
  if (members.length + add.length > MAX_OTHERS + 1) throw fail(400, 'CIRCLE_INVALID', 'A circle holds up to 8 people.');
  members = [...members, ...add.map((aid) => ({ user_id: aid, state: 'invited', at: new Date().toISOString() }))];
  return one(await save(circle, { name, members }), userId);
}

/** DELETE /circles/:id — the owner ends it. */
async function remove(userId, id) {
  const circle = await load(id);
  if (String(circle.owner_id) !== String(userId)) throw notFound();
  const { error } = await supabaseAdmin.from('Circle').delete().eq('id', circle.id);
  if (error) throw new Error(`Failed to end the circle: ${error.message}`);
}

/**
 * The people of a circle the reader is in, for Close circle (`reach=close&circle=<id>`): its members who are in,
 * without people hidden from the reader. 404 when the reader isn't in it.
 */
async function peopleFor(userId, id) {
  const circle = await load(id);
  if (!inside(circle, userId)) throw notFound();
  const hidden = await play().hiddenPeople(userId);
  return peopleIn(circle).filter((pid) => pid === String(userId) || !hidden.has(pid));
}

// ─── The magazine ───────────────────────────────────────────────────────────

// The columns the read rule needs (readAccess.POST_READ_SELECT), and the magazine's own.
// eslint-disable-next-line global-require
const POST_SELECT = () => `${require('./readAccess').POST_READ_SELECT}, content, created_at, like_count, comment_count, media_urls, media_types, media_thumbnails`;

function layoutOf(items) {
  const pages = [];
  if (!items.length) return pages;
  pages.push({ layout: 'cover', items: [items[0]] });
  let rest = items.slice(1);
  while (rest.length) {
    const size = rest.length >= 4 ? 4 : Math.min(rest.length, 2);
    pages.push({ layout: size === 4 ? 'grid' : size === 2 ? 'two' : 'one', items: rest.slice(0, size) });
    rest = rest.slice(size);
  }
  return pages;
}

/** The members' Moments of the week that have ended, which this reader could see while they were live. */
async function fadedFor(viewerId, authorIds, fromIso, toIso) {
  const store = momentStore();
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)
    .in('user_id', authorIds).gte('created_at', fromIso).lt('created_at', toIso).lte('story_expires_at', new Date().toISOString())
    .is('archived_at', null).eq('moderation_state', 'live').order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(`Failed to load the week's Moments: ${error.message}`);
  const rows = (data || []).filter((row) => !penName.isPenNameRow(row));
  if (!rows.length) return [];
  const [ctx, reported] = await Promise.all([store.viewerContext(viewerId, rows.map((r) => r.user_id), null, rows), store.reportedIds(viewerId)]);
  return rows.filter((row) => store.canSee(row, ctx) && !reported.has(row.id));
}

/** GET /circles/:id/magazine?week= — the circle's week, laid out, for a member who is in. */
async function magazine(userId, id, week = null, tz = null) {
  const store = momentStore();
  const circle = await load(id);
  if (!inside(circle, userId)) throw notFound();
  const span = weekOf(circle, week, DateTime.now(), tz);
  const hidden = await play().hiddenPeople(userId);
  const people = peopleIn(circle).filter((pid) => pid === String(userId) || !hidden.has(pid));
  const fromIso = span.from.toUTC().toISO();
  const toIso = span.to.toUTC().toISO();
  // eslint-disable-next-line global-require
  const { canReadPost } = require('./readAccess');
  // The members who chose "Keep my Moments in this circle's magazine after they fade" (LEAD-3 06:33).
  const fading = (circle.members || []).filter((m) => m.state === 'in' && m.keep_faded && people.includes(String(m.user_id)))
    .map((m) => String(m.user_id));
  const [{ data: posts, error }, live, kept, faded] = await Promise.all([
    supabaseAdmin.from('Post').select(POST_SELECT()).in('user_id', people).eq('is_story', false)
      .gte('created_at', fromIso).lt('created_at', toIso).is('archived_at', null).eq('moderation_state', 'live')
      .order('created_at', { ascending: false }).limit(200),
    // Moments still live, and Moments their author made posts that stay with "Keep this?" (CONTRACT 6d).
    store.shownOfPeople(userId, people),
    store.shownKept(userId, { people }),
    // An ended Moment only by its author's own choice for this circle, and only if this reader could see it while it was
    // live (its audience, blocks, mutes, reports). The author's Delete (archived) removes it here too.
    fading.length ? fadedFor(userId, fading, fromIso, toIso) : [],
  ]);
  if (error) throw new Error(`Failed to load the week's posts: ${error.message}`);
  const readable = await Promise.all((posts || []).filter((post) => !penName.isPenNameRow(post))
    .map(async (post) => ((await canReadPost(post, userId).catch(() => false)) ? post : null)));
  const byId = new Map();
  for (const row of [...live, ...kept].map((entry) => entry.row || entry).concat(faded)) byId.set(row.id, row);
  const momentRows = [...byId.values()].filter((row) => row.created_at >= fromIso && row.created_at < toIso && !penName.isPenNameRow(row));
  // eslint-disable-next-line global-require
  const media = require('../moments/momentMedia');
  const thumbKey = (row) => (store.meta(row).purged_at ? null : store.meta(row).media?.thumb_key || store.meta(row).media?.key || null);
  const [links, counts] = await Promise.all([
    media.signedLinks(undefined, momentRows.map(thumbKey).filter(Boolean)),
    momentRows.length ? supabaseAdmin.from('Post').select('id, like_count, comment_count').in('id', momentRows.map((r) => r.id))
      : Promise.resolve({ data: [] }),
  ]);
  const score = new Map((counts.data || []).map((r) => [r.id, (r.like_count || 0) + (r.comment_count || 0)]));
  const authors = await store.loadAuthors([...readable.filter(Boolean).map((p) => p.user_id), ...momentRows.map((r) => r.user_id)]);
  const items = [
    ...readable.filter(Boolean).map((post) => ({
      type: 'post', id: post.id, author: authors.get(String(post.user_id)) || null, at: post.created_at,
      caption: String(post.content || '').slice(0, 140) || null,
      thumb_url: (post.media_thumbnails || [])[0] || ((post.media_types || [])[0] === 'image' ? (post.media_urls || [])[0] : null) || null,
      score: (post.like_count || 0) + (post.comment_count || 0),
    })),
    ...momentRows.map((row) => ({
      type: 'moment', id: row.id, author: authors.get(String(row.user_id)) || null, at: row.created_at,
      caption: String(row.content || '').slice(0, 140) || null, thumb_url: links.get(thumbKey(row)) || null,
      ended: store.momentState(row) === 'ended',
      score: score.get(row.id) || 0,
    })),
  ].sort((a, b) => (b.score - a.score) || String(b.at).localeCompare(String(a.at))).slice(0, MAX_ITEMS)
    .map(({ score: _score, ...item }) => item);
  const tally = new Map();
  for (const item of items) {
    const key = String(item.author?.id || '');
    if (key) tally.set(key, { person: item.author, count: (tally.get(key)?.count || 0) + 1 });
  }
  if (!week || week === span.day) markSeen(userId, circle.id, span.day, await seenWeeks(userId).catch(() => ({})));
  return {
    circle: { id: circle.id, name: circle.name },
    week: { from: span.from.toISODate(), to: span.to.minus({ days: 1 }).toISODate(), day: span.day },
    pages: layoutOf(items),
    people: [...tally.values()].sort((a, b) => b.count - a.count),
    empty: !items.length,
  };
}

module.exports = { list, create, join, setMine, leave, change, remove, peopleFor, magazine, weekOf, MAX_OTHERS };
