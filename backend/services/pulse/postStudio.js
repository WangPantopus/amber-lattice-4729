'use strict';

// Pulse, reinvented, phase 1: what the Studio adds to a post its author made there (coord CONTRACT 6d), kept in its own
// table `PostStudio` (migration 20261127104500; one row per post, deleted with it, no app role reads it), never on the
// Post row: today's reads select every column or pass post_metadata on as stored. Written by POST /api/posts while the
// author's switch is on; read only by the new routes (list, map), alongside their other reads.
//
// The stamps work as a Moment's (momentStamps): the author places them, the server fills every value at the point
// everyone sees, and the home rules decide what is kept and shown.

const supabaseAdmin = require('../../config/supabaseAdmin');
const momentStamps = require('../moments/momentStamps');
const momentPlace = require('../moments/momentPlace');
const store = require('../moments/momentStore');
const { displayedPoint } = require('./distanceText');
const { haversineMeters } = require('../../utils/trustState');
const play = require('./play');

// The Live mark's checks for a post's weather and sunset (CONTRACT 6d): a fix this fresh, this near the post's pin.
const FIX_MAX_AGE_MS = 5 * 60 * 1000;
const CLOCK_SKEW_MS = 2 * 60 * 1000;
const FIX_NEAR_M = 200;

// The kinds a post may be shown in Explore as (6f): never an Ask, an Offer, a Heads-up or a Lost and found.
const EXPLORE_TYPES = ['recommendation', 'local_update', 'event', 'share'];

/**
 * The Studio's placements, height reading and photo time from the body's `studio`; 400 for a malformed list
 * (momentStamps) or a `taken_at` that isn't a date. `takenAt`: a picture from the library (CONTRACT 6d), null for one
 * taken now.
 */
function parse(studio, { penName = false } = {}) {
  const takenAt = studio?.taken_at == null || studio.taken_at === '' ? null : String(studio.taken_at);
  if (takenAt && !Number.isFinite(Date.parse(takenAt))) throw new Error('taken_at must be a date.');
  const fix = studio?.fix && typeof studio.fix === 'object' ? studio.fix : null;
  return {
    ...momentStamps.parseStudio(studio || {}),
    explore: studio?.explore === true,
    // Playable items (CONTRACT 7b); a malformed list throws, answered 400 POST_INVALID.
    play: play.parseItems(studio?.play),
    // Dots on the picture (CONTRACT 7c); no link under a made-up name. The Studio uploads a post's photo after making
    // the post, so a thing's photo is looked for when its field card is asked for (7d), not here.
    dots: play.parseDots(studio?.dots, { media: true, photo: true, penName }),
    takenAt,
    takenHere: studio?.taken_here === true,
    fix: fix && Number.isFinite(Number(fix.latitude)) && Number.isFinite(Number(fix.longitude))
      ? { latitude: Number(fix.latitude), longitude: Number(fix.longitude), at: Date.parse(fix.fix_at || '') }
      : null,
  };
}

/**
 * The Live mark's checks for a post's "now" stamps (weather, sunset; CONTRACT 6d): the app's own camera just now, no
 * album time, and a fix at most 5 minutes old within 200 m of the pin the author placed. Used only here, never kept.
 */
function passesLiveChecks(parsed, row, now = Date.now()) {
  const { fix } = parsed;
  if (parsed.takenAt || !parsed.takenHere || !fix || !Number.isFinite(fix.at)) return false;
  if (fix.at > now + CLOCK_SKEW_MS || now - fix.at > FIX_MAX_AGE_MS) return false;
  if (row.latitude == null || row.longitude == null) return false;
  return haversineMeters(fix.latitude, fix.longitude, row.latitude, row.longitude) <= FIX_NEAR_M;
}

/**
 * The `studio` column for a post about to be written (`row`, as it will be stored): the placements, every stamp's
 * value filled now at the point everyone sees, and Explore when it may be. `underPenName`: under a made-up name.
 */
