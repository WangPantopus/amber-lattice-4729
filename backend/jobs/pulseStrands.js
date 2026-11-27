/**
 * Pulse, reinvented: strands, "went because of you" (every 10 minutes; services/pulse/strands.js, coord CONTRACT 8c).
 * Looks at the posts and Moments of the last two hours whose authors have the `pulse_reinvented` switch on; one that
 * stands near something its author marked Want to go makes a strand for that post's author. Safe to run twice. With the
 * switch off for everyone it reads one page of new posts and writes nothing.
 */

const logger = require('../utils/logger');
const strands = require('../services/pulse/strands');

async function pulseStrands() {
  const made = await strands.findNew();
  if (made) logger.info('[pulseStrands] done', { made });
}

module.exports = pulseStrands;
