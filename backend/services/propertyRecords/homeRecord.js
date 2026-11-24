'use strict';

/**
 * A Home's copy of its county record, `niche_data.property_record`: what screens
 * answer from, at once, whatever storage is doing. It holds the facts served to
 * this Home with the release and date they came from, and only what the match
 * allows: a unit's private facts only on an exact match, building figures labeled
 * as the building's. Nothing a household entered is in it, so a refresh can't
 * write over a person's entries (those stay in Home's own columns and
 * `niche_data.household_facts`, services/householdFacts.js).
 *
 * A refresh runs in the background, from any screen that reads the copy, once the
 * county has a newer release, and the copy becomes what the Home's address finds
 * now: another record replaces it, and several records, none or a suppressed one
 * take it off, since a wrong home's facts are worse than none. Only a lookup that
 * can't say keeps the last copy, shown with its date: an outage, a timeout, a
 * release past its date. A withdrawn source's facts go. Where a county's past_date
 * switch is on (router.js), a release past its date still answers, and a copy from it
 * is served with `past_date: true`, so screens say how old it is (provenanceOf,
 * countyRecordSerializer.js). That mark is never stored on the Home.
 *
 * A refresh keeps on the copy what its county's newer file changed (`changes`,
 * withChanges), for the owner's "Worth a look" (services/place/homeChanges.js).
 * A release read by changed code keeps nothing: its `reader` stamp differs.
 *
 * A lookup holds a screen for a moment at most. Past that the screen says "looking
 * up", the lookup finishes behind it, and a Home that was told so is tried again
 * until storage answers: writing to the Home tells its open screens to read again.
 */

const crypto = require('crypto');
const { isDeepStrictEqual } = require('node:util');
const { changeNicheData } = require('../homeNicheData');
const config = require('../../config/propertyRecords');
const logger = require('../../utils/logger');
const { FACTS } = require('./facts');
const { municipalRelease } = require('./format');
const { city: cityKey, parse, zip5, stateCode } = require('./addressKey');
const { lookup, StorageUnavailable } = require('./index');
const { protectsUnitSites } = require('./identity');
const reader = require('./reader');
const { DENTON_FIPS, addressSuppressed, parcelSuppressed } = require('./suppressions');
const registryUnits = require('./registryUnits');
const router = require('./router');
const counts = require('./counts');

const SCHEMA = 1;
const REFRESH_EVERY_MS = 60 * 60 * 1000;
// How long a lookup may hold a screen. What it read stays in memory, so the next ask answers at once.
const SCREEN_WAIT_MS = 1000;
// A follow-up may wait longer: a hiccup in storage passes with the person seeing only "Looking up…".
const FOLLOW_UP_WAIT_MS = 8000;
const FOLLOW_UP_EVERY_MS = 750;
// A Home told "looking up" is tried again, less and less often, for this long; a later visit starts it over.
const LATER_FIRST_GAP_MS = 2000;
const LATER_MOST_GAP_MS = 60 * 1000;
const LATER_FOR_MS = 30 * 60 * 1000;
const LATER_MOST_HOMES = 500;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MATCHED = new Set(['exact', 'building_only', 'parcel_only']);

const homeAddress = (home) => ({ line1: home.address, unit: home.address2, city: home.city, state: home.state, zip: home.zipcode });

// Which address a copy answers for: a Home whose address changes reads again.
function addressStamp(address) {
  const parsed = parse(address.line1, address.unit);
  if (!parsed) return null;
  return crypto.createHash('sha256')
    .update(JSON.stringify([parsed.number, parsed.pre, parsed.name, parsed.suffix, parsed.post, parsed.unit, parsed.building, zip5(address.zip)]))
    .digest('hex').slice(0, 24);
}

function factsWhere(facts, keep) {
  return Object.fromEntries(Object.entries(facts || {}).filter(([name]) => keep(FACTS[name])));
}

const BUILDING_FIGURES = (fact) => (fact.scope === 'building' || fact.scope === 'parcel') && !fact.value;

/**
 * A record's held facts (format.js `held`), and its building's, kept by the same rules as its own facts. They stay off
 * screens until router.served() finds the county on that list. Null with none.
 */
