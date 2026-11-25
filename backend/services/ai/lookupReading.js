/**
 * The lookup's reading (LOOKUPORDER SPEC 5.1): "Ask Pantopus: what does this mean for me?" on the signed-out
 * address lookup. One model call over the public facts the page already shows, no tools, no memory, no
 * conversation; routes/public.js makes the call (POST /api/public/place/reading).
 *
 * This file is the parts without a model call: what the model is given, the shape of its answer, and the checks on
 * what comes back. What the model is given is the page's facts and the city and state, and nothing that places the
 * home: never the typed address, the street, the house number, the ZIP, the coordinates or the map cell, and nothing
 * about the visitor.
 *
 * Switches (all read at call time):
 *   AI_LOOKUP_READING=off          hides it (the route answers 404, and the lookup's order leaves out its Ask row)
 *   AI_LOOKUP_DAILY_READINGS=2000  model calls everyone together may make since midnight UTC (past it: 429)
 *   AI_ASSISTANT=off               stops it too
 */
const crypto = require('crypto');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { isAssistantOff } = require('./assistantBudget');
const { toClaudeSchema } = require('./schemas');

const ENDPOINT = 'lookup_reading';
const MAX_STEPS = 3;
const QUESTIONS = 3;
const MAX_EPA_SITES = 5;
const COUNT_MEMO_MS = 60_000;

function positiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const switchedOff = () => ['off', 'false', '0', 'disabled']
  .includes(String(process.env.AI_LOOKUP_READING || '').trim().toLowerCase());

/** Whether the reading can be offered at all (its switch, the assistant's, and a model key). */
function enabled() {
  return !switchedOff() && !isAssistantOff() && Boolean(process.env.ANTHROPIC_API_KEY);
}

// ── The daily cap ──────────────────────────────────────────────
let countMemo = { count: 0, until: 0 };

/** Model calls made since midnight UTC (answers served from the cache made none). A count that can't be read lets the call through. */
async function overDailyCap() {
  const cap = positiveInt(process.env.AI_LOOKUP_DAILY_READINGS, 2000);
  try {
    if (countMemo.until <= Date.now()) {
      const midnight = new Date();
      midnight.setUTCHours(0, 0, 0, 0);
      const { count, error } = await supabaseAdmin.from('AIRequestLog')
        .select('id', { count: 'exact', head: true })
        .eq('endpoint', ENDPOINT)
        .eq('cache_hit', false)
        .gte('created_at', midnight.toISOString());
      if (error) throw new Error(error.message);
      countMemo = { count: count || 0, until: Date.now() + COUNT_MEMO_MS };
    }
    return countMemo.count >= cap;
  } catch (err) {
    logger.warn('lookup reading: daily count unreadable; letting the call through', { error: err.message });
    return false;
  }
}

/** Counts a call this process just made, so the memo doesn't lag a busy minute. */
function countCall() {
  countMemo.count += 1;
}

// ── What the model is given ────────────────────────────────────
// Keys that could place the home or reach a person, dropped at any depth.
const DROPPED_KEYS = new Set([
  'address', 'street', 'line', 'zip', 'zipcode', 'zip_code', 'postal_code', 'lat', 'lng', 'latitude', 'longitude',
  'map_center_lat', 'map_center_lng', 'geohash', 'cell', 'point', 'coordinates', 'location', 'polling_place',
  'phone', 'phones', 'email', 'emails', 'fax', 'url', 'urls', 'details_url', 'link', 'links', 'official_links',
  'website', 'photo_url', 'image_url', 'id', 'pws_id', 'registry_id', 'frs_id', 'hourly', 'daily', 'channels',
  'tract_name', 'tract', 'tract_id', 'block_group', 'original_description', 'original_instruction',
]);

function scrub(value, depth = 0) {
  if (depth > 6) return undefined;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1)).filter((v) => v !== undefined);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (DROPPED_KEYS.has(key) || /_url$|_urls$|_link$|_lat$|_lng$/.test(key)) continue;
      const kept = scrub(v, depth + 1);
      if (kept !== undefined && kept !== null && kept !== '') out[key] = kept;
    }
    return out;
  }
  if (typeof value === 'string') return value.length > 600 ? `${value.slice(0, 600)}…` : value;
  return value;
}

// Per section, what the page shows, trimmed (SPEC 5.1): no hourly weather, at most five EPA sites, no
// representative phone numbers (scrub drops every contact field).
function sectionFacts(env) {
  const data = { ...(env.data || {}) };
  if (env.id === 'environmental_hazards' && Array.isArray(data.facilities)) {
    // Names, programs and standing only: a site's distance, with its name, would help place the home.
    data.facilities = data.facilities.slice(0, MAX_EPA_SITES).map((f) => ({
      name: f.name, program: f.program, compliance: f.compliance, construction: f.construction,
    }));
  }
  if (env.id === 'civic_districts' && Array.isArray(data.representatives)) {
    data.representatives = data.representatives.map((r) => ({ name: r.name, office: r.office || r.office_label, party: r.party }));
  }
  if (env.id === 'civic_election') {
    // Ballot's card carries a running count and links: the election's name, date and stage are what matter here.
    const { name, date, days_until: daysUntil, phase, title, subtitle } = data;
    return { id: env.id, group: env.group, source: env.source, data: scrub({ name, date, days_until: daysUntil, phase, title, subtitle }) };
  }
  return { id: env.id, group: env.group, source: env.source, ...(env.status !== 'ready' ? { status: env.status } : {}), data: scrub(data) };
}

