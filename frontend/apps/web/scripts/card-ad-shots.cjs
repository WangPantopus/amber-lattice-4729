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
  /** The picture that stars (by its number in backend/services/holidayCards.js): "On his way to you.", the founder's pick (11-16). */
  card: 55,
  from: 'Sam',
  to: 'Grandma',
  note: 'Grandma, I still dream about your cookies. Save me one.',
  /** The postmark's day, the same at both ends. */
  mailed: '2026-12-25',
  /** Sealed until Christmas morning. */
  until: '2026-12-25T15:00:00.000Z',
  signature: SAM,
  /** The card rack: three swipes through Christmas with Santa (58, 57, 56, its own order backwards), the cloth a new colour each time, stopping on the star. */
  rack: [58, 57, 56, 55],
};

/** Close on the seal: 1.45× on the phone with the seal at 44% of the height (a line fits on the red front under it);
 * 1.6× on the wide window, off to the right of the words. */
/** Christmas with Santa, in the app's order (backend/services/holidayCards.js COLLECTIONS). */
const SANTA = [50, 51, 52, 53, 54, 55, 56, 57, 58];
const CLOSE_ON_SEAL = { z: { tall: 1.45, wide: 1.6 }, focus: 'seal', dy: { tall: 0.04, wide: -0.02 }, dx: { wide: -0.12 } };

/** The card rack: the room it keeps above its card and below its button; on the wide window also at its left, so the
 * card stays clear of the words (left third). */
const RACK = {
  scene: 'rack',
  insets: { tall: { top: 150, bottom: 141 }, wide: { top: 150, bottom: 150, left: 660 } },
  clock: 618265,
  speed: [[0, 1]],
  view: [{ at: 0, z: 1 }],
  gestures: [],
  blur: [],
};

