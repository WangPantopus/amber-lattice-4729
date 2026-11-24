'use strict';

/**
 * A home's record page, drawn by the server as a list of blocks (contract v1, ~/pantopus-home-record/SPEC.md section 3):
 *
 *   GET /api/public/home-record   routes/public.js: anyone who looked up an address, signed in or not  → state `lookup`
 *   GET /api/homes/:id/record     routes/homeRecordPage.js: a person with this Home                      → `member` | `owner`
 *
 * The apps draw blocks and skip a kind they don't know, so later pieces reach the stores' apps with a server release.
 *
 * What never leaves this service for anyone but the confirmed owner (SPEC rule 2): every value marked `value` or
 * `owner` in propertyRecords/facts.js, the estimate, similar homes' figures, tax, exemptions and the Home's systems. The
 * `lookup` and `member` answers carry the open facts (rule 4), the area's ratings, and for each closed part only its
 * name and one line. The lookup keeps the lookup's privacy rules (rule 3): it reads the county record from the index
 * without counting the lookup or writing anything about the address.
 */

const config = require('../../config/propertyRecords');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { lookup, StorageUnavailable } = require('../propertyRecords/index');
const homeRecords = require('../propertyRecords/homeRecord');
const router = require('../propertyRecords/router');
const { stateCode } = require('../propertyRecords/addressKey');
const placeIntelligenceService = require('../placeIntelligenceService');
const authority = require('../homeDashboardService');
const open = require('./openPart');
const aerial = require('./aerial');
const ground = require('./ground');
const { ownerBlocks } = require('./ownerPart');
const { check } = require('./contract');
const { FOOTERS } = require('./words');

const CONTRACT_VERSION = 1;
// How long the page waits on the county index, as a Home's screens do (homeRecord.js SCREEN_WAIT_MS).
const RECORD_WAIT_MS = 1000;
const HOME_FIELDS = 'id, address, address2, city, state, zipcode, niche_data, map_center_lat, map_center_lng, year_built, home_type';

