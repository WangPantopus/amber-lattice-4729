'use strict';

/**
 * Plans for the holidays, the extras: photos afterwards (docs/product/plans-holidays/08-extras.md, section 5; the
 * founder's go on November 15 and 16, 2026). Behind `plans_photos`, read for the plan's host, **and** a private bucket:
 * with none set (or a public one), the feature is off for that environment whatever the switch says, so a photo is
 * never stored at a public address.
 *
 *  - Storage: the private bucket Moments use (momentMedia: MOMENTS_BUCKET or HOME_DOCUMENTS_BUCKET, checked to be
 *    private), under plan-photos/<plan>/<person>/; read through links signed for minutes. Every picture is cleaned of
 *    its metadata and passes the check Moments' pictures pass (a picture the check holds is not added).
 *  - Plan.photos: { rev, items: [{ id, by, key, thumb_key, w, h, at }], notice_sent_at }, at most 200 a plan and 30 a
 *    person.
 *  - From the plan's end, for 60 days, a person with an account who was in at the end, and the host, may add. They and
 *    guests who were in may look. Whoever added a picture, and the host, may remove it. Not shared outside the plan,
 *    and not a Moment.
 */

const crypto = require('crypto');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { recordFunnelEvent } = require('../funnelEvents');
const planService = require('./planService');
const planNotify = require('./planNotifications');
const rules = require('./planRules');
const extras = require('./planExtras');

const actions = () => require('./planActions');
const media = () => require('../moments/momentMedia');

const FLAG = 'plans_photos';
const COLUMN = 'photos';
const LIMITS = Object.freeze({ perPlan: 200, perPerson: 30, days: 60 });
const DAY_MS = 24 * 60 * 60 * 1000;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png' };

const fail = (status, code, message, extra) => {
  const { PlanError } = actions();
  throw new PlanError(status, code, message, extra);
};
const nowIso = () => new Date().toISOString();

/** The switch, read for the host, and a private bucket in this environment. */
async function enabledFor(hostId) {
  if (!(await extras.enabledFor(FLAG, hostId))) return false;
  return storageReady();
}
async function storageReady() {
  try {
    await media().privateBucket();
    return true;
  } catch (_) {
    return false;
  }
}
async function switchByHost(hostIds) {
  const out = await extras.switchByHost(FLAG, hostIds);
  if ([...out.values()].some(Boolean) && !(await storageReady())) for (const k of out.keys()) out.set(k, false);
  return out;
}

const itemsOf = (value) => (value && Array.isArray(value.items) ? value.items : []);
const endMs = (plan) => new Date(plan.post.event_end_date).getTime();
/** Over (by time or by the tick), not cancelled. */
const isOver = (plan) => plan.status !== 'cancelled' && !(plan.date_options && !plan.date_options.picked)
  && rules.planState(plan, plan.post.event_date, plan.post.event_end_date) === 'ended';
const addingOpen = (plan) => isOver(plan) && Date.now() < endMs(plan) + LIMITS.days * DAY_MS;

// ── Who ──────────────────────────────────────────────────────

/** The signed-in caller on an ended plan: the host, or an account that was in at the end. */
async function personFor(user, postId) {
  const viewer = await require('./planViewer').loadViewer(user);
  if (!planService.isUuid(postId)) fail(404, 'not_found', "This plan isn't available.");
  const plan = await planService.loadPlanRow(postId);
  if (!plan || !planService.isVisibleTo(plan, viewer, { involved: await planService.isInvolved(plan, viewer) })) {
    fail(404, 'not_found', "This plan isn't available.");
  }
  if (!extras.takesExtras(plan) || !(await enabledFor(plan.host_user_id))) fail(404, 'not_found', "This isn't available right now.");
  if (!isOver(plan)) fail(409, 'not_over', 'Photos open once the plan is over.');
  if (String(plan.host_user_id) === viewer.id) return { viewer, plan, role: 'host', key: extras.personKey(viewer.id) };
  const { data: request, error } = await supabaseAdmin.from('PlanRequest').select('id, status')
    .eq('post_id', postId).eq('user_id', viewer.id).maybeSingle();
  if (error) throw new Error(`Failed to load your request: ${error.message}`);
  if (!request || request.status !== 'accepted') fail(403, 'not_in', 'Only the people who came can see these.');
  return { viewer, plan, role: 'guest', key: extras.personKey(viewer.id) };
}

/** A guest without an account who was in, by their key: looks, never adds. */
async function guestFor(postId, secret) {
  const { plan, key } = await extras.guestFor(postId, secret, FLAG);
  if (!(await storageReady())) fail(404, 'not_found', "This plan isn't available.");
  if (!isOver(plan)) fail(409, 'not_over', 'Photos open once the plan is over.');
  return { plan, key };
}

// ── Reading ──────────────────────────────────────────────────

async function namesOf(plan, items) {
  const ids = [...new Set(items.filter((i) => i.by.startsWith('p:')).map((i) => i.by.slice(2)))];
  const names = await actions().userNames(ids);
  return (key) => actions().firstOf(names.get(key.slice(2)));
}

