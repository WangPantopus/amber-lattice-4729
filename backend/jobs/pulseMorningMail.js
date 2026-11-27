/**
 * Pulse, reinvented: tomorrow's mail (every hour; services/pulse/postcards.js, coord CONTRACT 8j). At 7 in the morning
 * each person with the switch on gets, as postcards in today's Mail tab, up to 3 Moments from their circles that they
 * missed. With the switch off for everyone it does nothing at all (no query but the cached flag's).
 */

const logger = require('../utils/logger');
const postcards = require('../services/pulse/postcards');
const strands = require('../services/pulse/strands');

async function pulseMorningMail() {
  if (!postcards.isMorning() || !(await strands.onForAnyone())) return;
  const sent = await postcards.sendMorning();
  if (sent) logger.info('[pulseMorningMail] done', { sent });
}

module.exports = pulseMorningMail;