function heldCopy(record, building, keep) {
  const held = {};
  for (const [name, facts] of Object.entries(record.held || {})) {
    const kept = keep ? factsWhere(facts, keep) : facts;
    if (Object.keys(kept).length) held[name] = { facts: kept };
  }
  for (const [name, facts] of Object.entries(building?.held || {})) {
    const kept = factsWhere(facts, BUILDING_FIGURES);
    if (Object.keys(kept).length) held[name] = { ...held[name], building: kept };
  }
  return Object.keys(held).length ? held : null;
}

/** The copy a Home keeps of a lookup's answer; null when the answer has nothing to keep. */
function copyFromAnswer(answer, address) {
  if (!MATCHED.has(answer.match)) return null;
  const { county, record } = answer;
  let facts = record.facts;
  let keep = null;
  if (answer.match === 'building_only') keep = BUILDING_FIGURES;
  if (answer.match === 'parcel_only') keep = (fact) => fact.scope === 'parcel' || fact.value;
  if (keep) facts = factsWhere(facts, keep);
  const held = heldCopy(record, answer.building, keep);
  return {
    schema: SCHEMA,
    match: answer.match,
    reason: answer.reason || null,
    requested_subject: answer.requested_subject,
    ...(answer.unit_site_checked ? { unit_site_checked: true } : {}),
    subject: answer.subject,
    ...(county.municipal_rolls && !answer.municipality ? { has_municipal_rolls: true } : {}),
    ...(answer.municipality ? { municipal_match: { municipality: answer.municipality, city: cityKey(address.city), state: stateCode(address.state) } } : {}),
    home_type: record.home_type || null,
    jurisdiction: answer.jurisdiction,
    release: county.release,
    as_of: county.as_of,
    publisher: county.publisher,
    dataset: county.dataset,
    method: county.method,
    title: county.title || 'County records',
    // Words a publisher's terms ask to go wherever it's named as the source ("provided as is, without warranty").
    ...(county.notice ? { notice: county.notice } : {}),
    // Where each held fact of a list came from, in words, when it isn't the county's own column (format.js `held_from`).
    ...(county.held_from ? { held_from: county.held_from } : {}),
    ...(county.require_mapped_lot_label && held?.mapped_lots ? { require_mapped_lot_label: true } : {}),
    stored_at: new Date().toISOString(),
    // Which reader made the release (scripts/property-index/build.cjs readerStamp), so a refresh can tell the county's
    // changes from a change to how its files are read (withChanges).
    ...(county.reader ? { reader: county.reader } : {}),
    address_stamp: addressStamp(address),
    facts,
    ...(answer.building ? { building: factsWhere(answer.building.facts, BUILDING_FIGURES) } : {}),
    ...(held ? { held } : {}),
  };
}

/**
 * What every record at an address with several homes agrees on (identity.js `agreed`, shared facts on for its county),
 * in a copy's shape so screens label and draw it as the county's: year built, size, bedrooms and baths at most. Never
 * stored on a Home, so its screens ask the record each time and the switch going off takes it away at once. Null otherwise.
 */
function agreedCopy(answer, address) {
  if (answer.match !== 'ambiguous' || !answer.agreed) return null;
  const { county } = answer;
  return {
    schema: SCHEMA,
    match: 'ambiguous',
    reason: answer.reason || null,
    requested_subject: answer.requested_subject,
    jurisdiction: answer.jurisdiction,
    release: county.release,
    as_of: county.as_of,
    publisher: county.publisher,
    dataset: county.dataset,
    method: county.method,
    title: county.title || 'County records',
    ...(county.notice ? { notice: county.notice } : {}),
    address_stamp: addressStamp(address),
    facts: answer.agreed,
  };
}

/** The agreed facts as they may be served now, leaving out any its county withholds. Null when nothing is left. */
function servedAgreed(answer, address) {
  const shared = router.served(agreedCopy(answer, address));
  return shared && Object.keys(shared.facts).length ? dated(shared, answer.county) : null;
}

/**
 * A copy as screens get it: marked `past_date` when its county's past_date switch is on and the release it came from
 * is the one serving and past its date (router.js). Never stored, so the switch going off takes the words away at once.
 * @param {object|null} copy    a served copy
 * @param {object|null} county  the county's entry in its state's file now (null until this server has read it)
 */
function dated(copy, county) {
  if (!copy || !county || !router.pastDateFor(copy.jurisdiction) || county.release !== copy.release) return copy;
  return county.stale_after && Date.now() > Date.parse(county.stale_after) ? { ...copy, past_date: true } : copy;
}

