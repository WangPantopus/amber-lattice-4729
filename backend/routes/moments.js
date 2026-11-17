// Moments (build brief and CONTRACT in ~/pantopus-moments/coord, approved 2026-11-08): post a photo, a video of up to
// 30 s or a text card where you are; it shows on the Moments map as your profile picture in a ring for 1, 6, 24 or 48
// hours. Every route needs a signed-in person with the `moments` flag on (404 MOMENTS_UNAVAILABLE otherwise).
// The rows are Posts (services/moments/momentStore.js); files sit in private storage (momentMedia.js); a picture check
// runs before a photo or video goes live (momentCheck.js); replies are chat messages (momentChat.js).

const express = require('express');
const multer = require('multer');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const { createHash } = require('node:crypto');
const verifyToken = require('../middleware/verifyToken');
const requireFeatureFlag = require('../middleware/requireFeatureFlag');
const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const feedService = require('../services/feedService');
const store = require('../services/moments/momentStore');
const { sunPosition } = require('../services/moments/sunPosition');
const media = require('../services/moments/momentMedia');
const momentCheck = require('../services/moments/momentCheck');
const momentPlace = require('../services/moments/momentPlace');
const momentChat = require('../services/moments/momentChat');
const { adultStatus, confirmAdult } = require('../services/adultAttestation');
const momentUpload = require('../services/moments/momentUpload');
const momentNotify = require('../services/moments/momentNotify');
const momentSchedule = require('../services/moments/momentSchedule');
const { normalizePostReaction } = require('../utils/postReaction');
const { REPORT_REASONS, filePostReport } = require('../services/postReportService');
const { areaPoint } = require('../utils/areaCells');
const { haversineMeters } = require('../utils/trustState');

const router = express.Router();
router.use(verifyToken, requireFeatureFlag('moments', { error: "Moments aren't available.", code: 'MOMENTS_UNAVAILABLE' }));
// Only an app that has Moments asks here: remembered once a day per person, so the push about a connection's Moment
// goes to people it can open for (services/moments/momentNotify.js). Never slows or fails the request.
router.use((req, res, next) => {
  momentNotify.rememberApp(req.user.id);
  next();
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// How long the upload's answer waits for the picture check; past it the answer says `checking` and the check finishes
// on its own (the cleanup job picks up one that never did).
const CHECK_WAIT_MS = 12 * 1000;

function limiter(windowMs, max) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => req.user?.id || req.ip,
    handler: (req, res) => res.status(429).json({ error: 'Too many requests. Please try again in a minute.', code: 'RATE_LIMITED' }),
    standardHeaders: true,
    legacyHeaders: false,
  });
}
const createLimiter = limiter(15 * 60 * 1000, 60);
const uploadLimiter = limiter(15 * 60 * 1000, 60);
const actionLimiter = limiter(60 * 1000, 120);

function sendError(res, error, what) {
  if (error.status) {
    return res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
  }
  logger.error(`moments.${what}.error`, { error: error.message });
  return res.status(503).json({ error: "Moments couldn't load. Please try again.", code: 'MOMENTS_FAILED' });
}

