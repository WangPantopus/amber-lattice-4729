/**
 * Nearby Plans API (build brief §5). Every route is signed in and answers 404
 * while the `plans` flag is off for the viewer. Errors are
 * `{ error: <code>, message: <sentence for people> }`.
 *
 * Privacy lives in services/plans/planService.js: cards carry the area only;
 * the exact place, the host's note and the people going reach only the host
 * and people who are in.
 */

const express = require('express');

const verifyToken = require('../middleware/verifyToken');
const requireFeatureFlag = require('../middleware/requireFeatureFlag');
const logger = require('../utils/logger');
const { contentCreationLimiter, aiDraftLimiter } = require('../middleware/rateLimiter');
const { recordFunnelEvent } = require('../services/funnelEvents');
const { loadViewer } = require('../services/plans/planViewer');
const planService = require('../services/plans/planService');
const planActions = require('../services/plans/planActions');
const planInvites = require('../services/plans/planInvites');
const planGuests = require('../services/plans/planGuests');
const planGames = require('../services/plans/planGames');
const planPlaces = require('../services/plans/planPlaces');
const { suggestPlaces } = require('../services/ai/planPlaceSuggest');
const { KINDS, ALL_KINDS, WINDOWS } = require('../services/plans/planRules');

const router = express.Router();
router.use(verifyToken, requireFeatureFlag('plans'));
// `biz=1` on a request: this app can draw a business's plan (Plans with businesses). Without it, on every
// route here, a business's plan does not exist, which is what keeps one from reaching an older app that would
// draw it as a neighbor's. `more=1`: this app can draw an online plan and the four newer kinds; without it those
// don't exist either, since older apps decode `kind` and `place_kind` as closed lists. `guests=1`: this app can
// draw guests without an account, Maybe, adults and kids, and room over 30 (Plans for the holidays, H1); without it
// the server answers as it did before. Read by services/plans/planViewer.js.
router.use((req, _res, next) => {
  if (req.user) {
    req.user.plansBiz = req.query.biz === '1';
    req.user.plansMore = req.query.more === '1';
    req.user.plansGuests = req.query.guests === '1';
  }
  next();
});

function fail(res, status, error, message) {
  return res.status(status).json({ error, message });
}

function serverError(res, err, where, req) {
  if (err instanceof planActions.PlanError) {
    return res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
  }
  if (err && err.code === 'BLOCK_CHECK_UNAVAILABLE') {
    return fail(res, 503, 'unavailable', 'Plans are taking a moment to load. Please try again.');
  }
  logger.error(`plans.${where}.error`, { error: err?.message, userId: req.user?.id });
  return fail(res, 500, 'server_error', 'Something went wrong. Please try again.');
}

