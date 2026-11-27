'use strict';

// Pulse, reinvented, phase 3: Convergences and the sky strip (coord CONTRACT 8h; board B14). Rarely, when the real world
// earns it, a 15-minute window opens over a 0.1° cell; every Live photo taken there in it joins one kept piece, and each
// sunset becomes one band of colour in the strip. Never invented: a job (jobs/pulseConvergence.js) decides by stated
// rules from real weather stamps and real captures by several people. No new table: a joined Moment keeps
// `convergence` in its own kept value, and stays. Only Moments of authors with the switch on count, and only a Moment
// its author posted with `join_convergence` ("Join tonight's sky: your photo stays in the piece") joins.

const { DateTime } = require('luxon');
const sharp = require('sharp');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const penName = require('../penName');

const MINUTE_MS = 60 * 1000;
const WINDOW_MS = 15 * MINUTE_MS;
const LOOK_MS = 30 * MINUTE_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SNOW_QUIET_MS = 60 * DAY_MS;
const MIN_PEOPLE = 3;
const ZONE = 'America/Los_Angeles';
const LIVE_SOURCES = ['gps', 'capture'];
const BAD_SKY = new Set(['overcast', 'fog', 'rain', 'drizzle', 'showers', 'thunderstorm', 'snow', 'sleet']);
const TITLES = { sunset: "Tonight's sky", first_snow: 'First snow' };
const NEAR = [-1, 0, 1];

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

const cellIndex = (value) => Math.floor(Number(value) * 10);
const cellOf = (row) => `${cellIndex(row.latitude)}:${cellIndex(row.longitude)}`;
const zoneOf = (row) => momentStore().meta(row).stamp_values?.zone || ZONE;
const skyOf = (row) => momentStore().meta(row).stamp_values?.weather?.kind || null;
const dayIn = (ms, zone) => DateTime.fromMillis(ms, { zone }).toISODate();

/**
 * A Live photo Moment that may count toward a rule: shared with people nearby (never a Friends-only one, so a window
 * never says someone posted privately there; LEAD-3 07:19). The switch-on author is checked by the caller.
 */
function liveCapture(row) {
  const m = momentStore().meta(row);
  return row.audience === 'nearby' && m.kind === 'photo' && LIVE_SOURCES.includes(m.location_source) && !m.share_at && !m.at_home && !m.show_area
    && !row.post_metadata?.area && !penName.isPenNameRow(row) && row.latitude != null && !row.archived_at
    && row.moderation_state === 'live' && m.state === 'live' && !m.seal;
}

/** The average colour of the top third of the Moment's photo (its thumbnail), as #RRGGBB, or null. */
async function bandOf(row) {
  const stored = momentStore().meta(row).media;
  const key = stored?.thumb_key || stored?.key;
  if (!key) return null;
  try {
    // eslint-disable-next-line global-require
    const buffer = await require('../moments/momentMedia').download(stored.bucket, key);
    const image = sharp(buffer).rotate();
    const { width, height } = await image.metadata();
    if (!width || !height) return null;
    const { channels } = await image.extract({ left: 0, top: 0, width, height: Math.max(1, Math.floor(height / 3)) }).stats();
    const hex = (c) => Math.round(c.mean).toString(16).padStart(2, '0');
    return `#${hex(channels[0])}${hex(channels[1])}${hex(channels[2])}`.toUpperCase();
  } catch (error) {
    logger.warn('[pulseConvergence] band unreadable', { momentId: row.id, error: error.message });
    return null;
  }
}

async function recentCaptures(now) {
  const store = momentStore();
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)
    .gte('created_at', new Date(now - LOOK_MS - WINDOW_MS).toISOString()).lte('created_at', new Date(now).toISOString())
    .eq('post_metadata->moment->>kind', 'photo').is('archived_at', null).eq('moderation_state', 'live').limit(2000);
  if (error) throw new Error(`Failed to load recent captures: ${error.message}`);
  const rows = (data || []).filter(liveCapture);
  const authors = [...new Set(rows.map((r) => String(r.user_id)))];
  const on = new Set((await Promise.all(authors.map(async (id) => ((await store.reinventedOn(id)) ? id : null)))).filter(Boolean));
  return rows.filter((r) => on.has(String(r.user_id)));
}

