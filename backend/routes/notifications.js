/**
 * Notification Routes
 *
 * GET    /api/notifications              — list notifications (paginated, unread count)
 * PATCH  /api/notifications/:id/read     — mark single as read
 * POST   /api/notifications/read-all     — mark all as read
 * DELETE /api/notifications/:id          — delete single
 * POST   /api/notifications/register     — register a device token (APNs/FCM/Expo)
 * POST   /api/notifications/push-token   — register Expo push token (legacy)
 * DELETE /api/notifications/push-token   — unregister Expo push token (legacy)
 */

const express = require('express');
const Joi = require('joi');
const router = express.Router();
const supabaseAdmin = require('../config/supabaseAdmin');
const verifyToken = require('../middleware/verifyToken');
const logger = require('../utils/logger');
const { NOTIFICATION_LIST } = require('../utils/columns');
const pushService = require('../services/pushService');
const badgeService = require('../services/badgeService');
const directDb = require('../config/directDb');
const { notificationBlockFilter, blockedUserIds, blockedIdsFromRows } = require('../services/blockService');
const { notificationPostFilter, postScopeAccess } = require('../services/pulse/readAccess');
const { areaContextFromRows } = require('../services/pulse/areas');
const {
  excludeHiddenLaunchNotifications, isLaunchFeatureEnabled, hiddenLaunchNotificationTypes, isAudienceNotificationStreamEnabled,
} = require('../utils/featureFlags');

const FIREWALL_VALUES = ['personal', 'audience', 'platform'];
const CONTEXT_INPUT = ['all', ...FIREWALL_VALUES];
const LEGACY_CONTEXT_TYPES = ['personal', 'business'];
const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(Number.MAX_SAFE_INTEGER).default(20),
  offset: Joi.number().integer().min(0).max(2147483597).default(0),
});

function parseFirewallFilter(req, { allowMultiple = false } = {}) {
  const contextRaw = req.query.context ?? req.body?.context;
  const firewallRaw = req.query.firewall ?? req.body?.firewall;
  const contextsRaw = req.query.contexts ?? req.body?.contexts;
  const raw = contextsRaw ?? contextRaw ?? firewallRaw;

  if (raw === undefined || raw === null || raw === '') return { contexts: null };

  const values = Array.isArray(raw)
    ? raw
    : String(raw).split(',').map((value) => value.trim()).filter(Boolean);

  if (values.length === 0 || values.includes('all')) return { contexts: null };
  if (!allowMultiple && values.length > 1) return { error: 'invalid context' };

  for (const value of values) {
    if (!FIREWALL_VALUES.includes(value)) return { error: 'invalid context' };
  }
  return { contexts: values };
}

function applyNotificationFilters(query, {
  contextType,
  contextId,
  contexts,
}) {
  let next = query;
  if (contextType === 'personal') {
    next = next.eq('context_type', 'personal');
  } else if (contextType === 'business') {
    next = next.eq('context_type', 'business');
    if (contextId) next = next.eq('context_id', contextId);
  }
  if (contexts?.length === 1) {
    next = next.eq('context', contexts[0]);
  } else if (contexts?.length > 1) {
    next = next.in('context', contexts);
  }
  return next;
}

// The assistant's brief and nudges (services/ai/nudges/engine.js TYPES) open the
// apps' assistant thread, pantopus://assistant?nudge=<id>, and its yearly memory
// review opens the apps' memory list (pantopus://settings/memory): the web has neither. The web asks for its list, counts and "Mark all read" without them
// (exclude=assistant); the apps send nothing and get every row, as before. A standing
// rule's notices (assistant_rule: runs, pauses, pickup reminders) open the apps' rules list,
// a plan or Today, and the web leaves them out too.
const ASSISTANT_TYPES = ['assistant_brief', 'assistant_nudge', 'assistant_memory_review', 'assistant_rule'];
function withoutAssistantRows(query, req) {
  if ((req.query.exclude ?? req.body?.exclude) !== 'assistant') return query;
  return query.not('type', 'in', `(${ASSISTANT_TYPES.join(',')})`);
}

