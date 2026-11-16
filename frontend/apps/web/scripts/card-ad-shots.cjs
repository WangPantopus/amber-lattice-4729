// ============================================================
// The Christmas cards ad, version 2: the shot list film-card-ad.cjs films.
// Sam sends Grandma a card; she opens it on Christmas morning. Sam and Grandma
// are made-up people: no real person's name, note, photo or address is in it.
//
// A take is one continuous run of the real card table on /dev/card-film (one
// page, one scene). Its times are in seconds of the finished film from the
// take's start (`at`, `speed`, `view`, `blur`, `stills`); a gesture's own path
// is in the table's milliseconds from its touch, so the table feels the speed
// a finger really moves at. `speed` slows or hurries the table's own clock
// (slow motion never stretches frames). `view` moves in (at most 1.6×) by
// filming the page larger, never by enlarging a finished frame. A cut lays
// takes end to end and puts the words, the dip and the end card over them.
// ============================================================

/** "Sam", signed: single pen strokes in the app's 400 × 100 signature box, its line at y = 72. Cubic curves, start to end. */
const SAM = [
  // S
  [[77, 21], [70, 8], [40, 5], [32, 21], [26, 34], [44, 40], [58, 46], [76, 53], [78, 69], [62, 75], [46, 81], [24, 76], [18, 65]],
  // am, in one stroke
  [[127, 50], [115, 42], [98, 48], [95, 60], [92, 72], [104, 77], [114, 70], [122, 64], [127, 55], [129, 48],
    [127, 58], [126, 68], [130, 73], [137, 77], [141, 60], [143, 50], [144, 60], [143, 68], [142, 74],
    [146, 56], [152, 47], [160, 48], [167, 49], [166, 64], [166, 74], [170, 56], [176, 47], [184, 48],
    [192, 49], [190, 64], [191, 72], [192, 77], [201, 74], [212, 63]],
];

const story = {
  /** The picture that stars (by its number in backend/services/holidayCards.js). */
  card: 45,
  from: 'Sam',
  to: 'Grandma',
  note: 'Grandma, I still dream about your cookies. Save me one.',
  /** The postmark's day, the same at both ends. */
  mailed: '2026-12-25',
  /** Sealed until Christmas morning. */
  until: '2026-12-25T15:00:00.000Z',
  signature: SAM,
  /** The card rack: three swipes, the cloth a new colour each time, stopping on the star. */
  rack: [8, 44, 40, 45],
};

