'use strict';

// Pulse, reinvented, phase 3: Eyes on (coord CONTRACT 8f, second half). Ask a place a question; people who are there
// now answer with a Live photo. An Ask made in the Studio with `studio.eyes_on` keeps `eyes_on: { v, until }` in its
// PostStudio row (open 6 hours); an answer is a photo Moment taken there now with `eyes_on_for`. A reader's own place
// only ever arrives in a POST body and is never kept or logged (LEAD-3 06:55). Nobody is told a person is near a place.

const supabaseAdmin = require('../../config/supabaseAdmin');
const { haversineMeters } = require('../../utils/trustState');

const OPEN_MS = 6 * 60 * 60 * 1000;
// Measured against the point everyone sees (the area privacy floor moves it up to about 900 m), never the stored one.
const NEAR_M = 1500;
const LIST = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOW_SOURCES = ['gps', 'capture'];
// NEAR_M plus the largest display offset, in degrees, for the database's first, wider cut.
const PAD = 0.025;

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

// eslint-disable-next-line global-require
const readAccess = () => require('./readAccess');
// eslint-disable-next-line global-require
const shownPoint = (post) => require('./distanceText').displayedPoint(post);

/** The Studio row's part for a new Ask (`eyes_on: true` sent): open for 6 hours; only an Ask with a place, not at home. */
function keptFor({ wanted, row, atHome }) {
  if (!wanted || row.post_type !== 'ask_local' || row.latitude == null || atHome) return {};
  return { eyes_on: { v: 1, until: new Date(Date.now() + OPEN_MS).toISOString() } };
}

function point(body) {
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (!(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) || body?.latitude == null || body?.longitude == null) {
    throw fail(400, 'EYES_ON_INVALID', 'Send where you are as latitude and longitude.');
  }
  return { latitude, longitude };
}

async function openAsks({ box = null, ids = null }) {
  const { POST_READ_SELECT } = readAccess();
  let query = supabaseAdmin.from('PostStudio')
    .select(`post_id, studio, post:Post!inner(${POST_READ_SELECT}, content, created_at, effective_latitude, effective_longitude, location_precision, post_type)`)
    .gt('studio->eyes_on->>until', new Date().toISOString()).is('post.archived_at', null).eq('post.moderation_state', 'live');
  if (box) {
    query = query.gte('post.latitude', box.latitude - PAD).lte('post.latitude', box.latitude + PAD)
      .gte('post.longitude', box.longitude - PAD * 1.5).lte('post.longitude', box.longitude + PAD * 1.5);
  }
  if (ids) query = query.in('post_id', ids);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(`Failed to load open Eyes-on asks: ${error.message}`);
  return data || [];
}

async function answerCounts(askIds) {
  const counts = new Map(askIds.map((id) => [id, 0]));
  if (!askIds.length) return counts;
  const { data, error } = await supabaseAdmin.from('Post').select('post_metadata->moment->>eyes_on_for')
    .eq('is_story', true).in('post_metadata->moment->>eyes_on_for', askIds).is('archived_at', null).eq('moderation_state', 'live')
    .limit(2000);
  if (error) throw new Error(`Failed to count answers: ${error.message}`);
  for (const row of data || []) {
    const id = row.eyes_on_for;
    if (counts.has(id)) counts.set(id, counts.get(id) + 1);
  }
  return counts;
}

/** POST /eyes-on/near — { latitude, longitude } (never kept): the open Eyes-on Asks near the reader that they may read. */
async function near(userId, body) {
  const here = point(body);
  const rows = await openAsks({ box: here });
  const readable = [];
  for (const row of rows) {
    const at = shownPoint(row.post);
    if (!at || haversineMeters(here.latitude, here.longitude, at.latitude, at.longitude) > NEAR_M) continue;
    if (await readAccess().canReadPost(row.post, userId).catch(() => false)) readable.push(row);
  }
  readable.sort((a, b) => String(b.post.created_at).localeCompare(String(a.post.created_at)));
  const page = readable.slice(0, LIST);
  // eslint-disable-next-line global-require
  const [authors, counts] = await Promise.all([require('../moments/momentStore').loadAuthors(page.map((r) => r.post.user_id)),
    answerCounts(page.map((r) => r.post_id))]);
  return {
    asks: page.map((row) => ({
      id: row.post_id,
      question: String(row.post.content || '').slice(0, 280),
      author: authors.get(String(row.post.user_id)) || null,
      at: row.post.created_at,
      until: row.studio.eyes_on.until,
      answers: counts.get(row.post_id) || 0,
    })),
  };
}

/**
 * The checks an answer passes when posted (`eyes_on_for`): a photo taken now, within NEAR_M of the Ask's shown point, of
 * an open Ask the poster may read, never from the poster's own home. Answers the Ask's id.
 */
async function checkAnswer(userId, askId, { kind, source, latitude, longitude, atHome }) {
  if (!UUID.test(String(askId || ''))) throw fail(400, 'EYES_ON_INVALID', 'Send the Ask as eyes_on_for.');
  if (kind !== 'photo' || !NOW_SOURCES.includes(source)) throw fail(400, 'EYES_ON_INVALID', 'Answer with a photo you take there now.');
  const [row] = await openAsks({ ids: [String(askId).toLowerCase()] });
  if (!row || !(await readAccess().canReadPost(row.post, userId).catch(() => false))) {
    throw fail(404, 'EYES_ON_NOT_FOUND', 'This question is closed or could not be found.');
  }
  if (atHome) throw fail(422, 'EYES_ON_AT_HOME', "An answer can't be taken at your home.");
  const at = shownPoint(row.post);
  if (!at || latitude == null || haversineMeters(latitude, longitude, at.latitude, at.longitude) > NEAR_M) {
    throw fail(422, 'EYES_ON_TOO_FAR', 'Answer from the place the question is about.');
  }
  return row.post_id;
}

/** For the Asks on a page (switch-on reader): `eyes_on: { open, until, answers }` by post id, from their Studio rows. */
async function partsFor(studios) {
  const asks = [...studios.entries()].filter(([, studio]) => studio?.eyes_on?.until);
  const out = new Map();
  if (!asks.length) return out;
  const counts = await answerCounts(asks.map(([id]) => id));
  for (const [id, studio] of asks) {
    out.set(id, { eyes_on: { open: Date.parse(studio.eyes_on.until) > Date.now(), until: studio.eyes_on.until, answers: counts.get(id) || 0 } });
  }
  return out;
}

module.exports = { keptFor, near, checkAnswer, partsFor, NEAR_M };