/**
 * GET /api/notifications
 * Returns notifications for the current user + unread count.
 * Query params:
 *   limit  — max results (default 20, max 50)
 *   offset — pagination offset (default 0)
 *   unread — if "true", only return unread
 *   context — 'all' | 'personal' | 'audience' | 'platform' (default 'all')
 *     P2.3 / unified-IA §6: filters Notification.context (the firewall
 *     column from P0.6). Personal-zone bell scopes to personal+platform;
 *     Audience-zone megaphone scopes to audience only.
 *   context_type — 'personal' | 'business' (legacy Identity Firewall axis)
 *     Filters the older context_type column. Independent of `context`;
 *     both compose. Renamed in P2.3 to avoid colliding with the firewall
 *     param above; previously this was also called `context`.
 *   context_id — business_user_id to filter business notifications
 *   firewall — alias for `context` kept for P0.6 internal callers.
 *     New code should pass `context` instead.
 *   exclude — 'assistant' leaves out the assistant's brief and nudges, in the
 *     list and its unread count (the web, which can't open them).
 *   after — only what's new (Instant Screens contract §8): a notification id
 *     the client already has, or an ISO time; returns the notifications
 *     newer than it, newest first (offset is ignored; hasMore means more new
 *     ones than `limit`, so reload the list). An id that isn't one of the
 *     caller's notifications answers 400 NOTIFICATION_CURSOR_UNKNOWN.
 */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})$/;
const NOTIFICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const pagination = paginationSchema.validate({ limit: req.query.limit, offset: req.query.offset });
    if (pagination.error) {
      return res.status(400).json({
        error: 'Invalid pagination. Use a positive whole-number limit and a non-negative offset within the supported range.',
        code: 'INVALID_PAGINATION',
      });
    }
    const limit = Math.min(pagination.value.limit, 50);
    const offset = pagination.value.offset;
    const unreadOnly = req.query.unread === 'true';
    const contextType = req.query.context_type; // legacy 'personal' | 'business'
    const contextId = req.query.context_id;

    // Firewall filter accepts either ?context= (new, preferred) or
    // ?firewall= (P0.6-era internal callers). Validate strictly so
    // typos surface as 400 instead of returning the unfiltered list.
    const contextRaw = req.query.context ?? req.query.firewall;
    if (contextRaw !== undefined && contextRaw !== null && contextRaw !== '' && !CONTEXT_INPUT.includes(contextRaw)) {
      return res.status(400).json({ error: 'invalid context' });
    }
    if (contextType && !LEGACY_CONTEXT_TYPES.includes(contextType)) {
      return res.status(400).json({ error: 'invalid context_type' });
    }
    const contexts = contextRaw && contextRaw !== 'all' ? [contextRaw] : null;

    let after = null;
    const afterRaw = typeof req.query.after === 'string' ? req.query.after.trim() : '';
    if (afterRaw) {
      if (NOTIFICATION_ID.test(afterRaw)) {
        const { data: anchor, error: anchorError } = await supabaseAdmin
          .from('Notification')
          .select('id, created_at')
          .eq('id', afterRaw)
          .eq('user_id', userId)
          .maybeSingle();
        if (anchorError) {
          logger.error('Error reading notification cursor', { error: anchorError.message, userId });
          throw anchorError;
        }
        if (!anchor) {
          return res.status(400).json({ error: 'Unknown notification; reload the list.', code: 'NOTIFICATION_CURSOR_UNKNOWN' });
        }
        after = anchor;
      } else if (ISO_TIME.test(afterRaw) && Number.isFinite(Date.parse(afterRaw))) {
        after = { created_at: afterRaw };
      } else {
        return res.status(400).json({ error: 'invalid after' });
      }
    }

    // Get notifications
    let query = supabaseAdmin
      .from('Notification')
      .select(NOTIFICATION_LIST)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      // Notifications written together share created_at; without a tiebreak "load more" can repeat one and skip others.
      .order('id', { ascending: false })
      .range(after ? 0 : offset, (after ? 0 : offset) + limit - 1);
    if (after?.id) {
      // Newer in the list's order: a later time, or the same time with a later id.
      query = query.or(`created_at.gt."${after.created_at}",and(created_at.eq."${after.created_at}",id.gt.${after.id})`);
    } else if (after) {
      query = query.gt('created_at', after.created_at);
    }

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    query = withoutAssistantRows(applyNotificationFilters(query, { contextType, contextId, contexts }), req);
    // Launch cuts: notifications that only a hidden feature produces are left out.
    query = excludeHiddenLaunchNotifications(query);
    // So are notices from someone across a block, in either direction. Both filters use one read of the block list
    // and are built together.
    const blocked = blockedUserIds(userId);
    const [withoutBlocked, readablePost] = await Promise.all([
      notificationBlockFilter(userId, blocked),
      notificationPostFilter(userId, blocked),
    ]);
    query = readablePost(withoutBlocked(query));

    // Get unread count (always, for the badge), read alongside the page
    let countQuery = supabaseAdmin
      .from('Notification')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    countQuery = withoutAssistantRows(applyNotificationFilters(countQuery, { contextType, contextId, contexts }), req);
    countQuery = readablePost(withoutBlocked(excludeHiddenLaunchNotifications(countQuery)));

    const [{ data: notifications, error }, { count: unreadCount, error: countErr }] = await Promise.all([query, countQuery]);

    if (error || countErr) throw error || countErr;

    res.json({
      notifications: notifications || [],
      unreadCount: unreadCount || 0,
      hasMore: (notifications || []).length === limit,
    });
  } catch (err) {
    logger.error('Notifications fetch error', { error: err.message });
    res.status(503).json({ error: 'Could not load notifications right now. Please try again.', code: 'NOTIFICATIONS_UNAVAILABLE' });
  }
});

