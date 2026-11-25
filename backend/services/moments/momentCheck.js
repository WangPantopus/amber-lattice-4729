// The automatic picture check (build brief "Safety"): before a photo or video Moment goes live, Claude looks at the
// photo, or at a video's poster and two frames, for nudity and sexual content, graphic violence and hate symbols. A
// picture it flags is held for review (moderation_state 'held') and lands in the report queue; one it passes goes
// live. If the check can't run (no key, a timeout, an outage), the Moment goes live and the cleanup job checks it
// again later (jobs/momentsCleanup.js).

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { getAnthropicClient, resolveModel, CHAT_MODEL } = require('../../config/anthropic');
const { complete, AIRefusalError } = require('../ai/llm');
const store = require('./momentStore');
const media = require('./momentMedia');
const penName = require('../penName');

const MODEL = resolveModel(process.env.ANTHROPIC_MOMENTS_CHECK_MODEL, CHAT_MODEL);
const TIMEOUT_MS = 20 * 1000;
// Checks after the first that couldn't run; then the Moment stays as it is.
const MAX_ATTEMPTS = 6;
const REASONS = ['nudity', 'sexual', 'minor_safety', 'violence', 'gore', 'hate_symbol', 'self_harm', 'other'];
const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ok', 'hold'] },
    reasons: { type: 'array', items: { type: 'string', enum: REASONS } },
  },
  required: ['verdict', 'reasons'],
  additionalProperties: false,
};
const SYSTEM = `You check pictures before they appear on Pantopus Moments: short-lived photos and videos that neighbors share on a local map. You see one photo, or a video's poster frame and two more frames from it.

Answer "hold" (with every reason that applies) when any picture shows:
- nudity: exposed genitals, female nipples or bare buttocks ("nudity")
- sexual acts, sexual touching or sexually explicit poses ("sexual")
- anything sexual or suggestive involving someone who may be under 18 ("minor_safety")
- graphic violence: a person or animal being hurt, a weapon aimed at someone ("violence")
- serious injury, blood, gore or a dead body ("gore")
- hate symbols or hateful slogans, such as a swastika, a burning cross or white-power signs ("hate_symbol")
- self-harm or suicide ("self_harm")
- anything else clearly unsafe to show neighbors ("other")

Everything else is "ok" with no reasons: everyday scenes, people in ordinary clothes or swimwear at a pool or beach, art and statues, food, pets, streets, traffic, weather, events, sports, costumes, crowds and peaceful protests. When you are unsure whether a picture crosses one of these lines, answer "hold".`;

/**
 * Checks base64 JPEGs from one Moment: { status: 'passed' | 'flagged' | 'unchecked', reasons }.
 * 'unchecked' means the check couldn't run; it never throws.
 */
// A Moment under a made-up name (services/penName) hides who made it, so its pictures are also checked for what would
// point at a private person or a home.
const MADE_UP_NAME_NOTE = ' This Moment is posted under a made-up name, so the people who see it cannot tell who made it. For this one, also answer "hold" with the reason "other" when a picture shows a readable license plate, a house number or a street address on a home, mail or a document or screen with a person\'s name or address, or a close-up of one private person\'s face.';

async function checkPictures(images, { madeUpName = false } = {}) {
  const blocks = (images || []).filter(Boolean)
    .map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }));
  if (!blocks.length) return { status: 'unchecked', reasons: [], error: 'no pictures' };
  const client = getAnthropicClient();
  if (!client) return { status: 'unchecked', reasons: [], error: 'no client' };
  try {
    const { text } = await complete({
      client,
      model: MODEL,
      system: SYSTEM,
      messages: [{ role: 'user', content: [...blocks,
        { type: 'text', text: `Check the pictures of this one Moment.${madeUpName ? MADE_UP_NAME_NOTE : ''}` }] }],
      effort: 'low',
      schema: SCHEMA,
      maxTokens: 1024,
      timeoutMs: TIMEOUT_MS,
      cacheSystem: false,
    });
    const answer = JSON.parse(text);
    if (answer?.verdict === 'ok') return { status: 'passed', reasons: [] };
    if (answer?.verdict === 'hold') {
      const reasons = (Array.isArray(answer.reasons) ? answer.reasons : []).filter((r) => REASONS.includes(r));
      return { status: 'flagged', reasons: reasons.length ? reasons : ['other'] };
    }
    return { status: 'unchecked', reasons: [], error: 'no verdict' };
  } catch (error) {
    // Claude declining to describe the pictures is itself a reason for a person to look.
    if (error instanceof AIRefusalError) return { status: 'flagged', reasons: ['other'], refused: true };
    logger.warn('moments.check_unavailable', { error: error.message });
    return { status: 'unchecked', reasons: [], error: error.name || 'error' };
  }
}

