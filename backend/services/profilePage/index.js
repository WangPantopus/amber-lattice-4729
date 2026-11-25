/**
 * The profile page (~/pantopus-profile-sources/CONTRACT.md, frozen v1): one read composes the page for whoever asks.
 * The person, the privacy checks and every content source are read at once (SPEC 4.13); a content source that is slow
 * or fails leaves its lines out, a privacy check that fails fails the read.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { serializeProfilePrompts } = require('../../utils/profilePrompts');
const { findPerson, openFor, PageRefusal, cityLimit, handleOthersSee } = require('./person');
const { readRows, sourcesFrom, relationshipStatus, bounded } = require('./sources');
const { readShare, applyShareChange, PART_KEYS } = require('./parts');
const links = require('./links');
const { profileLinksEnabled, profileTiesEnabled, profileKnownForEnabled } = require('../../utils/featureFlags');
const { buildRecord, composePage, composeMonth, composePiece, composeCircle, composeCirclePieces, partContent, firstWord, knownForLines } = require('./compose');
const { reaches } = require('./parts');

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const localDay = (at) => require('./compose').localDate(new Date(at), require('./compose').PACIFIC);

function webBase() {
  const url = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(url) ? url : 'https://pantopus.com';
}

/**
 * The saved parts (`User.profile_share`), or null when never saved. A database without the column yet (the migration
 * not applied: PostgreSQL's undefined-column code, 42703) reads as never saved; any other failure throws, so a privacy
 * decision never guesses.
 */
async function readShareColumn(userId) {
  const { data, error } = await supabaseAdmin.from('User').select('profile_share').eq('id', userId).maybeSingle();
  if (error) {
    if (error.code === '42703') return null;
    throw error;
  }
  return data?.profile_share || null;
}

/**
 * The Moments row (design session, 2026-11-23): the person's live Moments this viewer may see, decided by
 * services/moments/momentStore.js's own canSee and live state from the rows already read (their Moments, the viewer's
 * mutes and recent reports, blocks and connection), so it costs no call of its own; the Moments switch is the
 * viewer's, as the Moments routes check it (memoized). Returns { count, placed } or null when there is no row.
 */
async function momentsFor(req, ctx, rows) {
  if (ctx.view === 'link' || !req.user?.id || !(rows.moments || []).length) return null;
  const { isFeatureEnabled } = require('../featureFlagService');
  if (!(await isFeatureEnabled('moments', req.user))) return null;
  const store = require('../moments/momentStore');
  const { PREVIEW_VIEWER_ID } = require('../../utils/profilePreview');
  const personId = String(ctx.userData.id);
  const viewerId = ctx.view === 'owner' ? personId : String(ctx.preview ? PREVIEW_VIEWER_ID : req.user.id);
  const blocked = !ctx.preview && (relationshipStatus(rows.relationship, viewerId) === 'blocked'
    || rows.blocked_by_them === true || rows.blocked_by_viewer === true);
  const seeCtx = {
    viewerId,
    blocked: new Set(blocked ? [personId] : []),
    muted: new Set(!ctx.preview && rows.muted_by_viewer === true ? [personId] : []),
    // An accepted connection only, as momentStore.viewerContext reads it (living together isn't a connection); the
    // owner's preview as a connection stands in for one.
    connected: new Set(ctx.preview === 'connection' || (!ctx.preview && ctx.relationship === 'connected') ? [personId] : []),
  };
  const reported = new Set((ctx.preview ? [] : rows.reported_moments || []).map(String));
  const shown = rows.moments.filter((row) => store.momentState(row) === 'live' && store.canSee(row, seeCtx)
    && !reported.has(String(row.id)));
  if (!shown.length) return null;
  return { count: shown.length, placed: shown.filter((row) => store.displayedPoint(row).latitude != null).length };
}

/**
 * What a person's app can't show yet (CONTRACT "# On by default, and what a phone can't show yet"): on their own page
 * only, for each thing waiting for them whose part their app did not name in X-Pantopus-Profile-Parts, a `notice` that
 * opens the web screen for it. No header (a 2.1.5 app) means none. Asks to sign and role asks need one read, made only
 * when the app leaves `credits` or `roles` out; lines waiting for "Show it" come with the page's own rows.
 */
