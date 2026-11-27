'use strict';

// Pulse, reinvented, phase 3: pinboards and the crowd freeze (coord CONTRACT 8i). No new table.
// A pinboard is a photo Moment with a prompt ("Best fall tree on your walk"), open to pieces for 7 days; a piece is a
// photo Moment that names it (`pinboard_of`), one per person. Both stay, kept as posts that stay; each piece's own
// audience decides who sees it. The crowd freeze reads, and stores nothing: the Live photos and videos taken within 60
// seconds and 150 m of one Moment, ordered around the scene so the app can scrub around it.

const supabaseAdmin = require('../../config/supabaseAdmin');
const penName = require('../penName');
const { haversineMeters } = require('../../utils/trustState');

const OPEN_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PIECES = 300;
const CROWD_MS = 60 * 1000;
const CROWD_M = 150;
const CROWD_MIN = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIVE_SOURCES = ['gps', 'capture'];

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/** What the post asks: { prompt } to start one, { of } to add a piece, or null. Throws 400 on a bad field. */
function parse(body) {
  const prompt = body?.pinboard?.prompt;
  const of = body?.pinboard_of;
  if (prompt == null && of == null) return null;
  if (prompt != null && of != null) throw fail(400, 'PINBOARD_INVALID', 'Start a pinboard or add a piece, not both.');
  if (of != null) {
    if (!UUID.test(String(of))) throw fail(400, 'PINBOARD_INVALID', 'Send the pinboard as the id of its first Moment.');
    return { of: String(of).toLowerCase() };
  }
  const text = typeof prompt === 'string' ? prompt.trim().replace(/\s+/g, ' ') : '';
  if (!text || text.length > 80) throw fail(400, 'PINBOARD_INVALID', 'Write the prompt in up to 80 characters.');
  return { prompt: text };
}

function checkPosting(ask, { kind, underPenName }) {
  if (!ask) return;
  if (kind !== 'photo') throw fail(400, 'PINBOARD_INVALID', 'A pinboard is made of photos.');
  if (underPenName) throw fail(400, 'PINBOARD_INVALID', "A pinboard shows who added what, so it can't be under a made-up name.");
}

async function visible(rows, viewerId) {
  const store = momentStore();
  const standing = rows.filter((row) => !row.archived_at && row.moderation_state === 'live');
  if (!standing.length) return [];
  const [ctx, reported] = await Promise.all([store.viewerContext(viewerId, standing.map((r) => r.user_id), null, standing), store.reportedIds(viewerId)]);
  // Listed as lists show them (listedFor): never another's unopened relic or live guess spot (CONTRACT 8g, 5b).
  return standing.filter((row) => store.isOwn(row, viewerId)
    || (store.canSee(row, ctx) && store.listedFor(row, viewerId) && !reported.has(row.id)));
}

async function loadStart(id) {
  const store = momentStore();
  const row = await store.loadMoment(id);
  if (!row) return null;
  const board = store.meta(row).pinboard;
  if (board?.prompt) return row;
  return board?.of ? store.loadMoment(board.of) : null;
}

const openUntil = (start) => new Date(Date.parse(start.created_at) + OPEN_MS).toISOString();

/** A piece's checks (`of`): the start stands, the poster may see it, it is open, one piece per person. Answers its id. */
async function checkPiece(userId, of) {
  const start = await loadStart(of);
  if (!start || !(await visible([start], userId)).length) throw fail(404, 'PINBOARD_NOT_FOUND', 'This pinboard could not be found.');
  if (Date.parse(openUntil(start)) < Date.now()) throw fail(410, 'PINBOARD_CLOSED', 'This pinboard has closed.');
  const { data, error } = await supabaseAdmin.from('Post').select('id').eq('is_story', true).eq('user_id', userId)
    .eq('post_metadata->moment->pinboard->>of', start.id).is('archived_at', null).limit(1);
  if (error) throw new Error(`Failed to read your pieces: ${error.message}`);
  if ((data || []).length) throw fail(409, 'PINBOARD_ADDED', 'You already added your piece to this pinboard.');
  return start.id;
}

function keptPart(ask, startId) {
  return { pinboard: ask.prompt ? { v: 1, prompt: ask.prompt } : { v: 1, of: startId }, kept_post_at: new Date().toISOString() };
}

async function piecesOf(startIds) {
  if (!startIds.length) return [];
  const { data, error } = await supabaseAdmin.from('Post').select(momentStore().MOMENT_SELECT).eq('is_story', true)
    .in('post_metadata->moment->pinboard->>of', startIds).order('created_at', { ascending: false }).limit(MAX_PIECES);
  if (error) throw new Error(`Failed to load the pieces: ${error.message}`);
  return data || [];
}

