// Pulse, reinvented: loop (coord CONTRACT 7j). A short piece of a video Moment that the new viewers play over and over,
// silently. It rides today's video Moment exactly (the same posting and upload); one optional Studio field says which
// span to repeat, so the stored file stays an ordinary video that every app can play. No new route, no new table.
// Only while the switch is on for the author (routes/moments.js answers 403 PULSE_REINVENTED_OFF otherwise).

const MIN_MS = 500;
const MAX_MS = 6000;

class LoopError extends Error {}

const wholeMs = (value) => Number.isInteger(value) && value >= 0 && value <= 60 * 60 * 1000;

/**
 * The `loop` field of a posted Moment, checked: { from_ms, to_ms | null, bounce } or null when none was sent. Throws a
 * LoopError with the words the app shows (the route answers 400 MOMENT_INVALID).
 */
function parse(value, { kind, series }) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new LoopError('A loop is one short video.');
  if (kind !== 'video' || series) throw new LoopError('A loop is one short video.');
  const unknown = Object.keys(value).filter((key) => !['from_ms', 'to_ms', 'bounce'].includes(key));
  if (unknown.length) throw new LoopError('A loop is one short video.');
  const from = value.from_ms === undefined || value.from_ms === null ? 0 : value.from_ms;
  if (!wholeMs(from)) throw new LoopError('A loop is half a second to six seconds.');
  let to = null;
  if (value.to_ms !== undefined && value.to_ms !== null) {
    if (!wholeMs(value.to_ms) || value.to_ms - from < MIN_MS || value.to_ms - from > MAX_MS) {
      throw new LoopError('A loop is half a second to six seconds.');
    }
    to = value.to_ms;
  }
  if (value.bounce !== undefined && typeof value.bounce !== 'boolean') throw new LoopError('A loop is one short video.');
  return { v: 1, from_ms: from, to_ms: to, bounce: value.bounce === true };
}

/** What a Moment keeps (post_metadata.moment.loop), spread into its kept value; nothing when no loop was sent. */
function keptPart(loop) {
  return loop ? { loop } : {};
}

/**
 * A switch-on reader's `loop`: the span fitted to the stored video (never past its own length), or null when what is
 * left is shorter than half a second (the Moment then plays as an ordinary video). Before the file is stored, the
 * span as sent (or six seconds).
 */
function answerOf(m) {
  const loop = m?.loop;
  if (!loop) return null;
  const from = Number(loop.from_ms) || 0;
  const duration = Number(m.media?.duration_ms);
  let to = loop.to_ms == null ? from + MAX_MS : Number(loop.to_ms);
  if (Number.isFinite(duration) && duration > 0) to = Math.min(to, Math.round(duration));
  if (!(to - from >= MIN_MS)) return null;
  return { from_ms: from, to_ms: to, bounce: Boolean(loop.bounce) };
}

module.exports = { parse, keptPart, answerOf, LoopError, MIN_MS, MAX_MS };