/** "Nov 3, 2026" from "2026-11-03". */
function dateLabel(iso) {
  const [year, month, day] = String(iso || '').split('-').map(Number);
  return year && month && day ? `${MONTHS[month - 1]} ${day}, ${year}` : null;
}

/** Where a copy's facts come from, in the shape the apps read (services/recordVocabulary.js). */
function provenanceOf(copy) {
  const origin = copy.municipal_match ? `${copy.dataset}, assessed as of` : 'records, updated';
  const source = `From ${copy.publisher}'s ${origin} ${dateLabel(copy.as_of)}${copy.notice ? ` \u00b7 ${copy.notice}` : ''}`;
  let lead = '';
  if (copy.match === 'building_only') {
    lead = copy.reason === 'unit_needed'
      ? 'We found the building. Add your unit to see your home\'s own details. '
      : 'We found the building. Your unit\'s details weren\'t in the county record. ';
  }
  if (copy.match === 'ambiguous') lead = 'More than one home is on record at this address, and all of its records agree on these details. Add your unit if you have one. ';
  // A release past its date that still answers (dated): how old it is, plainly.
  const age = copy.past_date ? '. These are the newest county records we have; some details may have changed since.' : '';
  return {
    publisher: copy.publisher,
    dataset: copy.dataset,
    as_of: copy.as_of,
    // An address's several records: "building", which the apps read as "not your own unit's record".
    scope: { exact: 'unit', building_only: 'building', parcel_only: 'parcel', ambiguous: 'building' }[copy.match],
    method: copy.method,
    label: `${lead}${source}${age}`,
    title: copy.title || 'County records',
  };
}

function checkedUnitCopyRequired(copy) {
  return copy?.match === 'exact' && copy.requested_subject === 'unit' && protectsUnitSites(copy.jurisdiction);
}

function storedCopy(home) {
  const copy = home?.niche_data?.property_record;
  if (!copy || copy.schema !== SCHEMA) return null;
  if (checkedUnitCopyRequired(copy)) {
    const current = countyNow(home, copy);
    if (copy.unit_site_checked !== true || (current && current.release !== copy.release)) return null;
  }
  // A previous county-wide copy has no proof of the requested town. Re-read it on narrowing.
  // The original Suffolk release predates the municipal marker. A cold server cannot assume the whole county serves.
  if (!router.switchesKnown() && (copy.has_municipal_rolls || copy.municipal_match || copy.jurisdiction === '25025')) return null;
  const municipality = router.municipalityFor(copy.jurisdiction);
  if (municipality || copy.municipal_match) {
    const match = copy.municipal_match;
    const county = municipalRelease(countyNow(home, copy), municipality);
    if (!county || county.release !== copy.release || Date.now() > Date.parse(county.stale_after)) return null;
    if (!match || match.municipality !== municipality || match.city !== cityKey(home.city) || match.state !== stateCode(home.state)) return null;
  }
  return copy.address_stamp === addressStamp(homeAddress(home)) ? copy : null;
}

// The systems a finished permit dates on Place (services/homeSystemsService.js, `permit` source).
const PERMIT_SYSTEMS = new Set(['roof', 'hvac', 'water_heater', 'electrical_panel']);

/**
 * A copy's newest finished roof, heating, water heater or panel permit, where its county shows permits now (router.served),
 * as that system's year on Place. recordSystem never lets a permit outrank the household's word or a completed job, and an
 * older permit never replaces a newer one's year.
 */
async function permitSystems(homeId, copy) {
  const lines = router.served(copy)?.facts?.permits?.lines;
  if (!homeId || !Array.isArray(lines)) return;
  const newest = new Map();
  for (const line of lines) {
    const year = Number(String(line?.issued || '').slice(0, 4));
    if (!line?.done || !PERMIT_SYSTEMS.has(line.system) || !year || newest.get(line.system)?.year >= year) continue;
    newest.set(line.system, { year, number: line.number || null });
  }
  if (!newest.size) return;
  // eslint-disable-next-line global-require
  const homeSystems = require('../homeSystemsService');
  // eslint-disable-next-line global-require
  const supabaseAdmin = require('../../config/supabaseAdmin');
  const { data, error } = await supabaseAdmin.from('HomeSystem').select('system_key, installed_year, source').eq('home_id', homeId);
  if (error) throw new Error(error.message);
  for (const [systemKey, { year, number }] of newest) {
    const held = (data || []).find((row) => row.system_key === systemKey);
    if (held && (homeSystems.SOURCE_RANK[held.source] > homeSystems.SOURCE_RANK.permit || (held.source === 'permit' && held.installed_year >= year))) continue;
    await homeSystems.recordSystem({ homeId, systemKey, installedYear: year, source: 'permit', sourceRef: number ? `permit:${number}` : 'permit' });
  }
}