/** "23 from 5 people". */
function countText(items) {
  const people = new Set(items.map((i) => i.by)).size;
  return `${items.length} from ${people} ${people === 1 ? 'person' : 'people'}`;
}

/** The grid: signed links that last minutes, for someone allowed to look. */
async function gridFor(plan, { mineKey, isHost, canAdd }) {
  const items = itemsOf(plan.photos);
  const bucket = await media().privateBucket();
  const links = await media().signedLinks(bucket, items.flatMap((i) => [i.key, i.thumb_key]).filter(Boolean));
  const nameOf = await namesOf(plan, items);
  return {
    photos: items.map((i) => ({
      id: i.id, url: links.get(i.key) || null, thumb_url: links.get(i.thumb_key) || links.get(i.key) || null,
      w: i.w || null, h: i.h || null, by_name: nameOf(i.by), mine: i.by === mineKey, can_remove: isHost || i.by === mineKey, at: i.at,
    })),
    count: items.length,
    text: countText(items),
    can_add: Boolean(canAdd),
    note: 'Only the people who came can see these. They stay with the plan.',
    expires_in: media().LINK_SECONDS,
  };
}

/** GET /api/plans/:id/photos: the host and accounts that were in. */
async function list(user, postId) {
  const { plan, role, key } = await personFor(user, postId);
  return gridFor(plan, { mineKey: key, isHost: role === 'host', canAdd: addingOpen(plan) && mineCount(plan, key) < LIMITS.perPerson });
}

/** GET /api/public/plans/:id/photos: a guest who was in, by their key. Looks only: "Add yours in the app." */
async function guestList(postId, secret) {
  const { plan, key } = await guestFor(postId, secret);
  return { ...(await gridFor(plan, { mineKey: key, isHost: false, canAdd: false })), add_text: 'Add yours in the app.' };
}

const mineCount = (plan, key) => itemsOf(plan.photos).filter((i) => i.by === key).length;

/**
 * The card's photos on a plan that is over (with `extras=1`, for the host and people who were in): the banner, the
 * count, whether this reader may add. The pictures themselves come from GET …/photos (links that last minutes).
 */
function cardView(plan, { mineKey, comeCount }) {
  if (!isOver(plan)) return null;
  const items = itemsOf(plan.photos);
  const tz = rules.timezoneForPlan(plan);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(plan.post.event_date));
  return {
    count: items.length,
    text: countText(items),
    banner: `This was ${day}`,
    came_text: `${comeCount} ${comeCount === 1 ? 'person' : 'people'} came`,
    can_add: addingOpen(plan) && mineCount(plan, mineKey) < LIMITS.perPerson,
    note: 'Only the people who came can see these. They stay with the plan.',
  };
}

// ── Adding and removing ──────────────────────────────────────

/**
 * POST /api/plans/:id/photos (one picture a call, `file`): cleaned of its metadata, checked, stored privately with a
 * thumbnail. Answers the grid.
 */
async function add(user, postId, file) {
  const { plan, role, key } = await personFor(user, postId);
  if (!addingOpen(plan)) fail(409, 'closed', 'Photos can be added for 60 days after the plan.');
  if (!file) fail(400, 'validation', 'Send the picture as "file".');
  const m = media();
  if (!['image/jpeg', 'image/heic', 'image/heif', 'image/png'].includes(file.mimetype)) fail(415, 'unreadable', 'Send a JPEG, HEIC or PNG photo.');
  if (file.size > m.MAX_PHOTO_BYTES) fail(413, 'too_large', 'This photo is too large to add.');
  const items = itemsOf(plan.photos);
  if (items.length >= LIMITS.perPlan) fail(409, 'too_many', `A plan can keep up to ${LIMITS.perPlan} photos.`);
  if (mineCount(plan, key) >= LIMITS.perPerson) fail(409, 'too_many', `You can add up to ${LIMITS.perPerson} photos to a plan.`);
  const { cleanUploadedPhoto, MediaNotCleanedError } = require('../photoMetadata');
  try {
    await cleanUploadedPhoto(file);
  } catch (err) {
    if (err instanceof MediaNotCleanedError) fail(err.status || 415, 'unreadable', err.message);
    throw err;
  }
  const facts = await m.photoFacts(file.buffer);
  const ext = EXT[file.mimetype] || 'jpg';
  // The check Moments' pictures pass: a picture it holds is not added.
  const check = await require('../moments/momentCheck').checkPictures([await m.checkImage(file.buffer)]);
  if (check.status === 'flagged') {
    recordFunnelEvent('plan_photo_held', { meta: { plan_id: plan.post_id, reasons: check.reasons } });
    fail(422, 'held', 'This picture can’t be added to the plan.');
  }
  const bucket = await m.privateBucket();
  const digest = m.sha256(file.buffer);
  const folder = `plan-photos/${plan.post_id}/${key.slice(2)}`;
  const photoKey = `${folder}/${digest}.${ext}`;
  await m.put(bucket, photoKey, file.buffer, file.mimetype);
  const thumb = await m.thumbnail(file.buffer);
  const thumbKey = thumb ? `${folder}/thumb-${digest}.jpg` : null;
  if (thumb) await m.put(bucket, thumbKey, thumb, 'image/jpeg');
  const item = { id: crypto.randomBytes(6).toString('hex'), by: key, key: photoKey, thumb_key: thumbKey, w: facts.width, h: facts.height,
    at: nowIso(), ...(check.status === 'unchecked' ? { unchecked: true } : {}) };
  await extras.swap(plan.post_id, COLUMN, (current) => {
    const now = itemsOf(current);
    if (now.some((i) => i.key === photoKey)) return undefined;
    if (now.length >= LIMITS.perPlan) fail(409, 'too_many', `A plan can keep up to ${LIMITS.perPlan} photos.`);
    if (now.filter((i) => i.by === key).length >= LIMITS.perPerson) fail(409, 'too_many', `You can add up to ${LIMITS.perPerson} photos to a plan.`);
    return { rev: 0, ...(current || {}), items: [...now, item] };
  });
  recordFunnelEvent('plan_photo_added', { userId: key.slice(2), meta: { plan_id: plan.post_id, by: role } });
  const fresh = await planService.loadPlanRow(plan.post_id);
  return gridFor(fresh, { mineKey: key, isHost: role === 'host', canAdd: addingOpen(fresh) && mineCount(fresh, key) < LIMITS.perPerson });
}

