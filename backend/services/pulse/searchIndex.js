'use strict';

// Pulse, reinvented, phase 4: the search index (coord CONTRACT 9a; "a search index", approved by the founder 2026-11-26).
// The `PulseSearch` table holds one row per Pulse post or Moment: its words, from what every reader of it is shown, and
// the point everyone sees. It only finds candidates; search.js checks every one again with today's reads. Filled by a job
// (jobs/pulseSearchIndex.js) that does nothing while the switch is off for everyone; no route of today's writes to it.

const crypto = require('crypto');
const supabaseAdmin = require('../../config/supabaseAdmin');
const momentGuess = require('../moments/momentGuess');
const momentStamps = require('../moments/momentStamps');
const penName = require('../penName');

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');
// eslint-disable-next-line global-require
const feedService = () => require('../feedService');
// eslint-disable-next-line global-require
const strands = () => require('./strands');
// eslint-disable-next-line global-require
const seal = () => require('./seal');

const BATCH = 500;
// Ids per `in` filter: more make a request line too long for the database's web front.
const IDS = 100;
const FIRST_FILL_DAYS = 30;
const RECENT_MOMENT_HOURS = 48;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_WORDS_CHARS = 4000;
// Nobody: a post's point as everyone but its author sees it (feedService.displayedPoint for a viewer who isn't them).
const NOBODY = '00000000-0000-0000-0000-000000000000';

const POST_SELECT = 'id, user_id, content, title, location_name, post_type, latitude, longitude, location_precision, '
  + 'post_metadata, effective_latitude, effective_longitude, geocode_place_id, geocode_accuracy, created_at, updated_at, '
  + 'expires_at, archived_at, moderation_state, distribution_targets, origin, is_story, identity_context_type, post_as';

const TITLES = { sunset: 'sunset sky', first_snow: 'first snow' };

const strings = (...values) => values.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());

/** The words a kept field card, a dot and a playable item show every reader (never a whisper, never who answered). */
function studioWords({ cards, dots, play } = {}) {
  const out = [];
  for (const card of Object.values(cards && typeof cards === 'object' ? cards : {})) {
    out.push(...strings(card?.name, card?.scientific));
  }
  for (const dot of Array.isArray(dots) ? dots : []) {
    if (dot?.kind === 'thing') out.push(...strings(dot.label));
    if (dot?.kind === 'note') out.push(...strings(dot.text));
  }
  for (const item of Array.isArray(play) ? play : []) {
    out.push(...strings(item?.question, item?.title, item?.label, item?.text, item?.before, item?.after, item?.prompt));
    for (const option of Array.isArray(item?.options) ? item.options : []) out.push(...strings(option));
  }
  return out;
}

/** The plain words of the stamps a reader is shown ("Rain", "sunset"), from the shown stamps only. */
function stampWords(shown) {
  const out = [];
  for (const stamp of shown || []) {
    if (stamp.kind === 'weather') out.push(...strings(stamp.value?.label));
    if (stamp.kind === 'sunset') out.push('sunset');
    if (stamp.kind === 'postmark') out.push(...strings(stamp.value?.weather?.label));
  }
  return out;
}

/** `read(chunk)` for each chunk of ids, beside each other; their rows together. */
async function byIds(ids, read) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += IDS) chunks.push(ids.slice(i, i + IDS));
  return (await Promise.all(chunks.map(read))).flat();
}

