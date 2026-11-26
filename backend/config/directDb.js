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
// connection in 1 s (opening one, or waiting for one of the pool's to be free) or an answer in 0.8 s gives up, and the
// caller's Data API path answers. The pool's connections are opened when the process starts (warmUp), so the first
// requests after a deploy don't pay for opening them. A read that failed
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
const POOL_MAX = 3;

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
    max: POOL_MAX,
    // Opening a connection (TCP, TLS, auth) costs more than the reads it saves, so idle ones stay open.
    idleTimeoutMillis: 0,
    keepAlive: true,
    keepAliveInitialDelayMillis: 30 * 1000,
    // In node-pg this also covers waiting for a free pooled connection: a short queue is our own traffic.
    connectionTimeoutMillis: 1000,
    statement_timeout: 600,
    query_timeout: 800,
  });
  pool.on('error', (error) => logger.warn('directDb: idle connection failed', { error: error.message, errorCode: error.code }));
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

// A connection's first use makes it read-only for good, so nothing sent on it can write.
async function readOnly(client) {
  if (client.directReadOnly) return;
  await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  client.directReadOnly = true;
}

/**
 * At process start (API and worker), with direct reads in shadow or on: open the pool's connections, make each
 * read-only and run one trivial query on it, so the first requests find them ready. Never delays or fails startup:
 * it isn't awaited, never rejects, and a failure only logs (it doesn't pause direct reads). One line with how many
 * opened and how long it took.
 */
function warmUp() {
  if (mode() === 'off') return Promise.resolve(0);
  const started = performance.now();
  // All of them at once, so the pool opens one connection for each rather than reusing the first.
  return Promise.allSettled(Array.from({ length: POOL_MAX }, async () => {
    const client = await getPool().connect();
    try {
      await readOnly(client);
      await client.query('SELECT 1');
      client.release();
    } catch (error) {
      client.release(error.severity ? undefined : error);
      throw error;
    }
  })).then((results) => {
    const failed = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    const opened = results.length - failed.length;
    const line = { opened, of: POOL_MAX, ms: Math.round(performance.now() - started) };
    if (failed.length) {
      logger.warn('directDb: connections opened at start', { ...line, error: failed[0]?.message, errorCode: failed[0]?.code || null });
    } else {
      logger.info('directDb: connections opened at start', line);
    }
    return opened;
  }).catch(() => 0);
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
    await readOnly(client);
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
    logger.warn('directDb: read failed; the Data API answered', { read: name, error: error.message, errorCode: error.code, fell_back: entry.fellBack });
  }
}

/** In "shadow" mode: how the direct read compared with the Data API's (`differs` lists the parts that differed). */
function compared(name, { error, differs = [], directMs, apiMs }) {
  const entry = statsFor(name);
  if (error) {
    entry.failed += 1;
    if (loudly(entry)) logger.warn('directDb shadow: read failed', { read: name, error: error.message, errorCode: error.code, failed: entry.failed });
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

module.exports = { mode, read, fellBack, compared, warmUp };
