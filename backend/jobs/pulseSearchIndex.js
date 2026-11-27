/**
 * Pulse, reinvented: the search index (every 2 minutes; services/pulse/searchIndex.js, coord CONTRACT 9a). Adds the
 * Pulse posts and Moments made since the last run, refreshes the ones that change with time or later writes, and moves
 * a rolling refresh through the rest. With the switch off for everyone it does nothing at all: no query but the cached
 * flag row's.
 */

const logger = require('../utils/logger');
const searchIndex = require('../services/pulse/searchIndex');

async function pulseSearchIndex() {
  const done = await searchIndex.fill();
  if (done && (done.written || done.removed)) logger.info('[pulseSearchIndex] done', done);
}

module.exports = pulseSearchIndex;
