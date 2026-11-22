// Hot reads straight from Postgres (DATABASE_URL, the regional pooler) instead of through the Data API. From the
// production backend on 2026-11-07, a one-row read took about 3 ms on a direct connection and 60-80 ms through the
// Data API (network, Cloudflare, Supabase's gateway and PostgREST), so a request that waits on a read pays that much
// per round trip.
//
// DIRECT_DB_READS picks the path for the reads that support it (utils/homePermissions.js for now):
//   off (the default)  the Data API, as before.
//   shadow             the Data API still decides; the direct read runs alongside and is only compared and timed.
//   on                 the direct read decides, and any failure falls back to the Data API.
// Every connection is read-only and time-limited. Only a read's name, timings and error codes are logged, never
// its values.
//
// A direct read takes 2-10 ms, about 160 ms on a new connection, so its limits are short: a read that can't get a
// connection in 0.5 s or an answer in 0.8 s gives up, and the caller's Data API path answers. A read that failed
// without an answer from the database (a timeout, a connection that broke or couldn't be made) usually means the
// database or the way to it is struggling, so direct reads then step aside for 30 seconds: read() throws at once,
// without touching the pool, and every caller goes straight to the Data API ("on") or counts a failed comparison
// ("shadow"). An error the database answered (bad SQL, a permission, a refused password) pauses nothing, except the
// database cancelling a statement at its 0.6 s limit (57014), which is a timeout too (`stepsAside`).
const { Pool } = require('pg');
const logger = require('../utils/logger');
const dbTiming = require('../utils/dbTiming');

const MODES = new Set(['off', 'shadow', 'on']);
const SUMMARY_EVERY = 200;
const QUIET_MS = 60 * 1000;
const PAUSE_MS = 30 * 1000;

function mode() {
  const value = String(process.env.DIRECT_DB_READS || 'off').trim().toLowerCase();
  return process.env.DATABASE_URL && MODES.has(value) ? value : 'off';
}

let pool = null;
function getPool() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    application_name: 'pantopus-direct-reads',
    // Session-pooler connections are shared with pg-boss and the sync listener; a read takes a few ms.
    max: 3,
    // Opening a connection (TCP, TLS, auth) costs more than the reads it saves, so idle ones stay open.
    idleTimeoutMillis: 0,
    keepAlive: true,
    keepAliveInitialDelayMillis: 30 * 1000,
    connectionTimeoutMillis: 500,
    statement_timeout: 600,
    query_timeout: 800,
  });
  pool.on('error', (error) => logger.warn('directDb: idle connection failed', { error: error.message, code: error.code }));
  return pool;
}

// While direct reads step aside (until this time, in ms), read() throws at once.
let pausedUntil = 0;

// A failure without an answer from the database (no severity: a timeout, a broken or refused connection), or the
// database cancelling the statement at its time limit (57014), steps aside. Any other database error doesn't.
function stepsAside(error) {
  return !error?.severity || error.code === '57014';
}

function pause(name, error) {
  const now = Date.now();
  if (now < pausedUntil) return; // one pause, and one log line, for failures that come together
  pausedUntil = now + PAUSE_MS;
  // The logger redacts keys named "code", so the error's code travels as errorCode.
  logger.warn('directDb: direct reads paused after a failure', {
    read: name, error: error.message, errorCode: error.code || null, pause_ms: PAUSE_MS,
  });
}

/** Rows of one read-only query, counted in the request's database ledger as "SQL <name>". Throws on any failure. */
async function read(name, text, values) {
  if (Date.now() < pausedUntil) {
    throw Object.assign(new Error('Direct reads are paused after a failure'), { code: 'DIRECT_READS_PAUSED' });
  }
  const call = dbTiming.startCall(new URL(`sql://direct/${name}`), 'SQL');
  let client = null;
  try {
    client = await getPool().connect();
    // A connection's first use makes it read-only for good, so nothing sent on it can write.
    if (!client.directReadOnly) {
      await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
      client.directReadOnly = true;
    }
    const result = await client.query(text, values);
    client.release();
    dbTiming.endCall(call, { status: 200 });
    return result.rows;
  } catch (error) {
    // A database error (it has a severity) leaves the connection usable; anything else retires it.
    if (client) client.release(error.severity ? undefined : error);
    dbTiming.endCall(call, null);
    if (stepsAside(error)) pause(name, error);
    throw error;
  }
}

const stats = new Map();
function statsFor(name) {
  if (!stats.has(name)) stats.set(name, { compared: 0, differed: 0, failed: 0, fellBack: 0, directMs: [], apiMs: [], quietUntil: 0 });
  return stats.get(name);
}
function loudly(entry) {
  const now = Date.now();
  if (now < entry.quietUntil) return false;
  entry.quietUntil = now + QUIET_MS;
  return true;
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10 : null;
};

/** In "on" mode: the direct read failed and the Data API answered instead. */
function fellBack(name, error) {
  const entry = statsFor(name);
  entry.fellBack += 1;
  if (loudly(entry)) {
    logger.warn('directDb: read failed; the Data API answered', { read: name, error: error.message, code: error.code, fell_back: entry.fellBack });
  }
}

/** In "shadow" mode: how the direct read compared with the Data API's (`differs` lists the parts that differed). */
function compared(name, { error, differs = [], directMs, apiMs }) {
  const entry = statsFor(name);
  if (error) {
    entry.failed += 1;
    if (loudly(entry)) logger.warn('directDb shadow: read failed', { read: name, error: error.message, code: error.code, failed: entry.failed });
    return;
  }
  entry.compared += 1;
  if (differs.length) {
    entry.differed += 1;
    logger.warn('directDb shadow: reads differ', { read: name, parts: differs });
  }
  entry.directMs.push(directMs);
  entry.apiMs.push(apiMs);
  if (entry.directMs.length >= SUMMARY_EVERY) {
    logger.info('directDb shadow: summary', {
      read: name, compared: entry.compared, differed: entry.differed, failed: entry.failed,
      direct_median_ms: median(entry.directMs), api_median_ms: median(entry.apiMs),
    });
    entry.directMs = [];
    entry.apiMs = [];
  }
}

module.exports = { mode, read, fellBack, compared };