// Where a finger goes, from the table's own layout (a: anchors on the page, g: the engine's geometry).
const takes = {
  // Shot 1: close on the gold seal; a finger pulls up, the seal cracks in slow motion, the card comes out, the view eases back.
  open1: {
    scene: 'open',
    signed: true,
    length: 3.2,
    clock: 618265,
    start: { go: 'back' },
    speed: [[0, 1], [0.25, 1], [0.36, 0.25], [1.2, 0.25], [1.5, 1]],
    view: [{ at: 0, z: 1.6, focus: 'seal', dy: -0.02, dx: { wide: -0.12 } }, { at: 1.55, z: 1.6, focus: 'seal', dy: -0.02, dx: { wide: -0.12 } }, { at: 2.75, z: 1 }],
    gestures: [
      { at: 0.3, kind: 'drag', path: (a, g) => [[0, a.seal.x + 4, a.seal.y + 8], [110, a.seal.x + 4, a.seal.y - 9],
        [330, a.seal.x + 3, a.seal.y - 0.12 * g.h], [520, a.seal.x + 2, a.seal.y - 0.2 * g.h], [600, a.seal.x + 2, a.seal.y - 0.27 * g.h]] },
    ],
    blur: [],
  },
  // Shot 2: the card rack.
  rack: {
    scene: 'rack',
    length: 2.6,
    // The rack keeps this much room above its card and below its button.
    insets: { tall: { top: 150, bottom: 141 }, wide: { top: 150, bottom: 150 } },
    clock: 618265,
    speed: [[0, 1]],
    view: [{ at: 0, z: 1 }],
    gestures: [
      { at: 0.12, kind: 'drag', path: (a) => [[0, a.rackCard.x + 0.2 * a.rackCard.w, a.rackCard.y], [90, a.rackCard.x + 0.04 * a.rackCard.w, a.rackCard.y + 2],
        [190, a.rackCard.x - 0.38 * a.rackCard.w, a.rackCard.y + 4]] },
      { at: 0.72, kind: 'drag', path: (a) => [[0, a.rackCard.x + 0.2 * a.rackCard.w, a.rackCard.y - 6], [90, a.rackCard.x + 0.04 * a.rackCard.w, a.rackCard.y - 4],
        [190, a.rackCard.x - 0.38 * a.rackCard.w, a.rackCard.y - 2]] },
      { at: 1.32, kind: 'drag', path: (a) => [[0, a.rackCard.x + 0.2 * a.rackCard.w, a.rackCard.y + 4], [90, a.rackCard.x + 0.04 * a.rackCard.w, a.rackCard.y + 5],
        [190, a.rackCard.x - 0.38 * a.rackCard.w, a.rackCard.y + 6]] },
      { at: 2.0, kind: 'tap', path: (a) => [[0, a.rackWrite.x + 6, a.rackWrite.y + 2], [110, a.rackWrite.x + 6, a.rackWrite.y + 2]] },
    ],
    blur: [],
  },
  // Shots 3 and 4a-4d: Sam writes, signs, puts it in the envelope, closes the flap, presses the seal; it's addressed and goes.
  send: {
    scene: 'send',
    length: 10.2,
    clock: 655100,
    start: { send: true },
    speed: [[0, 1], [3.0, 1], [3.5, 1.2], [4.45, 1.2], [4.6, 1], [5.68, 1], [5.78, 0.5], [6.88, 0.5], [7.0, 1], [7.2, 1.5], [10.2, 1.5]],
    view: [{ at: 0, z: 1 }, { at: 5.25, z: 1 }, { at: 5.68, z: 1.6, focus: 'press', dx: { wide: -0.12 } }, { at: 7.1, z: 1.6, focus: 'press', dx: { wide: -0.12 } }, { at: 7.6, z: 1 }],
    write: { from: 0.25, to: 1.55 },
    sign: { from: 1.75, to: 2.85, lift: 0.1 },
    gestures: [
      { at: 3.0, kind: 'drag', path: (a, g) => [[0, a.card.x + 6, a.card.y + 0.22 * g.ch], [160, a.card.x + 5, a.card.y + 0.13 * g.ch],
        [330, a.card.x + 3, a.card.y - 0.02 * g.ch], [420, a.card.x + 2, a.card.y - 0.1 * g.ch]] },
      { at: 4.58, kind: 'drag', path: (a, g) => [[0, a.flapIn.x + 3, a.flapIn.top + 0.22 * g.fd], [140, a.flapIn.x + 2, a.flapIn.top + 0.55 * g.fd],
        [280, a.flapIn.x + 1, a.flapIn.top + 1.05 * g.fd], [330, a.flapIn.x + 1, a.flapIn.top + 1.3 * g.fd]] },
      { at: 5.72, kind: 'press', hold: 680, path: (a) => [[0, a.press.x + 3, a.press.y + 4]] },
    ],
    blur: [[7.45, 8.2], [9.5, 10.2]],
  },
  // Shot 5a: Grandma's table, the sealed envelope; she tries the flap, it springs back. 5b dips to black over its end.
  sealed: {
    scene: 'sealed',
    length: 2.4,
    clock: 702400,
    start: { go: 'back' },
    speed: [[0, 1]],
    view: [{ at: 0, z: 1 }],
    gestures: [
      { at: 0.3, kind: 'drag', path: (a, g) => [[0, a.seal.x + 5, a.seal.y + 10], [150, a.seal.x + 4, a.seal.y - 0.04 * g.h],
        [330, a.seal.x + 3, a.seal.y - 0.1 * g.h], [470, a.seal.x + 3, a.seal.y - 0.12 * g.h]] },
    ],
    blur: [],
  },
  // Shots 6a-6e and 7: Christmas morning. It lands, turns over, opens; the card turns to the note, then spins and settles.
  open: {
    scene: 'open',
    signed: true,
    length: 11.6,
    clock: 731000,
    start: { arrive: true },
    speed: [[0, 1], [1.98, 1], [2.06, 0.3], [2.65, 0.3], [2.85, 1], [7.0, 1], [7.25, 0.32], [8.0, 0.32], [8.3, 1]],
    view: [{ at: 0, z: 1 }],
    gestures: [
      { at: 1.05, kind: 'drag', path: (a, g) => [[0, a.front.x + 0.22 * g.ew, a.front.y + 6], [120, a.front.x + 0.1 * g.ew, a.front.y + 7],
        [230, a.front.x - 0.16 * g.ew, a.front.y + 9]] },
      { at: 1.95, kind: 'drag', path: (a, g) => [[0, a.seal.x + 4, a.seal.y + 8], [110, a.seal.x + 4, a.seal.y - 9],
        [330, a.seal.x + 3, a.seal.y - 0.12 * g.h], [520, a.seal.x + 2, a.seal.y - 0.2 * g.h], [600, a.seal.x + 2, a.seal.y - 0.27 * g.h]] },
      { at: 4.2, kind: 'drag', path: (a, g) => [[0, a.card.x + 0.32 * g.cw, a.card.y + 0.05 * g.ch], [300, a.card.x + 0.12 * g.cw, a.card.y + 0.05 * g.ch],
        [700, a.card.x - 0.3 * g.cw, a.card.y + 0.06 * g.ch], [900, a.card.x - 0.44 * g.cw, a.card.y + 0.06 * g.ch]] },
      { at: 6.45, kind: 'drag', path: (a, g) => [[0, a.card.x + 0.3 * g.cw, a.card.y + 0.1 * g.ch], [60, a.card.x + 0.2 * g.cw, a.card.y + 0.1 * g.ch],
        [120, a.card.x - 0.6 * g.cw, a.card.y + 0.12 * g.ch]] },
    ],
    blur: [[1.15, 1.75], [6.5, 7.6]],
  },
};

