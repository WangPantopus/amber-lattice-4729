/**
 * "Share later" pushes (every minute; services/moments/momentSchedule.js). A Moment held until a time its author picked
 * goes live on its own at that time (every read works it out from post_metadata.moment.share_at); this tick only sends
 * the push to the author's connections then, once (momentNotify marks the Moment it notified, or why it didn't). A
 * time missed by more than SHARE_PUSH_WINDOW_MS (the jobs were off) sends nothing: like any Moment push, a late one is
 * dropped, not held. A long video's later parts never notify (its first part does).
 */

const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const store = require('../services/moments/momentStore');
const momentNotify = require('../services/moments/momentNotify');

const SHARE_PUSH_WINDOW_MS = 30 * 60 * 1000;
const SHARE_AT = 'post_metadata->moment->>share_at';
const MAX_PER_TICK = 200;

async function momentsShareLater() {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT)
    .eq('is_story', true)
    .is('archived_at', null)
    .eq('moderation_state', 'live')
    .eq('post_metadata->moment->>state', 'live')
    .is('post_metadata->moment->>notify', null)
    .lte(SHARE_AT, nowIso)
    .gte(SHARE_AT, new Date(now - SHARE_PUSH_WINDOW_MS).toISOString())
    .gt('story_expires_at', nowIso)
    .order(SHARE_AT, { ascending: true })
    .limit(MAX_PER_TICK);
  if (error) throw new Error(`Failed to read Moments shared later: ${error.message}`);
  let told = 0;
  for (const row of data || []) {
    if (Number(store.meta(row).series?.index) > 1 || store.momentState(row) !== 'live') continue;
    await momentNotify.notifyConnections(row);
    told += 1;
  }
  if (told) logger.info('[momentsShareLater] done', { told });
}

module.exports = momentsShareLater;
