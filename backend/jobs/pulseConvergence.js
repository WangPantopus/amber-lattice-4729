/**
 * Pulse, reinvented: Convergences (every 5 minutes; services/pulse/convergence.js, coord CONTRACT 8h). Opens a
 * 15-minute window where the stated rules are met (a sunset or a first snow seen by several people) and joins the Live
 * photos taken in it. With the switch off for everyone it does nothing at all (no query but the cached flag's).
 */

const logger = require('../utils/logger');
const convergence = require('../services/pulse/convergence');
const strands = require('../services/pulse/strands');

async function pulseConvergence() {
  if (!(await strands.onForAnyone())) return;
  const { opened, joined } = await convergence.run();
  if (opened || joined) logger.info('[pulseConvergence] done', { opened, joined });
}

module.exports = pulseConvergence;