/** DELETE /api/plans/:id/photos/:photoId: whoever added it, or the host. The files go too. */
async function remove(user, postId, photoId) {
  const { plan, role, key } = await personFor(user, postId);
  let gone = null;
  await extras.swap(plan.post_id, COLUMN, (current) => {
    const now = itemsOf(current);
    const item = now.find((i) => i.id === photoId);
    if (!item) fail(404, 'not_found', 'That photo isn’t there any more.');
    if (role !== 'host' && item.by !== key) fail(403, 'not_yours', 'Only the person who added it, or the host, can remove it.');
    gone = item;
    return { ...current, items: now.filter((i) => i.id !== photoId) };
  });
  if (gone) await media().removeKeys(await media().privateBucket(), [gone.key, gone.thumb_key].filter(Boolean)).catch(() => false);
  const fresh = await planService.loadPlanRow(plan.post_id);
  return gridFor(fresh, { mineKey: key, isHost: role === 'host', canAdd: addingOpen(fresh) && mineCount(fresh, key) < LIMITS.perPerson });
}

// ── The day after ────────────────────────────────────────────

/**
 * The Plans tick: once, the day after a plan ends, people who came hear "Photos from {title}" / "{Name} added {14}. Add
 * yours and keep them together." when someone added any. {Name} is whoever added the most (the host when it's a tie).
 */
async function sendDayAfter() {
  const now = Date.now();
  const { data, error } = await supabaseAdmin.from('Plan').select(planService.PLAN_SELECT)
    .not('photos', 'is', null).neq('status', 'cancelled').is('photos->>notice_sent_at', null)
    .lte('post.event_end_date', new Date(now - DAY_MS).toISOString())
    .gt('post.event_end_date', new Date(now - 3 * DAY_MS).toISOString()).limit(100);
  if (error) throw new Error(`Failed to read plans with photos: ${error.message}`);
  let sent = 0;
  for (const plan of data || []) {
    try {
      const items = itemsOf(plan.photos);
      if (!items.length || !extras.takesExtras(plan) || !(await enabledFor(plan.host_user_id))) continue;
      // Once: only the tick that marks it sends.
      let won = false;
      await extras.swap(plan.post_id, COLUMN, (current) => {
        if (!current || current.notice_sent_at) return undefined;
        won = true;
        return { ...current, notice_sent_at: nowIso() };
      });
      if (!won) continue;
      const counts = new Map();
      for (const i of items) counts.set(i.by, (counts.get(i.by) || 0) + 1);
      const hostKey = extras.personKey(plan.host_user_id);
      const top = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] === hostKey ? -1 : b[0] === hostKey ? 1 : 0))[0];
      const nameOf = await namesOf(plan, items);
      const requests = (await actions().activeRequests(plan.post_id)).filter((r) => r.status === 'accepted');
      const people = [hostKey, ...requests.map((r) => extras.personKey(r.user_id))];
      for (const who of [...new Set(people)]) {
        const row = await planNotify.notify({
          userId: who.slice(2),
          type: 'plan_photos',
          title: `Photos from ${plan.post.title}`,
          body: `${nameOf(top[0])} added ${top[1]}. Add yours and keep them together.`,
          link: `/plans/${plan.post_id}`,
          plan,
          recipientIsIn: true,
          metadata: { opens: 'plan', photos: items.length },
          idempotencyKey: `plan_photos:${plan.post_id}:${who}`,
        });
        if (row) sent += 1;
      }
    } catch (err) {
      logger.warn('plans.photos.day_after_failed', { planId: plan?.post_id, error: err.message });
    }
  }
  return sent;
}

module.exports = {
  FLAG,
  LIMITS,
  enabledFor,
  storageReady,
  switchByHost,
  isOver,
  cardView,
  list,
  guestList,
  add,
  remove,
  sendDayAfter,
};
