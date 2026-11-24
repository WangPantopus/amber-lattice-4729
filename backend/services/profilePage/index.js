/**
 * The profile page (~/pantopus-profile-sources/CONTRACT.md, frozen v1): one read composes the page for whoever asks.
 * The person, the privacy checks and every content source are read at once (SPEC 4.13); a content source that is slow
 * or fails leaves its lines out, a privacy check that fails fails the read.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { serializeProfilePrompts } = require('../../utils/profilePrompts');
const { findPerson, openFor, PageRefusal, cityLimit, handleOthersSee } = require('./person');
const { readSources, bounded } = require('./sources');
const { readShare, applyShareChange, PART_KEYS } = require('./parts');
const links = require('./links');
const { profileLinksEnabled } = require('../../utils/featureFlags');
const { buildRecord, composePage, composeMonth, composePiece, partContent, firstWord } = require('./compose');

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

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

// "You and <name>" (services/profileInCommon.js), with the checks GET /api/users/:id/in-common makes beyond opening the
// profile: a personal block either way. Content: a failure leaves the block out.
async function readInCommon(viewerUser, targetId) {
  return bounded('inCommon', targetId, async () => {
    const blockService = require('../blockService');
    const { inCommon } = require('../profileInCommon');
    const [blocked, result] = await Promise.all([blockService.isBlocked(viewerUser.id, targetId), inCommon(viewerUser, targetId)]);
    return blocked ? null : result;
  });
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
async function loadPage(req, lookup, { view, keyed = null } = {}) {
  const found = keyed ? keyed.found : await findPerson(lookup);
  const userId = found.userData.id;
  const signedIn = req.user?.id ? String(req.user.id) : null;
  const previewing = Boolean(keyed) || view !== undefined || req.query?.as !== undefined;
  const readsForSignedIn = Boolean(signedIn) && !keyed && !(previewing && (view || req.query?.as) === 'link');
  const wantsInCommon = Boolean(signedIn) && signedIn !== String(userId) && !previewing;

  const [opened, stored, sources, inCommon] = await Promise.all([
    openFor(req, found, { viewOverride: keyed ? 'link' : view, keyed: Boolean(keyed) }),
    readShareColumn(userId),
    readSources(userId, { pinned: readsForSignedIn, reviewerNames: readsForSignedIn }),
    wantsInCommon ? readInCommon(req.user, userId) : null,
  ]);
  const ctx = contextFrom(opened, stored, found);
  if (keyed) {
    // A part the link shows reaches the link view; every other part reaches no one outside (connections is the
    // narrowest setting, and a link is never a connection). Never listed (item 9.5).
    ctx.parts = Object.fromEntries(PART_KEYS.map((key) => [key, keyed.row.parts?.[key] === true ? 'anyone' : 'connections']));
    ctx.searchEngines = false;
  }
  // No profile city: the verified home's city may stand in, only where the home part reaches the view too (compose).
  const home = (sources.homes || []).find((h) => h.city);
  if (home) {
    ctx.homePlaceLabel = [home.city, home.state].filter(Boolean).join(', ');
    ctx.homePlaceState = home.state;
  }
  const record = buildRecord(ctx, sources, { now: new Date() });
  return { ctx, sources, record, extras: { inCommon, record } };
}

async function getPage(req, lookup) {
  const loaded = await loadPage(req, lookup);
  const page = composePage(loaded.ctx, loaded.sources, loaded.extras);
  return loaded.ctx.preview ? { ...page, preview_as: loaded.ctx.preview } : page;
}

async function getMonth(req, lookup, month) {
  if (!MONTH_RE.test(String(month || ''))) throw new PageRefusal(400, 'MONTH_INVALID', 'Ask for a month as YYYY-MM.');
  const loaded = await loadPage(req, lookup);
  const answer = composeMonth(loaded.ctx, loaded.record, month);
  if (!answer) throw new PageRefusal(404, 'MONTH_NOT_FOUND', 'Nothing to show for that month.');
  return loaded.ctx.preview ? { ...answer, preview_as: loaded.ctx.preview } : answer;
}

async function getPiece(req, lookup, pieceId, { keyed = null } = {}) {
  const found = keyed ? keyed.found : await findPerson(lookup);
  const [opened, stored, pieceRead] = await Promise.all([
    openFor(req, found, keyed ? { viewOverride: 'link', keyed: true } : {}),
    readShareColumn(found.userData.id),
    supabaseAdmin.from('UserPortfolio')
      .select('id, user_id, title, description, portfolio_type, media_urls, thumbnail_url, file_ids, skills_used, '
        + 'external_url, github_url, demo_url, completed_at, created_at, is_visible')
      .eq('id', pieceId)
      .eq('user_id', found.userData.id)
      .eq('is_visible', true)
      .maybeSingle(),
  ]);
  const missing = () => new PageRefusal(404, 'PIECE_NOT_FOUND', 'That piece isn\'t here.');
  if (pieceRead.error) {
    if (pieceRead.error.code === '22P02') throw missing();
    throw pieceRead.error;
  }
  if (!pieceRead.data) throw missing();
  const ctx = contextFrom(opened, stored, found);
  if (keyed) ctx.parts = Object.fromEntries(PART_KEYS.map((key) => [key, keyed.row.parts?.[key] === true ? 'anyone' : 'connections']));
  const answer = composePiece(ctx, pieceRead.data);
  if (!answer) throw missing();
  return ctx.preview ? { ...answer, preview_as: ctx.preview } : answer;
}

// ---------- share ----------

/** The visitor's page, composed from the owner's reads as a signed-out caller would get it; null if they can't open it. */
async function visitorFrom(loaded) {
  const { previewProfileAccess } = require('../../routes/users').profileReads;
  const { ctx } = loaded;
  const access = await previewProfileAccess('anyone', ctx.userData, ctx.found.localProfileRouteMatch);
  if (!access.canOpen) return null;
  const visitorCtx = {
    ...ctx,
    view: 'link',
    preview: null,
    cityByPrivacy: ctx.cityLimit === 'anyone',
    relationship: 'none',
    canMessage: false,
  };
  const visitorSources = { ...loaded.sources, pinned: null };
  return composePage(visitorCtx, visitorSources, { record: loaded.record, inCommon: null });
}