// Accents folded ("café" is kept as "cafe"), as search.js folds the words asked.
const body = (parts) => [...new Set(parts.filter(Boolean))].join(' \n ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .slice(0, MAX_WORDS_CHARS);
const keyOf = (value) => crypto.createHash('sha1').update(JSON.stringify(value)).digest('base64').slice(0, 16);

/**
 * A Moment's index row, or null when none should exist: not shown yet, held or removed, deleted for good, an ended one
 * that nobody keeps, or an unopened relic (no words until it opens). A live guess spot has no place words and no point
 * until it ends; a Moment at home has no point.
 */
function momentEntry(row, now = Date.now()) {
  const store = momentStore();
  const m = store.meta(row);
  if (row.archived_at || row.moderation_state !== 'live' || m.deleted_for_good_at) return null;
  const state = store.momentState(row, now);
  const kept = Boolean(m.kept_post_at);
  if (state !== 'live' && !(state === 'ended' && (kept || m.kept))) return null;
  if (m.seal && seal().isSealed(row, now)) return null;
  const hideSpot = momentGuess.isGuess(row) && !store.hasEnded(row, now);
  const point = hideSpot || m.at_home ? { latitude: null, longitude: null } : store.displayedPoint(row);
  const shown = momentStamps.shownStamps(m, { atHome: Boolean(m.at_home), penName: penName.isPenNameRow(row), placed: point.latitude != null });
  const text = body([
    ...strings(row.content),
    ...(hideSpot ? [] : strings(row.location_name)),
    ...studioWords(m),
    ...strings(m.retake?.title, m.pinboard?.prompt),
    m.convergence?.kind ? TITLES[m.convergence.kind] || null : null,
    ...(hideSpot ? [] : stampWords(shown)),
  ]);
  const entry = {
    post_id: row.id,
    kind: 'moment',
    // Under a made-up name, no person (LEAD-3 08:17): never matched by any search by person.
    user_id: penName.isPenNameRow(row) ? null : row.user_id,
    body: text,
    shown_lat: point.latitude ?? null,
    shown_lng: point.longitude ?? null,
    at: store.shownAt(row),
    made_at: row.created_at,
    stays: kept,
    ends_at: kept ? null : store.answeredEnd(row),
  };
  return { ...entry, source_key: keyOf(entry) };
}

/** A Pulse post's index row (with its Studio row's words, when it has one), or null when it shouldn't be listed. */
function postEntry(row, studio, now = Date.now()) {
  if (row.archived_at || row.moderation_state !== 'live' || row.is_story) return null;
  if (!Array.isArray(row.distribution_targets) || !row.distribution_targets.includes('place')) return null;
  if (row.origin === 'curator') return null;
  if (row.expires_at && Date.parse(row.expires_at) <= now) return null;
  const point = feedService().displayedPoint(row, NOBODY) || { latitude: null, longitude: null };
  // eslint-disable-next-line global-require
  const shown = studio ? require('./postStudio').shownOf(studio) : [];
  // The place name everyone but its author is shown (a street line never; a Home post's never, which may be its address).
  const isHomePost = row.identity_context_type === 'home' || row.post_as === 'home';
  const text = body([
    ...strings(row.title, row.content, isHomePost ? null : feedService().placeLabelForOthers(row)),
    ...studioWords(studio || {}),
    ...stampWords(shown),
  ]);
  if (!text) return null;
  const entry = {
    post_id: row.id,
    kind: 'post',
    // Under a made-up name, no person (LEAD-3 08:17): never matched by any search by person.
    user_id: penName.isPenNameRow(row) ? null : row.user_id,
    body: text,
    shown_lat: point.latitude ?? null,
    shown_lng: point.longitude ?? null,
    at: row.created_at,
    made_at: row.created_at,
    stays: true,
    ends_at: row.expires_at || null,
  };
  return { ...entry, source_key: keyOf(entry) };
}

async function studioRowsFor(ids) {
  const rows = await byIds(ids, async (chunk) => {
    const { data, error } = await supabaseAdmin.from('PostStudio').select('post_id, studio').in('post_id', chunk);
    if (error) throw new Error(`Failed to load the posts' Studio rows: ${error.message}`);
    return data || [];
  });
  return new Map(rows.map((r) => [r.post_id, r.studio]));
}

/** Index rows for these Post rows (Moments and posts); ids to remove for the ones that shouldn't be listed. */
async function entriesFor(rows, now) {
  const posts = rows.filter((r) => !r.is_story);
  const studios = await studioRowsFor(posts.map((r) => r.id));
  const put = [];
  const drop = [];
  for (const row of rows) {
    const entry = row.is_story ? momentEntry(row, now) : postEntry(row, studios.get(row.id) || null, now);
    if (entry) put.push(entry); else drop.push(row.id);
  }
  return { put, drop };
}

async function readPosts(build) {
  const store = momentStore();
  const [moments, posts] = await Promise.all([
    build(supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)),
    build(supabaseAdmin.from('Post').select(POST_SELECT).not('is_story', 'is', true)),
  ]);
  if (moments.error) throw new Error(`Failed to load Moments to index: ${moments.error.message}`);
  if (posts.error) throw new Error(`Failed to load posts to index: ${posts.error.message}`);
  return [...(moments.data || []).map((r) => ({ ...r, is_story: true })), ...(posts.data || [])];
}

