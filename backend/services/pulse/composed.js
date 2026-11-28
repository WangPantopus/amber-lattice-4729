'use strict';

// Pulse, reinvented, phase 5: a picture shown as its author composed it (coord CONTRACT 10c, PHASE-5 piece A6). The Studio
// places a photo on the 9:16 canvas (Resize's model) and posts it as that canvas, backdrop included; a video isn't
// re-encoded, so its placement on the canvas is kept beside it. `whole` tells the new viewers to show the picture fit, on
// its backdrop, on every screen shape, never cut again by the reader's screen. Studio fields only: refused from a
// switched-off author (routes/moments.js), answered only to a switch-on reader (momentStore), so a switched-off reader and
// the 2.1.6 apps get today's picture and today's video.

const PLACEMENT_KEYS = ['width', 'x', 'y', 'turn'];

function invalid(message) {
  return Object.assign(new Error(message), { status: 400, code: 'MOMENT_INVALID' });
}

function number(value, min, max, what) {
  const n = Number(value);
  if (typeof value !== 'number' || !Number.isFinite(n) || n < min || n > max) {
    throw invalid(`placement.${what} is ${min} to ${max}.`);
  }
  return Math.round(n * 10000) / 10000;
}

/**
 * The kept part of `body`'s `whole` and `placement` for a Moment of `kind` (CONTRACT 10c), or {} when neither was sent.
 * Throws a 400 MOMENT_INVALID error with words that say what is wrong.
 */
function parse(body, { kind }) {
  const b = body || {};
  const hasWhole = Object.prototype.hasOwnProperty.call(b, 'whole');
  const hasPlacement = Object.prototype.hasOwnProperty.call(b, 'placement') && b.placement != null;
  if (!hasWhole && !hasPlacement) return {};
  if (hasWhole && typeof b.whole !== 'boolean') throw invalid('whole is true or false.');
  const whole = b.whole === true;
  if (whole && !['photo', 'video'].includes(kind)) throw invalid('A text card is drawn as it is: whole goes with a photo or a video.');
  if (!hasPlacement) return whole ? { whole: true } : {};
  if (kind !== 'video') throw invalid('A placement goes with a video (a photo is posted as its canvas).');
  if (!whole) throw invalid('A placement goes with whole: true.');
  const p = b.placement;
  if (typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some((key) => !PLACEMENT_KEYS.includes(key))) {
    throw invalid('placement is { width, x, y, turn }.');
  }
  return {
    whole: true,
    placement: {
      width: number(p.width, 0.25, 4, 'width'),
      x: number(p.x, 0, 1, 'x'),
      y: number(p.y, 0, 1, 'y'),
      turn: number(p.turn, -180, 180, 'turn'),
    },
  };
}

/** `whole` and `placement` as a switch-on reader's Moment answer carries them (CONTRACT 10c). */
function answerOf(m) {
  return { whole: m?.whole === true, placement: m?.placement && m.whole === true ? { ...m.placement } : null };
}

module.exports = { parse, answerOf };