async function shareBody(req) {
  const linksOn = profileLinksEnabled();
  const [loaded, linkRows] = await Promise.all([
    loadPage(req, { id: req.user.id }),
    linksOn ? links.listRows(req.user.id) : null,
  ]);
  const { ctx } = loaded;
  const content = partContent(ctx, loaded.record);
  const linkFields = linksOn ? {
    links_enabled: ctx.linksEnabled,
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
    ...linkFields,
  };
}

async function putShare(req) {
  const stored = await readShareColumn(req.user.id);
  const change = applyShareChange(readShare(stored), req.body, new Date(), { links: profileLinksEnabled() });
  if (change.error) throw new PageRefusal(400, 'PROFILE_SHARE_INVALID', change.error);
  const { error } = await supabaseAdmin.from('User').update({ profile_share: change.value }).eq('id', req.user.id);
  if (error) throw error;
  logger.info('Profile parts saved', { userId: req.user.id });
  return shareBody(req);
}

// ---------- links for one purpose ----------

// The owner's switch for links and the name in their link (the handle others see).
async function ownerLinkFields(req) {
  const [stored, found] = await Promise.all([readShareColumn(req.user.id), findPerson({ id: req.user.id })]);
  return { linksEnabled: readShare(stored).links_enabled, username: await handleOthersSee(found.userData) };
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
 * the same 404, whatever the reason. Counts one open unless the owner opened it.
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
  const [stored, blocked] = await Promise.all([
    readShareColumn(row.user_id),
    signedIn && !isOwner ? blockedEitherWay(signedIn, row.user_id) : false,
  ]);
  if (blocked || !links.isLive(row, readShare(stored).links_enabled)) throw links.NOT_FOUND();
  let answer;
  try {
    if (what === 'piece') {
      answer = await getPiece(req, null, arg, { keyed: { found, row } });
    } else {
      const loaded = await loadPage(req, null, { keyed: { found, row } });
      if (what === 'month') {
        if (!MONTH_RE.test(String(arg || ''))) throw new PageRefusal(400, 'MONTH_INVALID', 'Ask for a month as YYYY-MM.');
        answer = composeMonth(loaded.ctx, loaded.record, arg);
        if (!answer) throw new PageRefusal(404, 'MONTH_NOT_FOUND', 'Nothing to show for that month.');
      } else {
        answer = composePage(loaded.ctx, loaded.sources, loaded.extras);
      }
    }
  } catch (err) {
    // A private profile behind a live key reads as a link that doesn't work, like every other closed key.
    if (err instanceof PageRefusal && err.code === 'PROFILE_PRIVATE') throw links.NOT_FOUND();
    throw err;
  }
  if (!isOwner && what === 'page') links.countOpen(row.id);
  return answer;
}

// A block either way, as the profile reads count one: Block in the app, a profile block of any scope, a personal block.
async function blockedEitherWay(viewerId, personId) {
  const { isScopedBlocked } = require('../../utils/visibilityPolicy');
  const blockService = require('../blockService');
  const [scoped, personal] = await Promise.all([
    isScopedBlocked(viewerId, personId, 'any'),
    blockService.isBlocked(viewerId, personId),
  ]);
  return scoped || personal;
}

module.exports = {
  getPage, getMonth, getPiece, shareBody, putShare, readShareColumn, PageRefusal, cityLimit,
  makeLink, changeLink, removeLink, openByKey, LinkRefusal: links.LinkRefusal,
};