// True when the copy was written: the Home row's change tells its household's open screens to read again.
// Only this key changes, on the row as it stands now: an entry the household made during the lookup stays.
async function storeCopy(home, copy, superseded) {
  if (!home?.id || home.niche_data === undefined) return false;
  try {
    const nicheData = await changeNicheData(home.id, (stored) => {
      if (superseded && !isDeepStrictEqual(stored.property_record, superseded)) return null;
      if (copy) stored.property_record = copy;
      else delete stored.property_record;
      return stored;
    });
    if (!nicheData) return false;
    home.niche_data = nicheData;
    if (copy) permitSystems(home.id, copy).catch((err) => logger.info('property_records.permit_systems_later', { error: err.name }));
    return true;
  } catch (err) {
    logger.warn('property_records.store_failed', { error: err.message });
    return false;
  }
}

/** The county as the state's file held now says, with no wait. Null until this server has read that file. */
function countyNow(home, copy) {
  return reader.heldStateFile(stateCode(home.state))?.jurisdictions?.[copy.jurisdiction] || null;
}

/** A copy whose facts may not be shown: its county withdrew the source, or its release was taken back. */
function setAside(home, copy) {
  const county = countyNow(home, copy);
  return Boolean(county && (county.status === 'withdrawn' || county.rolled_back_from === copy.release));
}

// A Home's copy keeps what its last few refreshes changed, newest first.
const CHANGES_KEPT = 6;
const said = (name) => Boolean(FACTS[name]?.label) && !['none', 'history'].includes(FACTS[name].format);
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The facts a screen shows now (router.served, under today's switches) that a refresh gave a new value or newly states,
 * as { name: [was, now] } (was null when the record didn't state it). A fact the new copy no longer states isn't one:
 * a county file leaving a column empty is more often a gap than news.
 */
function changedFacts(old, next) {
  const before = router.served(old)?.facts || {};
  const after = router.served(next)?.facts || {};
  const changed = {};
  for (const [name, value] of Object.entries(after)) {
    if (!said(name) || value === null || value === undefined || value === '' || sameValue(before[name], value)) continue;
    changed[name] = [before[name] ?? null, value];
  }
  return changed;
}

/**
 * Whether what differs between two copies of one home's record is the county's: the same record from the same source,
 * a newer county file, read by the same reader. A release built by a changed reader (a fix to a connector or its
 * libraries) has another `reader` stamp, and a copy made before releases had one has none: either way it says nothing.
 */
function countyMoved(old, next) {
  return Boolean(old.reader && old.reader === next.reader && old.subject?.id && old.subject.id === next.subject?.id
    && old.match === next.match && old.publisher === next.publisher && old.dataset === next.dataset
    && String(next.as_of || '') > String(old.as_of || ''));
}

/**
 * The next copy with `changes`, what its record's refreshes changed (services/place/homeChanges.js "Worth a look"):
 * [{ at, release, as_of, was_as_of, facts: { name: [was, now] } }], newest first, the earlier ones carried over while it
 * is the same record and only for facts it still shows at that value, so each says what the record shows now. A release
 * taken back takes its changes with it.
 */
function withChanges(old, next, county) {
  if (!next) return next;
  const same = old?.subject?.id && old.subject.id === next.subject?.id;
  const shown = router.served(next)?.facts || {};
  const still = (entry) => {
    const facts = Object.fromEntries(Object.entries(entry?.facts || {}).filter(([name, pair]) => Array.isArray(pair) && sameValue(shown[name], pair[1])));
    return Object.keys(facts).length ? { ...entry, facts } : null;
  };
  const kept = same ? (old.changes || []).filter((entry) => entry?.release !== county?.rolled_back_from).map(still).filter(Boolean) : [];
  let entry = null;
  if (same && county?.rolled_back_from !== old.release && countyMoved(old, next)) {
    const facts = changedFacts(old, next);
    if (Object.keys(facts).length) entry = { at: next.stored_at, release: next.release, as_of: next.as_of, was_as_of: old.as_of, facts };
  }
  const changes = (entry ? [entry, ...kept] : kept).slice(0, CHANGES_KEPT);
  return changes.length ? { ...next, changes } : next;
}

const refreshedAt = new Map();

// Answers that don't say which home an address is: the copy stays until one does. (Storage that can't be read throws.)
const saysNothing = (answer) => answer.match === 'stale' || answer.reason === 'unreadable_address';

/**
 * Brings a stored copy up to the county's current release, in the background, as soon as this server has seen the
 * release change. It asks every live county, since a fix can file a record under another county of its source, and
 * keeps what the address finds now: never a copy the record no longer gives this address, which may be another home's.
 * A rolled-back release's facts leave the screens at once (setAside) and go once the release in its place has answered.
 * Only while the county is known to be live: before a server has read the switch file, copies stay as they are.
 */
function refreshSoon(home, copy) {
  if (!home.id || !router.serves(copy.jurisdiction)) return null;
  const county = countyNow(home, copy);
  if (!county || (county.release === copy.release && county.status !== 'withdrawn')) return null;
  // Once for each release a county moves to, so a refresh that finds nothing new doesn't run on every read.
  const tried = `${home.id}:${county.release}:${county.status}`;
  if (Date.now() - (refreshedAt.get(tried) || 0) < REFRESH_EVERY_MS) return null;
  refreshedAt.set(tried, Date.now());
  if (refreshedAt.size > 5000) refreshedAt.delete(refreshedAt.keys().next().value);
  return (async () => {
    if (county.status === 'withdrawn') {
      await storeCopy(home, null);
      return;
    }
    const address = homeAddress(home);
    const answer = await lookup(address);
    const next = withChanges(copy, copyFromAnswer(answer, address), county);
    if (next || county.rolled_back_from === copy.release || !saysNothing(answer)) await storeCopy(home, next);
  })().catch((err) => logger.info('property_records.refresh_later', { error: err.name }));
}

/** A lookup that says "still reading" rather than hold a screen. The read goes on behind the answer. */
function lookupForScreen(address) {
  const read = lookup(address);
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new StorageUnavailable('Still reading')), SCREEN_WAIT_MS);
  });
  read.catch(() => {});
  return Promise.race([read, late]).finally(() => clearTimeout(timer));
}