/**
 * GET /api/notifications/unread-count
 * Quick endpoint for the bell badge — returns the total + a per-firewall
 * breakdown (P2.3 / unified-IA §6.1: separate streams for personal vs
 * audience, never combined). Existing callers reading `count` keep working.
 * `?exclude=assistant` leaves the assistant's brief and nudges out (the web).
 *
 *   { count: 12, byContext: { personal: 9, audience: 3, platform: 0 } }
 */
// The badge counts through the Data API: the block list and the Pulse read scope (both filters are built together from
// one read of the block list), then the four counts in one round.
async function apiUnreadCounts(userId, req) {
  // Launch cuts: hidden notification types stay out of the badge counts, and so do notices from
  // someone across a block. Both filters use one read of the block list and are built together.
  const blocked = blockedUserIds(userId);
  const [withoutBlocked, readablePost] = await Promise.all([
    notificationBlockFilter(userId, blocked),
    notificationPostFilter(userId, blocked),
  ]);
  const baseFilter = (q) => readablePost(withoutBlocked(excludeHiddenLaunchNotifications(withoutAssistantRows(q
    .from('Notification')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false), req))));

  const [totalRes, personalRes, audienceRes, platformRes] = await Promise.all([
    baseFilter(supabaseAdmin),
    baseFilter(supabaseAdmin).eq('context', 'personal'),
    baseFilter(supabaseAdmin).eq('context', 'audience'),
    baseFilter(supabaseAdmin).eq('context', 'platform'),
  ]);

  const firstError = [totalRes, personalRes, audienceRes, platformRes]
    .map((r) => r && r.error)
    .find(Boolean);
  if (firstError) {
    throw firstError;
  }

  return {
    total: totalRes.count || 0,
    byContext: {
      personal: personalRes.count || 0,
      audience: audienceRes.count || 0,
      platform: platformRes.count || 0,
    },
    blocked: await blocked,
  };
}

// The same counts on a direct connection (config/directDb.js), in two queries. First the rows the filters are built
// from, as the Data API sends them (json_agg, so text timestamps): this person's UserBlock rows, their active
// occupancies with Pulse's HOME_SELECT columns (oldest first), their default Home and pulse_user_home_area_context's
// rows. The block list and the read scope are then decided by the same code as above (blockedIdsFromRows,
// areaContextFromRows, postScopeAccess).
const UNREAD_INPUTS_SQL = `
select
  (select coalesce(json_agg(json_build_object('blocker_user_id', b.blocker_user_id, 'blocked_user_id', b.blocked_user_id)), '[]')
   from "UserBlock" b where b.blocker_user_id = $1 or b.blocked_user_id = $1) as blocks,
  (select coalesce(json_agg(o order by o.created_at, o.home_id), '[]') from (
     select o.home_id, o.user_id, o.is_active, o.role, o.role_base, o.verification_status, o.verification_source,
       o.verified_at, o.start_at, o.end_at, o.access_start_at, o.access_end_at, o.created_at, o.fast_check_kind,
       o.fast_check_at, o.fast_check_expires_at, o.fast_check_recheck_due_at, o.fast_check_confirmed_at,
       case when h.id is null then null
         else json_build_object('id', h.id, 'home_status', h.home_status, 'security_state', h.security_state) end as home
     from "HomeOccupancy" o left join "Home" h on h.id = o.home_id
     where o.user_id = $1 and o.is_active = true) o) as occupancies,
  (select json_build_object('default_home_id', p.default_home_id)
   from "UserNotificationPreferences" p where p.user_id = $1) as preferences,
  (select coalesce(json_agg(a), '[]') from public.pulse_user_home_area_context($1) a) as areas`;