class HomeRecordError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function subtitleOf({ city, state, zipcode }) {
  const place = [city, [state, zipcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return place || null;
}

/**
 * The county record for a looked-up address, read from the index as a Home's screens read it, but without counting the
 * lookup (counts.js keeps a hash of each address it counts) and without keeping anything. Null when no live county has it.
 */
async function recordForAddress(address) {
  if (!config.enabled() || !router.liveState(stateCode(address.state))) return null;
  let timer;
  try {
    const read = lookup(address);
    read.catch(() => {});
    const answer = await Promise.race([read, new Promise((resolve) => { timer = setTimeout(() => resolve(null), RECORD_WAIT_MS); })]);
    if (!answer) return null;
    return router.served(homeRecords.copyFromAnswer(answer, address)) || null;
  } catch (err) {
    if (!(err instanceof StorageUnavailable)) logger.warn('homeRecord.lookup_failed', { error: err.name });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// The extras the closed lines need, on the same short wait as the record.
async function extrasWithin(copy, home) {
  if (!copy) return {};
  return placeIntelligenceService.withinBudget(open.extrasFor(copy, home), placeIntelligenceService.sectionBudgetMs()).catch(() => ({}));
}

// The picture from above, on the lookup's section budget: past it the page goes without, and the search keeps running
// to fill the cache for the next look.
function withinBudget(read, label) {
  return placeIntelligenceService.withinBudget(read, placeIntelligenceService.sectionBudgetMs()).catch((err) => {
    if (err?.message !== 'over budget') logger.info('homeRecord.reading_failed', { part: label, error: err?.message });
    return null;
  });
}

/**
 * The picture from above for someone who isn't the owner, with how many survey years the owner's record holds (one
 * search, kept in memory, answers both). `{ above, years }`.
 */
async function pictureForViewer(point, copy) {
  if (!point) return { above: null, years: null };
  const [above, years] = await Promise.all([
    withinBudget(aerial.pictureBlock(point, { lotChip: open.lotChip(copy), earlierYearsForOwner: true }), 'picture'),
    withinBudget(aerial.yearsAt(point), 'years'),
  ]);
  return { above, years };
}

/** The owner's lot through the years, or the newest picture where fewer than two years cover the point. */
async function pictureForOwner(point, copy) {
  if (!point) return null;
  return (await withinBudget(aerial.photoYearsBlock(point), 'photo_years'))
    || withinBudget(aerial.pictureBlock(point, { lotChip: open.lotChip(copy) }), 'picture');
}

function answer(state, header, blocks) {
  return check({ v: CONTRACT_VERSION, state, header, blocks: blocks.filter(Boolean), footer: FOOTERS[state] });
}

/**
 * The `lookup` answer for a geocoded address (routes/public.js geocodeUsAddress). `flood(lat, lng)` is the lookup's own
 * cached flood reader.
 */
async function forLookup(place, { flood }) {
  const address = { line1: place.line, unit: null, city: place.city, state: place.state, zip: place.zipcode };
  const [copy, read, under] = await Promise.all([
    place.line ? recordForAddress(address) : null,
    open.readings({ lat: place.lat, lng: place.lng }, { flood }),
    groundAt({ lat: place.lat, lng: place.lng }),
  ]);
  const [extras, { above, years }] = await Promise.all([
    extrasWithin(copy, { address: place.line, address2: null, city: place.city, state: place.state, zipcode: place.zipcode }),
    pictureForViewer({ lat: place.lat, lng: place.lng }, copy),
  ]);
  return answer('lookup', { chip: open.foundChip(copy), title: place.line || subtitleOf(place) || 'This address', subtitle: place.line ? subtitleOf(place) : null }, [
    above,
    open.factsBlock(copy),
    open.metersBlock(read),
    ...open.closedPart(open.closedItems(copy, { ...extras, years, ground: under }), {
      // No Home yet, so no id: each app opens Add Home at the looked-up address when signed in, and the lookup's own
      // sign-up (which keeps the address) when signed out (~/pantopus-home-record/DECISIONS.md, 11-22).
      button: { label: 'Verify you own this home', url: '/homes/claim-owner' },
      alt: { lead: 'Renting, or living here with family?', label: 'Verify your address', url: '/homes/verify-address' },
    }),
  ]);
}

// The member's next step, for the promise's button: what this person can do now on this Home.
async function memberSteps(homeId, userId, standing) {
  const pending = await placeIntelligenceService.hasPendingOwnership(homeId, userId);
  if (pending || standing.claimant) {
    return { button: { label: 'See where your claim stands', url: `/app/homes/${homeId}/waiting-room` }, alt: null };
  }
  const claim = { label: 'Verify you own this home', url: `/app/homes/${homeId}/claim-owner/evidence` };
  // In the household already: only ownership is left to prove.
  if (standing.access?.hasAccess) return { button: claim, alt: null };
  return {
    button: claim,
    alt: { lead: 'Renting, or living here with family?', label: 'Finish verifying your address', url: `/app/homes/${homeId}/verify-residency` },
  };
}

async function readRow(homeId) {
  const { data, error } = await supabaseAdmin.from('Home').select(HOME_FIELDS).eq('id', homeId).maybeSingle();
  if (error) throw new HomeRecordError('HOME_RECORD_UNAVAILABLE', 503, 'Could not load this home\'s record. Please try again.');
  if (!data) throw new HomeRecordError('HOME_NOT_FOUND', 404, 'Home not found.');
  return data;
}

const pointOf = (row) => {
  const lat = Number(row.map_center_lat);
  const lng = Number(row.map_center_lng);
  return row.map_center_lat != null && row.map_center_lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

const noReadings = { flood: null, seismic: null, wildfire: null, air: null, nri: null };

/** The Home's copy of its county record, as its other screens get it (a lookup kept on the Home when it has none yet). */
async function copyForHome(row) {
  try {
    const found = await homeRecords.forHome(row);
    return found?.copy || null;
  } catch (err) {
    logger.warn('homeRecord.home_copy_failed', { error: err.message });
    return null;
  }
}

// The ground's readings for a point, each on the section budget. Null without a point.
const groundAt = (point) => (point ? ground.readingsAt(point, (read) => withinBudget(read, 'ground')) : null);

async function openFor(row, flood, { owner = false } = {}) {
  const point = pointOf(row);
  const [copy, read, under] = await Promise.all([copyForHome(row), point ? open.readings(point, { flood }) : noReadings, groundAt(point)]);
  const [extras, pictured] = await Promise.all([
    extrasWithin(copy, row),
    owner ? pictureForOwner(point, copy).then((above) => ({ above, years: null })) : pictureForViewer(point, copy),
  ]);
  return { copy, read, extras: { ...extras, years: pictured.years, ground: under }, above: pictured.above };
}

/**
 * The record page for a Home: `owner` for its confirmed owner (the same test Property details and the value card use,
 * access.isOwner), `member` for anyone else the Home's Place lets in (its household, a private setup, an open claim).
 * Anyone else gets a 404, which says nothing about the Home.
 */
async function forHome({ homeId, userId, flood }) {
  const standing = await placeIntelligenceService.readAccess(homeId, userId);
  if (!standing) throw new HomeRecordError('HOME_NOT_FOUND', 404, 'Home not found.');
  const header = (row, chip, subtitle) => ({ chip, title: row.address || subtitleOf(row) || 'Your home', subtitle });

  if (standing.access?.hasAccess && standing.access.isOwner) {
    // Read under the Home's current access and checked again after every read, as Property details is.
    return authority.withCurrentAccess({ homeId, actorId: userId }, async (access) => {
      if (!access.isOwner) throw new HomeRecordError('HOME_RECORD_ACCESS_CHANGED', 409, 'Your access to this home changed. Please try again.');
      const row = await readRow(homeId);
      const { copy, read, extras, above } = await openFor(row, flood, { owner: true });
      const place = subtitleOf(row);
      const blocks = await ownerBlocks({ row, copy, extras, above, open: [open.factsBlock(copy), open.metersBlock(read)] });
      return answer('owner', header(row, { tone: 'success', text: 'Confirmed owner' }, place ? `${place} · everything in its record` : null), blocks);
    });
  }

  const row = await readRow(homeId);
  const [{ copy, read, extras, above }, steps] = await Promise.all([openFor(row, flood), memberSteps(homeId, userId, standing)]);
  return answer('member', header(row, open.foundChip(copy), subtitleOf(row)), [
    above,
    open.factsBlock(copy),
    open.metersBlock(read),
    ...open.closedPart(open.closedItems(copy, extras), steps),
  ]);
}

module.exports = { forLookup, forHome, HomeRecordError, CONTRACT_VERSION };