/** Writes what changed (by `source_key`) and removes what shouldn't be listed. Answers { written, removed }. */
async function write({ put, drop }) {
  let written = 0;
  let removed = 0;
  const ids = [...new Set([...put.map((e) => e.post_id), ...drop])];
  const known = new Map((await byIds(ids, async (chunk) => {
    const { data, error } = await supabaseAdmin.from('PulseSearch').select('post_id, source_key').in('post_id', chunk);
    if (error) throw new Error(`Failed to read the search index: ${error.message}`);
    return data || [];
  })).map((r) => [r.post_id, r.source_key]));
  const changed = put.filter((e) => known.get(e.post_id) !== e.source_key);
  // An unchanged row is touched too, so the rolling refresh moves on past it.
  const unchanged = put.filter((e) => known.get(e.post_id) === e.source_key).map((e) => e.post_id);
  for (let i = 0; i < changed.length; i += 200) {
    const { data, error } = await supabaseAdmin.rpc('pulse_search_put', { p_rows: changed.slice(i, i + 200) });
    if (error) throw new Error(`Failed to write the search index: ${error.message}`);
    written += Number(data) || 0;
  }
  const touchedAt = new Date().toISOString();
  await byIds(unchanged, async (chunk) => {
    const { error } = await supabaseAdmin.from('PulseSearch').update({ indexed_at: touchedAt }).in('post_id', chunk);
    if (error) throw new Error(`Failed to touch the search index: ${error.message}`);
    return [];
  });
  const gone = drop.filter((id) => known.has(id));
  await byIds(gone, async (chunk) => {
    const { error } = await supabaseAdmin.from('PulseSearch').delete().in('post_id', chunk);
    if (error) throw new Error(`Failed to remove from the search index: ${error.message}`);
    return [];
  });
  removed = gone.length;
  return { written, removed };
}

/**
 * One run of the job (CONTRACT 9a): new rows since the newest indexed, the rows that change with time or later writes,
 * and a rolling refresh of the rows indexed longest ago (which also removes what was deleted or held). With the switch
 * off for everyone it does nothing at all: no read but the cached flag's.
 */
async function fill(now = Date.now()) {
  if (!(await strands().onForAnyone())) return null;
  const { data: newest, error } = await supabaseAdmin.from('PulseSearch').select('made_at').order('made_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Failed to read the search index: ${error.message}`);
  const since = newest?.[0]?.made_at || new Date(now - FIRST_FILL_DAYS * DAY_MS).toISOString();
  const recent = new Date(now - RECENT_MOMENT_HOURS * HOUR_MS).toISOString();
  const edited = new Date(now - 10 * 60 * 1000).toISOString();
  const store = momentStore();
  const [fresh, changing, sealed, edits, oldest] = await Promise.all([
    readPosts((q) => q.gt('created_at', since).order('created_at', { ascending: true }).limit(BATCH)),
    supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true).gte('created_at', recent)
      .order('created_at', { ascending: false }).limit(BATCH),
    supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)
      .not('post_metadata->moment->>seal', 'is', null).order('created_at', { ascending: false }).limit(BATCH),
    supabaseAdmin.from('Post').select(POST_SELECT).not('is_story', 'is', true).gte('updated_at', edited).limit(BATCH),
    supabaseAdmin.from('PulseSearch').select('post_id').order('indexed_at', { ascending: true }).limit(BATCH),
  ]);
  for (const read of [changing, sealed, edits, oldest]) {
    if (read.error) throw new Error(`Failed to load rows to index: ${read.error.message}`);
  }
  const oldIds = (oldest.data || []).map((r) => r.post_id);
  const refreshed = await byIds(oldIds, (chunk) => readPosts((q) => q.in('id', chunk)));
  // A row the rolling refresh asked for that is gone from Post was removed by the cascade already.
  const rows = new Map();
  for (const row of [...fresh, ...(changing.data || []).map((r) => ({ ...r, is_story: true })),
    ...(sealed.data || []).map((r) => ({ ...r, is_story: true })), ...(edits.data || []), ...refreshed]) {
    rows.set(row.id, row);
  }
  const done = await write(await entriesFor([...rows.values()], now));
  return { read: rows.size, ...done };
}

module.exports = { fill, momentEntry, postEntry, studioWords, POST_SELECT };