// Then the four counts in one pass, with every filter apiUnreadCounts applies, written as PostgREST writes them
// (NOT ... = ANY for not.in, <> for neq, so a missing value is left out the same way). The post-access field is
// computed once per row. $2 assistant types (empty unless ?exclude=assistant), $3 hidden launch types, $4 whether
// audience notices are hidden, $5 the block list, $6 and $7 the read scope's verified towns and areas.
const UNREAD_COUNTS_SQL = `
select count(*) as total,
  count(*) filter (where n.context = 'personal') as personal,
  count(*) filter (where n.context = 'audience') as audience,
  count(*) filter (where n.context = 'platform') as platform
from "Notification" n
cross join lateral (select public.pulse_notification_post_access(n) as a) p
where n.user_id = $1 and n.is_read = false
  and not (n.type = any($2::text[]))
  and not (n.type = any($3::text[]))
  and (not $4::boolean or n.context <> 'audience')
  and (cardinality($5::text[]) = 0 or n.metadata->>'user_id' is null or not (n.metadata->>'user_id' = any($5::text[])))
  and (p.a->>'read_scope' is null or p.a->>'read_scope' = 'public' or p.a->>'user_id' = $1::text
    or (p.a->>'read_scope' = 'verified_town' and p.a->>'pulse_post_town_id' = any($6::text[]))
    or (p.a->>'read_scope' = 'verified_area' and p.a->>'area_id' = any($7::text[])))
  and (p.a->>'moderation_state' is null or p.a->>'moderation_state' = 'live' or p.a->>'user_id' = $1::text)
  and (p.a->>'reply_moderation_state' is null or p.a->>'reply_moderation_state' = 'live'
    or p.a->>'reply_user_id' = $1::text)
  and p.a->>'withdrawn' is null
  and (cardinality($5::text[]) = 0 or p.a->>'user_id' is null or not (p.a->>'user_id' = any($5::text[])))
  and (cardinality($5::text[]) = 0 or p.a->>'reply_user_id' is null or not (p.a->>'reply_user_id' = any($5::text[])))`;

async function directUnreadCounts(userId, req) {
  const [inputs] = await directDb.read('unread_inputs', UNREAD_INPUTS_SQL, [userId]);
  const blocked = blockedIdsFromRows(userId, inputs.blocks);
  const context = await areaContextFromRows(inputs.occupancies, inputs.preferences, { value: inputs.areas });
  const access = await postScopeAccess(userId, context);
  const assistant = (req.query.exclude ?? req.body?.exclude) === 'assistant' ? ASSISTANT_TYPES : [];
  const [row] = await directDb.read('unread_counts', UNREAD_COUNTS_SQL, [userId, assistant,
    hiddenLaunchNotificationTypes(), !isAudienceNotificationStreamEnabled(), [...blocked], [...access.townIds],
    [...access.areaIds]]);
  return {
    total: Number(row.total),
    byContext: { personal: Number(row.personal), audience: Number(row.audience), platform: Number(row.platform) },
    blocked,
  };
}

// Which parts of two answers differ (shadow mode): the four counts and the block list they were filtered by.
function unreadCountsDiffer(a, b) {
  const view = (c) => ({ total: c.total, ...c.byContext, blocked: [...c.blocked].sort() });
  const [x, y] = [view(a), view(b)];
  return Object.keys(x).filter((key) => JSON.stringify(x[key]) !== JSON.stringify(y[key]));
}

// DIRECT_DB_READS (config/directDb.js) picks the path, as for the Home access check (utils/homePermissions.js). "on":
// the direct reads, falling back to the Data API on any failure. "shadow": the Data API answers and the direct reads
// are compared with it.
async function unreadCounts(userId, req) {
  const mode = directDb.mode();
  if (mode === 'on') {
    try {
      return await directUnreadCounts(userId, req);
    } catch (error) {
      directDb.fellBack('unread_count', error);
      return apiUnreadCounts(userId, req);
    }
  }
  if (mode !== 'shadow') return apiUnreadCounts(userId, req);
  const started = performance.now();
  const direct = directUnreadCounts(userId, req)
    .then((counts) => ({ counts, ms: performance.now() - started }), (error) => ({ error }));
  const api = await apiUnreadCounts(userId, req);
  const apiMs = performance.now() - started;
  direct.then(({ counts, ms, error }) => directDb.compared('unread_count', error
    ? { error } : { differs: unreadCountsDiffer(api, counts), directMs: ms, apiMs }));
  return api;
}

