// ============================================================
// CARD EMAIL RETRY JOB
// Tries again the emails of Christmas cards by email that didn't go out (services/cardEmail): every 10 minutes, up to
// holidayCards.EMAIL_TRIES tries in all, one card at a time. After the last try its sender is told, once for all their
// cards that gave up in this run (a list sent during a mail server outage is one notice, not 20), and their Sent offers
// Email it again or Take it back.
// ============================================================

const cardEmail = require('../services/cardEmail');
const logger = require('../utils/logger');
const { areLaunchFeaturesEnabled } = require('../utils/featureFlags');

async function cardEmailRetry() {
  if (!areLaunchFeaturesEnabled(['mailbox', 'holiday_cards'])) return;
  let due;
  try {
    due = await cardEmail.dueForRetry(new Date());
  } catch (err) {
    logger.error('[CardEmailRetry] Could not read cards to retry', { error: err.message });
    return;
  }
  if (!due.length) return;
  let sent = 0;
  let failed = 0;
  const gaveUp = new Map();
  for (const mail of due) {
    try {
      const result = await cardEmail.deliver(mail);
      if (result.sent) sent += 1;
      else if (!result.skipped) failed += 1;
      if (result.gaveUp) gaveUp.set(mail.sender_user_id, [...(gaveUp.get(mail.sender_user_id) || []), result.gaveUp]);
    } catch (err) {
      failed += 1;
      logger.warn('[CardEmailRetry] Retry failed', { mailId: mail.id, error: err.message });
    }
  }
  for (const [senderId, cards] of gaveUp) await cardEmail.tellSender(senderId, cards);
  logger.info('[CardEmailRetry] Done', { due: due.length, sent, failed, gaveUp: [...gaveUp.values()].flat().length });
}

module.exports = cardEmailRetry;
