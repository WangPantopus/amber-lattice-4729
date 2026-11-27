'use strict';

const db = require('../../config/supabaseAdmin');
const { runLimited } = require('../../utils/runLimited');

// Recipients of one bulk notice checked at the same time. Each check is a few reads for that one person.
const RECIPIENTS_AT_ONCE = 25;

function referencesPost(notification) {
  return Boolean(notification.metadata?.post_id || notification.metadata?.plan_id
    || /^\/(?:app\/)?(?:posts|plans)\/[0-9a-fA-F-]{36}(?:\/|$)/.test(notification.link || ''));
}

// Use the same current database predicate as the inbox, before anything leaves
// the server through sockets, desktop alerts or push. Unrelated notices need no
// home lookup. Group a bulk fanout by recipient, never reuse another viewer's grants.
async function readableNotifications(notifications) {
  const groups = new Map();
  const allowed = new Set();
  for (const notification of notifications) {
    if (!referencesPost(notification)) {
      allowed.add(notification.id);
      continue;
    }
    const ids = groups.get(notification.user_id) || [];
    ids.push(notification.id);
    groups.set(notification.user_id, ids);
  }
  if (groups.size) {
    // notificationService participates in the persona lifecycle import cycle.
    const { notificationPostFilter } = require('./readAccess');
    // Each recipient's own filter and read, as before, but several recipients at once: one after another, a notice
    // to 200 people waited for 200 people's reads in turn before anything left the server.
    await runLimited([...groups], RECIPIENTS_AT_ONCE, async ([userId, ids]) => {
      const filter = await notificationPostFilter(userId);
      const { data, error } = await filter(db.from('Notification').select('id')
        .eq('user_id', userId).in('id', ids));
      if (error) throw error; // The caller suppresses emission on a failed privacy check.
      for (const row of data || []) allowed.add(row.id);
    });
  }
  return notifications.filter(notification => allowed.has(notification.id));
}

module.exports = { readableNotifications };