router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const { total, byContext } = await unreadCounts(req.user.id, req);
    res.json({ count: total, total, byContext });
  } catch (err) {
    logger.error('Unread count error', { error: err.message });
    res.status(503).json({ error: 'Could not load notifications right now. Please try again.', code: 'NOTIFICATIONS_UNAVAILABLE' });
  }
});

/**
 * GET /api/notifications/no-bid-nudge-check
 * Lightweight check used by the mobile floating-modal trigger.
 * Returns whether the user has an unread no_bid_gig_nudge notification
 * and whether they have a verified home address.
 */
router.get('/no-bid-nudge-check', verifyToken, async (req, res) => {
  try {
    // Launch cut #4 (Open Gigs): the no-bid modal is hidden for the first launch.
    if (!isLaunchFeatureEnabled('open_gigs')) return res.json({ eligible: false });
    const userId = req.user.id;

    const { count, error } = await supabaseAdmin
      .from('Notification')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', 'no_bid_gig_nudge')
      .eq('is_read', false);

    if (error || !count) {
      return res.json({ eligible: false });
    }

    // Check if user has an active, verified home
    const { count: homeCount } = await supabaseAdmin
      .from('HomeOccupancy')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('verification_status', 'verified');

    return res.json({ eligible: true, hasHome: (homeCount || 0) > 0 });
  } catch (err) {
    logger.error('No-bid nudge check error', { error: err.message });
    return res.json({ eligible: false });
  }
});

/**
 * POST /api/notifications/no-bid-nudge-mark-read
 * Marks all unread no_bid_gig_nudge notifications as read for the user.
 * Called by the mobile floating-modal trigger after the modal is shown
 * (or was already dismissed) to prevent blocking lower-priority promos.
 */
router.post('/no-bid-nudge-mark-read', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const { error } = await supabaseAdmin
      .from('Notification')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('type', 'no_bid_gig_nudge')
      .eq('is_read', false);

    if (error) {
      logger.error('Failed to mark no-bid nudge read', { error: error.message });
      return res.status(500).json({ error: 'update_failed' });
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.error('No-bid nudge mark-read error', { error: err.message });
    return res.status(500).json({ error: 'internal' });
  }
});

/**
 * Persistent login (migration 160): the client device UUID that owns a push
 * token — body `deviceId`, else the `X-Device-Id` header native clients send
 * on every request. Stored on PushToken.device_id so device revoke / local
 * logout with proof can delete exactly that device's tokens. Optional and
 * validated loosely (UUID); anything else is ignored rather than rejected so
 * legacy clients keep registering.
 */
const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function deviceIdFromRequest(req) {
  const raw = req.body?.deviceId ?? (typeof req.get === 'function' ? req.get('x-device-id') : req.headers?.['x-device-id']);
  const value = typeof raw === 'string' ? raw.trim() : '';
  return DEVICE_ID_RE.test(value) ? value.toLowerCase() : undefined;
}

/**
 * POST /api/notifications/register
 * Unified device-token registration for native push (APNs/FCM) and the
 * legacy Expo path. The iOS and Android clients both POST here.
 * Body: { token: string, platform?: "ios"|"android", provider?: "apns"|"fcm"|"expo", deviceId?: uuid }
 * Header: X-Device-Id (used when body.deviceId is absent)
 *
 * `platform`/`provider` are persisted so the send path can route the
 * token to the right transport; either may be omitted and is derived
 * from the other (or from the token format for Expo tokens).
 */
router.post('/register', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, platform, provider } = req.body || {};

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Push token is required' });
    }
    if (platform && !['ios', 'android'].includes(String(platform).toLowerCase())) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    if (provider && !['apns', 'fcm', 'expo'].includes(String(provider).toLowerCase())) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    const saved = await pushService.saveToken(userId, token, { platform, provider, deviceId: deviceIdFromRequest(req) });
    if (!saved) {
      return res.status(400).json({ error: 'Invalid push token' });
    }

    // Registration also runs automatically on app open and token rotation.
    // Initialize defaults only for a new preference row; an existing opt-out
    // belongs to the user and must survive device registration. Resolve this
    // atomically so a concurrent settings save cannot be overwritten.
    await supabaseAdmin
      .from('MailPreferences')
      .upsert(
        { user_id: userId, push_notifications: true, updated_at: new Date().toISOString() },
        { onConflict: 'user_id', ignoreDuplicates: true },
      )
      .then(({ error: prefErr }) => {
        if (prefErr) logger.warn('Failed to initialize push preference', { error: prefErr.message, userId });
      });

    res.json({ message: 'Device registered for push', pushToken: saved });
  } catch (err) {
    logger.error('Device registration error', { error: err.message });
    res.status(500).json({ error: 'Failed to register device' });
  }
});