function parseBody(schema, value) {
  const { error, value: parsed } = schema.validate(value || {}, { abortEarly: true, stripUnknown: true });
  if (error) throw store.fail(400, 'MOMENT_INVALID', error.details[0].message.replace(/"/g, ''));
  return parsed;
}

function momentId(req) {
  if (!UUID.test(String(req.params.id || ''))) throw store.fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  return req.params.id;
}

async function oneMoment(row, viewerId) {
  return (await store.serializeMoments([row], viewerId))[0];
}

const point = { latitude: Joi.number().min(-90).max(90).required(), longitude: Joi.number().min(-180).max(180).required() };

// ─── 18+ and the Post sheet ─────────────────────────────────────────────────

/** POST /adult-confirm — the one-time 18+ confirmation, shared with Pulse (services/adultAttestation.js). */
router.post('/adult-confirm', actionLimiter, async (req, res) => {
  try {
    const result = await confirmAdult(req.user.id);
    if (!result.found) return res.status(404).json({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' });
    if (result.ineligible) return res.status(403).json({ error: 'Moments are for people 18 and older.', code: 'AGE_NOT_ELIGIBLE' });
    res.json({ attested_at: result.attestedAt });
  } catch (error) {
    sendError(res, error, 'adult_confirm');
  }
});

/**
 * POST /place-preview — what the Post sheet shows: the place's label, the area's, the names the author may pick for an
 * exact pin (`places`; the first is the label), the home notice, whether "Show height" may be offered
 * (`can_show_height`), the 18+ state, and whether the author has a connection (`has_connections`: a Moment with no
 * location needs one). With no point (location off) it answers only the last two (and `can_show_height: false`).
 * With the Sky on for the caller (`sky_places`) it adds `sky: true`, the area a Moment at home shows (`area`: its town,
 * point and disc), the public place that may take a pin there (`place`), whether one may be pinned (`can_pin`) and
 * the "Share later" times on offer now (`share_later`); the names leave out schools and preschools, and
 * `pick_within_m` is shorter where the spot is built up (momentPlace.pickWithinM).
 */
router.post('/place-preview', actionLimiter, async (req, res) => {
  try {
    const at = parseBody(Joi.object({
      latitude: Joi.number().min(-90).max(90), longitude: Joi.number().min(-180).max(180),
    }).and('latitude', 'longitude'), req.body);
    const placed = at.latitude != null;
    const sky = await store.skyOn(req.user);
    const [labels, atHome, heights, adult, connections, pickWithin] = await Promise.all([
      placed ? momentPlace.labelsAt(at.latitude, at.longitude, { pinnableOnly: sky })
        : { place_label: null, area_label: null, places: [] },
      placed ? momentPlace.isAtHome(req.user.id, at.latitude, at.longitude) : false,
      placed ? store.heightsOn(req.user) : false,
      adultStatus(req.user.id),
      // Never in the way of the place's words: a failed read leaves `has_connections` out.
      store.connectionIds(req.user.id).catch((error) => {
        logger.warn('moments.connections_read_failed', { error: error.message });
        return null;
      }),
      sky && placed ? momentPlace.pickWithinM(at.latitude, at.longitude) : momentPlace.PICK_PLACE_M,
    ]);
    // pick_within_m: how far from the pin the place picker's venues may be (POST / takes a venue_id within it).
    res.json({
      ...labels,
      at_home: atHome,
      // Whether the sheet may offer "Show height" for this point: never at home (and never for an area: the app hides
      // it when the author picks one). POST / decides again.
      can_show_height: heights && !atHome,
      adult_confirmed: Boolean(adult.attestedAt) && !adult.ineligible,
      pick_within_m: pickWithin,
      ...(connections ? { has_connections: connections.length > 0 } : {}),
      ...(sky ? await skyPreview(req.user.id, at, atHome) : {}),
    });
  } catch (error) {
    sendError(res, error, 'place_preview');
  }
});

/**
 * The Sky's part of the preview: the area the point is in, which a Moment at home shows (its town, read at the area's
 * own point so the words depend on the area only; its point; its disc), the place "Pin it at a place" starts with,
 * and whether a pin is possible (never at home), and the "Share later" choices on offer now in the author's time zone
 * (`tonight` only before 7 pm), each with the time it would share.
 */
async function skyPreview(userId, at, atHome) {
  const shareLater = momentSchedule.choices(Date.now(), await momentSchedule.zoneFor(userId, at.latitude, at.longitude));
  if (at.latitude == null) return { sky: true, area: null, place: null, can_pin: false, share_later: shareLater };
  const area = await areaPoint(at.latitude, at.longitude);
  const [label, place] = await Promise.all([
    momentPlace.townAt(area.latitude, area.longitude),
    momentPlace.namingPlace(at.latitude, at.longitude),
  ]);
  return {
    sky: true,
    area: { label, latitude: area.latitude, longitude: area.longitude, radius_m: area.radius_m },
    place: place ? { key: place.key, label: place.label } : null,
    can_pin: !atHome,
    share_later: shareLater,
  };
}

/**
 * Where a new Moment goes with the Sky on for its author (founder 2026-11-17): where it was taken, unless its author
 * pins it at a public place close by, picked by name ("Pin it at a place"). `venue` ({ latitude, longitude, label })
 * for a pin at a place, `area` (areaPoint of the Moment's own point) for one that shows only its area, neither for one
 * where it was taken. A Moment at the author's home shows only its area whatever was asked, and so does one sent with
 * `show_area` (the "Show the area instead" of an app from before the Sky, and a Post sheet from before November 17,
 * which showed the area unless a place was picked).
 *
 * A place is picked with `pin: "place"`, a `venue_id` or a venue's `place_key`. It may be no farther from the spot
 * than momentPlace.pickWithinM says (422 PLACE_NOT_NEARBY for a `venue_id` that is, or that nobody finds), and
 * `pin: "place"` with no place named and none at the spot is 422 NO_PLACE_HERE. A place that can't take a pin (a
 * school), and one right by the author's home, leave the Moment where it was taken. A place whose own point is
 * farther off than that (the middle of a big park the photo was taken in) names the Moment, and the pin stays where
 * it was taken: no pin is ever farther from the photo than a place may be picked.
 */
async function skyPlacement(userId, body) {
  const { latitude, longitude } = body.location;
  const atHome = await momentPlace.isAtHome(userId, latitude, longitude);
  if (atHome || body.show_area) return { atHome, venue: null, area: await areaPoint(latitude, longitude) };
  const venueKey = typeof body.place_key === 'string' && body.place_key.startsWith('v_') ? body.place_key : null;
  if (body.pin !== 'place' && !body.venue_id && !venueKey) return { atHome, venue: null, area: null };
  const within = await momentPlace.pickWithinM(latitude, longitude);
  let venue = null;
  if (body.venue_id) {
    const found = await momentPlace.venueNear(body.venue_id, latitude, longitude, within);
    if (!found) {
      throw store.fail(422, 'PLACE_NOT_NEARBY', "That place is too far from this Moment's pin. Pick one nearby.");
    }
    venue = found.pinnable ? found : null;
  } else if (venueKey) {
    venue = await momentPlace.venueForKey(latitude, longitude, venueKey);
  } else {
    venue = await momentPlace.namingPlace(latitude, longitude);
    if (!venue) throw store.fail(422, 'NO_PLACE_HERE', 'There is no public place to pin this Moment at here.');
  }
  if (venue && await momentPlace.isAtHome(userId, venue.latitude, venue.longitude)) venue = null;
  if (venue && haversineMeters(latitude, longitude, venue.latitude, venue.longitude) > within) {
    venue = { ...venue, latitude, longitude };
  }
  return { atHome, venue, area: null };
}

/**
 * GET /limits — what a Moment may be, for the apps to shape a video before it goes up: the longest one Moment's video
 * runs, how many Moments a longer one is posted as, and the largest file an upload may be (less than ours when
 * storage takes less). An app that can't read this keeps to 30 seconds and one part.
 */
router.get('/limits', async (req, res) => {
  try {
    res.json({
      video: {
        max_seconds: media.MAX_VIDEO_MS / 1000,
        max_parts: store.MAX_PARTS,
        max_bytes: await media.maxVideoBytes(),
      },
      daily_limit: store.DAILY_LIMIT,
    });
  } catch (error) {
    sendError(res, error, 'limits');
  }
});

// ─── Posting ────────────────────────────────────────────────────────────────

const createSchema = Joi.object({
  kind: Joi.string().valid(...store.KINDS).required(),
  hours: Joi.number().valid(...store.HOURS).default(24),
  audience: Joi.string().valid(...store.AUDIENCES).default('nearby'),
  show_area: Joi.boolean().default(false),
  caption: Joi.string().trim().max(100).allow('', null),
  text: Joi.string().trim().max(200).allow('', null),
  background: Joi.string().valid(...store.BACKGROUNDS).allow(null),
  location: Joi.alternatives().try(
    Joi.object({ source: Joi.string().valid('gps').required(), ...point, fix_at: Joi.string().isoDate().required() }),
    Joi.object({ source: Joi.string().valid('capture').required(), ...point, taken_at: Joi.string().isoDate().required() }),
    // No location (founder 2026-11-11): no pin, not on the map; only the author's connections see it.
    Joi.object({ source: Joi.string().valid('none').required() }),
  ).required(),
  // When an album photo or video pinned where you are (its file doesn't say where) was taken (optional; a `capture`
  // location carries its own `taken_at`). One taken more than a day ago says so on the Moment.
  taken_at: Joi.string().isoDate().allow(null),
  // A venue the place picker listed around the pin (its `osm:` id, optional): the Moment pins there under its name.
  venue_id: Joi.string().max(64).pattern(/^osm:(node|way|relation)\/\d+$/).allow('', null),
  // A retry of the same Post tap returns the Moment it made (optional).
  client_request_id: Joi.string().uuid().allow(null),
  // The Post sheet's pick among place-preview's `places` (optional): a key, never the place's words.
  place_key: Joi.string().max(40).pattern(/^[a-z0-9_]+$/).allow('', null),
  // The Sky (optional; used while `sky_places` is on for the author): pin the Moment at a public place: the one named
  // by `venue_id` or a venue's `place_key`, else the one naming the spot (place-preview's `place`).
  pin: Joi.string().valid('place').allow(null),
  // The Sky (optional; while `sky_places` is on for the author): hold the Moment until then; only its author sees it
  // before (momentSchedule.js).
  share_later: Joi.string().valid(...momentSchedule.KEYS).allow(null),
  // "Show height" (optional; behind the `moment_heights` flag): how high above sea level the phone, or the album
  // photo, says the Moment was made, in metres, with how far off that may be and how fast the phone was moving when
  // it knows. Sent only when the author turned the switch on; everyone reads feet rounded to 10 (store.shownAltitude).
  altitude: Joi.object({
    meters: Joi.number().required(),
    accuracy_m: Joi.number().allow(null),
    speed_mps: Joi.number().allow(null),
  }).allow(null),
  // A video longer than one Moment (GET /limits) is posted as several, in order (optional): the same `id` on each,
  // which part this is and of how many. Later parts need the first; they count as one post and notify once.
  series: Joi.object({
    id: Joi.string().uuid().required(),
    index: Joi.number().integer().min(1).max(store.MAX_PARTS).required(),
    count: Joi.number().integer().min(2).max(store.MAX_PARTS).required(),
  }).allow(null),
});

// The row id a retry key stands for, so the same tap never makes two Moments.
function retryId(userId, key) {
  if (!key) return null;
  const hex = createHash('sha256').update(`pantopus:moment-create:v1:${userId.toLowerCase()}:${key.toLowerCase()}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** POST / — a new Moment: a text card is live at once; a photo or video waits for its file (POST /:id/media). */
router.post('/', createLimiter, async (req, res) => {
  try {
    const body = parseBody(createSchema, req.body);
    if (body.kind === 'text') {
      if (!body.text) throw store.fail(400, 'MOMENT_INVALID', 'Write something on the card.');
      if (body.caption) throw store.fail(400, 'MOMENT_INVALID', 'A text card has no caption.');
    } else if (body.text || body.background) {
      throw store.fail(400, 'MOMENT_INVALID', 'Only a text card has text and a background.');
    }
    if (body.series && (body.kind !== 'video' || body.series.index > body.series.count)) {
      throw store.fail(400, 'MOMENT_INVALID', 'Only a video is posted in parts.');
    }
    const id = retryId(req.user.id, body.client_request_id);
    if (id) {
      const prior = await store.loadMoment(id);
      if (prior && prior.user_id === req.user.id) return res.status(201).json({ moment: await oneMoment(prior, req.user.id) });
    }
    // No location: connections only, no area, no place.
    const unplaced = body.location.source === 'none';
    if (unplaced) Object.assign(body, { audience: 'connections', show_area: false, venue_id: null, place_key: null });
    await store.checkPostingRules(req.user, body);
    // With the Sky on for the author, skyPlacement decides where the Moment goes; off, the rules from before it do.
    const skyFor = await store.skyOn(req.user);
    const sky = !unplaced && skyFor;
    // "Share later" (with the Sky on, a Moment with no place too): the time it shares, worked out now.
    const shareAt = skyFor && body.share_later
      ? momentSchedule.shareAtFor(body.share_later, Date.now(),
        await momentSchedule.zoneFor(req.user.id, body.location.latitude, body.location.longitude))
      : null;
    const placed = sky ? await skyPlacement(req.user.id, body) : null;
    // A venue picked in the place picker moves the pin to it and names it; found again here by its id near the pin.
    const venue = sky ? placed.venue : body.venue_id && !body.show_area
      ? await momentPlace.venueNear(body.venue_id, body.location.latitude, body.location.longitude)
      : null;
    if (!sky && body.venue_id && !body.show_area && !venue) {
      throw store.fail(422, 'PLACE_NOT_NEARBY', "That place is too far from this Moment's pin. Pick one nearby.");
    }
    const area = sky ? placed.area : null;
    const location = venue ? { ...body.location, latitude: venue.latitude, longitude: venue.longitude } : body.location;
    const { latitude, longitude } = location;
    let found;
    let atHome;
    if (unplaced) {
      [found, atHome] = [{ place_label: null, area_label: null, places: [] }, false];
    } else if (sky && (venue || area)) {
      // A pin at a place says the place's name; a Moment over its area the area's town, read at the area's point.
      const town = area ? await momentPlace.townAt(area.latitude, area.longitude) : null;
      [found, atHome] = [{ place_label: venue ? venue.label : town, area_label: town, places: [] }, placed.atHome];
    } else if (sky) {
      // Where it was taken: the names that fit the spot, as before the Sky, but never a school's or a preschool's.
      [found, atHome] = [await momentPlace.labelsAt(latitude, longitude, { pinnableOnly: true }), false];
    } else {
      [found, atHome] = await Promise.all([
        momentPlace.labelsAt(latitude, longitude),
        momentPlace.isAtHome(req.user.id, latitude, longitude),
      ]);
    }
    // The name the author picked for this point, worked out again here; an area or at-home Moment says the town.
    const labels = venue
      ? { ...found, place_label: venue.label, places: [{ key: 'venue', label: venue.label }, ...found.places] }
      : { ...found, place_label: momentPlace.pickedLabel(found, body.place_key) || found.place_label };
    const showArea = sky ? Boolean(area) : body.show_area;
    const shown = showArea || atHome ? labels.area_label : labels.place_label;
    // The height is kept only away from home, and only while heights are on for the author: an exact pin's rounded to
    // 10 ft, a floating Moment's to 100 ft.
    const reading = store.shownAltitude(body.altitude, { atHome, showArea, unplaced, floating: Boolean(area) });
    const altitude = reading && (await store.heightsOn(req.user)) ? reading : null;
    const { row, created } = await store.insertMoment(store.newMomentRow({
      userId: req.user.id,
      accountType: req.user.accountType,
      kind: body.kind,
      hours: body.hours,
      audience: body.audience,
      showArea,
      atHome,
      caption: body.caption || null,
      text: body.text || null,
      background: body.background || 'teal',
      location,
      labels,
      labelKind: unplaced ? 'none' : sky && venue ? 'place' : momentPlace.labelKind(labels, shown),
      takenAt: store.takenAtShown(body.location.source === 'capture' ? body.location.taken_at : body.taken_at),
      venueId: venue && body.venue_id ? body.venue_id : null,
      altitude,
      series: body.series || null,
      area,
      shareAt,
    }), id);
    logger.info('moments.created', { momentId: row.id, kind: body.kind, hours: body.hours, audience: body.audience,
      ...(sky ? { floating: Boolean(area) } : {}), ...(shareAt ? { share_at: shareAt } : {}) });
    res.status(201).json({ moment: await oneMoment(row, req.user.id) });
    // A text card is live now: its author's connections hear of it (a photo or video when its check finishes; one shared
    // later at its time, from jobs/momentsShareLater.js). After the answer, and on its own: it never slows or fails the
    // post.
    if (created && body.kind === 'text') momentNotify.notifyConnections(row);
  } catch (error) {
    sendError(res, error, 'create');
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: media.MAX_VIDEO_BYTES, files: 4, fields: 8, parts: 12, fieldSize: 1024, fieldNameSize: 100 },
});
const receive = upload.fields([{ name: 'file', maxCount: 1 }, { name: 'poster', maxCount: 1 },
  { name: 'frames[]', maxCount: 2 }, { name: 'frames', maxCount: 2 }]);

function receiveFiles(req, res, next) {
  receive(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'This file is too large to post.', code: 'MEDIA_TOO_LARGE' });
    }
    return res.status(400).json({ error: 'Send the photo or video as "file", and a video\'s "poster" and "frames[]".', code: 'MOMENT_INVALID' });
  });
}

/** POST /:id/media — the photo or video of the caller's own Moment; the picture check runs, then it goes live. */
router.post('/:id/media', uploadLimiter, receiveFiles, async (req, res) => {
  try {
    const id = momentId(req);
    const row = await store.loadMoment(id);
    if (!row || row.user_id !== req.user.id) throw store.fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
    if (store.momentState(row) === 'ended') throw store.fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
    const kind = store.meta(row).kind;
    if (kind === 'text') throw store.fail(400, 'MOMENT_INVALID', 'A text card has no file.');

    const sentSha = req.files?.file?.[0] ? media.sha256(req.files.file[0].buffer) : null;
    const existing = store.meta(row).media;
    if (existing) {
      // The same file again (a retry after a lost answer) changes nothing.
      if (sentSha && existing.upload_sha256 === sentSha) return res.json({ moment: await oneMoment(row, req.user.id) });
      throw store.fail(409, 'MOMENT_MEDIA_EXISTS', 'This Moment already has its file. Post a new Moment instead.');
    }

    const files = req.files || {};
    const prepared = await momentUpload.prepareFiles(kind, {
      file: files.file?.[0] || null,
      poster: files.poster?.[0] || null,
      frames: [...(files['frames[]'] || []), ...(files.frames || [])],
    });
    const record = await momentUpload.storeFiles(row, prepared);
    const checking = await store.updateMoment(row, {
      moment: { media: record, state: 'checking', checking_since: new Date().toISOString() },
    }, { 'post_metadata->moment->>media': null, archived_at: null });
    if (!checking) {
      // Another upload of this Moment got there first.
      const current = await store.loadMoment(id);
      if (current && store.meta(current).media?.upload_sha256 === prepared.uploadSha) {
        return res.json({ moment: await oneMoment(current, req.user.id) });
      }
      throw store.fail(409, 'MOMENT_MEDIA_EXISTS', 'This Moment already has its file. Post a new Moment instead.');
    }

    const pictures = await Promise.all(momentUpload.checkSources(kind, prepared).map((buffer) => media.checkImage(buffer)));
    const finished = momentCheck.checkPictures(pictures).then((result) => momentCheck.finishUpload(checking, result));
    finished.catch((error) => logger.error('moments.check_finish_failed', { momentId: id, error: error.message }));
    let timer;
    const done = await Promise.race([
      finished.then((updated) => updated || null, () => null),
      new Promise((resolve) => { timer = setTimeout(() => resolve(undefined), CHECK_WAIT_MS); }),
    ]);
    clearTimeout(timer);
    const latest = done || await store.loadMoment(id) || checking;
    res.json({ moment: await oneMoment(latest, req.user.id) });
  } catch (error) {
    sendError(res, error, 'media');
  }
});

// ─── Reading ────────────────────────────────────────────────────────────────

const mapSchema = Joi.object({
  south: Joi.number().min(-90).max(90).required(),
  west: Joi.number().min(-180).max(180).required(),
  north: Joi.number().min(-90).max(90).required(),
  east: Joi.number().min(-180).max(180).required(),
  zoom: Joi.number().min(0).max(25),
});

/**
 * GET /map — the rings in view: live Moments the caller may see, blocks and mutes removed. `heights_on` says whether
 * Moment heights are on for the caller (the `moment_heights` flag), so an app can offer its "Heights" control even
 * where no ring in view carries a height; it says nothing about anyone else. `float_on` says whether Moments with an
 * elevation float on the caller's map by day (`moment_float`, which needs `moment_heights` too); only then `sun` says
 * where the sun is right now over the middle of the box, so both phones draw the same shadows.
 */
router.get('/map', async (req, res) => {
  try {
    const box = parseBody(mapSchema, req.query);
    if (box.south >= box.north || box.west >= box.east) throw store.fail(400, 'MOMENT_INVALID', 'Send a map area with south < north and west < east.');
    // `unplaced`: connections' Moments with no location (and the caller's own), for the row of faces, whatever the box.
    const [rings, unplaced, heights, float, sky] = await Promise.all([
      store.mapRings(req.user.id, box), store.unplacedRings(req.user.id), store.heightsOn(req.user), store.floatOn(req.user),
      store.skyOn(req.user),
    ]);
    const answer = { rings, unplaced, heights_on: heights, float_on: float };
    // The Sky (share later): the caller's own Moments waiting for their time, for their own row ("Shares at 6:40 pm"),
    // soonest first. Never anyone else's, never on the map; only while the Sky is on for the caller.
    if (sky) {
      answer.scheduled = (await store.ownMoments(req.user.id))
        .filter((moment) => moment.state === 'scheduled')
        .sort((a, b) => String(a.share_at).localeCompare(String(b.share_at)));
    }
    if (float) answer.sun = sunPosition((box.south + box.north) / 2, (box.west + box.east) / 2);
    res.json(answer);
  } catch (error) {
    sendError(res, error, 'map');
  }
});

/**
 * GET /unseen — the Moments tab's dot: how many people have a live Moment in the box that the caller may see and
 * hasn't watched, new since `since` (the last time they had the tab open; none: any). Never their own.
 */
router.get('/unseen', async (req, res) => {
  try {
    const { since, include_unplaced: includeUnplaced, ...box } = parseBody(mapSchema.keys({
      since: Joi.string().isoDate(),
      // Apps that show Moments with no location (contract v3.4) ask for them to count; older ones don't.
      include_unplaced: Joi.boolean().default(false),
    }), req.query);
    if (box.south >= box.north || box.west >= box.east) throw store.fail(400, 'MOMENT_INVALID', 'Send a map area with south < north and west < east.');
    res.json({ count: await store.unseenPeople(req.user.id, box, since ? Date.parse(since) : null, { includeUnplaced }) });
  } catch (error) {
    sendError(res, error, 'unseen');
  }
});

/** GET /mine — the caller's own Moments that haven't ended, in any state. */
router.get('/mine', async (req, res) => {
  try {
    res.json({ moments: await store.ownMoments(req.user.id) });
  } catch (error) {
    sendError(res, error, 'mine');
  }
});

// A ring holds a person's Moments at one spot: a day's posting limit is far under this.
const BATCH_MAX = 40;

/**
 * GET /batch?ids=a,b,c — several Moments in one read, each as GET /:id answers it (signed links included), in the
 * order asked. The viewer reads a person's whole ring and the next person's first Moment ahead with it. One the caller
 * can't open (ended, not live, blocked, muted, not theirs to see) is left out, never an error.
 */
router.get('/batch', async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').map((id) => id.trim()).filter((id) => UUID.test(id)).slice(0, BATCH_MAX);
    const rows = await store.openMoments(ids, req.user.id);
    res.json({ moments: await store.serializeMoments(rows, req.user.id) });
  } catch (error) {
    sendError(res, error, 'batch');
  }
});

/**
 * GET /people?ids=a,b,c — the rings around profile pictures: for the people on a screen (up to 100 account ids), who
 * has live Moments the caller may see, one ring per person with all of them in the order they play. The map's rules
 * decide (blocks, mutes, "my connections only", the Moments the caller reported): someone with nothing the caller may
 * see is left out, never an error.
 */
router.get('/people', async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').map((id) => id.trim()).filter((id) => UUID.test(id)).slice(0, store.MAX_PEOPLE);
    res.json({ rings: await store.peopleRings(req.user.id, ids) });
  } catch (error) {
    sendError(res, error, 'people');
  }
});

/** GET /:id — one Moment, with its signed links; 410 once it has ended. */
router.get('/:id', async (req, res) => {
  try {
    const row = await store.openMoment(momentId(req), req.user.id);
    res.json({ moment: await oneMoment(row, req.user.id) });
  } catch (error) {
    sendError(res, error, 'read');
  }
});

/** POST /:id/view — the caller watched it: one view per person; the author's own views aren't counted. */
router.post('/:id/view', actionLimiter, async (req, res) => {
  try {
    const row = await store.openMoment(momentId(req), req.user.id);
    if (row.user_id !== req.user.id) {
      const { error } = await supabaseAdmin.rpc('record_post_unique_view', { p_post_id: row.id, p_user_id: req.user.id });
      if (error) throw new Error(`Failed to record the view: ${error.message}`);
    }
    res.status(204).end();
  } catch (error) {
    sendError(res, error, 'view');
  }
});

/** GET /:id/viewers — the author's "Seen by": who watched, newest first, with their reaction and whether they replied. */
router.get('/:id/viewers', async (req, res) => {
  try {
    const row = await store.loadMoment(momentId(req));
    if (!row || row.user_id !== req.user.id) throw store.fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
    if (store.momentState(row) === 'ended') throw store.fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
    res.json(await store.viewersOf(row));
  } catch (error) {
    sendError(res, error, 'viewers');
  }
});

// ─── Acting on someone's Moment ─────────────────────────────────────────────

async function othersMoment(req) {
  const row = await store.openMoment(momentId(req), req.user.id);
  if (row.user_id === req.user.id) throw store.fail(400, 'MOMENT_OWN', 'This is your own Moment.');
  return row;
}

/** PUT /:id/reaction — { emoji } (one of the post reactions) or { emoji: null } to take it back. */
router.put('/:id/reaction', actionLimiter, async (req, res) => {
  try {
    const raw = req.body?.emoji;
    const emoji = raw === null ? null : normalizePostReaction(raw);
    if (raw !== null && !emoji) throw store.fail(400, 'MOMENT_INVALID', 'Choose one of the reactions.');
    const row = await othersMoment(req);
    const { error } = await supabaseAdmin.rpc('set_post_reaction', { p_post_id: row.id, p_user_id: req.user.id, p_reaction: emoji });
    if (error) throw new Error(`Failed to save the reaction: ${error.message}`);
    res.json({ my_reaction: emoji });
  } catch (error) {
    sendError(res, error, 'reaction');
  }
});

/** POST /:id/reply — { text }: a message in the caller's direct chat with the author, naming the Moment. */
router.post('/:id/reply', actionLimiter, async (req, res) => {
  try {
    const { text } = parseBody(Joi.object({ text: Joi.string().trim().min(1).max(1000).required() }), req.body);
    const row = await othersMoment(req);
    const author = (await store.loadAuthors([row.user_id])).get(String(row.user_id));
    res.json(await momentChat.replyToMoment({
      row, author, replierId: req.user.id, text, io: req.app.get('io'), requestId: req.requestId,
    }));
  } catch (error) {
    sendError(res, error, 'reply');
  }
});

/** POST /:id/report — { reason, details? }: into the report queue; two people's reports hold it until reviewed. */
router.post('/:id/report', actionLimiter, async (req, res) => {
  try {
    const { reason, details } = parseBody(Joi.object({
      reason: Joi.string().valid(...REPORT_REASONS).required(),
      details: Joi.string().trim().max(1000).allow('', null),
    }), req.body);
    const row = await othersMoment(req);
    await filePostReport({ postId: row.id, userId: req.user.id, reason, details: details || null });
    await store.holdIfReported(row);
    res.json({ message: 'Thanks. We will review this Moment.' });
  } catch (error) {
    sendError(res, error, 'report');
  }
});

/** DELETE /:id — the author deletes their Moment; its files go unless a review holds them. */
router.delete('/:id', actionLimiter, async (req, res) => {
  try {
    const row = await store.loadMoment(momentId(req));
    if (!row || row.user_id !== req.user.id) throw store.fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
    if (!row.archived_at) await store.deleteMoment(row);
    res.status(204).end();
  } catch (error) {
    sendError(res, error, 'delete');
  }
});

// ─── Muting a person's Moments ──────────────────────────────────────────────

async function mutedAccount(req) {
  const userId = String(req.params.userId || '');
  if (!UUID.test(userId)) throw store.fail(404, 'USER_NOT_FOUND', 'This person could not be found.');
  if (userId === req.user.id) throw store.fail(400, 'MOMENT_OWN', "You can't mute your own Moments.");
  const { data, error } = await supabaseAdmin.from('User').select('id, account_type').eq('id', userId).maybeSingle();
  if (error) throw new Error(`Failed to load the person: ${error.message}`);
  if (!data) throw store.fail(404, 'USER_NOT_FOUND', 'This person could not be found.');
  return { id: data.id, type: data.account_type === 'business' ? 'business' : 'user' };
}

/** PUT /authors/:userId/mute — hide this person's Moments (only their Moments; Settings lists it to undo). */
router.put('/authors/:userId/mute', actionLimiter, async (req, res) => {
  try {
    const account = await mutedAccount(req);
    const { data: existing, error: readError } = await supabaseAdmin.from('PostMute').select('id')
      .eq('user_id', req.user.id).eq('muted_entity_type', account.type).eq('muted_entity_id', account.id)
      .eq('surface', 'moments').limit(1);
    if (readError) throw new Error(`Failed to read mutes: ${readError.message}`);
    if (!existing?.length) {
      const { error } = await supabaseAdmin.from('PostMute').insert({
        user_id: req.user.id, muted_entity_type: account.type, muted_entity_id: account.id, surface: 'moments',
      });
      if (error && String(error.code) !== '23505') throw new Error(`Failed to mute: ${error.message}`);
    }
    feedService.invalidateFilterCache(req.user.id);
    res.status(204).end();
  } catch (error) {
    sendError(res, error, 'mute');
  }
});

/** DELETE /authors/:userId/mute — show this person's Moments again. */
router.delete('/authors/:userId/mute', actionLimiter, async (req, res) => {
  try {
    const account = await mutedAccount(req);
    const { error } = await supabaseAdmin.from('PostMute').delete()
      .eq('user_id', req.user.id).eq('muted_entity_id', account.id).eq('surface', 'moments');
    if (error) throw new Error(`Failed to unmute: ${error.message}`);
    feedService.invalidateFilterCache(req.user.id);
    res.status(204).end();
  } catch (error) {
    sendError(res, error, 'unmute');
  }
});

module.exports = router;