function number(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pointFromQuery(query, latKey = 'latitude', lngKey = 'longitude') {
  const latitude = number(query[latKey]);
  const longitude = number(query[lngKey]);
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

/** A fresh GPS fix sent as query params (gps_latitude, gps_longitude, gps_timestamp). */
function gpsFromQuery(query) {
  const point = pointFromQuery(query, 'gps_latitude', 'gps_longitude');
  if (!point || !query.gps_timestamp) return null;
  return { ...point, timestamp: String(query.gps_timestamp) };
}

/** The host's homes and fresh fix: their areas' public places start loading now, ready for H6. */
function warmPlaces(viewer) {
  planPlaces.warmAround(viewer.locations.filter((l) => l.kind === 'home' || l.kind === 'gps'));
}

/** The kinds a list asked for, of the ones this viewer's app can draw. */
function kindsFromQuery(value, viewer) {
  if (!value) return [];
  const known = viewer.more ? ALL_KINDS : KINDS;
  return String(value).split(',').map((k) => k.trim()).filter((k) => known.includes(k));
}

// GET /api/plans: the list under the map, soonest first, within 5 miles.
router.get('/', async (req, res) => {
  try {
    const point = pointFromQuery(req.query);
    if (!point) return fail(res, 422, 'validation', 'A latitude and longitude are needed to find plans nearby.');
    const window = WINDOWS.includes(req.query.window) ? req.query.window : 'week';
    const viewer = await loadViewer(req.user, { point, gps: gpsFromQuery(req.query) });
    warmPlaces(viewer);
    let kinds = kindsFromQuery(req.query.kinds, viewer);
    if (!viewer.seesPlaydates) kinds = kinds.filter((k) => k !== 'playdate');
    if (req.query.kinds && kinds.length === 0) return res.json({ items: [], next_cursor: null, nearest_elsewhere: null });
    // host=all|neighbors|businesses: the list's filter, for a viewer businesses' plans exist for.
    const result = await planService.listNearby(viewer, {
      point, window, kinds, cursor: req.query.cursor || null, host: planService.hostFilter(req.query.host),
    });
    return res.json(result);
  } catch (err) {
    return serverError(res, err, 'list', req);
  }
});

// GET /api/plans/mine: hosting, going, asked, waitlisted, invited (not answered yet), and recent (ended in the last
// two days). Email invitations to the person's verified address become theirs first.
router.get('/mine', async (req, res) => {
  try {
    const [viewer] = await Promise.all([
      loadViewer(req.user, { point: pointFromQuery(req.query), gps: gpsFromQuery(req.query) }),
      planInvites.attachEmailInvites(req.user),
    ]);
    warmPlaces(viewer);
    return res.json(await planService.listMine(viewer));
  } catch (err) {
    return serverError(res, err, 'mine', req);
  }
});

// GET /api/plans/games: the next 14 days' games from the checked list (H2's game chips),
// for teams near one of the viewer's places (homes, saved places, a fresh fix, or the point
// the app is looking from).
router.get('/games', async (req, res) => {
  try {
    const viewer = await loadViewer(req.user, { point: pointFromQuery(req.query), gps: gpsFromQuery(req.query) });
    warmPlaces(viewer);
    const near = viewer.origin ? [...viewer.locations, viewer.origin] : viewer.locations;
    if (req.query.v === '2' && viewer.sportsFlag) {
      return res.json(await planGames.gamesForViewer(viewer, req.query.for === 'composer' ? 'composer' : 'sheet'));
    }
    return res.json({ games: planGames.upcomingGames(Date.now(), { near }) });
  } catch (err) {
    return serverError(res, err, 'games', req);
  }
});

// GET /api/plans/host-as: the businesses this person may post a plan for, each with the locations it can meet at,
// the kinds a business posts and the labels each may carry. `{ businesses: [] }` for nearly everyone, and always
// without `biz=1`; the apps show "Host as" only when it isn't empty.
router.get('/host-as', async (req, res) => {
  try {
    const viewer = await loadViewer(req.user);
    return res.json(await require('../services/plans/planBusiness').hostAsChoices(viewer));
  } catch (err) {
    return serverError(res, err, 'host_as', req);
  }
});

router.get('/teams', requireFeatureFlag('plans_sports'), async (req, res) => {
  try {
    const viewer = await loadViewer(req.user, { point: pointFromQuery(req.query), gps: gpsFromQuery(req.query) });
    const { searchTeams, teamById, publicTeam } = require('../services/plans/planTeams');
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const chosen = [...new Set([...(viewer.sports.teams || []), ...(viewer.sports.hidden || [])])].map(teamById).filter(Boolean);
    return res.json({ suggested: planGames.suggestedForViewer(viewer).map(publicTeam), results: (q ? searchTeams(q) : chosen).map(publicTeam) });
  } catch (err) { return serverError(res, err, 'teams', req); }
});

/** The plan's start or end from a query or body value (ISO 8601), or null. */
function isoTime(value) {
  if (typeof value !== 'string' || value.length > 40) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

const PLACES_UNAVAILABLE = "Places near you aren't loading right now. Try again in a minute.";

// GET /api/plans/places/nearby?latitude&longitude[&q][&kind&sport&starts_at&ends_at][&wait=0]:
// public places for H6, nearest first, or with a kind the ones that suit the plan first, each
// with its hours for the plan's time and a few facts. wait=0 only starts gathering a new area
// (the host flow opening) and answers at once.
router.get('/places/nearby', async (req, res) => {
  try {
    const point = pointFromQuery(req.query);
    if (!point) return fail(res, 422, 'validation', 'A latitude and longitude are needed to find places nearby.');
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 60) : '';
    // Any kind orders the places: the list is the same public places either way.
    const kind = ALL_KINDS.includes(req.query.kind) ? req.query.kind : null;
    const sport = typeof req.query.sport === 'string' ? req.query.sport.slice(0, 30) : null;
    const result = await planPlaces.placesNear({
      ...point,
      q,
      kind,
      sport,
      startsAt: isoTime(req.query.starts_at),
      endsAt: isoTime(req.query.ends_at),
      ...(req.query.wait === '0' ? { waitMs: 0 } : {}),
    });
    // 202 while an area seen for the first time is still loading: ask again in a few seconds.
    return res.status(result.loading ? 202 : 200).json(result);
  } catch (err) {
    logger.warn('plans.places.unavailable', { error: err?.message });
    return fail(res, 503, 'unavailable', PLACES_UNAVAILABLE);
  }
});

// POST /api/plans/places/suggest { latitude, longitude, kind, title?, about?, starts_at?, ends_at?,
// spots?, details?, ask? }: H6's "Suggest places", up to three public places from the same list,
// best first, each with `why`. 202 while the area's places are still loading, as above.
router.post('/places/suggest', aiDraftLimiter, async (req, res) => {
  try {
    const input = body(req);
    const point = pointFromQuery(input);
    if (!point) return fail(res, 422, 'validation', 'A latitude and longitude are needed to find places nearby.');
    if (!ALL_KINDS.includes(input.kind)) return fail(res, 422, 'validation', 'Choose what kind of plan it is.');
    const details = input.details && typeof input.details === 'object' && !Array.isArray(input.details) ? input.details : {};
    const spots = Number.isInteger(input.spots) && input.spots > 0 && input.spots <= 50 ? input.spots : null;
    const result = await suggestPlaces({
      userId: req.user.id,
      ...point,
      plan: {
        kind: input.kind,
        title: typeof input.title === 'string' ? input.title : null,
        about: typeof input.about === 'string' ? input.about : null,
        startsAt: isoTime(input.starts_at),
        endsAt: isoTime(input.ends_at),
        spots,
        details,
      },
      ask: typeof input.ask === 'string' ? input.ask.slice(0, 120) : '',
    });
    return res.status(result.loading ? 202 : 200).json(result);
  } catch (err) {
    logger.warn('plans.places.suggest_unavailable', { error: err?.message });
    return fail(res, 503, 'unavailable', PLACES_UNAVAILABLE);
  }
});

// GET /api/plans/occasions: the occasions in season (Plans for the holidays H3), each with what it fills in on the host
// form: { occasions: [{ key, text, kind, details, fills }] }. 404 while plans_occasions is off; none without the newer
// kinds (`more=1` and plans_kinds), whose kinds they start.
router.get('/occasions', async (req, res) => {
  try {
    const planOccasions = require('../services/plans/planOccasions');
    if (!(await planOccasions.enabledFor(req.user))) return fail(res, 404, 'not_found', "This isn't available right now.");
    const viewer = await loadViewer(req.user, { point: pointFromQuery(req.query), gps: gpsFromQuery(req.query) });
    if (!viewer.kindsFlag) return res.json({ occasions: [] });
    return res.json(await planOccasions.inSeason(viewer));
  } catch (err) {
    return serverError(res, err, 'occasions', req);
  }
});

// GET /api/plans/invites/people[?q=]: the people this person can invite, before the plan exists (a private plan's
// preview): { people: [{ user_id, display_name, avatar_url, reason }] }.
router.get('/invites/people', requireFeatureFlag('plans_invites'), async (req, res) => {
  try {
    return res.json(await planInvites.peopleBeforePosting(req.user, req.query.q));
  } catch (err) {
    return serverError(res, err, 'invites_people_before', req);
  }
});

// The same people again (Plans for the holidays, 08-extras section 6), behind plans_same_people: 404 while it is off.
// GET /api/plans/past-people: the host's last ten ended plans that had anyone in, { plans: [{ post_id, title, kind,
// date_text, count }] }. GET /api/plans/past-people/:postId: who was in on one, a name each, never an address.
router.get('/past-people', requireFeatureFlag('plans_invites'), async (req, res) => {
  try {
    return res.json(await require('../services/plans/planSamePeople').pastPlans(req.user));
  } catch (err) {
    return serverError(res, err, 'past_people', req);
  }
});
router.get('/past-people/:postId', requireFeatureFlag('plans_invites'), async (req, res) => {
  try {
    return res.json(await require('../services/plans/planSamePeople').pastPlanPeople(req.user, req.params.postId));
  } catch (err) {
    return serverError(res, err, 'past_people_plan', req);
  }
});

// GET /api/plans/invites/next: right after signing in, the newest invitation the person hasn't opened, so the app
// opens that plan ({ plan_id } or { plan_id: null }). An email invitation reaches them by their verified address.
router.get('/invites/next', async (req, res) => {
  try {
    return res.json(await planInvites.nextInvite(req.user));
  } catch (err) {
    return serverError(res, err, 'invites_next', req);
  }
});

// GET /api/plans/:id: PlanDetail for the host and people who are in, PlanCard for anyone else allowed to see it.
// An invitation the person hadn't opened counts as opened.
router.get('/:id', async (req, res) => {
  try {
    const [viewer] = await Promise.all([
      loadViewer(req.user, { point: pointFromQuery(req.query), gps: gpsFromQuery(req.query) }),
      planInvites.attachEmailInvites(req.user),
    ]);
    const { body } = await planService.getForViewer(req.params.id, viewer);
    if (body?.my_invite) planInvites.markOpened(viewer.id, body.id).catch(() => {});
    // Playdate links open for everyone on Pantopus: the J9 "verify your address" answer ended November 7.
    if (!body) return fail(res, 404, 'not_found', "This plan isn't available.");
    if (body.viewer.role === 'none') {
      recordFunnelEvent('plan_viewed', { userId: viewer.id, meta: { plan_id: body.id, kind: body.kind } });
    }
    return res.json(body);
  } catch (err) {
    return serverError(res, err, 'detail', req);
  }
});

function body(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

// POST /api/plans/deal-preview (B1): what a guest will read about a deal the business is choosing; nothing is saved.
router.post('/deal-preview', async (req, res) => {
  try {
    return res.json(await require('../services/plans/planDeals').previewFor(req.user, body(req)));
  } catch (err) {
    return serverError(res, err, 'deal_preview', req);
  }
});

// POST /api/plans: host a plan. Returns PlanDetail (201).
router.post('/', contentCreationLimiter, async (req, res) => {
  try {
    return res.status(201).json(await planActions.createPlan(req.user, body(req)));
  } catch (err) {
    return serverError(res, err, 'create', req);
  }
});

// PATCH /api/plans/:id: the host changes the plan. Moving the start by more than
// 30 minutes or changing the place asks everyone who's in "Still coming?".
router.patch('/:id', async (req, res) => {
  try {
    return res.json(await planActions.editPlan(req.user, req.params.id, body(req), { io: req.app.get('io') }));
  } catch (err) {
    return serverError(res, err, 'edit', req);
  }
});

// POST /api/plans/:id/cancel { note }
router.post('/:id/cancel', async (req, res) => {
  try {
    return res.json(await planActions.cancelPlan(req.user, req.params.id, body(req)));
  } catch (err) {
    return serverError(res, err, 'cancel', req);
  }
});

// GET /api/plans/:id/requests: the host's pending and waitlisted asks.
router.get('/:id/requests', async (req, res) => {
  try {
    return res.json(await planActions.listRequests(req.user, req.params.id));
  } catch (err) {
    return serverError(res, err, 'requests', req);
  }
});

// POST /api/plans/:id/requests: ask to join (again: updates who's coming while waiting).
router.post('/:id/requests', async (req, res) => {
  try {
    const result = await planActions.askToJoin(req.user, req.params.id, body(req), { io: req.app.get('io') });
    return res.status(result.status).json(result.body);
  } catch (err) {
    return serverError(res, err, 'ask', req);
  }
});

// DELETE /api/plans/:id/requests/mine: withdraw (waiting) or leave (in).
router.delete('/:id/requests/mine', async (req, res) => {
  try {
    return res.json(await planActions.withdrawMine(req.user, req.params.id, { io: req.app.get('io') }));
  } catch (err) {
    return serverError(res, err, 'withdraw', req);
  }
});

// POST /api/plans/:id/requests/quote (B2): { party_size, kids_count } → what joining costs, with no side effect.
router.post('/:id/requests/quote', async (req, res) => {
  try {
    return res.json(await planActions.quoteToJoin(req.user, req.params.id, req.body || {}));
  } catch (err) {
    return serverError(res, err, 'paid_quote', req);
  }
});

// POST /api/plans/:id/requests/mine/confirm (B2): the payment sheet closed; in once the payment company says it went
// through. Answers the plan (PlanDetail), or 409 payment_not_complete, full (it filled while they paid: refunded) or
// ended (it takes nobody now: refunded).
router.post('/:id/requests/mine/confirm', async (req, res) => {
  try {
    return res.json(await require('../services/plans/planPaid').confirmMine(req.user, req.params.id, { io: req.app.get('io') }));
  } catch (err) {
    return serverError(res, err, 'paid_confirm', req);
  }
});

// The bill at the place (B5, contract 11.2), behind plans_pay_here. Every amount is the server's.
const planChecks = () => require('../services/plans/planChecks');
const checkRoute = (method, path, label, handler) => router[method](path, async (req, res) => {
  try {
    return res.json(await handler(req));
  } catch (err) {
    return serverError(res, err, label, req);
  }
});
// Staff with plans.manage: send a guest a check { request_id, amount_cents, no_deal_cents }, and the guest list.
checkRoute('post', '/:id/checks', 'check_send', (req) => planChecks().sendCheck(req.user, req.params.id, req.body || {}));
checkRoute('get', '/:id/checks', 'check_list', (req) => planChecks().staffList(req.user, req.params.id));
// A guest who is in: their open check (or the last paid one), and starting their own { amount_cents } (no deal on the bill).
checkRoute('get', '/:id/checks/mine', 'check_mine', (req) => planChecks().mine(req.user, req.params.id));
checkRoute('post', '/:id/checks/mine', 'check_start', (req) => planChecks().startMine(req.user, req.params.id, req.body || {}));
// The guest: another tip's total (no side effect), the payment sheet's values, and confirm after the sheet closes.
checkRoute('post', '/:id/checks/:checkId/quote', 'check_quote', (req) => planChecks().quote(req.user, req.params.id, req.params.checkId, req.body || {}));
checkRoute('post', '/:id/checks/:checkId/pay', 'check_pay', (req) => planChecks().pay(req.user, req.params.id, req.params.checkId, req.body || {}));
checkRoute('post', '/:id/checks/:checkId/confirm', 'check_confirm', (req) => planChecks().confirm(req.user, req.params.id, req.params.checkId));
// A tip after a paid plan (B6): { amount_cents } answers the payment sheet's values; confirm answers "You tipped $5.00".
checkRoute('post', '/:id/tip', 'tip_later', (req) => planChecks().tipLater(req.user, req.params.id, req.body || {}));
checkRoute('post', '/:id/tip/confirm', 'tip_confirm', (req) => planChecks().tipConfirm(req.user, req.params.id));
// Staff: refund all or { amount_cents }, until 48 hours after the plan ends.
checkRoute('post', '/:id/checks/:checkId/refund', 'check_refund', (req) => planChecks().refund(req.user, req.params.id, req.params.checkId, req.body || {}));

// POST /api/plans/:id/requests/:requestId/deal-used (B1): staff with plans.manage mark a guest's free thing used.
router.post('/:id/requests/:requestId/deal-used', async (req, res) => {
  try {
    return res.json(await require('../services/plans/planDeals').markUsedFor(req.user, req.params.id, req.params.requestId));
  } catch (err) {
    return serverError(res, err, 'deal_used', req);
  }
});

// POST /api/plans/:id/requests/:requestId/accept | decline | remove (host).
router.post('/:id/requests/:requestId/:action', async (req, res) => {
  try {
    const { action } = req.params;
    if (!['accept', 'decline', 'remove'].includes(action)) return fail(res, 404, 'not_found', 'Unknown action.');
    return res.json(await planActions.decide(req.user, req.params.id, req.params.requestId, action, body(req), { io: req.app.get('io') }));
  } catch (err) {
    return serverError(res, err, 'decide', req);
  }
});

// POST /api/plans/:id/on-my-way: a line in the chat, no push.
router.post('/:id/on-my-way', async (req, res) => {
  try {
    return res.json(await planActions.onMyWay(req.user, req.params.id));
  } catch (err) {
    return serverError(res, err, 'on_my_way', req);
  }
});

// POST /api/plans/:id/still-coming { coming }: false leaves the plan.
router.post('/:id/still-coming', async (req, res) => {
  try {
    return res.json(await planActions.stillComing(req.user, req.params.id, body(req), { io: req.app.get('io') }));
  } catch (err) {
    return serverError(res, err, 'still_coming', req);
  }
});

// POST /api/plans/:id/feedback { answer: great | ok | not_right, note }
router.post('/:id/feedback', async (req, res) => {
  try {
    return res.json(await planActions.giveFeedback(req.user, req.params.id, body(req)));
  } catch (err) {
    return serverError(res, err, 'feedback', req);
  }
});

// ── Invitations (services/plans/planInvites.js) ─────────────

// GET /api/plans/:id/invites: the host's invitations, each with where it stands.
router.get('/:id/invites', async (req, res) => {
  try {
    return res.json(await planInvites.listForHost(req.user, req.params.id));
  } catch (err) {
    return serverError(res, err, 'invites', req);
  }
});

// GET /api/plans/:id/invites/people?q=: people the host can invite (connections and people who came to their
// plans), with where each stands on this plan.
router.get('/:id/invites/people', requireFeatureFlag('plans_invites'), async (req, res) => {
  try {
    return res.json(await planInvites.peopleToInvite(req.user, req.params.id, req.query.q));
  } catch (err) {
    return serverError(res, err, 'invite_people', req);
  }
});

// POST /api/plans/:id/invites { user_ids?, emails?, confirm_shares_address? }: invite people on Pantopus and by email.
router.post('/:id/invites', requireFeatureFlag('plans_invites'), async (req, res) => {
  try {
    return res.status(201).json(await planInvites.createInvites(req.user, req.params.id, body(req)));
  } catch (err) {
    return serverError(res, err, 'invite', req);
  }
});

// POST /api/plans/:id/invites/link { confirm_shares_address? }: a one-person link for the host to text.
router.post('/:id/invites/link', requireFeatureFlag('plans_invites'), async (req, res) => {
  try {
    return res.status(201).json(await planInvites.createLinkInvite(req.user, req.params.id, body(req)));
  } catch (err) {
    return serverError(res, err, 'invite_link', req);
  }
});

// POST /api/plans/:id/invites/from-plan { from_post_id, skip?, confirm_shares_address? }: the same people again. Each
// person who was in there is invited the way they were reached; answers the host's list and a result a person.
router.post('/:id/invites/from-plan', requireFeatureFlag('plans_invites'), async (req, res) => {
  try {
    return res.status(201).json(await require('../services/plans/planSamePeople').inviteFromPlan(req.user, req.params.id, body(req)));
  } catch (err) {
    return serverError(res, err, 'invite_from_plan', req);
  }
});

// ── Plans for the holidays, H1 (services/plans/planGuests.js): 404 while plans_guest_answers is off for the host ──

// POST /api/plans/:id/invites/open-link { host_says_yes_first?, rotate?, confirm_shares_address? }: the plan's one
// link for everyone. Answers { url, message, host_says_yes_first }.
router.post('/:id/invites/open-link', requireFeatureFlag('plans_invites'), async (req, res) => {
  try {
    return res.json(await planGuests.makeOpenLink(req.user, req.params.id, body(req)));
  } catch (err) {
    return serverError(res, err, 'invite_open_link', req);
  }
});

// DELETE /api/plans/:id/invites/open-link: turns the link off. Answers already given stay.
router.delete('/:id/invites/open-link', async (req, res) => {
  try {
    return res.json(await planGuests.closeOpenLink(req.user, req.params.id));
  } catch (err) {
    return serverError(res, err, 'invite_open_link_off', req);
  }
});

// POST /api/plans/:id/invites/remind: everyone who hasn't answered, the way each was invited; once a plan a day.
router.post('/:id/invites/remind', requireFeatureFlag('plans_invites'), async (req, res) => {
  try {
    return res.json(await planGuests.remind(req.user, req.params.id));
  } catch (err) {
    return serverError(res, err, 'invite_remind', req);
  }
});

// POST /api/plans/:id/invites/maybe: an invited person says Maybe.
router.post('/:id/invites/maybe', async (req, res) => {
  try {
    return res.json(await planGuests.sayMaybe(req.user, req.params.id, { io: req.app.get('io') }));
  } catch (err) {
    return serverError(res, err, 'invite_maybe', req);
  }
});

// POST /api/plans/:id/invites/:inviteId/ok { confirm_shares_address? }: the host lets in a guest waiting from the open
// link; their email goes. (A guest who took that answer into the app: the ordinary accept of their ask.)
router.post('/:id/invites/:inviteId/ok', async (req, res) => {
  try {
    return res.json(await planGuests.letIn(req.user, req.params.id, req.params.inviteId, body(req), { io: req.app.get('io') }));
  } catch (err) {
    return serverError(res, err, 'invite_ok', req);
  }
});

// ── The bring list, H2 (services/plans/planBring.js): 404 while plans_bring_list is off for the host ──

// PUT /api/plans/:id/bring { items: [{ id?, label, note?, mine? }], guests_can_add? } (the host). Answers { bring }.
router.put('/:id/bring', async (req, res) => {
  try {
    return res.json(await require('../services/plans/planBring').replace(req.user, req.params.id, body(req)));
  } catch (err) {
    return serverError(res, err, 'bring_replace', req);
  }
});

// POST /api/plans/:id/bring/items { label, note? }: someone in adds one thing they'll bring (when guests may add).
router.post('/:id/bring/items', async (req, res) => {
  try {
    return res.json(await require('../services/plans/planBring').add(req.user, req.params.id, body(req)));
  } catch (err) {
    return serverError(res, err, 'bring_add', req);
  }
});

// POST | DELETE /api/plans/:id/bring/:itemId/claim: someone in (or the host) claims an item, or gives it back.
router.post('/:id/bring/:itemId/claim', async (req, res) => {
  try {
    return res.json(await require('../services/plans/planBring').claim(req.user, req.params.id, req.params.itemId));
  } catch (err) {
    return serverError(res, err, 'bring_claim', req);
  }
});
router.delete('/:id/bring/:itemId/claim', async (req, res) => {
  try {
    return res.json(await require('../services/plans/planBring').giveBack(req.user, req.params.id, req.params.itemId));
  } catch (err) {
    return serverError(res, err, 'bring_give_back', req);
  }
});

// POST /api/plans/:id/invites/claim { token } | { open }: the person opened an email or text invitation, or (Plans for
// the holidays, contract 6.9) the plan's open link.
router.post('/:id/invites/claim', async (req, res) => {
  try {
    return res.json(await planInvites.claimInvite(req.user, req.params.id, body(req).token, { open: body(req).open }));
  } catch (err) {
    return serverError(res, err, 'invite_claim', req);
  }
});

// POST /api/plans/:id/invites/decline: "Can't make it". Saying "I'm in" is the ask (POST /:id/requests).
router.post('/:id/invites/decline', async (req, res) => {
  try {
    return res.json(await planInvites.declineInvite(req.user, req.params.id, { io: req.app.get('io') }));
  } catch (err) {
    return serverError(res, err, 'invite_decline', req);
  }
});

// DELETE /api/plans/:id/invites/:inviteId: the host takes back an invitation nobody said yes to.
router.delete('/:id/invites/:inviteId', async (req, res) => {
  try {
    return res.json(await planInvites.cancelInvite(req.user, req.params.id, req.params.inviteId));
  } catch (err) {
    return serverError(res, err, 'invite_cancel', req);
  }
});

// POST /api/plans/:id/report { reason, details }: into the admin report queue.
router.post('/:id/report', async (req, res) => {
  try {
    return res.json(await planActions.reportPlan(req.user, req.params.id, body(req)));
  } catch (err) {
    return serverError(res, err, 'report', req);
  }
});

module.exports = router;