/**
 * POST /api/notifications/push-token
 * Register an Expo push token for the current user.
 * Body: { token: "ExponentPushToken[...]" }
 */
router.post('/push-token', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Push token is required' });
    }

    const saved = await pushService.saveToken(userId, token, { deviceId: deviceIdFromRequest(req) });
    if (!saved) {
      return res.status(400).json({ error: 'Invalid push token format' });
    }

    // Legacy token refreshes must preserve an existing account-level opt-out
    // too. Only initialize defaults if no preference row exists.
    await supabaseAdmin
      .from('MailPreferences')
      .upsert(
        { user_id: userId, push_notifications: true, updated_at: new Date().toISOString() },
        { onConflict: 'user_id', ignoreDuplicates: true },
      )
      .then(({ error: prefErr }) => {
        if (prefErr) logger.warn('Failed to initialize push preference', { error: prefErr.message, userId });
      });

    res.json({ message: 'Push token registered', pushToken: saved });
  } catch (err) {
    logger.error('Push token registration error', { error: err.message });
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

/**
 * DELETE /api/notifications/push-token
 * Unregister an Expo push token (e.g. on logout).
 * Body: { token: "ExponentPushToken[...]" }
 */
router.delete('/push-token', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Push token is required' });
    }

    await pushService.removeToken(userId, token);
    res.json({ message: 'Push token removed' });
  } catch (err) {
    logger.error('Push token removal error', { error: err.message });
    res.status(500).json({ error: 'Failed to remove push token' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const readablePost = await notificationPostFilter(userId);
    const withoutBlocked = await notificationBlockFilter(userId);
    const { data, error } = await readablePost(withoutBlocked(supabaseAdmin
      .from('Notification')
      .update({ is_read: true })))
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) {
      logger.error('Error marking notification read', { error: error.message, id });
      return res.status(500).json({ error: 'Failed to update notification' });
    }
    // Not this person's, or deleted elsewhere (e.g. on the web, then tapped on the phone).
    if (!data) return res.status(404).json({ error: 'Notification not found' });

    // Open tabs and other devices learn the new unread count (their bells kept the old one).
    badgeService.emitBadgeUpdate(userId);
    res.json({ notification: data });
  } catch (err) {
    logger.error('Mark read error', { error: err.message });
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read for the current user. Optional body/query:
 *   context | contexts | firewall — personal/audience/platform/all
 *   context_type/context_id       — legacy personal/business sub-filter
 *   exclude=assistant             — leaves the assistant's brief and nudges unread (the web)
 */
router.post('/read-all', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const contextType = req.query.context_type ?? req.body?.context_type;
    const contextId = req.query.context_id ?? req.body?.context_id;
    if (contextType && !LEGACY_CONTEXT_TYPES.includes(contextType)) {
      return res.status(400).json({ error: 'invalid context_type' });
    }
    const parsed = parseFirewallFilter(req, { allowMultiple: true });
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    let query = supabaseAdmin
      .from('Notification')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    query = withoutAssistantRows(applyNotificationFilters(query, {
      contextType,
      contextId,
      contexts: parsed.contexts,
    }), req);

    const { error } = await query;

    if (error) {
      logger.error('Error marking all read', { error: error.message, userId });
      return res.status(500).json({ error: 'Failed to mark all as read' });
    }

    badgeService.emitBadgeUpdate(userId);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    logger.error('Mark all read error', { error: err.message });
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a single notification.
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('Notification')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');

    if (error) {
      logger.error('Error deleting notification', { error: error.message, id });
      return res.status(500).json({ error: 'Failed to delete notification' });
    }
    // Not this person's, or already deleted elsewhere: nothing was deleted, as mark-read answers.
    if (!data || data.length === 0) return res.status(404).json({ error: 'Notification not found' });

    badgeService.emitBadgeUpdate(userId);
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    logger.error('Delete notification error', { error: err.message });
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;