const PARTS_HEADER = 'x-pantopus-profile-parts';
async function noticesFor(req, ctx, sources = {}) {
  const header = req.get?.(PARTS_HEADER);
  if (header === undefined || ctx.view !== 'owner' || ctx.preview) return [];
  const named = new Set(String(header).split(',').map((p) => p.trim().toLowerCase()).filter(Boolean));
  const base = webBase();
  const site = base.replace(/^https?:\/\//, '');
  const work = `${base}/${encodeURIComponent(ctx.username)}?tab=work`;
  const out = [];
  if (profileTiesEnabled() && (!named.has('credits') || !named.has('roles'))) {
    const { asks } = await require('./ties').listAsks(String(ctx.userData.id));
    for (const a of asks) {
      const who = a.from?.name || 'Someone';
      if (a.kind === 'credit' && !named.has('credits')) {
        out.push({ id: `notice_${a.id}`, text: `${who} asked you to sign a piece. Open it on ${site}.`, url: work });
      } else if (a.kind === 'role' && !named.has('roles')) {
        out.push({ id: `notice_${a.id}`, text: `${who} asked ${a.business?.name || 'your business'} to confirm a role. Open it on ${site}.`, url: work });
      }
    }
  }
  if (!named.has('known_for')) {
    for (const t of (sources.knownFor || []).filter((line) => line.status === 'asked')) {
      out.push({ id: `notice_${t.id}`, text: `${t.party_shown?.name || 'Someone'} wrote a line about you. Open it on ${site}.`, url: ctx.shareUrl });
    }
  }
  return out.map((n) => ({ kind: 'notice', id: n.id, text: n.text, link: { kind: 'url', url: n.url, site } }));
}

// "You and <name>" (services/profileInCommon.js). GET /api/users/:id/in-common also refuses a personal block either
// way; that comes with the person's rows (blocked_by_them, blocked_by_viewer). Content: a failure leaves it out.
function readInCommon(viewerUser, targetId) {
  return bounded('inCommon', targetId, () => require('../profileInCommon').inCommon(viewerUser, targetId));
}

/** The person's rows for this viewer (sources.readRows), or throws. */
async function personRows(userId, viewerId, options) {
  const rows = (await readRows([userId], viewerId && String(viewerId) !== String(userId) ? viewerId : null, options))
    .get(String(userId));
  if (!rows) throw new Error('Profile rows missing');
  return rows;
}

// A block either way between a signed-in viewer and the person, as the profile reads count one: Block in the app
// (Relationship), a profile block of any scope, a personal block.
function blockedEitherWay(rows, viewerId) {
  return relationshipStatus(rows.relationship, viewerId) === 'blocked'
    || (rows.profile_blocks || []).length > 0 || rows.blocked_by_them === true || rows.blocked_by_viewer === true;
}

function contextFrom(opened, stored, found) {
  const share = readShare(stored);
  const linksEnabled = share.links_enabled;
  const { shown, userData } = opened;
  const displayName = String(shown.name || '').trim() || opened.username;
  const firstName = firstWord(displayName) || opened.username;
  const accountName = [userData.first_name, userData.last_name].filter(Boolean).join(' ').trim() || userData.name || null;
  return {
    ...opened,
    found,
    parts: share.parts,
    saved: share.saved,
    searchEngines: share.search_engines,
    linksEnabled,
    displayName,
    firstName,
    accountName,
    prompts: serializeProfilePrompts(shown.profile_prompts),
    placeLabel: shown.city ? [shown.city, shown.state].filter(Boolean).join(', ') : null,
    placeState: shown.city ? shown.state : null,
    shareUrl: `${webBase()}/${encodeURIComponent(opened.username)}`,
  };
}

/**
 * Reads everything for one request. `view` forces a view (the share read's visitor). `keyed` opens a link for one
 * purpose: the link view, with that link's parts.
 */
async function loadPage(req, lookup, { view, keyed = null, inCommon: withInCommon = true, notices = false } = {}) {
  const found = keyed ? keyed.found : await findPerson(lookup);
  const userId = found.userData.id;
  const signedIn = req.user?.id ? String(req.user.id) : null;
  const previewing = Boolean(keyed) || view !== undefined || req.query?.as !== undefined;
  const readsForSignedIn = Boolean(signedIn) && !keyed && !(previewing && (view || req.query?.as) === 'link');
  const wantsInCommon = withInCommon && Boolean(signedIn) && signedIn !== String(userId) && !previewing;

  // One database call for the person's content, parts, privacy and Local Profile, and this viewer's side of things
  // (a keyed link reads the caller's side only to refuse a block).
  const rowsViewer = keyed ? signedIn : (previewing ? null : signedIn);
  const rowsRead = personRows(userId, rowsViewer, { reviewers: readsForSignedIn });
  const [opened, rows, inCommonRead] = await Promise.all([
    openFor(req, found, { viewOverride: keyed ? 'link' : view, keyed: Boolean(keyed), rows: rowsRead }),
    rowsRead,
    wantsInCommon ? readInCommon(req.user, userId) : null,
  ]);
  // The viewer whose side the rows carry (none for a preview or a link): an ask shows to the one asked.
  const viewerId = keyed ? null : rowsViewer;
  const sources = await sourcesFrom(userId, rows, { pinned: readsForSignedIn, owner: opened.view === 'owner', viewerId });
  const inCommon = inCommonRead && !(rows.blocked_by_them || rows.blocked_by_viewer) ? inCommonRead : null;
  const ctx = contextFrom(opened, rows.share || null, found);
  ctx.viewerId = viewerId;
  ctx.shelf = require('./shelf').objectsOf(rows.shelf);
  ctx.share = rows.share || null;
  // Doors and cards (phase 3B), none of it while PROFILE_DOORS is off.
  ctx.doorsOn = profileDoorsEnabled();
  if (ctx.doorsOn) {
    const doors = require('./doors');
    const { isLaunchFeatureEnabled } = require('../../utils/featureFlags');
    ctx.doors = doors.storedDoors(rows.doors);
    ctx.cards = opened.view === 'owner' ? doors.cardsFrom(rows) : [];
    ctx.viewerCardAt = rows.viewer_card_at ? localDay(rows.viewer_card_at) : null;
    ctx.canSendCard = isLaunchFeatureEnabled('mailbox') && isLaunchFeatureEnabled('holiday_cards');
  }
  // A block either way between a signed-in viewer and the person: no "Write a line", no doors, no card.
  ctx.blockedEitherWay = Boolean(viewerId) && String(viewerId) !== String(userId) && blockedEitherWay(rows, viewerId);
  if (keyed) {
    // A part the link shows reaches the link view; every other part reaches no one outside (connections is the
    // narrowest setting, and a link is never a connection). Never listed (item 9.5).
    ctx.parts = Object.fromEntries(PART_KEYS.map((key) => [key, keyed.row.parts?.[key] === true ? 'anyone' : 'connections']));
    ctx.searchEngines = false;
    // The person switched the city on for this one link: that decides, not "Who sees your city" (founder 9.2; the
    // main link keeps both checks).
    ctx.cityByPrivacy = true;
  }
  // No profile city: the verified home's city may stand in, only where the home part reaches the view too (compose).
  const home = (sources.homes || []).find((h) => h.city);
  if (home) {
    ctx.homePlaceLabel = [home.city, home.state].filter(Boolean).join(', ');
    ctx.homePlaceState = home.state;
  }
  const record = buildRecord(ctx, sources, { now: new Date() });
  ctx.notices = !notices ? [] : await noticesFor(req, ctx, sources).catch((err) => {
    logger.warn('Profile page notices unavailable; left out', { userId, error: err.message });
    return [];
  });
  const moments = await momentsFor(req, ctx, rows).catch((err) => {
    logger.warn('Profile page Moments row unavailable; left out', { userId, error: err.message });
    return null;
  });
  return { ctx, sources, record, rows, extras: { inCommon, record, moments } };
}

async function getPage(req, lookup) {
  const loaded = await loadPage(req, lookup, { notices: true });
  const page = composePage(loaded.ctx, loaded.sources, loaded.extras);
  return loaded.ctx.preview ? { ...page, preview_as: loaded.ctx.preview } : page;
}

async function getMonth(req, lookup, month) {
  if (!MONTH_RE.test(String(month || ''))) throw new PageRefusal(400, 'MONTH_INVALID', 'Ask for a month as YYYY-MM.');
  // A month has no "You and <name>": don't read it.
  const loaded = await loadPage(req, lookup, { inCommon: false });
  const answer = composeMonth(loaded.ctx, loaded.record, month);
  if (!answer) throw new PageRefusal(404, 'MONTH_NOT_FOUND', 'Nothing to show for that month.');
  return loaded.ctx.preview ? { ...answer, preview_as: loaded.ctx.preview } : answer;
}

async function getPiece(req, lookup, pieceId, { keyed = null } = {}) {
  const found = keyed ? keyed.found : await findPerson(lookup);
  const viewing = keyed || req.query?.as !== undefined ? null : (req.user?.id || null);
  const signedIn = Boolean(req.user?.id) && !keyed && req.query?.as === undefined;
  const rowsRead = personRows(found.userData.id, viewing, { reviewers: signedIn });
  const [opened, rows] = await Promise.all([
    openFor(req, found, keyed ? { viewOverride: 'link', keyed: true, rows: rowsRead } : { rows: rowsRead }),
    rowsRead,
  ]);
  const missing = () => new PageRefusal(404, 'PIECE_NOT_FOUND', 'That piece isn\'t here.');
  const ctx = contextFrom(opened, rows.share || null, found);
  ctx.viewerId = viewing ? String(viewing) : null;
  if (keyed) ctx.parts = Object.fromEntries(PART_KEYS.map((key) => [key, keyed.row.parts?.[key] === true ? 'anyone' : 'connections']));
  // The owner may open their drafts and hidden pieces; nobody else's rows carry them (sources.js).
  const owner = ctx.view === 'owner';
  const candidates = owner ? [...(rows.pieces || []), ...(rows.owner_only_pieces || [])] : (rows.pieces || []);
  const row = candidates.find((r) => String(r.id) === String(pieceId));
  if (!row) throw missing();
  const sources = await sourcesFrom(String(found.userData.id), rows, { pinned: false, owner, viewerId: ctx.viewerId });
  // Someone asked to sign a credit on this piece, or who signed one, may open it (they were shown it when asked);
  // sources.creditsFrom already left out a block either way and their own switch off.
  const party = !owner && Boolean(ctx.viewerId) && sources.credits.some((c) => String(c.piece_id) === String(row.id)
    && String(c.party_user_id) === ctx.viewerId && (c.status === 'asked' || c.status === 'signed'));
  const { attachmentsOf } = require('./pieces');
  const tiesOn = profileTiesEnabled();
  // The owner's piece from a paid job: who hired them, when they could be asked now (a plan suggests nobody).
  const suggest = owner && tiesOn
    ? (row.source_kind === 'gig' && row.source_gig_id
      ? require('./ties').suggestionsFor(String(found.userData.id), [row.source_gig_id]).then((m) => m.get(String(row.source_gig_id)) || [])
      : Promise.resolve([]))
    : Promise.resolve(null);
  const [attachments, suggested] = await Promise.all([attachmentsOf(row), suggest]);
  const answer = composePiece(ctx, row, {
    attachments, reviews: sources.reviews?.rows || [], credits: tiesOn ? sources.credits : null, party, suggested,
  });
  if (!answer) throw missing();
  return ctx.preview ? { ...answer, preview_as: ctx.preview } : answer;
}

// ---------- Known for (CONTRACT P3.2) ----------

/** GET …/known-for: every shown line this viewer may see (the writer's own too), on top first. */
async function getKnownFor(req, lookup, { keyed = null } = {}) {
  const loaded = await loadPage(req, lookup, { inCommon: false, keyed });
  const { ctx } = loaded;
  if (!reaches(ctx.parts, 'known_for', ctx.view)) throw new PageRefusal(404, 'KNOWN_FOR_NOT_FOUND', 'Nothing to show here.');
  const answer = { v: 1, lines: knownForLines(ctx, loaded.sources, loaded.record, ctx.view) };
  return ctx.preview ? { ...answer, preview_as: ctx.preview } : answer;
}

/** The person a writer means, by the page's lookup (their username or account id). */
async function personIdFor(lookup) {
  return String((await findPerson(lookup)).userData.id);
}

// ---------- the work circle (CONTRACT P2.6) ----------

const circleMissing = () => new PageRefusal(404, 'CIRCLE_NOT_FOUND', 'Nothing to show here.');
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET …/circle (and …/circle/:userId): read like the page, under the same viewer rules; no "You and <name>". */
async function getCircle(req, lookup, userId = null, { keyed = null } = {}) {
  if (userId !== null && !ID_RE.test(String(userId))) throw circleMissing();
  const loaded = await loadPage(req, lookup, { inCommon: false, keyed });
  const answer = userId === null ? composeCircle(loaded.ctx, loaded.record, loaded.sources)
    : composeCirclePieces(loaded.ctx, loaded.record, userId);
  if (!answer) throw circleMissing();
  return loaded.ctx.preview ? { ...answer, preview_as: loaded.ctx.preview } : answer;
}

// ---------- share ----------

/** The visitor's page, composed from the owner's reads as a signed-out caller would get it; null if they can't open it. */
async function visitorFrom(loaded) {
  const { ctx, rows } = loaded;
  // As routes/users.js previewProfileAccess('anyone') decides (a public profile that everyone can find), from the
  // settings already read; a page found by its Local Profile asks that function, which reads its own.
  let canOpen;
  if (ctx.found.localProfileRouteMatch) {
    const { previewProfileAccess } = require('../../routes/users').profileReads;
    canOpen = (await previewProfileAccess('anyone', ctx.userData, ctx.found.localProfileRouteMatch)).canOpen;
  } else {
    const findable = rows.privacy?.search_visibility || 'everyone';
    canOpen = (ctx.userData.profile_visibility || 'public') === 'public' && findable !== 'nobody' && findable !== 'mutuals';
  }
  if (!canOpen) return null;
  const visitorCtx = {
    ...ctx,
    view: 'link',
    preview: null,
    cityByPrivacy: ctx.cityLimit === 'anyone',
    relationship: 'none',
    canMessage: false,
    viewerId: null,
  };
  // The visitor's own sources and record: the owner's carry drafts and hidden pieces, a visitor's never do.
  const visitorSources = await sourcesFrom(String(ctx.userData.id), rows, { pinned: false, owner: false });
  return composePage(visitorCtx, visitorSources, { record: buildRecord(visitorCtx, visitorSources, { now: new Date() }), inCommon: null });
}

// The share sheet's Work row (CONTRACT P2.5): "<shown> of your <total> pieces". `total` counts the pieces that are
// finished and not hidden; `shown`, those whose own "who sees it" is anyone, so the row's setting decides the rest.
function workPieces(sources) {
  const live = (sources.pieces || []).filter((row) => row.title && !row.is_draft && row.is_visible !== false);
  return { shown: live.filter((row) => (row.audience || 'anyone') === 'anyone').length, total: live.length };
}

async function shareBody(req) {
  const linksOn = profileLinksEnabled();
  const tiesOn = profileTiesEnabled();
  const [loaded, linkRows] = await Promise.all([
    loadPage(req, { id: req.user.id }),
    linksOn ? links.listRows(req.user.id) : null,
  ]);
  const { ctx } = loaded;
  const content = partContent(ctx, loaded.record);
  // A link for one purpose opens whatever the profile's visibility (founder, SPEC 9.11). Someone whose profile is
  // private or for people on Pantopus only is told so plainly, so nobody shares a link without knowing it opens.
  const linkFields = linksOn ? {
    links_enabled: ctx.linksEnabled,
    links_open: true,
    links_note: linksNote(ctx.userData.profile_visibility),
    links: linkRows.map((row) => links.serialize(row, {
      username: ctx.username, webBase: webBase(), linksEnabled: ctx.linksEnabled, day: links.today(),
    })),
  } : {};
  return {
    v: 1,
    username: ctx.username,
    username_is_made_up: ctx.usernameIsMadeUp,
    url: ctx.shareUrl,
    saved: ctx.saved,
    parts: PART_KEYS.map((key) => ({ key, setting: ctx.parts[key], has_content: Boolean(content[key]) })),
    search_engines: ctx.searchEngines,
    city_limit: ctx.cityLimit,
    visitor: await visitorFrom(loaded),
    work_pieces: workPieces(loaded.sources),
    ...(tiesOn ? { ties_enabled: readShare(loaded.rows.share).ties_enabled } : {}),
    ...(profileKnownForEnabled() ? { known_for_enabled: readShare(loaded.rows.share).known_for_enabled } : {}),
    ...linkFields,
  };
}

async function putShare(req) {
  const stored = await readShareColumn(req.user.id);
  const change = applyShareChange(readShare(stored), req.body, new Date(), {
    links: profileLinksEnabled(), ties: profileTiesEnabled(), knownFor: profileKnownForEnabled(),
  });
  if (change.error) throw new PageRefusal(400, 'PROFILE_SHARE_INVALID', change.error);
  const { error } = await supabaseAdmin.from('User').update({ profile_share: change.value }).eq('id', req.user.id);
  if (error) throw error;
  logger.info('Profile parts saved', { userId: req.user.id });
  return shareBody(req);
}

// ---------- links for one purpose ----------

/** The share sheet's note about links for one purpose, by the profile's visibility (null for a public profile). */
function linksNote(visibility) {
  if (visibility === 'private') return 'Your profile is private. A link for one purpose still opens for anyone who has it.';
  if (visibility === 'registered') {
    return 'Your profile is for people on Pantopus. A link for one purpose still opens for anyone who has it.';
  }
  return null;
}

// The owner's switch for links and the name in their link (the handle others see).
async function ownerLinkFields(req) {
  const [stored, found] = await Promise.all([readShareColumn(req.user.id), findPerson({ id: req.user.id })]);
  return {
    linksEnabled: readShare(stored).links_enabled,
    username: await handleOthersSee(found.userData),
  };
}

async function makeLink(req) {
  const owner = await ownerLinkFields(req);
  const row = await links.createLink(req.user.id, req.body, owner);
  return links.serialize(row, { username: owner.username, webBase: webBase(), linksEnabled: owner.linksEnabled, day: links.today() });
}

async function changeLink(req) {
  const owner = await ownerLinkFields(req);
  const row = await links.updateLink(req.user.id, req.params.id, req.body);
  return links.serialize(row, { username: owner.username, webBase: webBase(), linksEnabled: owner.linksEnabled, day: links.today() });
}

async function removeLink(req) {
  return links.deleteLink(req.user.id, req.params.id);
}

/**
 * A link for one purpose, opened by its key: `what` is 'page', 'piece' or 'month'. Every key that doesn't open gives
 * the same 404, whatever the reason. Counts one open unless the owner opened it, or the web's server read it to draw
 * the link's picture for a chat app or a social site (the share-card marker, trusted only with the edge secret, as
 * routes/public.js trusts it for the Place card): nobody opened the page then.
 */
async function openByKey(req, username, key, what = 'page', arg = null) {
  const row = await links.rowForKey(key);
  let found;
  try {
    found = await findPerson({ username });
  } catch (err) {
    if (err instanceof PageRefusal) throw links.NOT_FOUND();
    throw err;
  }
  if (String(found.userData.id) !== String(row.user_id)) throw links.NOT_FOUND();
  const signedIn = req.user?.id ? String(req.user.id) : null;
  const isOwner = signedIn === String(row.user_id);
  let answer;
  try {
    if (what === 'piece') {
      // The piece read keeps its own rows (no viewer side): check the link with the caller's side first.
      const rows = await personRows(row.user_id, signedIn);
      if ((signedIn && !isOwner && blockedEitherWay(rows, signedIn)) || !links.isLive(row, readShare(rows.share).links_enabled)) {
        throw links.NOT_FOUND();
      }
      answer = await getPiece(req, null, arg, { keyed: { found, row } });
    } else {
      const loaded = await loadPage(req, null, { keyed: { found, row } });
      if ((signedIn && !isOwner && blockedEitherWay(loaded.rows, signedIn)) || !links.isLive(row, loaded.ctx.linksEnabled)) {
        throw links.NOT_FOUND();
      }
      if (what === 'month') {
        if (!MONTH_RE.test(String(arg || ''))) throw new PageRefusal(400, 'MONTH_INVALID', 'Ask for a month as YYYY-MM.');
        answer = composeMonth(loaded.ctx, loaded.record, arg);
        if (!answer) throw new PageRefusal(404, 'MONTH_NOT_FOUND', 'Nothing to show for that month.');
      } else if (what === 'known_for') {
        if (!reaches(loaded.ctx.parts, 'known_for', loaded.ctx.view)) throw new PageRefusal(404, 'KNOWN_FOR_NOT_FOUND', 'Nothing to show here.');
        answer = { v: 1, lines: knownForLines(loaded.ctx, loaded.sources, loaded.record, loaded.ctx.view) };
      } else if (what === 'circle') {
        if (arg !== null && !ID_RE.test(String(arg))) throw circleMissing();
        answer = arg === null ? composeCircle(loaded.ctx, loaded.record, loaded.sources)
          : composeCirclePieces(loaded.ctx, loaded.record, arg);
        if (!answer) throw circleMissing();
      } else {
        answer = composePage(loaded.ctx, loaded.sources, loaded.extras);
      }
    }
  } catch (err) {
    // A key never refuses for the profile's visibility (SPEC 9.11); should any refusal of the page come through, it
    // reads as a link that doesn't work, like every other closed key.
    if (err instanceof PageRefusal && err.code === 'PROFILE_PRIVATE') throw links.NOT_FOUND();
    throw err;
  }
  const shareCard = req.viaWebEdge === true && req.get('x-pantopus-share-card') === '1';
  if (!isOwner && what === 'page' && !shareCard) links.countOpen(row.id);
  return answer;
}

module.exports = {
  getPage, getMonth, getPiece, getCircle, getKnownFor, personIdFor, shareBody, putShare, readShareColumn, PageRefusal, cityLimit,
  makeLink, changeLink, removeLink, openByKey, LinkRefusal: links.LinkRefusal,
};