// The money card without anything that names the ZIP: the curve is the county's, and the ZIP's own last year is
// given as "this ZIP code" without its number.
function moneyFacts(money) {
  if (!money) return null;
  const out = {};
  if (money.value) out.typical_home_value = { amount: money.value.amount, scope: money.value.scope, source: money.value.source };
  if (money.tax) out.typical_property_tax_a_year = { amount: money.tax.amount, scope: money.tax.scope, source: money.tax.source };
  const t = money.trend;
  if (t) {
    out.price_index = {
      what: 'FHFA House Price Index: a price-change index for the county, never a home value or a sale price',
      county: t.county_name || (t.scope === 'county' ? t.area_name : null),
      county_change_last_year_pct: t.county_last_change_pct ?? (t.scope === 'county' ? t.last_change_pct : null),
      ...(t.scope === 'zip' ? { this_zip_code_change_last_year_pct: t.last_change_pct } : {}),
      year: t.year,
      change_since_first_year_pct: t.since_change_pct,
      first_year: t.since_year,
    };
  }
  out.note = 'Area figures, not this home. This home\'s own county value and tax bill are not on this page.';
  return out;
}

/**
 * The facts the model is given for one preview (buildPlacePreview's answer). Never anything that places the home.
 * @returns {object}
 */
function readingInput(preview) {
  const sections = (preview.sections || [])
    .filter((env) => env && env.status !== 'error' && env.status !== 'unavailable' && env.data)
    .map(sectionFacts);
  const aha = preview.aha
    ? { headline: preview.aha.headline, detail: preview.aha.detail, grade: preview.aha.grade, tone: preview.aha.tone, section: preview.aha.section_id }
    : null;
  const floodCost = preview.flood_cost
    ? { headline: preview.flood_cost.headline, detail: preview.flood_cost.detail, scope: preview.flood_cost.scope, source: preview.flood_cost.source }
    : null;
  return {
    area: { city: preview.place?.city || null, state: preview.place?.state || null },
    stand_out: aha,
    at_a_glance: (preview.glance || []).map((row) => ({ check: row.label, value: row.value, tone: row.tone })),
    money: moneyFacts(preview.money),
    ...(floodCost ? { flood_insurance_cost: floodCost } : {}),
    sections,
    could_not_check: (preview.not_checked || []).map((n) => n.label),
  };
}

/**
 * The words that place the home, for the check that none of them reaches the model or comes back: the typed
 * address, the geocoded street line, the street name alone (5 characters or more) and the ZIP. Not the bare house
 * number: the model is never given it, and a number like 28 or 2025 turns up in the facts on its own.
 */
function placingWords({ typed, place }) {
  const words = new Set();
  const add = (text, min = 3) => { const t = String(text || '').trim().toLowerCase(); if (t.length >= min) words.add(t); };
  add(typed);
  // The geocoded place names its street line `line` (a preview's place calls it `address`).
  const street = place?.line || place?.address;
  add(street);
  add(place?.zipcode, 5);
  for (const line of [street, String(typed || '').split(',')[0]]) {
    add(String(line || '').replace(/^\s*\d+[a-z]?(-\d+)?\s+/i, ''), 5);
  }
  return [...words];
}

/** True when `text` holds any placing word (a house number counts only as a whole number). */
function mentionsPlace(text, words) {
  const lower = String(text || '').toLowerCase();
  return words.some((w) => (/^\d+[a-z]?$/.test(w) ? new RegExp(`(^|[^0-9])${w}([^0-9]|$)`).test(lower) : lower.includes(w)));
}

// ── The answer ─────────────────────────────────────────────────
const readingJsonSchema = {
  type: 'object',
  properties: {
    matters: { type: 'string', description: 'Two or three sentences: what matters most here.' },
    steps: {
      type: 'array',
      maxItems: MAX_STEPS,
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'One step, from the agency that publishes the fact.' },
          source: { type: 'string', description: 'The agency, as the input names it (EPA, FEMA, the county...).' },
        },
        required: ['text', 'source'],
      },
    },
    cannot_tell: { type: 'string', description: 'One or two sentences: what this page cannot tell.' },
    questions: {
      type: 'array',
      minItems: QUESTIONS,
      maxItems: QUESTIONS,
      items: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'A question someone looking at this page would ask.' },
          a: { type: 'string', description: 'The answer, three sentences at most.' },
        },
        required: ['q', 'a'],
      },
    },
  },
  required: ['matters', 'steps', 'cannot_tell', 'questions'],
};
const readingClaudeSchema = toClaudeSchema(readingJsonSchema);

const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const FORBIDDEN_WORDS = /\bneighbou?r(s|hood|hoods|ly)?\b/i;