const later = new Map();
let laterTimer = null;

function nextLaterRun() {
  if (laterTimer || !later.size) return;
  const soonest = Math.min(...[...later.values()].map((entry) => entry.due));
  laterTimer = setTimeout(runLater, Math.max(0, soonest - Date.now()));
  laterTimer.unref();
}

async function runLater() {
  laterTimer = null;
  const now = Date.now();
  await Promise.all([...later].filter(([, entry]) => entry.due <= now).map(async ([id, entry]) => {
    const address = homeAddress(entry.home);
    try {
      const answer = await lookup(address);
      later.delete(id);
      const copy = copyFromAnswer(answer, address);
      // Written even with nothing to keep, which changes nothing: the Home row moving is what tells an open screen to stop saying "looking up".
      if (copy) await storeCopy(entry.home, copy);
      else await changeNicheData(id, (stored) => stored);
    } catch (err) {
      if (!(err instanceof StorageUnavailable)) logger.warn('property_records.later_failed', { error: err.name });
      entry.gap = Math.min(entry.gap * 2, LATER_MOST_GAP_MS);
      entry.due = Date.now() + entry.gap;
      if (entry.due > entry.until) later.delete(id);
    }
  }));
  nextLaterRun();
}

/** A Home that was told "looking up" gets its answer when storage has one. */
function finishLater(home) {
  if (!home?.id || home.niche_data === undefined || later.has(home.id) || later.size >= LATER_MOST_HOMES) return;
  const now = Date.now();
  // Only what a lookup needs is held: a Home's row can carry much more.
  const { id, address, address2, city, state, zipcode } = home;
  later.set(id, { home: { id, address, address2, city, state, zipcode, niche_data: null }, gap: LATER_FIRST_GAP_MS, due: now + LATER_FIRST_GAP_MS, until: now + LATER_FOR_MS });
  nextLaterRun();
}

