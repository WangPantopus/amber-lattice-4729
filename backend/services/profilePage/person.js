/**
 * Who the page is about and who is asking (CONTRACT.md sections 1 and 4). The person is found and opened exactly as
 * today's profile reads find and open them (routes/users.js `sendPublicProfile`): the same lookups, the same access
 * rules, the same name others see. A failed privacy read throws, and the route answers 503.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const { isConnected, shareHome, isUnpublishedBusiness, getRelationshipStatus, canMessageUser } = require('../../utils/visibilityPolicy');
const { isMadeUpUsername, chosenUsernameOrNull } = require('../../utils/personalUsername');

// Lazy: routes/users.js requires this folder for rule 4.7.
const reads = () => require('../../routes/users').profileReads;

const PREVIEW_VIEWS = ['link', 'member', 'connection'];
// The old reads' Preview-as audience for each view (utils/profilePreview.js).
const PREVIEW_AUDIENCE = { link: 'anyone', member: 'neighbors', connection: 'connections' };

class PageRefusal extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const NOT_FOUND = () => new PageRefusal(404, 'PROFILE_NOT_FOUND', 'This profile isn\'t here.');

/** The person behind `:username` or `/id/:id`, as the old reads find them, or throws PageRefusal. */
async function findPerson({ username, id }) {
  const { PUBLIC_USER_PROFILE_SELECT, getLocalProfileByLegacyRouteHandle, getLocalProfileByLegacyRouteId, isNotAnIdError } = reads();
  let userData = null;
  let localProfileRouteMatch = null;
  const byId = id !== undefined;
  const first = await supabaseAdmin
    .from('User')
    .select(PUBLIC_USER_PROFILE_SELECT)
    .eq(byId ? 'id' : 'username', byId ? id : username)
    .maybeSingle();
  if (first.error && !(byId && isNotAnIdError(first.error))) throw first.error;
  userData = first.data || null;
  if (!userData) {
    localProfileRouteMatch = byId ? await getLocalProfileByLegacyRouteId(id) : await getLocalProfileByLegacyRouteHandle(username);
    if (localProfileRouteMatch?.user_id) {
      const second = await supabaseAdmin
        .from('User')
        .select(PUBLIC_USER_PROFILE_SELECT)
        .eq('id', localProfileRouteMatch.user_id)
        .maybeSingle();
      if (second.error) throw second.error;
      userData = second.data || null;
    }
  }
  if (!userData) throw NOT_FOUND();
  if (userData.account_type === 'business' || userData.account_type === 'curator') {
    if (userData.account_type === 'business' && await isUnpublishedBusiness(userData.id)) throw NOT_FOUND();
    throw new PageRefusal(404, 'PROFILE_PAGE_NOT_PERSONAL', 'This is a business on Pantopus.');
  }
  return { userData, localProfileRouteMatch };
}

/** `?as=` for the owner: { preview } or throws PageRefusal. */
function previewFor(req, ownerId) {
  const as = req.query?.as;
  if (as === undefined) return null;
  if (typeof as !== 'string' || !PREVIEW_VIEWS.includes(as)) {
    throw new PageRefusal(400, 'PREVIEW_AUDIENCE_INVALID',
      'Preview your page as anyone with the link, someone on Pantopus or a connection.');
  }
  if (!req.user?.id || String(req.user.id) !== String(ownerId)) {
    throw new PageRefusal(403, 'PREVIEW_OWNER_ONLY', 'Only you can preview your page.');
  }
  return as;
}

async function readPrivacy(userId) {
  const { data, error } = await supabaseAdmin
    .from('UserPrivacySettings')
    .select('show_neighborhood, search_visibility')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || {};
}

/** "Who sees your city" as the widest view it allows: anyone | connections | none. */
function cityLimit(settings) {
  const level = settings?.show_neighborhood || 'followers';
  if (level === 'public') return 'anyone';
  if (level === 'followers' || level === 'connections') return 'connections';
  return 'none';
}

/**
 * Opens the page for this request: the view, whether they may open it, the name others see and what the view needs
 * for its actions. Throws PageRefusal (403 PROFILE_PRIVATE when they may not open it).
 */
async function openFor(req, found, { viewOverride } = {}) {
  const { userData, localProfileRouteMatch } = found;
  const { PREVIEW_VIEWER_ID } = require('../../utils/profilePreview');
  const {
    canAccessPublicUserProfile, canAccessLegacyLocalProfileRoute, applyLocalProfilePublicOverlay,
    withLocalProfileNameForViewer, previewProfileAccess,
  } = reads();
  const preview = viewOverride || previewFor(req, userData.id);
  const signedIn = req.user?.id || null;
  const viewerId = preview ? (preview === 'link' ? null : PREVIEW_VIEWER_ID) : signedIn;
  const isOwner = !preview && viewerId === userData.id;
  // The name others see, read as someone who isn't the owner (the owner's page shows that name too).
  const othersSee = isOwner ? PREVIEW_VIEWER_ID : viewerId;

  const [canOpen, privacy, household, connected, relationship, canMessage, shown] = await Promise.all([
    (async () => {
      if (isOwner) return true;
      if (preview) return (await previewProfileAccess(PREVIEW_AUDIENCE[preview], userData, localProfileRouteMatch)).canOpen;
      if (localProfileRouteMatch) return canAccessLegacyLocalProfileRoute(localProfileRouteMatch, viewerId, userData);
      return canAccessPublicUserProfile(viewerId, userData.id, userData.profile_visibility || 'public');
    })(),
    readPrivacy(userData.id),
    !preview && viewerId && !isOwner ? shareHome(viewerId, userData.id) : false,
    !preview && viewerId && !isOwner ? isConnected(viewerId, userData.id) : false,
    !preview && viewerId && !isOwner ? getRelationshipStatus(viewerId, userData.id, { forViewer: true }) : 'none',
    !preview && viewerId && !isOwner ? canMessageUser(viewerId, userData.id) : false,
    withLocalProfileNameForViewer(applyLocalProfilePublicOverlay(userData, localProfileRouteMatch), userData, othersSee,
      localProfileRouteMatch),
  ]);
  if (!canOpen) throw new PageRefusal(403, 'PROFILE_PRIVATE', 'This profile is private');

  let view;
  if (isOwner) view = 'owner';
  else if (preview) view = preview;
  else if (!viewerId) view = 'link';
  else if (household) view = 'household';
  else if (connected) view = 'connection';
  else view = 'member';

  const limit = cityLimit(privacy);
  const cityByPrivacy = view === 'owner' || limit === 'anyone'
    || (limit === 'connections' && (view === 'connection' || view === 'household'));

  return {
    view,
    preview,
    viewerId: preview ? null : signedIn,
    userData,
    shown,
    privacy,
    cityLimit: limit,
    cityByPrivacy,
    relationship: preview === 'connection' ? 'connected' : relationship,
    canMessage: preview === 'connection' ? true : canMessage,
    username: chosenUsernameOrNull(shown.username) || shown.username,
    usernameIsMadeUp: isMadeUpUsername(shown.username, userData.email),
  };
}

module.exports = { findPerson, openFor, PageRefusal, cityLimit, readPrivacy, PREVIEW_VIEWS };
