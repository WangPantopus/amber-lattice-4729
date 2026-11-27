'use strict';

// Pulse, reinvented, phase 4: the cabinet profile and the yearly poster (coord CONTRACT 9d; board B8). Numbers about what
// a person did: places stood, the highest point, field specimens, questions helped, strands sparked, canvases added to.
// No follower or view count anywhere; nothing under a made-up name is counted for a person (those Moments are stored
// under the one system account, never theirs); nothing says where anyone stood. The person's own choice
// "Show my cabinet to people I know" (PersonChoice `cabinet_shown`, on by default) decides whether connections may read it.

const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');
const momentStamps = require('../moments/momentStamps');

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');

const ZONE = 'America/Los_Angeles';
const CHOICE = 'cabinet_shown';
const MAX_ROWS = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOMENT_COLUMNS = 'id, latitude, longitude, created_at, post_metadata';

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
const notFound = () => fail(404, 'CABINET_NOT_FOUND', 'This cabinet could not be found.');

async function rows(query, what) {
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load ${what}: ${error.message}`);
  return data || [];
}
async function count(query, what) {
  const { count: n, error } = await query;
  if (error) throw new Error(`Failed to count ${what}: ${error.message}`);
  return n || 0;
}

/** Whether this person shows their cabinet to people they know (on unless they turned it off). */
async function shownOn(userId) {
  const { data, error } = await supabaseAdmin.from('PersonChoice').select('value').eq('user_id', userId).eq('choice', CHOICE).maybeSingle();
  if (error) throw new Error(`Failed to read the cabinet setting: ${error.message}`);
  return data?.value?.on !== false;
}

/** Turns "Show my cabinet to people I know" on or off. On removes the row, so the default is what's left. */
async function setShown(userId, on) {
  const { error } = on
    ? await supabaseAdmin.from('PersonChoice').delete().eq('user_id', userId).eq('choice', CHOICE)
    : await supabaseAdmin.from('PersonChoice').upsert({
      user_id: userId, choice: CHOICE, value: { on: false }, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,choice' });
  if (error) throw new Error(`Failed to keep the cabinet setting: ${error.message}`);
}

/** May `viewerId` read `ownerId`'s cabinet: themself, or a connection with no block or mute either way, while it's shown. */
async function mayRead(ownerId, viewerId) {
  if (String(ownerId) === String(viewerId)) return true;
  // eslint-disable-next-line global-require
  const play = require('./play');
  const [connections, shown, ownerHides, readerHides] = await Promise.all([
    momentStore().connectionIds(viewerId), shownOn(ownerId), play.hiddenPeople(ownerId), play.hiddenPeople(viewerId),
  ]);
  return shown && connections.includes(String(ownerId)) && !ownerHides.has(String(viewerId)) && !readerHides.has(String(ownerId));
}

const dayOf = (iso) => DateTime.fromISO(iso, { zone: 'utc' }).setZone(ZONE).toISODate();

/** The numbers for `userId`, over everything or one Pacific year (`range`: { from, to } ISO). */
async function numbersOf(userId, range = null) {
  const within = (query, column = 'created_at') => (range ? query.gte(column, range.from).lt(column, range.to) : query);
  // Only Moments posted with the switch on carry `kept`; a made-up-name Moment is never under the person's own id.
  const own = within(supabaseAdmin.from('Post').select(MOMENT_COLUMNS).eq('is_story', true).eq('user_id', userId)
    .eq('post_metadata->moment->>kept', 'true').is('archived_at', null).order('created_at', { ascending: true }).limit(MAX_ROWS));
  const [moments, specimens, replies, strands] = await Promise.all([
    rows(own, 'Moments'),
    count(within(supabaseAdmin.from('PostAnswer').select('post_id', { count: 'exact', head: true }).eq('user_id', userId)
      .eq('kind', 'collect').is('value->deck', null)), 'field cards'),
    rows(within(supabaseAdmin.from('PostComment').select('post_id, identity_context_type, post:Post!inner(post_type)')
      .eq('user_id', userId).eq('is_deleted', false).eq('moderation_state', 'live').eq('post.post_type', 'ask_local'))
      .limit(MAX_ROWS), 'replies to Asks'),
    count(within(supabaseAdmin.from('PostStrand').select('id', { count: 'exact', head: true }).eq('source_user_id', userId)
      .is('taken_back_at', null)), 'strands'),
  ]);
  const places = new Set();
  let highest = null;
  let eyes = 0;
  let canvases = 0;
  const store = momentStore();
  // A number never tells what the person didn't show (LEAD-3 08:44): Moments at home are left out of every count, and
  // the highest point comes only from a height the person showed (the Moment's own height, or a placed elevation stamp).
  for (const row of moments) {
    const m = row.post_metadata?.moment || {};
    // An unopened relic (8g) hasn't been shown yet either.
    // eslint-disable-next-line global-require
    if (m.at_home || (m.seal && require('./seal').isSealed(row))) continue;
    const floating = Boolean(row.post_metadata?.area);
    if (row.latitude != null && row.longitude != null && !floating) {
      places.add(m.venue_id ? `v:${m.venue_id}` : `${Math.floor(row.latitude * 100)}:${Math.floor(row.longitude * 100)}`);
    }
    const shownHigh = store.shownHeight(row);
    const placed = Array.isArray(m.stamps) && m.stamps.some((stamp) => stamp?.kind === 'elevation')
      ? momentStamps.valueOf('elevation', m.stamp_values, { atHome: false, penName: false, placed: row.latitude != null }) : null;
    for (const shown of [shownHigh, placed]) {
      if (shown && !shown.flying && Number.isFinite(shown.altitude_ft)) highest = highest == null ? shown.altitude_ft : Math.max(highest, shown.altitude_ft);
    }
    if (m.eyes_on_for) eyes += 1;
    if (m.retake?.of || m.pinboard?.of) canvases += 1;
  }
  const askedReplies = new Set(replies.filter((r) => r.identity_context_type !== 'pen_name').map((r) => r.post_id));
  return {
    numbers: {
      places_stood: places.size,
      highest_ft: highest,
      specimens,
      questions_helped: askedReplies.size + eyes,
      strands_sparked: strands,
      canvases,
    },
    since: moments.length ? dayOf(moments[0].created_at) : null,
    moments,
  };
}

/** GET /cabinet/:userId for `viewerId` (CONTRACT 9d). */
async function cabinetOf(ownerId, viewerId) {
  if (!UUID.test(String(ownerId || ''))) throw notFound();
  const store = momentStore();
  const [allowed, authors, shown] = await Promise.all([mayRead(ownerId, viewerId), store.loadAuthors([ownerId]), shownOn(ownerId)]);
  const user = authors.get(String(ownerId));
  if (!allowed || !user) throw notFound();
  const { numbers, since } = await numbersOf(ownerId);
  return { cabinet: { user, since, ...numbers, shown_to: shown ? 'people_you_know' : 'only_you' } };
}

/** GET /poster/:year for `userId` (their own only): the year's numbers and one kept Moment a month. */
async function posterOf(userId, yearText) {
  const year = Number(yearText);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw fail(400, 'POSTER_INVALID', 'Choose a year.');
  const from = DateTime.fromObject({ year, month: 1, day: 1 }, { zone: ZONE });
  const range = { from: from.toUTC().toISO(), to: from.plus({ years: 1 }).toUTC().toISO() };
  const { numbers, moments } = await numbersOf(userId, range);
  const store = momentStore();
  const ids = moments.map((r) => r.id);
  const counts = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabaseAdmin.rpc('post_reaction_counts', { p_post_ids: ids.slice(i, i + 500) });
    if (error) throw new Error(`Failed to count reactions: ${error.message}`);
    for (const row of data || []) counts.set(row.post_id, (counts.get(row.post_id) || 0) + Number(row.reaction_count || 0));
  }
  const best = new Map();
  for (const row of moments) {
    const month = DateTime.fromISO(row.created_at, { zone: 'utc' }).setZone(ZONE).month;
    const score = counts.get(row.id) || 0;
    const held = best.get(month);
    if (!held || score > held.score || (score === held.score && row.created_at > held.row.created_at)) best.set(month, { row, score });
  }
  const chosen = [...best.entries()].sort((a, b) => a[0] - b[0]);
  const full = chosen.length ? await rows(supabaseAdmin.from('Post').select(store.MOMENT_SELECT).in('id', chosen.map(([, v]) => v.row.id)), 'the poster\'s Moments') : [];
  const byId = new Map(full.map((r) => [r.id, r]));
  const ordered = chosen.map(([, v]) => byId.get(v.row.id)).filter(Boolean);
  const answers = new Map((await store.serializeMoments(ordered, userId, { keptEnded: true })).map((m) => [m.id, m]));
  return {
    poster: {
      year,
      numbers,
      months: chosen.map(([month, v]) => ({ month, moment: answers.get(v.row.id) || null })).filter((m) => m.moment),
    },
  };
}

module.exports = { cabinetOf, posterOf, shownOn, setShown, CHOICE };