/** Counts a lookup for the daily report: county and outcome only. */
function noteLookup(surface, address, found) {
  let outcome = 'no_record';
  if (!found) outcome = 'off';
  else if (found.copy) outcome = 'answered';
  else if (found.lookup === 'pending') outcome = 'waiting';
  else if ((found.match || found.answer?.match) === 'ambiguous') outcome = 'ambiguous';
  try {
    counts.noteLookup(surface, { mark: addressStamp(address), zip: address.zip, state: address.state }, outcome,
      found?.copy?.jurisdiction || found?.jurisdiction || found?.answer?.jurisdiction);
  } catch (err) {
    logger.info('property_records.count_failed', { error: err.name });
  }
}

// Denton's private standing exclusions also apply to copies made by an earlier release.
async function copySuppressed(home, copy) {
  if (copy.jurisdiction !== DENTON_FIPS) return false;
  const list = await reader.suppressions(copy.jurisdiction);
  const subjectParcel = /^pp:(?:property|parcel|unit|building|other):48121:(\d+)$/.exec(copy.subject?.id || '')?.[1];
  if (parcelSuppressed(list, copy.jurisdiction, copy.facts?.parcel_number) || parcelSuppressed(list, copy.jurisdiction, subjectParcel)) return true;
  if (!list?.hashes?.length) return false;
  const address = homeAddress(home);
  const onRecord = parse(copy.facts?.address_on_record || '');
  return addressSuppressed(list, copy.jurisdiction, parse(address.line1, address.unit, { state: stateCode(address.state), zip: address.zip }))
    || ((copy.subject?.kind !== 'unit' || onRecord?.unit) && addressSuppressed(list, copy.jurisdiction, onRecord));
}

/** The copy a live county's screens answer from, with no lookup. One behind its county's release starts its refresh. */
async function liveCopy(home) {
  if (!config.enabled() || !home) return null;
  const stored = storedCopy(home);
  if (!stored || !router.showsCopies(stored.jurisdiction)) return null;
  try {
    if (await copySuppressed(home, stored)) return null;
  } catch (err) {
    if (!(err instanceof StorageUnavailable)) throw err;
    return null;
  }
  refreshSoon(home, stored);
  return setAside(home, stored) ? null : dated(router.served(stored), countyNow(home, stored));
}

/**
 * What the record has for a Home, for a screen: its stored copy at once, or for a
 * Home in a live county with no copy yet, a lookup now (a few milliseconds of
 * reading), kept on the Home. Null when the record has nothing to do with this
 * Home, so the caller goes on as before.
 *
 * @returns {Promise<null|{ copy: object|null, lookup: 'pending'|'none'|null, shared?: object }>}
 *   `pending`: storage can't be read just now, so say "Looking up…"; `none`: no record. `shared`: with no copy, what
 *   all the records at the Home's address agree on (agreedCopy), where its county shows that.
 */
async function forHome(home) {
  if (!home) return null;
  const found = await readForHome(home);
  noteLookup('home', homeAddress(home), found);
  return found;
}

async function readForHome(home) {
  if (!config.enabled()) return null;
  const stored = storedCopy(home);
  // Taking a county off its live list takes its copies off the screens too; they stay on the Home for when it comes back.
  if (stored && router.showsCopies(stored.jurisdiction)) {
    try {
      if (await copySuppressed(home, stored)) return { copy: null, lookup: 'none', match: 'restricted', jurisdiction: stored.jurisdiction };
    } catch (err) {
      if (!(err instanceof StorageUnavailable)) throw err;
      return { copy: null, lookup: 'pending' };
    }
    refreshSoon(home, stored);
    if (!setAside(home, stored)) return { copy: dated(router.served(stored), countyNow(home, stored)), lookup: null };
    if (countyNow(home, stored).status === 'withdrawn') return { copy: null, lookup: 'none', reason: 'withdrawn', jurisdiction: stored.jurisdiction };
    // A release taken back: ask the release in its place, as a Home with no copy would.
  }
  if (!router.liveState(stateCode(home.state))) return null;
  try {
    const address = homeAddress(home);
    const answer = await lookupForScreen(address);
    const prior = home.niche_data?.property_record;
    if (answer.match === 'unsupported' && prior?.municipal_match) {
      // A corrected city roll can reclassify an old home as an accessory account.
      const current = municipalRelease(countyNow(home, prior), router.municipalityFor(prior.jurisdiction));
      if (current?.status === 'active' && current.release !== prior.release && Date.now() <= Date.parse(current.stale_after)) {
        await storeCopy(home, null, prior);
      }
    }
    if (answer.match === 'unsupported' && answer.reason === 'no_release') return null;
    const copy = copyFromAnswer(answer, address);
    if (!copy) {
      const prior = home.niche_data?.property_record;
      if (answer.match === 'restricted' && checkedUnitCopyRequired(prior)) await storeCopy(home, null, prior);
      const shared = servedAgreed(answer, address);
      return { copy: null, lookup: 'none', match: answer.match, reason: answer.reason || null, jurisdiction: answer.jurisdiction, ...(shared ? { shared } : {}) };
    }
    await storeCopy(home, copy);
    return { copy: dated(router.served(copy), answer.county), lookup: null };
  } catch (err) {
    if (!(err instanceof StorageUnavailable)) throw err;
    finishLater(home);
    return { copy: null, lookup: 'pending' };
  }
}

