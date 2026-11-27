/**
 * Pulse, reinvented: live beams (every 10 minutes; services/pulse/beams.js, coord CONTRACT 9h). A Moment's heading never
 * outlives the Moment: this takes it off every Moment that has ended, a kept one too. With the switch off for everyone it
 * does nothing at all: no query but the cached flag row's.
 */

const logger = require('../utils/logger');
const beams = require('../services/pulse/beams');

async function pulseBeams() {
  const cleared = await beams.clearEnded();
  if (cleared) logger.info('[pulseBeams] done', { cleared });
}

module.exports = pulseBeams;