// Where a finger goes, from the table's own layout (a: anchors on the page, g: the engine's geometry).
const takes = {
  // Shot 1: close on the gold seal; a finger pulls up, the seal cracks in slow motion, the card comes out, the view eases
  // back. On the phone the close-up is 1.45× with the seal at 44% of the height, so the first line fits on the red front
  // under it (above the platforms' bottom 35%); it holds while the card comes up, then eases back as the card is laid down.
  open1: {
    scene: 'open',
    signed: true,
    length: 4.0,
    clock: 618265,
    start: { go: 'back' },
    speed: [[0, 1], [0.25, 1], [0.36, 0.25], [1.2, 0.25], [1.5, 1]],
    view: [{ at: 0, ...CLOSE_ON_SEAL }, { at: 2.25, ...CLOSE_ON_SEAL }, { at: 3.05, z: 1 }],
    gestures: [
      { at: 0.3, kind: 'drag', path: (a, g) => [[0, a.seal.x + 4, a.seal.y + 8], [110, a.seal.x + 4, a.seal.y - 9],
        [330, a.seal.x + 3, a.seal.y - 0.12 * g.h], [520, a.seal.x + 2, a.seal.y - 0.2 * g.h], [600, a.seal.x + 2, a.seal.y - 0.27 * g.h]] },
    ],
    blur: [],
  },
  // Shot 2: the card rack, opened on three collections in quick cuts (the app's rack swipes only inside a collection):
  // Christmas as a Kid, Christmas with Jesus Christ, then the star in Christmas with Santa, where the finger taps
  // "Write on this card". Each take opens the rack on that collection's cards (in its own order) at the one shown.
  rackKid: { ...RACK, length: 0.75, rack: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], start: 6 },
  rackJesus: { ...RACK, length: 0.75, rack: [59, 60, 61, 62, 63, 64, 65, 66, 67], start: 61 },
  rackSanta: {
    ...RACK,
    length: 1.05,
    rack: SANTA,
    start: 55,
    gestures: [{ at: 0.45, kind: 'tap', path: (a) => [[0, a.rackWrite.x + 6, a.rackWrite.y + 2], [110, a.rackWrite.x + 6, a.rackWrite.y + 2]] }],
  },
  // Checkpoints 1-4: three swipes through Christmas with Santa (kept to compare).
  rack: {
    scene: 'rack',
    length: 2.6,
    // The rack keeps this much room above its card and below its button; on the wide window also at its left, so the
    // card stays clear of the words (left third) even as a swipe carries it left.
    insets: { tall: { top: 150, bottom: 141 }, wide: { top: 150, bottom: 150, left: 560 } },
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
    length: 11.5,
    clock: 655100,
    start: { send: true },
    // The writing at an easy pace; the card in, the flap down; the press at half speed; then the address, stamp, postmark
    // and gold mark at the app's own speed (only the beat before the turn and the wait before it leaves hurry).
    speed: [[0, 1], [3.4, 1], [3.9, 1.2], [4.85, 1.2], [5.0, 1], [6.08, 1], [6.18, 0.5], [7.28, 0.5], [7.4, 1], [7.5, 1.3], [7.85, 1.3],
      [7.95, 1], [10.35, 1], [10.45, 1.6], [10.85, 1.6], [10.95, 1], [11.5, 1]],
    view: [{ at: 0, z: 1 }, { at: 5.65, z: 1 }, { at: 6.08, z: 1.6, focus: 'press', dy: { tall: -0.06 }, dx: { wide: -0.12 } }, { at: 7.5, z: 1.6, focus: 'press', dy: { tall: -0.06 }, dx: { wide: -0.12 } }, { at: 8.0, z: 1 }],
    write: { from: 0.25, to: 1.95 },
    sign: { from: 2.15, to: 3.25, lift: 0.1 },
    gestures: [
      { at: 3.4, kind: 'drag', path: (a, g) => [[0, a.card.x + 6, a.card.y + 0.22 * g.ch], [160, a.card.x + 5, a.card.y + 0.13 * g.ch],
        [330, a.card.x + 3, a.card.y - 0.02 * g.ch], [420, a.card.x + 2, a.card.y - 0.1 * g.ch]] },
      { at: 4.98, kind: 'drag', path: (a, g) => [[0, a.flapIn.x + 3, a.flapIn.top + 0.22 * g.fd], [140, a.flapIn.x + 2, a.flapIn.top + 0.55 * g.fd],
        [280, a.flapIn.x + 1, a.flapIn.top + 1.05 * g.fd], [330, a.flapIn.x + 1, a.flapIn.top + 1.3 * g.fd]] },
      { at: 6.12, kind: 'press', hold: 680, path: (a) => [[0, a.press.x + 3, a.press.y + 4]] },
    ],
    blur: [[7.85, 8.65], [10.8, 11.5]],
  },
  // Shot 5a: Grandma's table, the sealed envelope; she tries the flap, it springs back. 5b dips to black over its end.
  sealed: {
    scene: 'sealed',
    length: 2.4,
    clock: 702400,
    start: { go: 'back' },
    speed: [[0, 1]],
    // Close on the seal and flap, as the opening, so the flap's small lift and its spring back show.
    view: [{ at: 0, ...CLOSE_ON_SEAL }],
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
    length: 12.6,
    clock: 731000,
    start: { arrive: true },
    // The seal's crack in slow motion; after the flick's two fast turns the clock drops to 0.16× as the last half turn
    // begins (at 7.52 s, measured), so it takes about a second and the light slides across the picture as it settles.
    speed: [[0, 1], [1.98, 1], [2.06, 0.3], [2.65, 0.3], [2.85, 1], [7.45, 1], [7.53, 0.16], [8.7, 0.16], [9.0, 0.6], [9.3, 1]],
    view: [{ at: 0, z: 1 }],
    gestures: [
      { at: 1.05, kind: 'drag', path: (a, g) => [[0, a.front.x + 0.22 * g.ew, a.front.y + 6], [120, a.front.x + 0.1 * g.ew, a.front.y + 7],
        [230, a.front.x - 0.16 * g.ew, a.front.y + 9]] },
      { at: 1.95, kind: 'drag', path: (a, g) => [[0, a.seal.x + 4, a.seal.y + 8], [110, a.seal.x + 4, a.seal.y - 9],
        [330, a.seal.x + 3, a.seal.y - 0.12 * g.h], [520, a.seal.x + 2, a.seal.y - 0.2 * g.h], [600, a.seal.x + 2, a.seal.y - 0.27 * g.h]] },
      { at: 5.0, kind: 'drag', path: (a, g) => [[0, a.card.x + 0.32 * g.cw, a.card.y + 0.05 * g.ch], [300, a.card.x + 0.12 * g.cw, a.card.y + 0.05 * g.ch],
        [700, a.card.x - 0.3 * g.cw, a.card.y + 0.06 * g.ch], [900, a.card.x - 0.44 * g.cw, a.card.y + 0.06 * g.ch]] },
      // The flick: two and a half turns, from the note to the picture (1.02 card widths in 120 ms lands on -1080°; 0.9
      // stops a half turn short, 1.15 goes a half turn on).
      { at: 7.25, kind: 'drag', path: (a, g) => [[0, a.card.x + 0.4 * g.cw, a.card.y + 0.1 * g.ch], [60, a.card.x + 0.3 * g.cw, a.card.y + 0.1 * g.ch],
        [120, a.card.x - 1.02 * g.cw, a.card.y + 0.12 * g.ch]] },
    ],
    blur: [[1.15, 1.75], [7.25, 8.3]],
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
  // Checkpoint 2: shots 4a-4d.
  seal: {
    pieces: [['send', 3.4, 11.5]],
    shots: { '4a': 0, '4b': 1.55, '4c': 2.65, '4d': 4.6 },
    words: [[1.55, 4.15, W.seal], [5.1, 7.25, W.sealed]],
    dips: [],
    // The app's paper sounds are quiet by design (peaks about -18 dBFS): all three raised alike, peaks near -5 dBFS.
    soundGain: 13,
  },
  // The main cut (the founder, 11-16: it needn't be 30 seconds; show as much of the good parts as possible). Checkpoint
  // 5 (founder, 11-16): the first line held two seconds on the envelope's front under the seal, the rack across three
  // collections, no light-moving beat, the spin's last half turn slowed to about a second, "Not yet." close up.
  main: {
    pieces: [['open1', 0, 4.0], ['rackKid', 0, 0.75], ['rackJesus', 0, 0.75], ['rackSanta', 0, 1.05], ['send', 0, 11.5], ['sealed', 0, 2.4], ['open', 0, 12.6]],
    shots: { 1: 0, 2: 4.0, 3: 6.55, '4a': 9.95, '4b': 11.5, '4c': 12.6, '4d': 14.55, '5a': 18.05, '5b': 19.5, '6a': 20.45, '6b': 21.45, '6c': 22.35, '6d': 25.45, '6e': 27.7, 7: 30.35 },
    words: [
      // The promise, fully up for two seconds: on the phone on the envelope's red front under the seal (the close-up
      // holds till 2.25 s); on the wide window beside it. "On their phone." once the card is laid down.
      [0, 2.6, W.open, { tall: { to: 2.45, at: 'seal' } }], [2.9, 4.0, W.phone], [4.08, 6.5, W.pick], [6.65, 8.5, W.write], [8.6, 9.9, W.sign],
      [11.5, 14.1, W.seal], [15.05, 17.2, W.sealed], [18.4, 19.5, W.notYet, { tall: { at: 'seal' } }], [19.65, 20.55, W.morning], [24.15, 25.95, W.mail],
    ],
    dips: [[19.5, 19.95, 20.45, 21.0, 0.05]],
    // Under music the paper sounds need a little more to stay clearly above it.
    soundGain: 15,
    // With --music: the bed at -16 LUFS, ducking under each sound (starting 80 ms early), a breath of 4 dB as the seal
    // is pressed and of 9 dB as the picture dips, a fade to the end; the whole mix then set to -14 LUFS, true peak under -1 dB.
    music: { bed: -16, lookahead: 0.08, duckThreshold: 0.03, duckRatio: 5, duckRelease: 380, breaths: [[13.25, 13.6, 14.3, 14.85, 4], [19.35, 19.75, 20.5, 21.05, 9]], fade: 1.8, loudness: -14, truePeak: -1 },
    end: { at: 30.35, full: 31.15, ...END },
  },
  // 15 seconds: the seal cracking close up, the seal pressed and the envelope addressed, a quick dip, then on Christmas
  // morning the card turned to the note and spun, its last half turn slowed, and the end card.
  15: {
    pieces: [['open1', 0, 4.0], ['send', 6.1, 10.35], ['open', 5.3, 12.05]],
    words: [[0, 2.6, W.open, { tall: { to: 2.45, at: 'seal' } }], [2.9, 4.0, W.phone], [4.1, 5.35, W.seal], [6.3, 8.0, W.sealed], [8.6, 10.2, W.mail]],
    dips: [[7.95, 8.25, 8.25, 8.65, 0.06]],
    soundGain: 15,
    music: { bed: -16, lookahead: 0.08, duckThreshold: 0.03, duckRatio: 5, duckRelease: 380, breaths: [[3.95, 4.25, 5.0, 5.5, 4]], fade: 1.2, loudness: -14, truePeak: -1 },
    end: { at: 12.55, full: 13.35, ...END },
  },
  // 6 seconds: the seal cracking close up under the first line, then the end card with one line.
  6: {
    pieces: [['open1', 0, 3.5], ['open', 9.3, 11.8]],
    words: [[0, 2.6, W.open, { tall: { to: 2.45, at: 'seal' } }]],
    dips: [],
    soundGain: 15,
    music: { bed: -16, lookahead: 0.08, duckThreshold: 0.03, duckRatio: 5, duckRelease: 380, breaths: [], fade: 0.9, loudness: -14, truePeak: -1 },
    end: { at: 3.5, full: 4.3, lines: ['Christmas cards', 'they open by hand.'], address: END.address },
  },
};

/** One still per shot, at these seconds of the main cut. */
const stills = {
  1: 0.78, 2: 5.0, 3: 9.25, '4a': 10.25, '4b': 11.9, '4c': 13.45, '4d': 16.75, '5a': 18.8, '5b': 20.2, '6a': 21.15,
  '6b': 21.75, '6c': 23.45, '6d': 26.5, '6e': 28.6, 7: 32.0,
};

module.exports = { fps: 60, story, takes, cuts, stills, words: W, end: END };