/**
 * A Home no county record answers for, in a state live on the address registry: the line asking which unit is theirs, when
 * its address has several homes and it names none, in the shape the apps draw (provenanceOf). Never stored on the Home: a
 * copy would take the place of what the Home shows today. Null when there's nothing to ask, or the registry can't say in time.
 */
async function unitQuestion(home) {
  const address = homeAddress(home);
  if (!registryUnits.usesRegistry(address)) return null;
  const parsed = parse(address.line1, address.unit, { state: stateCode(address.state), zip: address.zip });
  if (!parsed || parsed.unit || parsed.building) return null;
  try {
    const units = await registryUnits.lookup({ normalizedAddress: address, submittedUnit: '' });
    if (!units?.secondary_required) return null;
    const release = String(units.provider_version || '');
    return {
      publisher: 'Public address records',
      dataset: 'address points',
      as_of: /^\d{8}/.test(release) ? `${release.slice(0, 4)}-${release.slice(4, 6)}-${release.slice(6, 8)}` : null,
      scope: 'building',
      method: 'county',
      label: units.raw?.reason === 'several_urbanizations'
        ? 'More than one home has this address. Which urbanizaci\u00f3n is yours?'
        : 'We found the building. Which unit is yours?',
    };
  } catch (err) {
    logger.info('address_registry.question_later', { error: err.name });
    return null;
  }
}

/**
 * What the record has for an address with no Home yet (Add Home). `copy` is what may be shown; `whole` is what a new
 * Home keeps, so a fact withheld today comes back without a new lookup. `shared`: with no copy, what all the records at
 * the address agree on (agreedCopy), where its county shows that; a new Home never keeps it.
 * @param {object} address
 * @param {object} [options]
 * @param {boolean} [options.patient] A follow-up: it may wait a few seconds for storage to answer.
 * @returns {Promise<null|{ copy: object|null, whole: object|null, answer: object, lookup: 'found'|'none'|'pending', shared?: object }>} null outside live counties.
 */
async function forAddress(address, options) {
  const found = await readForAddress(address, options);
  noteLookup('add_home', address, found);
  return found;
}

async function readForAddress(address, { patient = false } = {}) {
  if (!router.liveState(stateCode(address.state))) return null;
  const until = Date.now() + (patient ? FOLLOW_UP_WAIT_MS : 0);
  for (;;) {
    try {
      const answer = await lookupForScreen(address);
      if (answer.match === 'unsupported' && answer.reason === 'no_release') return null;
      const copy = copyFromAnswer(answer, address);
      const shared = copy ? null : servedAgreed(answer, address);
      return { copy: dated(router.served(copy), answer.county), whole: copy, answer, lookup: copy ? 'found' : 'none', ...(shared ? { shared } : {}) };
    } catch (err) {
      if (!(err instanceof StorageUnavailable)) throw err;
      if (Date.now() + FOLLOW_UP_EVERY_MS > until) return { copy: null, whole: null, answer: null, lookup: 'pending' };
      await new Promise((resolve) => { setTimeout(resolve, FOLLOW_UP_EVERY_MS); });
    }
  }
}

module.exports = { copyFromAnswer, provenanceOf, storedCopy, liveCopy, storeCopy, refreshSoon, withChanges, forHome, forAddress, finishLater, unitQuestion, noteLookup, homeAddress, dateLabel };
