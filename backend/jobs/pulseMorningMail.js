/**
 * Pulse, reinvented: tomorrow's mail (every hour; services/pulse/postcards.js, coord CONTRACT 8j). At 7 in the morning,
 * in each person's own mailbox time zone, a person with the switch on and the Mailbox on gets, as one delivery of
 * postcards in today's Mail tab, up to 3 Moments they missed from circle members who chose to keep theirs there. With the switch off for everyone it does nothing at all (no query but the cached flag's).
 */

const logger = require('../utils/logger');
const postcards = require('../services/pulse/postcards');
const strands = require('../services/pulse/strands');

async function pulseMorningMail() {
  if (!(await strands.onForAnyone())) return;
  const sent = await postcards.sendMorning();
  if (sent) logger.info('[pulseMorningMail] done', { sent });
}

module.exports = pulseMorningMail;
