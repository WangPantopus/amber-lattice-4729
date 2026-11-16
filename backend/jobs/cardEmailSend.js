// ============================================================
// CARD EMAIL SEND JOB
// Every 5 minutes, sends the emails of Christmas cards by email that are due (services/cardEmail): those set for the
// sender's 7 a.m. or Christmas morning once that time has come, and those that didn't go out, tried again every 10
// minutes up to holidayCards.EMAIL_TRIES tries in all. A few go at a time (cardEmail.AT_ONCE); a run keeps going until
// nothing is due or its 4 minutes are up, and never overlaps the one before. After a card's last try its sender is told,
// once for all their cards that gave up in this run (a list sent during a mail server outage is one notice, not 20),
// and their Sent offers Email it again or Take it back.
// ============================================================

const cardEmail = require('../services/cardEmail');
const logger = require('../utils/logger');
const { areLaunchFeaturesEnabled } = require('../utils/featureFlags');

const RUN_BUDGET_MS = 4 * 60 * 1000;
let running = false;

async function cardEmailSend() {
  if (!areLaunchFeaturesEnabled(['mailbox', 'holiday_cards'])) return;
  if (running) {
    logger.info('[CardEmailSend] The last run is still sending; skipping this one');
    return;
  }
  running = true;
  const started = Date.now();
  let sent = 0;
  let failed = 0;
  let due = 0;
  const gaveUp = new Map();
  const tried = new Set();
  try {
    while (Date.now() - started < RUN_BUDGET_MS) {
      let page;
      try {
        page = (await cardEmail.dueToSend(new Date())).filter((mail) => !tried.has(mail.id));
      } catch (err) {
        logger.error('[CardEmailSend] Could not read the cards that are due', { error: err.message });
        break;
      }
      if (!page.length) break;
      due += page.length;
      page.forEach((mail) => tried.add(mail.id));
      // A few at a time: each card is marked 'sending' before it goes, so a card is never sent twice.
      for (let i = 0; i < page.length; i += cardEmail.AT_ONCE) {
        await Promise.all(page.slice(i, i + cardEmail.AT_ONCE).map(async (mail) => {
          try {
            const result = await cardEmail.deliver(mail);
            if (result.sent) sent += 1;
            else if (!result.skipped) failed += 1;
            if (result.gaveUp) gaveUp.set(mail.sender_user_id, [...(gaveUp.get(mail.sender_user_id) || []), result.gaveUp]);
          } catch (err) {
            failed += 1;
            logger.warn('[CardEmailSend] Send failed', { mailId: mail.id, error: err.message });
          }
        }));
      }
    }
    for (const [senderId, cards] of gaveUp) await cardEmail.tellSender(senderId, cards);
    if (due) logger.info('[CardEmailSend] Done', { due, sent, failed, gaveUp: [...gaveUp.values()].flat().length });
  } finally {
    running = false;
  }
}

module.exports = cardEmailSend;