// Every number in the reading must be in the input (SPEC 5.1: "no number that is not in the input"), rounded or not.
// Single digits are let through: the input's own small numbers read as words just as often.
function numbersOf(text) {
  return (String(text).match(/\d[\d,]*(\.\d+)?/g) || [])
    .map((n) => n.replace(/,/g, '').replace(/\.0+$/, ''))
    .filter((n) => n.length > 1);
}

/**
 * The model's answer, checked: the shape, the counts, no words that place the home, no "neighbor", and no number the
 * input doesn't hold. null (with the reason) when anything fails: a half reading is never shown.
 * @returns {{reading: object|null, reason: string|null}}
 */
function checkReading(answer, { input, placing }) {
  if (!answer || typeof answer !== 'object') return { reading: null, reason: 'not an object' };
  const reading = {
    matters: clean(answer.matters),
    steps: (Array.isArray(answer.steps) ? answer.steps : []).slice(0, MAX_STEPS)
      .map((s) => ({ text: clean(s?.text), source: clean(s?.source) }))
      .filter((s) => s.text && s.source),
    cannot_tell: clean(answer.cannot_tell),
    questions: (Array.isArray(answer.questions) ? answer.questions : [])
      .map((x) => ({ q: clean(x?.q), a: clean(x?.a) }))
      .filter((x) => x.q && x.a),
  };
  if (!reading.matters || !reading.cannot_tell) return { reading: null, reason: 'empty part' };
  if (reading.questions.length !== QUESTIONS) return { reading: null, reason: `questions ${reading.questions.length}` };
  const all = [reading.matters, reading.cannot_tell, ...reading.steps.flatMap((s) => [s.text, s.source]),
    ...reading.questions.flatMap((x) => [x.q, x.a])].join('\n');
  if (FORBIDDEN_WORDS.test(all)) return { reading: null, reason: 'forbidden word' };
  if (mentionsPlace(all, placing)) return { reading: null, reason: 'names the place' };
  // A rounded figure ("+167%" for 166.6, "about $4,200" for 4,214) is the input's own number: within 1% passes.
  const held = numbersOf(JSON.stringify(input)).map(Number);
  const near = (n) => held.some((h) => Math.abs(n - h) <= Math.max(0.5, Math.abs(h) * 0.01));
  const stray = numbersOf(all).filter((n) => !near(Number(n)));
  if (stray.length) return { reading: null, reason: `numbers not in the input: ${stray.slice(0, 5).join(', ')}` };
  return { reading, reason: null };
}

/** The user message: the facts, then the ask. */
function userContent(input) {
  return `The public records on this page, as JSON:\n${JSON.stringify(input)}\n\nWrite the reading.`;
}

// ── The reading ticket (SPEC 5.1a) ─────────────────────────────
// The lookup's answer carries a ticket for its own place, so the reading no longer leans on the caller's address
// (a web proxy, a phone changing networks, a page read for longer than ten minutes). It holds the geocoded place
// and an expiry an hour ahead, signed with a key derived from a secret the server already has; nothing is stored.
// It is issued only by a counted lookup, never reaches the model or a log, and a bad or expired one is no ticket.
const TICKET_TTL_MS = 60 * 60 * 1000;
const TICKET_MAX_CHARS = 1500;

function ticketKey() {
  const secret = String(process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || '').trim();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update('pantopus-lookup-reading-ticket-v1').digest();
}

const clipText = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

/** A signed ticket for a geocoded lookup place, or null (no key on this server, or no usable point). */
function issueTicket(place, now = Date.now()) {
  const key = ticketKey();
  const lat = Number(place?.lat);
  const lng = Number(place?.lng);
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const claims = {
    v: 1,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    line: clipText(place.line, 120),
    city: clipText(place.city, 120),
    state: clipText(place.state, 24),
    zip: clipText(place.zipcode, 12),
    exp: now + TICKET_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', key).update(body).digest('base64url')}`;
}

/** The place a valid, unexpired ticket names, in the lookup's place shape; null for anything else. */
function readTicket(value, now = Date.now()) {
  const key = ticketKey();
  if (!key || typeof value !== 'string' || !value || value.length > TICKET_MAX_CHARS) return null;
  const [body, mac, extra] = value.split('.');
  if (!body || !mac || extra !== undefined) return null;
  const expected = crypto.createHmac('sha256', key).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (claims?.v !== 1 || !(Number(claims.exp) > now)) return null;
  const lat = Number(claims.lat);
  const lng = Number(claims.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    ok: true, lat, lng, line: claims.line || null, city: claims.city || null, state: claims.state || null, zipcode: claims.zip || null,
  };
}

/** For tests: forget the daily count. */
function resetMemo() {
  countMemo = { count: 0, until: 0 };
}

module.exports = {
  ENDPOINT,
  enabled,
  overDailyCap,
  countCall,
  readingInput,
  placingWords,
  mentionsPlace,
  checkReading,
  userContent,
  readingClaudeSchema,
  issueTicket,
  readTicket,
  resetMemo,
};
