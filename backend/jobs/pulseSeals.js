/**
 * Pulse, reinvented: relics that open with rain (every 30 minutes; services/pulse/seal.js, coord CONTRACT 8g). A sealed
 * Moment set to open "the next time it rains here" opens for everyone when the server reads rain at its point, or after
 * a year. With the switch off for everyone it does nothing at all (no query but the cached flag's).
 */

const logger = require('../utils/logger');
const seal = require('../services/pulse/seal');
const strands = require('../services/pulse/strands');

async function pulseSeals() {
  if (!(await strands.onForAnyone())) return;
  const opened = await seal.openWithRain();
  if (opened) logger.info('[pulseSeals] done', { opened });
}

module.exports = pulseSeals;