// The account the automatic check reports as (the Pantopus curator), so a flagged Moment waits in the same report
// queue as reported ones. Looked up once.
let reporterRead = null;
function checkReporterId() {
  if (!reporterRead) {
    reporterRead = supabaseAdmin.from('User').select('id').eq('account_type', 'curator').limit(1).maybeSingle()
      .then(({ data }) => data?.id || null)
      .catch(() => null);
    reporterRead.then((id) => { if (!id) reporterRead = null; });
  }
  return reporterRead;
}

async function reportFlagged(row, reasons) {
  const reporterId = await checkReporterId();
  const details = `Automatic picture check: ${reasons.join(', ')}`;
  try {
    if (reporterId && reporterId !== row.user_id) {
      await require('../postReportService').filePostReport({ postId: row.id, userId: reporterId, reason: 'inappropriate', details });
    } else {
      await require('../adminAlerts').notifyReportToReview({ kind: 'post', reason: 'inappropriate', reportId: null });
    }
  } catch (error) {
    logger.warn('moments.check_report_failed', { momentId: row.id, error: error.message });
  }
}

// After this many tries that couldn't run, a Moment's check gives up ('unavailable'): it stays live, reports still
// hold it, and the job stops trying.
function checkRecord(row, result) {
  const before = store.meta(row).check || {};
  const attempts = (Number(before.attempts) || 0) + 1;
  return {
    status: result.status === 'unchecked' && attempts > MAX_ATTEMPTS ? 'unavailable' : result.status,
    reasons: result.reasons || [],
    checked_at: new Date().toISOString(),
    attempts,
  };
}

/** The first check's answer, when the upload finishes: the Moment goes live, held first if the check flagged it. */
async function finishUpload(row, result) {
  const check = checkRecord(row, result);
  // Under a made-up name a picture nothing could look at never shows: the Moment waits (the cleanup job tries again
  // every couple of minutes) and, once the check has given up, ends with its files.
  if (penName.isPenNameRow(row) && result.status === 'unchecked') {
    if (check.status === 'unavailable') {
      await store.deleteMoment(row);
      logger.info('moments.checked', { momentId: row.id, status: 'ended_unchecked' });
      return null;
    }
    logger.info('moments.checked', { momentId: row.id, status: 'waiting_unchecked' });
    return store.updateMoment(row, { moment: { check, checking_since: new Date().toISOString() } }, { archived_at: null });
  }
  if (result.status === 'flagged') {
    await store.hold(row, 'moment_picture_check', 'Hidden while Pantopus reviews it after the automatic picture check.');
  }
  const updated = await store.goLive(row, check);
  if (result.status === 'flagged') await reportFlagged(row, check.reasons);
  logger.info('moments.checked', { momentId: row.id, status: result.status });
  // Live now, unless the check held it: the author's connections hear of it (never of a held one, nor later when a
  // hold is released). On its own, after this answer. A long video's later parts say nothing: its first part did.
  const laterPart = Number(store.meta(row).series?.index) > 1;
  if (updated && result.status !== 'flagged' && !laterPart && !penName.isPenNameRow(row)) {
    require('./momentNotify').notifyConnections(updated);
  }
  return updated;
}

/** A later check of a live Moment the first check couldn't read: a flag holds it; its time doesn't change. */
async function applyRecheck(row, result) {
  const check = checkRecord(row, result);
  if (result.status === 'flagged') {
    await store.hold(row, 'moment_picture_check', 'Hidden while Pantopus reviews it after the automatic picture check.');
    await reportFlagged(row, check.reasons);
  }
  return store.updateMoment(row, { moment: { check } });
}

/** The pictures the check reads, from storage: the photo, or a video's poster and frames. */
async function storedPictures(row) {
  const stored = store.meta(row).media;
  if (!stored) return [];
  const keys = store.meta(row).kind === 'video' ? [stored.poster_key, ...(stored.frame_keys || [])] : [stored.key];
  const pictures = [];
  for (const key of keys.filter(Boolean)) {
    pictures.push(await media.checkImage(await media.download(stored.bucket, key)));
  }
  return pictures;
}

module.exports = { checkPictures, finishUpload, applyRecheck, storedPictures, MAX_ATTEMPTS, REASONS };