async function taggedIn(cell, sinceMs, kind = null) {
  let query = supabaseAdmin.from('Post').select(momentStore().MOMENT_SELECT).eq('is_story', true)
    .eq('post_metadata->moment->convergence->>cell', cell).gte('created_at', new Date(sinceMs).toISOString());
  if (kind) query = query.eq('post_metadata->moment->convergence->>kind', kind);
  const { data, error } = await query.limit(1000);
  if (error) throw new Error(`Failed to load a convergence: ${error.message}`);
  return data || [];
}

/** Which rule this cell's recent captures meet now, if any: 'sunset', 'first_snow' or null. */
async function ruleMet(cell, rows, now) {
  const people = new Set(rows.filter((r) => Date.parse(r.created_at) >= now - LOOK_MS).map((r) => String(r.user_id)));
  if (people.size < MIN_PEOPLE) return null;
  const [lat, lng] = cell.split(':').map((v) => (Number(v) + 0.5) / 10);
  const zone = zoneOf(rows[0]);
  const skies = rows.map(skyOf);
  if (skies.includes('snow')) {
    const before = await supabaseAdmin.from('Post').select('id').eq('is_story', true)
      .gte('created_at', new Date(now - SNOW_QUIET_MS).toISOString()).lt('created_at', new Date(now - LOOK_MS - WINDOW_MS).toISOString())
      .eq('post_metadata->moment->stamp_values->weather->>kind', 'snow')
      .gte('latitude', lat - 0.05).lt('latitude', lat + 0.05).gte('longitude', lng - 0.05).lt('longitude', lng + 0.05).limit(1);
    if (before.error) throw new Error(before.error.message);
    const season = await taggedIn(cell, now - 120 * DAY_MS, 'first_snow');
    if (!(before.data || []).length && !season.length) return 'first_snow';
  }
  // eslint-disable-next-line global-require
  const sunset = require('../moments/momentStamps').sunsetMs(lat, lng, now, zone);
  const known = skies.filter(Boolean);
  if (sunset && now >= sunset - LOOK_MS && now <= sunset && known.length && !known.some((k) => BAD_SKY.has(k))) return 'sunset';
  return null;
}

/**
 * The job's work: open the windows the rules call for, and join every Live photo taken in an open window. Answers
 * { opened, joined }. Safe to run again: a window's id is its cell, local date and kind.
 */
async function run(now = Date.now()) {
  const store = momentStore();
  const rows = await recentCaptures(now);
  const cells = new Map();
  for (const row of rows) cells.set(cellOf(row), [...(cells.get(cellOf(row)) || []), row]);
  let opened = 0;
  let joined = 0;
  for (const [cell, inCell] of cells) {
    try {
      const zone = zoneOf(inCell[0]);
      const tagged = await taggedIn(cell, now - DAY_MS);
      const today = tagged.map((r) => store.meta(r).convergence)
        .filter((c) => c && c.day === dayIn(now, zone));
      let window = today.find((c) => Date.parse(c.closes_at) >= now) || null;
      if (!window) {
        const kind = await ruleMet(cell, inCell, now);
        if (kind && !today.some((c) => c.kind === kind)) {
          window = {
            id: `${kind}:${cell}:${dayIn(now, zone)}`, kind, cell, day: dayIn(now, zone),
            opened_at: new Date(now).toISOString(), closes_at: new Date(now + WINDOW_MS).toISOString(),
          };
          opened += 1;
          logger.info('[pulseConvergence] window opened', { id: window.id, people: new Set(inCell.map((r) => r.user_id)).size });
        }
      }
      if (!window) continue;
      const from = Date.parse(window.opened_at) - LOOK_MS;
      for (const row of inCell) {
        const at = Date.parse(row.created_at);
        // Joining is the author's own choice (LEAD-3 07:19): only a Moment posted with `join_convergence`.
        if (at < from || at > Date.parse(window.closes_at) || store.meta(row).convergence || !store.meta(row).convergence_join) continue;
        const band = window.kind === 'sunset' ? await bandOf(row) : null;
        const updated = await store.updateMoment(row, {
          moment: { convergence: { ...window, band }, kept_post_at: store.meta(row).kept_post_at || new Date(now).toISOString() },
        });
        if (updated) joined += 1;
      }
    } catch (error) {
      logger.warn('[pulseConvergence] cell failed', { cell, error: error.message });
    }
  }
  return { opened, joined };
}

// ─── Reading ────────────────────────────────────────────────────────────────