/** Words on screen: the app's serif in cream, never more than two lines. */
const W = {
  open: ['A Christmas card', 'they open by hand.'],
  phone: ['On their phone.'],
  pick: ['Pick from 67 cards.'],
  write: ['Write a few words.'],
  sign: ['Sign it yourself.'],
  seal: ['Seal it by hand.'],
  sealed: ['Sealed until', 'Christmas morning.'],
  notYet: ['Not yet.'],
  morning: ['7:00 AM', 'Christmas morning.'],
  mail: ['It opens like', 'real mail.'],
  short: ['Christmas cards', 'they open by hand.'],
};

/** The end card: the line, then the address. */
const END = { lines: ['Send a Christmas card.', 'Your first 3 are free.'], address: 'pantopus.com/cards' };

// A cut: takes end to end ([take, from, to] in the take's seconds), then words, dips and the end card in the cut's seconds.
const cuts = {
  30: {
    pieces: [['open1', 0, 3.2], ['rack', 0, 2.6], ['send', 0, 10.2], ['sealed', 0, 2.4], ['open', 0, 11.6]],
    shots: { 1: 0, 2: 3.2, 3: 5.8, '4a': 8.8, '4b': 10.1, '4c': 11.2, '4d': 13.1, '5a': 16.0, '5b': 17.5, '6a': 18.4, '6b': 19.4, '6c': 20.3, '6d': 22.5, '6e': 24.8, 7: 26.8 },
    words: [
      [0.15, 1.75, W.open], [1.85, 3.15, W.phone], [3.3, 5.75, W.pick], [5.9, 7.4, W.write], [7.5, 8.75, W.sign],
      [10.0, 13.05, W.seal], [14.0, 15.95, W.sealed], [16.35, 17.45, W.notYet], [17.6, 18.5, W.morning], [22.1, 23.8, W.mail],
    ],
    dips: [[17.45, 17.9, 18.4, 18.95, 0.05]],
    end: { at: 26.8, full: 27.6, ...END },
  },
};

/** Checkpoint 1: one still per shot, at these seconds of the 30-second cut. */
const stills = {
  1: 0.78, 2: 4.95, 3: 8.32, '4a': 9.12, '4b': 10.75, '4c': 12.3, '4d': 15.0, '5a': 16.75, '5b': 18.05, '6a': 19.1,
  '6b': 19.7, '6c': 21.4, '6d': 23.9, '6e': 26.3, 7: 29.0,
};

module.exports = { fps: 60, story, takes, cuts, stills, words: W, end: END };