async function studioFor({ userId, row, parsed, underPenName = false }) {
  const point = displayedPoint(row);
  const placed = Boolean(point);
  const [atHome, town] = placed
    ? await Promise.all([
      momentPlace.isAtHome(userId, row.latitude, row.longitude, { onFailure: true }),
      momentPlace.townAt(point.latitude, point.longitude),
    ])
    : [false, null];
  const stampValues = await momentStamps.valuesFor({
    userId,
    point: placed ? point : { latitude: null, longitude: null },
    placeLabel: row.location_name,
    town,
    atHome,
    penName: underPenName,
    // A picture from the library isn't "now": no weather or sunset, and its time is the photo's (as a Moment's).
    fresh: !parsed.takenAt,
    takenAt: parsed.takenAt,
    sky: passesLiveChecks(parsed, row),
    elevation: underPenName ? null : store.shownAltitude(parsed.reading, {
      atHome, showArea: row.location_precision !== 'exact_place', unplaced: !placed, floating: false,
    }),
  });
  const explore = parsed.explore && placed && !atHome && !underPenName && EXPLORE_TYPES.includes(row.post_type);
  return {
    v: 1,
    stamps: parsed.placements,
    stamp_values: stampValues,
    // The home rules, checked again on every read (momentStamps.valueOf): nothing kept says more than they allow.
    guard: { at_home: atHome, pen_name: Boolean(underPenName), placed },
    ...(parsed.play?.length ? { play: parsed.play } : {}),
    ...(parsed.dots?.length ? { dots: parsed.dots } : {}),
    ...(explore ? { explore: { v: 1, town: town && town !== momentPlace.FALLBACK_LABEL ? town : null } } : {}),
  };
}

/** Keeps the Studio's part of a post just written. A failure is logged by the caller; the post stands without it. */
async function save(postId, studio) {
  const { error } = await supabaseAdmin.from('PostStudio').insert({ post_id: postId, studio });
  if (error) throw new Error(`Failed to keep the post's stamps: ${error.message}`);
}

function shownOf(studio) {
  const guard = studio?.guard || {};
  return momentStamps.shownStamps(studio, { atHome: Boolean(guard.at_home), penName: Boolean(guard.pen_name), placed: guard.placed !== false });
}

/** The shown stamps of each of these posts that the Studio made (6d), by post id; one read for the page. */
async function stampsFor(posts) {
  const ids = [...new Set((posts || []).map((post) => post?.id).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin.from('PostStudio').select('post_id, studio').in('post_id', ids);
  if (error) throw new Error(`Failed to load the posts' stamps: ${error.message}`);
  return new Map((data || []).map((row) => [row.post_id, shownOf(row.studio)]));
}

/**
 * The shown stamps, the playable items and the dots of each of these posts that the Studio made, for `viewerId`
 * (CONTRACT 6d, 7b, 7c): { stamps, play, dots }, each by post id. The answers are read alongside the post's own row, never after the page.
 */
async function readerParts(posts, viewerId) {
  const ids = [...new Set((posts || []).map((post) => post?.id).filter(Boolean))];
  if (!ids.length) return { stamps: new Map(), play: new Map(), dots: new Map() };
  const [{ data, error }, answers] = await Promise.all([
    supabaseAdmin.from('PostStudio').select('post_id, studio').in('post_id', ids),
    play.answersOn(ids).catch(() => null),
  ]);
  if (error) throw new Error(`Failed to load the posts' stamps: ${error.message}`);
  const rows = data || [];
  const stamps = new Map(rows.map((row) => [row.post_id, shownOf(row.studio)]));
  const dots = new Map(rows.map((row) => [row.post_id, play.dotsFor(row.studio?.dots, row.studio?.cards)]));
  const byId = new Map((posts || []).map((post) => [post.id, post]));
  const withItems = rows.filter((row) => row.studio?.play?.length).map((row) => ({
    id: row.post_id,
    items: row.studio.play,
    // A post is listed as its reader gets it: their own made-up-name post carries their id (penName.present).
    own: String(byId.get(row.post_id)?.user_id) === String(viewerId),
    open: true,
  }));
  return { stamps, dots, play: answers ? await play.playFor(withItems, viewerId, { answers }) : new Map() };
}

/**
 * The shown stamps of the Studio-made posts whose stored point is in the box (widened as the map's own post read is),
 * by post id: read alongside the map's posts, never after them. Only the posts the map then lists use theirs.
 */
async function stampsInBox({ south, west, north, east }) {
  const pad = 0.02;
  const { data, error } = await supabaseAdmin.from('PostStudio').select('post_id, studio, post:Post!inner(latitude, longitude)')
    .gte('post.latitude', south - pad).lte('post.latitude', north + pad)
    .gte('post.longitude', west - pad).lte('post.longitude', east + pad)
    .limit(1000);
  if (error) throw new Error(`Failed to load the posts' stamps: ${error.message}`);
  return new Map((data || []).map((row) => [row.post_id, shownOf(row.studio)]));
}

/** The posts with the stamps the Studio gave them (`stamps`, only on those; every other post as it came). */
function withStamps(posts, stamps) {
  if (!stamps?.size) return posts;
  return posts.map((post) => (stamps.has(post.id) ? { ...post, stamps: stamps.get(post.id) } : post));
}

module.exports = { parse, studioFor, save, shownOf, stampsFor, readerParts, stampsInBox, withStamps, EXPLORE_TYPES };