/** The `pinboard` of each of these rows for `viewerId` (CONTRACT 8i), by row id; one read for the page. */
async function summariesFor(rows, viewerId) {
  const store = momentStore();
  const out = new Map();
  const startOf = (row) => store.meta(row).pinboard?.of || (store.meta(row).pinboard?.prompt ? row.id : null);
  const startIds = [...new Set(rows.map(startOf).filter(Boolean))];
  if (!startIds.length) return out;
  const known = new Map(rows.filter((r) => startIds.includes(r.id)).map((r) => [r.id, r]));
  const missing = startIds.filter((id) => !known.has(id));
  const [more, pieces] = await Promise.all([
    missing.length ? supabaseAdmin.from('Post').select(store.MOMENT_SELECT).in('id', missing).then(({ data }) => data || []) : [],
    piecesOf(startIds),
  ]);
  for (const row of more) known.set(row.id, row);
  const shown = new Set((await visible(pieces, viewerId)).map((r) => r.id));
  for (const row of rows) {
    const start = known.get(startOf(row));
    if (!start) continue;
    out.set(row.id, {
      start_id: start.id,
      prompt: store.meta(start).pinboard.prompt,
      pieces: pieces.filter((p) => store.meta(p).pinboard.of === start.id && shown.has(p.id)).length,
      open: Date.parse(openUntil(start)) >= Date.now(),
      is_start: row.id === start.id,
    });
  }
  return out;
}

const keyOf = (row, which) => (momentStore().meta(row).purged_at ? null : momentStore().meta(row).media?.[which] || null);

/** GET /pinboards/:id — the pinboard (from its start or any piece) as `viewerId` may see it. */
async function view(id, viewerId) {
  const store = momentStore();
  if (!UUID.test(String(id || ''))) throw fail(404, 'PINBOARD_NOT_FOUND', 'This pinboard could not be found.');
  const start = await loadStart(id);
  if (!start || !(await visible([start], viewerId)).length) throw fail(404, 'PINBOARD_NOT_FOUND', 'This pinboard could not be found.');
  const pieces = await visible(await piecesOf([start.id]), viewerId);
  // eslint-disable-next-line global-require
  const media = require('../moments/momentMedia');
  const [authors, links, mine] = await Promise.all([
    store.loadAuthors([start.user_id, ...pieces.map((r) => r.user_id)]),
    media.signedLinks(undefined, pieces.flatMap((r) => [keyOf(r, 'thumb_key'), keyOf(r, 'key')]).filter(Boolean)),
    supabaseAdmin.from('Post').select('id').eq('is_story', true).eq('user_id', viewerId).eq('post_metadata->moment->pinboard->>of', start.id)
      .is('archived_at', null).limit(1),
  ]);
  const open = Date.parse(openUntil(start)) >= Date.now();
  return {
    pinboard: {
      start_id: start.id,
      prompt: store.meta(start).pinboard.prompt,
      started_by: authors.get(String(start.user_id)) || null,
      started_at: start.created_at,
      open_until: openUntil(start),
      open,
      pieces: pieces.map((row) => ({
        id: row.id, author: authors.get(String(row.user_id)) || null, at: row.created_at,
        thumb_url: links.get(keyOf(row, 'thumb_key')) || links.get(keyOf(row, 'key')) || null, media_url: links.get(keyOf(row, 'key')) || null,
      })),
      can_add: open && !(mine.data || []).length,
    },
  };
}

// ─── The crowd freeze ───────────────────────────────────────────────────────

function liveScene(row) {
  const m = momentStore().meta(row);
  return ['photo', 'video'].includes(m.kind) && LIVE_SOURCES.includes(m.location_source) && !m.share_at && !m.at_home
    && !m.show_area && !row.post_metadata?.area && !penName.isPenNameRow(row) && row.audience === 'nearby'
    && row.latitude != null && !m.seal;
}

function bearing(from, to) {
  const rad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(rad(to.longitude - from.longitude)) * Math.cos(rad(to.latitude));
  const x = Math.cos(rad(from.latitude)) * Math.sin(rad(to.latitude))
    - Math.sin(rad(from.latitude)) * Math.cos(rad(to.latitude)) * Math.cos(rad(to.longitude - from.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** GET /crowd/:id — the scene around one Live photo or video, from the phones there at the same minute, or null. */
async function crowdOf(id, viewerId) {
  const store = momentStore();
  if (!UUID.test(String(id || ''))) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  const center = await store.loadMoment(id);
  if (!center || !(await visible([center], viewerId)).length) throw fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  if (!liveScene(center)) return { crowd: null };
  const at = Date.parse(store.meta(center).taken_at || center.created_at);
  const point = store.displayedPoint(center);
  const pad = 0.003;
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)
    .gte('created_at', new Date(at - CROWD_MS).toISOString()).lte('created_at', new Date(at + CROWD_MS).toISOString())
    .gte('latitude', point.latitude - pad).lte('latitude', point.latitude + pad)
    .gte('longitude', point.longitude - pad * 1.5).lte('longitude', point.longitude + pad * 1.5).limit(200);
  if (error) throw new Error(`Failed to load the scene: ${error.message}`);
  const near = (data || []).filter((row) => liveScene(row)
    && haversineMeters(point.latitude, point.longitude, store.displayedPoint(row).latitude, store.displayedPoint(row).longitude) <= CROWD_M);
  const rows = await visible(near, viewerId);
  if (rows.length < CROWD_MIN) return { crowd: null };
  const points = rows.map((row) => store.displayedPoint(row));
  const middle = { latitude: points.reduce((a, p) => a + p.latitude, 0) / points.length, longitude: points.reduce((a, p) => a + p.longitude, 0) / points.length };
  const ordered = rows.map((row, i) => ({ row, b: bearing(middle, points[i]) })).sort((a, b) => a.b - b.b).map((x) => x.row);
  return { crowd: { center: center.id, moments: await store.serializeMoments(ordered, viewerId) } };
}

module.exports = { parse, checkPosting, checkPiece, keptPart, summariesFor, view, crowdOf };