async function visible(rows, viewerId) {
  const store = momentStore();
  if (!rows.length) return [];
  const [ctx, reported] = await Promise.all([store.viewerContext(viewerId, rows.map((r) => r.user_id), null, rows), store.reportedIds(viewerId)]);
  return rows.filter((row) => !row.archived_at && row.moderation_state === 'live'
    // Listed as lists show them (listedFor): never another's unopened relic or live guess spot (CONTRACT 8g, 5b).
    && (store.isOwn(row, viewerId) || (store.canSee(row, ctx) && store.listedFor(row, viewerId) && !reported.has(row.id))));
}

function summaryOf(c, now = Date.now()) {
  return { id: c.id, kind: c.kind, title: TITLES[c.kind] || 'Convergence', open: Date.parse(c.closes_at) >= now };
}

/** POST /convergences/near — { latitude, longitude } in the body, never kept: windows open now or in the last day nearby. */
async function near(viewerId, body) {
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (body?.latitude == null || body?.longitude == null || !(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)) {
    throw fail(400, 'CONVERGENCE_INVALID', 'Send where you are as latitude and longitude.');
  }
  const cells = NEAR.flatMap((dy) => NEAR.map((dx) => `${cellIndex(latitude) + dy}:${cellIndex(longitude) + dx}`));
  const store = momentStore();
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)
    .in('post_metadata->moment->convergence->>cell', cells).gte('created_at', new Date(Date.now() - DAY_MS - LOOK_MS).toISOString())
    .limit(2000);
  if (error) throw new Error(`Failed to load convergences: ${error.message}`);
  const rows = await visible(data || [], viewerId);
  const byId = new Map();
  for (const row of rows) {
    const c = store.meta(row).convergence;
    const entry = byId.get(c.id) || { c, count: 0, people: new Set() };
    entry.count += 1;
    entry.people.add(String(row.user_id));
    byId.set(c.id, entry);
  }
  return {
    convergences: [...byId.values()].sort((a, b) => String(b.c.opened_at).localeCompare(String(a.c.opened_at)))
      .map(({ c, count, people }) => ({ ...summaryOf(c), closes_at: c.closes_at, count, people: people.size })),
  };
}

async function rowsOf(id) {
  const { data, error } = await supabaseAdmin.from('Post').select(momentStore().MOMENT_SELECT).eq('is_story', true)
    .eq('post_metadata->moment->convergence->>id', String(id)).order('created_at', { ascending: true }).limit(500);
  if (error) throw new Error(`Failed to load the convergence: ${error.message}`);
  return data || [];
}

/** GET /convergences/:id — the kept piece: its Moments this reader may see, and their bands. */
async function view(id, viewerId) {
  const store = momentStore();
  const rows = await visible(await rowsOf(id), viewerId);
  if (!rows.length) throw fail(404, 'CONVERGENCE_NOT_FOUND', 'This could not be found.');
  const c = store.meta(rows[0]).convergence;
  const moments = await store.serializeMoments(rows, viewerId, { keptPosts: true });
  return {
    convergence: {
      ...summaryOf(c), opened_at: c.opened_at, closes_at: c.closes_at, moments,
      bands: rows.map((r) => store.meta(r).convergence.band).filter(Boolean),
    },
  };
}

/** GET /strip/sky?cell=<a sunset convergence id>&days= — the sunset bands of that cell, one entry per day. */
async function skyStrip(id, viewerId, days = 30) {
  const store = momentStore();
  const cell = String(id || '').split(':').slice(1, 3).join(':');
  if (!/^-?\d+:-?\d+$/.test(cell)) throw fail(400, 'CONVERGENCE_INVALID', 'Send the id of a sunset convergence as cell.');
  const span = Math.min(Math.max(Number.parseInt(days, 10) || 30, 1), 365);
  const rows = await visible((await taggedIn(cell, Date.now() - span * DAY_MS, 'sunset')), viewerId);
  const byDay = new Map();
  for (const row of rows) {
    const c = store.meta(row).convergence;
    const entry = byDay.get(c.day) || { date: c.day, bands: [], count: 0 };
    if (c.band) entry.bands.push(c.band);
    entry.count += 1;
    byDay.set(c.day, entry);
  }
  return { days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

/** The `convergence` a Moment answer carries (switch-on reader), or null. */
function answerOf(m) {
  return m?.convergence ? summaryOf(m.convergence) : null;
}

module.exports = { run, near, view, skyStrip, answerOf, ruleMet, MIN_PEOPLE };
