#!/usr/bin/env node
// ============================================================
// Films the Christmas cards ad (version 2) from the real card table: the web
// app's CardTable and CardRack on /dev/card-film, filmed frame by frame in
// headless Chrome on the clock it shares with the share videos
// (card-film-clock.cjs). The story, its takes and its words are the shot list,
// card-ad-shots.cjs.
//
//   node scripts/film-card-ad.cjs --takes open1,send    film whole takes as frames (every take without --takes)
//   node scripts/film-card-ad.cjs --cut main --music <wav>
//                                    lay the filmed takes into a cut (main, 15, 6, seal), with a music bed
//   node scripts/film-card-ad.cjs --stills              one still per shot of the main cut
//   node scripts/film-card-ad.cjs --strip open:2:4:0.2  a row of one take's frames, to look its timing over
//   --shape tall|wide|post  tall: 1080 × 1920 at phone size; wide: 1920 × 1080, a wide window; post: 1080 × 1350, cut
//                       from the tall frames (rows 192-1542)
//   --work <folder>     frames and sounds (default <repo>/test-results/card-ad); --out <folder> the stills and films
//   --from, --to        with --takes: keep only these seconds' frames (the clock still runs through the take)
//   --overlays [--alpha 128]  where the words and end card sit; --bars-sheet  the platforms' buttons over a finished tall cut
//   --keep-picture, --reuse-picture
//                       keep a cut's silent picture master; later lay a new sound under it without composing again
//   --card, --rack, --only   another star card or rack (--card 44 --rack 40,45,8,44); only these shots' stills
//   --art <folder>      envelope and seal art to film with in place of the app's (art drawn larger; never shipped)
//   --url, --port       as film-card-videos.cjs
//   AD_DEBUG=1          log the table's state every tenth of a second and where each touch lands
//   AD_FFMPEG=1         print each ffmpeg command line
//
// Everything on screen is the app's own table: its envelope, wax, cloth, light,
// pen and sounds. The film adds only the words, a fingertip mark, moving in
// (by filming the page larger), speed changes, the dip to black, the end card
// and a fine grain. A finger moves the table through real touch input (Chrome's
// own touch events), so the card and the flap follow it as they do in the app.
// Sounds are written down by the frame they fired on and laid in by ffmpeg.
// ============================================================
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { WEB, REPO, chromium, CHROME, argument, designs, devServer, clockShim } = require('./card-film-clock.cjs');

const sharp = require(require.resolve('sharp', { paths: [path.dirname(require.resolve(path.join(WEB, 'node_modules/next/package.json')))] }));

const SHOTS = require(path.resolve(argument('shots', path.join(__dirname, 'card-ad-shots.cjs'))));
const FPS = SHOTS.fps;
/** A finger's touches reach the page 120 times a second of the table's time, as a phone's screen samples them, however the film's frames and steps fall. */
const TOUCH_EVERY = 1000 / 120;
/** The shutter for the fast moments: four steps over half a frame (180°, as a film camera), blended. */
const SHUTTER = 0.5;
/** The serif the table prints in (CardTable.module.css --serif): the ad's words are set in it. */
const SERIF = "ui-serif, 'New York', Georgia, 'Times New Roman', serif";
const CREAM = '#f6ecd9';

/**
 * The shapes. tall: a 360 × 640 phone at 3× (1080 × 1920); the table makes room above and below itself for the
 * platforms' own buttons. wide: a 1920 × 1080 window, where the card stands at its 640 cap.
 */
const SHAPES = {
  tall: { width: 360, height: 640, scale: 3, mobile: true, top: 150, bottom: 150 },
  wide: { width: 1920, height: 1080, scale: 1, mobile: false, top: 40, bottom: 60 },
};
/** 4:5 (the feeds) is cut from the tall film, rows 192-1542: the tall frames, words and end card, cropped. */
SHAPES.post = { ...SHAPES.tall, frames: 'tall', crop: { top: 192, height: 1350 } };

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
/** "4a" → "04a", for file names that sort in shot order. */
const label = (shot) => String(shot).replace(/^\d+/, (n) => n.padStart(2, '0'));
const smooth = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const ease = (x) => { const t = clamp(x); return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2; };

// ---- Time: the take's seconds on screen, and the table's milliseconds ----

/** The table's time (ms) at each of the take's seconds on screen, from its speed curve ([[second, rate], ...]). */
function clockOf(take) {
  const points = take.speed?.length ? take.speed : [[0, 1]];
  const rate = (s) => {
    if (s <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i += 1) {
      if (s <= points[i][0]) {
        const [a, ra] = points[i - 1];
        const [b, rb] = points[i];
        return ra + (rb - ra) * smooth((s - a) / (b - a));
      }
    }
    return points[points.length - 1][1];
  };
  const step = 1 / 4800;
  const table = [0];
  const end = take.length + 1;
  for (let s = step; s <= end + step; s += step) table.push(table[table.length - 1] + rate(s - step / 2) * step * 1000);
  return (s) => {
    const i = clamp(s, 0, end) / step;
    const k = Math.floor(i);
    return table[k] + (table[Math.min(k + 1, table.length - 1)] - table[k]) * (i - k);
  };
}

/** A gesture's path: the finger's place at `t` ms after it touched, through its key points ([ms, x, y], ...). */
function pathAt(points, t) {
  if (t <= points[0][0]) return { x: points[0][1], y: points[0][2] };
  const last = points[points.length - 1];
  if (t >= last[0]) return { x: last[1], y: last[2] };
  let i = 1;
  while (points[i][0] < t) i += 1;
  const [t0, x0, y0] = points[i - 1];
  const [t1, x1, y1] = points[i];
  const h = t1 - t0;
  // Hermite: at rest where it touched, at the last segment's speed where it lets go, the average between.
  const slope = (j, axis) => {
    if (j === 0) return 0;
    const a = points[j - 1];
    const b = points[j];
    const out = (b[axis] - a[axis]) / (b[0] - a[0]);
    if (j === points.length - 1) return out;
    const c = points[j + 1];
    const next = (c[axis] - b[axis]) / (c[0] - b[0]);
    return out * next <= 0 ? 0 : (out + next) / 2;
  };
  const u = (t - t0) / h;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  return {
    x: h00 * x0 + h10 * h * slope(i - 1, 1) + h01 * x1 + h11 * h * slope(i, 1),
    y: h00 * y0 + h10 * h * slope(i - 1, 2) + h01 * y1 + h11 * h * slope(i, 2),
  };
}

/** "Sam" as points along its strokes, evenly spaced, with each point's share of the whole length. */
function signaturePoints(strokes) {
  const out = [];
  let total = 0;
  for (const curve of strokes) {
    const points = [];
    for (let i = 0; i + 3 < curve.length; i += 3) {
      const [p0, p1, p2, p3] = [curve[i], curve[i + 1], curve[i + 2], curve[i + 3]];
      for (let k = i === 0 ? 0 : 1; k <= 24; k += 1) {
        const u = k / 24;
        const m = 1 - u;
        points.push([
          m ** 3 * p0[0] + 3 * m * m * u * p1[0] + 3 * m * u * u * p2[0] + u ** 3 * p3[0],
          m ** 3 * p0[1] + 3 * m * m * u * p1[1] + 3 * m * u * u * p2[1] + u ** 3 * p3[1],
        ]);
      }
    }
    const lengths = [0];
    for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    out.push({ points, lengths, start: total, length: lengths[lengths.length - 1] });
    total += lengths[lengths.length - 1];
  }
  return { strokes: out, total };
}

/**
 * The signature drawn by `progress` (0 to 1) of the signing, the pen lifted between strokes for `lift` of the time a
 * whole signature takes. Returns the strokes for the card (box units, to tenths) and the pen's point, or null while
 * it's lifted or done.
 */
function signatureAt(sig, progress, lift) {
  const n = sig.strokes.length;
  let left = clamp(progress) * (1 + lift * (n - 1));
  const strokes = [];
  const flat = (stroke, upTo) => {
    const out = [];
    for (let i = 0; i < stroke.points.length && stroke.lengths[i] <= upTo; i += 1) out.push(Math.round(stroke.points[i][0] * 10) / 10, Math.round(stroke.points[i][1] * 10) / 10);
    return out;
  };
  for (let s = 0; s < n; s += 1) {
    const stroke = sig.strokes[s];
    const share = stroke.length / sig.total;
    if (left < share) {
      // The pen is on this stroke.
      const drawn = (left / share) * stroke.length;
      const points = flat(stroke, drawn);
      const k = stroke.lengths.findIndex((l) => l > drawn);
      const f = (drawn - stroke.lengths[k - 1]) / (stroke.lengths[k] - stroke.lengths[k - 1]);
      const x = stroke.points[k - 1][0] + (stroke.points[k][0] - stroke.points[k - 1][0]) * f;
      const y = stroke.points[k - 1][1] + (stroke.points[k][1] - stroke.points[k - 1][1]) * f;
      points.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
      if (points.length >= 2) strokes.push(points);
      return { signature: { w: 400, h: 100, strokes }, pen: { x, y } };
    }
    strokes.push(flat(stroke, stroke.length));
    left -= share;
    if (s === n - 1) return { signature: { w: 400, h: 100, strokes }, pen: null };
    if (left < lift) {
      // Lifted, on its way to where the next stroke starts.
      const end = stroke.points[stroke.points.length - 1];
      const next = sig.strokes[s + 1].points[0];
      const f = smooth(left / lift);
      return { signature: { w: 400, h: 100, strokes }, pen: null, air: { x: end[0] + (next[0] - end[0]) * f, y: end[1] + (next[1] - end[1]) * f } };
    }
    left -= lift;
  }
  return { signature: strokes.length ? { w: 400, h: 100, strokes } : null, pen: null };
}

// ---- In the page ----

/** Runs in the page once the table is ready: hides the app's buttons and words, adds the fingertip, starts the clock. */
function startAdFilm({ clock, start, finger }) {
  const film = window.__film;
  const table = window.__cardTable;
  const css = document.createElement('style');
  css.textContent = `
    nextjs-portal { display: none !important; }
    [data-ui], [data-el="words"], [data-el="act"], [role="status"] { visibility: hidden !important; }
    [data-testid="cardRack"] > div:has(> [data-testid="cardRackClose"]) { visibility: hidden !important; }
    [data-testid="cardRack"] > div:has(> [data-testid="cardRackWrite"]) > p { visibility: hidden !important; }
    #adFinger { position: fixed; z-index: 2147483000; left: 0; top: 0; width: ${finger}px; height: ${finger}px; border-radius: 50%;
      pointer-events: none; opacity: 0; will-change: transform, opacity;
      background: radial-gradient(circle at 50% 50%, rgba(255, 253, 248, 0.62) 0%, rgba(255, 253, 248, 0.5) 52%, rgba(255, 253, 248, 0.34) 70%);
      box-shadow: inset 0 0 0 ${(finger * 0.035).toFixed(2)}px rgba(60, 45, 35, 0.26), 0 0 0 ${(finger * 0.02).toFixed(2)}px rgba(255, 253, 248, 0.35),
        0 ${(finger * 0.04).toFixed(2)}px ${(finger * 0.28).toFixed(2)}px rgba(0, 0, 0, 0.3); }
  `;
  document.head.append(css);
  const mark = document.createElement('div');
  mark.id = 'adFinger';
  document.body.append(mark);
  // Every pointer event the page gets, so the film knows a touch has landed before it moves the clock on.
  const input = { n: 0 };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    window.addEventListener(type, (e) => { if (e.pointerType === 'touch') input.n += 1; if (type === 'pointercancel') input.cancelled = (input.cancelled || 0) + 1; }, true);
  }
  window.__adInput = input;
  film.base = clock;
  film.t = 0;
  // What's already moving goes on the film's clock now: an animation that has finished (the table or the rack
  // fading in) stays finished; one still going (the snow, the candle) starts from the same place in every run.
  for (const animation of document.getAnimations()) {
    animation.pause();
    const end = animation.effect?.getComputedTiming?.().endTime;
    const now = Number(animation.currentTime) || 0;
    film.seen.set(animation, { t: 0, at: Number.isFinite(end) && now >= end ? end : 0 });
  }
  film.on = true;
  if (table) {
    // The light starts where its drift is at this moment of the day, as in the share videos.
    table.v.tx.x = Math.sin(film.base / 2900) * 0.62; table.v.tx.t = table.v.tx.x; table.v.tx.v = 0;
    table.v.ty.x = Math.sin(film.base / 4100 + 1) * 0.5; table.v.ty.t = table.v.ty.x; table.v.ty.v = 0;
    if (start.go) table.go(start.go, { tx: table.v.tx.x, ty: table.v.ty.x });
    if (start.arrive) table.restart(true);
    if (start.send) table.startSending({ sealedMark: true });
    // From here the light drifts by itself, and stops for a while after a touch, as it does in the app.
    table.lastTouch = -1e12;
  }
}

/** Runs in the page: where things are, for a finger to find them. */
function anchors() {
  const box = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  };
  const table = window.__cardTable;
  return {
    g: table?.g ?? null,
    seal: box('[data-el="seal"]'),
    press: box('[data-el="press"]'),
    card: box('[data-el="card"]'),
    flapIn: box('[data-el="flapIn"]'),
    flapOut: box('[data-el="flapOut"]'),
    front: box('[data-el="lFront"]'),
    pocket: box('[data-el="lPocket"]'),
    sign: box('[data-testid="cardSignature"] svg'),
    rackCard: box('[data-testid="cardRackCard"]'),
    rackWrite: box('[data-testid="cardRackWrite"]'),
  };
}

/** Runs in the page: one step of the film's clock to `t`, after the touches for it have landed. */
async function stepTo({ t, note, signature, finger }) {
  const film = window.__film;
  film.t = t;
  if (note !== undefined && window.__cardFilm) window.__cardFilm.setNote(note);
  if (signature !== undefined && window.__cardFilm) window.__cardFilm.setSignature(signature);
  film.runTimers();
  film.runFrames();
  // React's own updates (a state the engine reported, the note, the signature) land before the picture is taken.
  for (let i = 0; i < 3; i += 1) await new Promise((done) => { film.real.set(done, 0); });
  film.stepAnimations(true);
  const mark = document.getElementById('adFinger');
  if (mark) {
    mark.style.opacity = finger ? finger.o.toFixed(3) : '0';
    if (finger) mark.style.transform = `translate(${(finger.x - mark.offsetWidth / 2).toFixed(2)}px, ${(finger.y - mark.offsetHeight / 2).toFixed(2)}px) scale(${finger.s.toFixed(3)})`;
  }
  return film.sounds.length;
}

// ---- A take: one page, one scene, filmed through ----

class Take {
  constructor({ server, shape, shapeName, name, story, art, work }) {
    this.server = server;
    this.shape = shape;
    this.shapeName = shapeName;
    this.name = name;
    this.def = SHOTS.takes[name];
    this.story = story;
    this.art = art;
    this.work = work;
    this.filmAt = clockOf(this.def);
    // A take that moves in is drawn at its closest view's scale from the start (a 1.6× close-up of a 3× phone: 4.8×),
    // and every frame is taken at or below it: nothing is ever enlarged, and a layer mid-animation keeps its detail.
    this.dpr = shape.scale * Math.max(1, ...(this.def.view || []).map((key) => key.z || 1));
    this.sounds = [];
    this.expected = 0;
    this.gestures = (this.def.gestures || []).map((g) => ({ ...g, t0: this.filmAt(g.at), state: 'waiting' }));
    this.sig = signaturePoints(story.signature);
    this.focus = new Map();
  }

  url() {
    const { story, shape } = this;
    const card = story.cards.get(story.card);
    const query = new URLSearchParams({
      scene: this.def.scene, design: card.id, number: String(card.number), caption: card.caption, paper: card.paper, table: card.table,
      year: String(story.year), from: story.from, to: story.to, note: this.def.write ? '' : story.note, mailed: story.mailed, until: story.until,
      top: String(this.def.insets?.[this.shapeName]?.top ?? shape.top), bottom: String(this.def.insets?.[this.shapeName]?.bottom ?? shape.bottom),
    });
    const left = this.def.insets?.[this.shapeName]?.left;
    if (left) query.set('left', String(left));
    if (this.def.scene === 'rack') {
      const rack = story.rack.map((n) => story.cards.get(n)).map(({ id, number, caption, paper, table }) => ({ id, number, caption, paper, table }));
      query.set('rack', JSON.stringify(rack));
      query.set('start', rack[0].id);
    }
    return `${this.server}/dev/card-film?${query}`;
  }

  async open() {
    const { shape } = this;
    // Its own Chrome at the take's real device scale. Chrome's emulated scale draws a layer turned in 3D (the flap
    // lifting) from a lower-resolution copy; a real one keeps every layer at full detail. Only the size is emulated.
    this.browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [`--force-device-scale-factor=${this.dpr}`] });
    this.context = await this.browser.newContext({ viewport: null, hasTouch: true, colorScheme: 'dark', reducedMotion: 'no-preference' });
    const page = await this.context.newPage();
    this.page = page;
    this.cdp = await this.context.newCDPSession(page);
    await this.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: shape.width, height: shape.height, deviceScaleFactor: 0, mobile: shape.mobile, screenWidth: shape.width, screenHeight: shape.height,
    });
    await this.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    this.trouble = [];
    page.on('pageerror', (error) => this.trouble.push(error.message));
    await page.addInitScript(clockShim);
    if (this.art) {
      // Art drawn larger, for filming only: the same files by name, from the folder given.
      await page.route(/\/holiday-cards\/table\/[^/?]+\.webp/, (route) => {
        const file = path.join(this.art, path.basename(new URL(route.request().url()).pathname));
        if (fs.existsSync(file)) route.fulfill({ path: file, contentType: 'image/webp' });
        else route.continue();
      });
    }
    await page.goto(this.url(), { waitUntil: 'networkidle', timeout: 180000 });
    if (this.def.scene === 'rack') {
      await page.waitForSelector('[data-testid="cardRackCard"] img', { timeout: 60000 });
    } else {
      // The table shows its envelope only once its art, the picture and the pen are ready.
      await page.waitForFunction(() => {
        const front = document.querySelector('[data-el="lFront"]');
        return Boolean(window.__cardTable && front && front.style.visibility !== 'hidden');
      }, null, { timeout: 60000 });
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
    });
    await page.waitForTimeout(1800);
    await page.evaluate(() => window.__cardTable?.setPaused(true));
    await page.waitForTimeout(150);
    const finger = Math.round(this.shape.mobile ? 38 : 64);
    await page.evaluate(startAdFilm, { clock: this.def.clock, start: this.def.start || {}, finger });
    await page.evaluate(() => window.__cardTable?.setPaused(false));
    if (this.def.signed) {
      // It arrives signed: Sam's whole signature, as the server keeps it with the note.
      const { signature } = signatureAt(this.sig, 1, 0);
      await page.evaluate(async (sig) => {
        window.__cardFilm.setSignature(sig);
        for (let i = 0; i < 3; i += 1) await new Promise((done) => { window.__film.real.set(done, 0); });
      }, signature);
    }
    // The rack's pictures load as each card comes: have them all ready before the clock starts.
    if (this.def.scene === 'rack') {
      await page.evaluate(async (ids) => {
        await Promise.all(ids.map((id) => { const image = new Image(); image.src = `/holiday-cards/card/${id}.jpg`; return image.decode().catch(() => {}); }));
      }, this.story.rack.map((n) => this.story.cards.get(n).id));
    }
  }

  async close() {
    await this.context?.close();
    await this.browser?.close();
    if (this.trouble.length) throw new Error(`${this.name}: the page reported ${this.trouble.join('; ')}`);
  }

  /** Touch input through Chrome: a touch starts, moves or ends, and the film waits for the page to have it. */
  async touch(type, point) {
    const touchPoints = type === 'touchEnd' ? [] : [{ x: point.x, y: point.y, radiusX: 11, radiusY: 11, force: 1, id: 1 }];
    const began = Date.now();
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints, modifiers: 0 });
    this.expected += 1;
    const landed = await this.page.evaluate(async (n) => {
      for (let i = 0; i < 200 && window.__adInput.n < n; i += 1) await new Promise((done) => { window.__film.real.set(done, 2); });
      return { n: window.__adInput.n, cancelled: window.__adInput.cancelled || 0 };
    }, this.expected);
    this.touchStats = this.touchStats || { n: 0, missed: 0, ms: 0, worst: 0 };
    const waited = Date.now() - began;
    this.touchStats.n += 1; this.touchStats.ms += waited; this.touchStats.worst = Math.max(this.touchStats.worst, waited);
    if (landed.n < this.expected) {
      // A move to where the finger already was isn't an event: count what landed.
      this.touchStats.missed += 1;
      if (process.env.AD_DEBUG) console.log(`\n${this.name} ${type} at (${point?.x?.toFixed(2)}, ${point?.y?.toFixed(2)}) never landed (${waited} ms)`);
      this.expected = landed.n;
    }
    if (landed.cancelled) throw new Error(`${this.name}: the page cancelled a touch`);
  }

  /** Where the finger is and what it's doing at the table's time `t`; touches go to the page as they happen. */
  async fingers(t) {
    let shown = null;
    for (const g of this.gestures) {
      if (g.state === 'waiting' && t >= g.t0) {
        const a = await this.page.evaluate(anchors);
        g.missing = Object.entries(a).filter(([, v]) => v === null).map(([k]) => k);
        if (process.env.AD_DEBUG) console.log(`\n${this.name} touch at ${g.at}s`, JSON.stringify(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v && v.x !== undefined ? [Math.round(v.x), Math.round(v.y), Math.round(v.w), Math.round(v.h)] : v && k === 'g' ? 'g' : v]))));
        let points;
        try {
          points = g.path(a, a.g || {});
        } catch (error) {
          throw new Error(`${this.name}: the touch at ${g.at}s needs something that isn't on the table (missing: ${g.missing.join(', ')})`);
        }
        g.points = points;
        g.end = g.kind === 'press' ? g.hold : points[points.length - 1][0];
        g.last = pathAt(points, 0);
        await this.touch('touchStart', g.last);
        g.state = 'down';
      }
      if (g.state === 'down') {
        const at = t - g.t0;
        // A move goes to the page at the screen's own rate, and always at the end.
        if (at >= g.end || t - (g.sentAt ?? g.t0) >= TOUCH_EVERY - 1e-6) {
          const p = pathAt(g.points, Math.min(at, g.end));
          if (Math.hypot(p.x - g.last.x, p.y - g.last.y) > 0.01) {
            await this.touch('touchMove', p);
            g.last = p;
          }
          g.sentAt = t;
        }
        if (at >= g.end) {
          await this.touch('touchEnd', g.last);
          g.state = 'up';
          g.upAt = t;
        }
      }
      // The mark: in as the finger lands, a touch smaller while it presses, out as it lifts.
      if (g.state === 'down') {
        const at = t - g.t0;
        shown = { x: g.last.x, y: g.last.y, o: smooth(at / 70), s: 1 - 0.06 * smooth(at / 90) };
      } else if (g.state === 'up' && t - g.upAt < 170) {
        const k = 1 - (t - g.upAt) / 170;
        shown = { x: g.last.x, y: g.last.y, o: smooth(k), s: 0.94 + 0.08 * (1 - k) };
      }
    }
    return shown;
  }

  /** The note written so far, and the signature: the pen's own progress at the table's time `t`. */
  async writing(t) {
    const out = {};
    const { write, sign } = this.def;
    if (write) {
      const k = clamp((t - write.from * 1000) / ((write.to - write.from) * 1000));
      const n = Math.round(k * this.story.note.length);
      if (n !== this.noteShown) { out.note = this.story.note.slice(0, n); this.noteShown = n; }
    }
    if (sign) {
      const k = (t - sign.from * 1000) / ((sign.to - sign.from) * 1000);
      if (k >= 0) {
        const { signature, pen, air } = signatureAt(this.sig, k, sign.lift);
        const key = JSON.stringify(signature);
        if (key !== this.signShown) { out.signature = signature; this.signShown = key; }
        out.signing = k <= 1.3;
        // The fingertip on the pen's point, mapped from the signature's box on the card; dimmer while it's lifted.
        const box = this.signBox;
        const at = (p) => ({ x: box.left + (p.x / 400) * box.w, y: box.top + (p.y / 100) * box.h });
        if (box && (pen || air)) {
          if (this.penDown === undefined || this.penDown === null) this.penDown = t;
          const p = at(pen || air);
          this.penLast = { ...p, t };
          out.finger = { ...p, o: smooth((t - this.penDown) / 60) * (pen ? 1 : 0.55), s: pen ? 0.94 : 1 };
        } else if (box && this.penLast && t - this.penLast.t < 170) {
          const fade = 1 - (t - this.penLast.t) / 170;
          out.finger = { x: this.penLast.x, y: this.penLast.y, o: smooth(fade), s: 0.94 + 0.08 * (1 - fade) };
        }
      }
    }
    return out;
  }

  /** The view at the take's second `s`: the part of the page filmed, in CSS px. */
  async view(s) {
    const keys = this.def.view?.length ? this.def.view : [{ at: 0, z: 1 }];
    let a = keys[0];
    let b = keys[0];
    for (let i = 0; i < keys.length; i += 1) {
      if (keys[i].at <= s) { a = keys[i]; b = keys[Math.min(i + 1, keys.length - 1)]; }
    }
    const k = b === a ? 0 : ease((s - a.at) / (b.at - a.at));
    const { width, height } = this.shape;
    // A key's centre: what it looks at (found on the page the first time it's needed, then kept), or the middle at 1×.
    const centre = async (key) => {
      if (!key.focus) return { x: width / 2, y: height / 2 };
      if (!this.focus.has(key.focus)) {
        const found = (await this.page.evaluate(anchors))[key.focus];
        if (found) this.focus.set(key.focus, found);
      }
      const f = this.focus.get(key.focus) || { x: width / 2, y: height / 2 };
      // An offset may differ by shape ({ tall, wide }): in the wide shape the view sits off the seal, clear of the words.
      const off = (value) => (value && typeof value === 'object' ? value[this.shapeName] ?? 0 : value || 0);
      return { x: f.x + off(key.dx) * width, y: f.y + off(key.dy) * height };
    };
    const ca = await centre(a);
    const cb = b === a ? ca : await centre(b);
    const z = a.z + (b.z - a.z) * k;
    const w = width / z;
    const h = height / z;
    const x = ca.x + (cb.x - ca.x) * k;
    const y = ca.y + (cb.y - ca.y) * k;
    return { x: clamp(x - w / 2, 0, width - w), y: clamp(y - h / 2, 0, height - h), width: w, height: h, z };
  }

  /** One step of the table's clock to the take's second `s`, then (if `capture`) its picture as raw RGB. */
  async step(s, capture) {
    const t = this.filmAt(s);
    const fingerFromTouch = await this.fingers(t);
    const write = await this.writing(t);
    const finger = write.finger || fingerFromTouch;
    const count = await this.page.evaluate(stepTo, { t, note: write.note, signature: write.signature, finger });
    if (write.signing) this.signBox = (await this.page.evaluate(anchors)).sign || this.signBox;
    if (count > this.sounds.length) {
      const fresh = await this.page.evaluate((from) => window.__film.sounds.slice(from), this.sounds.length);
      for (const sound of fresh) this.sounds.push({ name: path.basename(new URL(sound.src).pathname, '.mp3'), table: sound.at, second: s });
    }
    if (process.env.AD_DEBUG && Math.abs(s * 10 - Math.round(s * 10)) < 0.022) {
      const state = await this.page.evaluate(() => { const e = window.__cardTable; return e ? { step: e.step, send: e.send, pull: +e.v.pull.x.toFixed(3), lay: +e.v.lay.x.toFixed(3), env: +e.v.envDeg.x.toFixed(1), deg: +e.v.deg.x.toFixed(1), drag: e.dragging?.mode ?? null } : null; });
      console.log(`${this.name} ${s.toFixed(1)}s t=${t.toFixed(0)} ${JSON.stringify(state)}`);
    }
    if (!capture) return null;
    const v = await this.view(s);
    const [ow, oh] = [this.shape.width * this.shape.scale, this.shape.height * this.shape.scale];
    // The view's part of the page at the film's size: moving in films the page larger. When the scale has changed since
    // the last picture, Chrome draws the page afresh at the new scale and may hand over a picture before every tile is
    // drawn: that first picture is thrown away and the next one, complete, is kept.
    const clip = { x: v.x, y: v.y, width: v.width, height: v.height, scale: ow / (v.width * this.dpr) };
    const shoot = () => this.cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false, clip });
    if (this.lastScale !== undefined && Math.abs(this.lastScale - clip.scale) > 1e-6) await shoot();
    this.lastScale = clip.scale;
    const shot = await shoot();
    const image = sharp(Buffer.from(shot.data, 'base64')).removeAlpha();
    const meta = await image.metadata();
    const raw = meta.width === ow && meta.height === oh ? image : image.resize(ow, oh, { fit: 'fill', kernel: 'lanczos3' });
    return raw.raw().toBuffer();
  }

  /** Is the take's second `s` one of its fast moments, filmed in four steps over a 180° shutter and blended? */
  blurred(s) {
    return (this.def.blur || []).some(([a, b]) => s >= a && s < b);
  }

  /**
   * Films the take: every frame steps the clock (four steps where it's blurred), and the frames in `wanted` (indexes,
   * or all) are written as PNG. Returns the sounds, each with the second it fired on.
   */
  async film(dir, wanted = null) {
    fs.mkdirSync(dir, { recursive: true });
    const count = Math.round(this.def.length * FPS);
    const [ow, oh] = [this.shape.width * this.shape.scale, this.shape.height * this.shape.scale];
    for (let i = 0; i < count; i += 1) {
      const capture = !wanted || wanted.has(i);
      const s = i / FPS;
      let frame;
      if (this.blurred(s)) {
        const sum = new Float32Array(ow * oh * 3);
        for (let k = 0; k < 4; k += 1) {
          const raw = await this.step(s + ((k - 1.5) / 4) * (SHUTTER / FPS), capture);
          if (raw) for (let p = 0; p < sum.length; p += 1) sum[p] += raw[p];
        }
        if (capture) {
          frame = Buffer.alloc(sum.length);
          for (let p = 0; p < sum.length; p += 1) frame[p] = Math.round(sum[p] / 4);
        }
      } else {
        frame = await this.step(s, capture);
      }
      if (capture) {
        await sharp(frame, { raw: { width: ow, height: oh, channels: 3 } }).png({ compressionLevel: 3 }).toFile(path.join(dir, `f_${String(i).padStart(5, '0')}.png`));
      }
      if (i % 60 === 0) process.stdout.write(`  ${this.name} ${s.toFixed(1)}s\r`);
    }
    fs.writeFileSync(path.join(dir, 'sounds.json'), JSON.stringify(this.sounds, null, 1));
    return this.sounds;
  }
}

// ---- Words, the end card and the platforms' bars, drawn once by Chrome as transparent pictures ----

function wordsHtml(shape, lines) {
  const tall = shape.mobile;
  const box = tall
    ? 'left: 20px; right: 20px; top: 96px; height: 51px; justify-content: center; align-items: center; text-align: center; font-size: 23px;'
    : 'left: 96px; width: 500px; top: 330px; height: 170px; justify-content: center; align-items: flex-start; text-align: left; font-size: 58px;';
  return `<!doctype html><html><head><style>
    html, body { margin: 0; background: transparent; }
    .w { position: absolute; display: flex; flex-direction: column; ${box} font-family: ${SERIF}; font-style: italic; line-height: 1.1;
      color: ${CREAM}; text-shadow: 0 ${tall ? 1 : 2}px ${tall ? 9 : 18}px rgba(0, 0, 0, 0.42), 0 0 ${tall ? 2 : 4}px rgba(0, 0, 0, 0.25); letter-spacing: 0.005em; }
    .w span { white-space: nowrap; }
  </style></head><body><div class="w">${lines.map((line) => `<span>${line}</span>`).join('')}</div></body></html>`;
}

function markSvg(fill) {
  const holes = [[23.5, 4], [40.5, 4], [23.5, 60], [40.5, 60], [4, 23.5], [4, 40.5], [60, 23.5], [60, 40.5]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="#000"/>`).join('');
  // The perforation mark (components/brand/PantopusMark.tsx), its reverse colours for a dark ground.
  return `<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true"><defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
    <rect width="64" height="64" fill="#000"/><rect x="4" y="4" width="56" height="56" rx="13" fill="#fff"/>${holes}<rect x="20" y="20" width="24" height="24" rx="4" fill="#000"/></mask></defs>
    <rect width="64" height="64" fill="${fill}" mask="url(#m)"/>
    <path d="M26 32.4 L30.2 36.6 L38.2 26.8" fill="none" stroke="${fill}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** The end card, in parts that come in one after another: mark, name, line, badges, address. */
function endHtml(shape, server, end, parts) {
  const tall = shape.mobile;
  const u = tall ? 1 : 2.5;
  const show = (part) => (parts.includes(part) ? 1 : 0);
  return `<!doctype html><html><head><style>
    html, body { margin: 0; background: transparent; }
    .end { position: absolute; left: 0; right: 0; top: ${tall ? 132 : 186}px; display: flex; flex-direction: column; align-items: center; color: ${CREAM};
      text-shadow: 0 ${u}px ${10 * u}px rgba(0, 0, 0, 0.45); }
    .mark { width: ${50 * u}px; height: ${50 * u}px; filter: drop-shadow(0 ${2 * u}px ${8 * u}px rgba(0,0,0,.45)); opacity: ${show('mark')}; }
    .name { margin-top: ${10 * u}px; font: 600 ${38 * u}px/1 -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.01em; opacity: ${show('name')}; }
    .line { margin-top: ${24 * u}px; font: italic ${23 * u}px/1.18 ${SERIF}; text-align: center; opacity: ${show('line')}; }
    .badges { margin-top: ${26 * u}px; display: flex; gap: ${10 * u}px; opacity: ${show('badges')}; }
    .badges img { height: ${40 * u}px; width: auto; display: block; }
    .address { margin-top: ${22 * u}px; font: 600 ${17 * u}px/1 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif; letter-spacing: 0.04em; color: #fbf3e4; opacity: ${show('address')}; }
  </style></head><body><div class="end">
    <div class="mark">${markSvg('#ffffff')}</div>
    <div class="name">Pantopus</div>
    <div class="line">${end.lines.join('<br>')}</div>
    <div class="badges"><img src="${server}/landing/badge-appstore.svg" alt=""><img src="${server}/landing/badge-playstore.svg" alt=""></div>
    <div class="address">${end.address}</div>
  </div></body></html>`;
}

/**
 * The platforms' own buttons over a tall frame, drawn roughly where they sit (no platform's art): its top bar, the
 * column of buttons on the right, and the name, caption and call to action at the bottom. The dashed box is the area
 * that platform's guidance keeps clear for words and anything that matters.
 */
function barsHtml(platform) {
  const icon = (x, y, r = 13) => `<div style="position:absolute;left:${x - r}px;top:${y - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:rgba(255,255,255,.88);box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`;
  const bar = (x, y, w, h, o = 0.85, r = 4) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${r}px;background:rgba(255,255,255,${o});box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`;
  const label = (text) => `<div style="position:absolute;left:6px;top:6px;font:600 9px/1.2 -apple-system,sans-serif;color:#fff;background:rgba(200,30,60,.85);padding:2px 5px;border-radius:3px">${text}</div>`;
  const shade = '<div style="position:absolute;left:0;right:0;bottom:0;height:200px;background:linear-gradient(to top,rgba(0,0,0,.55),rgba(0,0,0,0))"></div>';
  const box = (top, bottom, left, right) => `<div style="position:absolute;left:${left}px;right:${right}px;top:${top}px;bottom:${bottom}px;border:1.2px dashed rgba(255,70,90,.95)"></div>`;
  let parts = '';
  if (platform === 'meta') {
    // Meta's ads guide (Instagram Reels): keep 14% top, 35% bottom and 6% each side clear.
    parts = shade + bar(14, 22, 44, 12) + icon(334, 28, 10)
      + [380, 428, 476, 524].map((y) => icon(334, y, 12)).join('') + bar(322, 566, 24, 24, 0.85, 5)
      + icon(28, 520, 12) + bar(46, 513, 120, 9) + bar(46, 526, 60, 7, 0.6) + bar(16, 544, 240, 8, 0.7) + bar(16, 557, 170, 8, 0.7)
      + bar(16, 578, 300, 30, 0.92, 8) + box(90, 224, 22, 22) + label('Instagram / Facebook Reels (approx.)');
  } else if (platform === 'tiktok') {
    // TikTok publishes its in-feed safe zone as template files only; this follows the usual layout.
    parts = shade + bar(110, 20, 140, 13) + icon(336, 26, 9)
      + icon(333, 322, 17) + [384, 436, 488, 540].map((y) => icon(333, y, 13)).join('') + icon(333, 594, 14)
      + bar(14, 500, 110, 11) + bar(14, 518, 250, 8, 0.7) + bar(14, 531, 200, 8, 0.7) + bar(14, 548, 70, 12, 0.6)
      + bar(14, 572, 290, 28, 0.92, 4) + bar(0, 612, 360, 28, 0.5, 0) + box(70, 160, 20, 66) + label('TikTok in-feed (approx.)');
  } else {
    // YouTube Shorts: no published numbers; the usual buttons.
    parts = shade + icon(300, 26, 10) + icon(336, 26, 10)
      + [364, 414, 464, 514, 566].map((y) => icon(333, y, 14)).join('')
      + icon(28, 532, 13) + bar(48, 525, 110, 10) + bar(16, 552, 230, 8, 0.7)
      + bar(16, 574, 290, 30, 0.92, 15) + box(64, 150, 16, 64) + label('YouTube Shorts (approx.)');
  }
  return `<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style></head><body>${parts}</body></html>`;
}

/** Chrome draws an overlay page as a transparent picture at the shape's size; returns raw RGBA. */
async function drawOverlay(context, shape, html) {
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  const shot = await page.screenshot({ type: 'png', omitBackground: true });
  await page.close();
  const image = sharp(shot).ensureAlpha();
  const meta = await image.metadata();
  const [w, h] = [shape.width * shape.scale, shape.height * shape.scale];
  return (meta.width === w && meta.height === h ? image : image.resize(w, h, { fit: 'fill' })).raw().toBuffer();
}

// ---- Laying a cut together ----

/** A cut's pieces, its words, dips and end card, as what's on screen at each of its seconds. */
function cutPlan(cut) {
  let at = 0;
  const pieces = cut.pieces.map(([take, from, to]) => { const piece = { take, from, to, at }; at += to - from; return piece; });
  return { pieces, length: at };
}

function wordsAlpha(cut, s) {
  const out = [];
  for (const [a, b, lines] of cut.words) {
    if (s < a - 0.001 || s > b + 0.001) continue;
    const k = Math.min(smooth((s - a) / 0.22), smooth((b - s) / 0.22));
    if (k > 0.001) out.push({ lines, k });
  }
  return out;
}

function dipAt(cut, s) {
  let k = 1;
  for (const [a, b, c, d, floor] of cut.dips || []) {
    if (s >= a && s < b) k = Math.min(k, 1 - (1 - floor) * smooth((s - a) / (b - a)));
    else if (s >= b && s < c) k = Math.min(k, floor);
    else if (s >= c && s < d) k = Math.min(k, floor + (1 - floor) * smooth((s - c) / (d - c)));
  }
  return k;
}

/** Composes one frame of a cut: the take's frame, the dip, the end card, the words and the grain. Raw RGB in and out. */
async function compose({ raw, shape, s, cut, overlays, frameNo, bars }) {
  const [w, h] = [shape.width * shape.scale, shape.height * shape.scale];
  let rgb = Buffer.from(raw);
  const end = cut.end;
  if (end && s >= end.at) {
    // The table dims and softens under the end card.
    const k = smooth((s - end.at) / 0.5);
    const soft = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).blur(Math.max(0.3, 9 * k * shape.scale / 3)).raw().toBuffer();
    const dim = 1 - 0.56 * k;
    for (let p = 0; p < rgb.length; p += 1) rgb[p] = Math.round(soft[p] * dim);
  }
  const dip = dipAt(cut, s);
  if (dip < 0.999) for (let p = 0; p < rgb.length; p += 1) rgb[p] = Math.round(rgb[p] * dip);
  const layers = [];
  for (const { lines, k } of wordsAlpha(cut, s)) layers.push({ image: await overlays.words(lines), k });
  if (end && s >= end.at) {
    const parts = ['mark', 'name', 'line', 'badges', 'address'];
    const span = end.full - end.at - 0.25;
    parts.forEach((part, i) => {
      const a = end.at + 0.18 + (i * span) / parts.length;
      const k = smooth((s - a) / 0.4);
      if (k > 0.001) layers.push({ part, k });
    });
  }
  for (const layer of layers) {
    const image = layer.part ? await overlays.end(layer.part) : layer.image;
    for (let p = 0, q = 0; p < rgb.length; p += 3, q += 4) {
      const a = (image[q + 3] / 255) * layer.k;
      if (a <= 0) continue;
      rgb[p] = Math.round(rgb[p] * (1 - a) + image[q] * a);
      rgb[p + 1] = Math.round(rgb[p + 1] * (1 - a) + image[q + 1] * a);
      rgb[p + 2] = Math.round(rgb[p + 2] * (1 - a) + image[q + 2] * a);
    }
  }
  // A fine grain over everything (about 3.5%), different every frame, so the dark cloth doesn't band.
  let seed = (frameNo * 2654435761) >>> 0;
  for (let p = 0; p < rgb.length; p += 3) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const n = ((seed >>> 8) / 16777216 - 0.5) * 18;
    rgb[p] = clamp(Math.round(rgb[p] + n), 0, 255);
    rgb[p + 1] = clamp(Math.round(rgb[p + 1] + n), 0, 255);
    rgb[p + 2] = clamp(Math.round(rgb[p + 2] + n), 0, 255);
  }
  if (bars) {
    for (let p = 0, q = 0; p < rgb.length; p += 3, q += 4) {
      const a = bars[q + 3] / 255;
      if (a <= 0) continue;
      rgb[p] = Math.round(rgb[p] * (1 - a) + bars[q] * a);
      rgb[p + 1] = Math.round(rgb[p + 1] * (1 - a) + bars[q + 1] * a);
      rgb[p + 2] = Math.round(rgb[p + 2] * (1 - a) + bars[q + 2] * a);
    }
  }
  return rgb;
}

/** The overlays a cut needs, drawn once each and kept; the end card is the cut's own (or the shot list's). */
function overlayCache(context, shape, server, endCard = SHOTS.end) {
  const words = new Map();
  const ends = new Map();
  return {
    words: async (lines) => {
      const key = lines.join('\n');
      if (!words.has(key)) words.set(key, await drawOverlay(context, shape, wordsHtml(shape, lines)));
      return words.get(key);
    },
    end: async (part) => {
      if (!ends.has(part)) {
        ends.set(part, await drawOverlay(context, shape, endHtml(shape, server, endCard, [part])));
      }
      return ends.get(part);
    },
  };
}

// ---- Runs ----

function story() {
  const { year, list } = designs();
  const cards = new Map(list.map((design) => [design.number, design]));
  // Another star, or another rack, for a version to compare: --card 44 --rack 40,45,8,44
  const card = argument('card') ? Number(argument('card')) : SHOTS.story.card;
  const rack = argument('rack') ? argument('rack').split(',').map(Number) : SHOTS.story.rack;
  for (const n of [card, ...rack]) if (!cards.has(n)) throw new Error(`No card ${n} in the server's list.`);
  return { ...SHOTS.story, card, rack, year, cards, total: list.length };
}

async function stills({ browser, server, shapeName, work, out, art }) {
  const shape = { ...SHAPES[shapeName] };
  const cut = SHOTS.cuts.main;
  const plan = cutPlan(cut);
  const s0 = story();
  // Which frame of which take each still needs.
  const wanted = new Map();
  const where = {};
  const only = argument('only') ? new Set(argument('only').split(',')) : null;
  for (const [shot, s] of Object.entries(SHOTS.stills)) {
    if (only && !only.has(String(shot))) continue;
    const piece = [...plan.pieces].reverse().find((p) => s >= p.at - 1e-9);
    const second = piece.from + (s - piece.at);
    const frame = Math.round(second * FPS);
    if (!wanted.has(piece.take)) wanted.set(piece.take, new Set());
    wanted.get(piece.take).add(frame);
    where[shot] = { take: piece.take, frame, s };
  }
  const takeNames = argument('takes') ? argument('takes').split(',') : [...wanted.keys()];
  for (const name of takeNames) {
    if (!wanted.has(name)) continue;
    const take = new Take({ browser, server, shape, shapeName, name, story: s0, art, work });
    const began = Date.now();
    await take.open();
    await take.film(path.join(work, shapeName, name), wanted.get(name));
    await take.close();
    const ts = take.touchStats;
    console.log(`${name}: ${((Date.now() - began) / 1000).toFixed(0)} s, sounds ${take.sounds.map((x) => `${x.name}@${x.second.toFixed(2)}s`).join(' ') || 'none'}${ts ? `, touches ${ts.n} (${ts.missed} never landed, ${(ts.ms / ts.n).toFixed(0)} ms average, worst ${ts.worst} ms)` : ''}`);
  }
  // Compose each still with its words (and the platforms' bars over the tall ones).
  const context = await browser.newContext({ viewport: { width: shape.width, height: shape.height }, deviceScaleFactor: shape.scale });
  const overlays = overlayCache(context, shape, server);
  const bars = {};
  if (shape.mobile) for (const p of ['meta', 'tiktok', 'youtube']) bars[p] = await drawOverlay(context, shape, barsHtml(p));
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = [shape.width * shape.scale, shape.height * shape.scale];
  const made = [];
  for (const [shot, { take, frame, s }] of Object.entries(where)) {
    const file = path.join(work, shapeName, take, `f_${String(frame).padStart(5, '0')}.png`);
    if (!fs.existsSync(file)) continue;
    const raw = await sharp(file).removeAlpha().raw().toBuffer();
    const frameNo = Math.round(s * FPS);
    const clean = await compose({ raw, shape, s, cut, overlays, frameNo });
    const name = `shot-${label(shot)}-${shapeName}.png`;
    await sharp(clean, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(out, name));
    made.push({ shot, file: path.join(out, name), s });
    for (const [p, overlay] of Object.entries(bars)) {
      const withBars = await compose({ raw, shape, s, cut, overlays, frameNo, bars: overlay });
      fs.mkdirSync(path.join(out, 'bars'), { recursive: true });
      await sharp(withBars, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(out, 'bars', `shot-${label(shot)}-${p}.png`));
    }
  }
  await context.close();
  return made;
}

async function filmTakes({ browser, server, shapeName, work, art }) {
  const shape = { ...SHAPES[shapeName] };
  const s0 = story();
  const names = (argument('takes') || Object.keys(SHOTS.takes).join(',')).split(',');
  for (const name of names) {
    const take = new Take({ browser, server, shape, shapeName, name, story: s0, art, work });
    const began = Date.now();
    await take.open();
    let wanted = null;
    if (argument('from') || argument('to')) {
      wanted = new Set();
      const to = Math.min(Number(argument('to') ?? take.def.length), take.def.length);
      for (let i = Math.round(Number(argument('from') ?? 0) * FPS); i < Math.round(to * FPS); i += 1) wanted.add(i);
    }
    await take.film(path.join(work, shapeName, name), wanted);
    await take.close();
    const ts = take.touchStats;
    console.log(`${name}: ${((Date.now() - began) / 1000).toFixed(0)} s, sounds ${take.sounds.map((x) => `${x.name}@${x.second.toFixed(2)}s`).join(' ') || 'none'}${ts ? `, touches ${ts.n} (${ts.missed} never landed, ${(ts.ms / ts.n).toFixed(0)} ms average, worst ${ts.worst} ms)` : ''}`);
  }
}

/** Runs ffmpeg and throws with its words if it fails (`loud`: keep its information lines, for readings like loudness). */
function ffmpeg(args, loud = false) {
  if (process.env.AD_FFMPEG) console.error(JSON.stringify(args));
  const run = spawnSync('ffmpeg', ['-hide_banner', '-v', loud ? 'info' : 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr.slice(-2000)}`);
  return run;
}

/** The colour tags every film carries: BT.709, limited range (on the frames too, or ffmpeg drops some of them). */
const TAGS = ['-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
const TAG_FRAMES = 'setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709';

/**
 * A cut from filmed takes: composed frames into a ProRes master, then the table's sounds laid in at the frames they
 * fired on, the master kept with its sound, and the H.264 film made from it.
 */
async function filmCut({ browser, server, shapeName, work, out, name, music }) {
  const shape = { ...SHAPES[shapeName] };
  const cut = SHOTS.cuts[name];
  if (!cut) throw new Error(`No cut ${name}: ${Object.keys(SHOTS.cuts).join(', ')}.`);
  const plan = cutPlan(cut);
  const frameShape = shape.frames || shapeName;
  const [w, fullH] = [shape.width * shape.scale, shape.height * shape.scale];
  const h = shape.crop ? shape.crop.height : fullH;
  const context = await browser.newContext({ viewport: { width: shape.width, height: shape.height }, deviceScaleFactor: shape.scale });
  const overlays = overlayCache(context, shape, server, cut.end || SHOTS.end);
  fs.mkdirSync(out, { recursive: true });
  const base = path.join(out, `cards-ad-${name}${/^\d+$/.test(name) ? 's' : ''}-${shapeName}`);
  const silent = `${base}-master-silent.mov`;
  const reuse = process.argv.includes('--reuse-picture') && fs.existsSync(silent);
  const master = reuse ? null : spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-r', String(FPS), '-i', '-',
    '-vf', `scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv422p10le,${TAG_FRAMES}`, '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', ...TAGS, silent],
  { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(plan.length * FPS);
  const sounds = [];
  for (const piece of plan.pieces) {
    const file = path.join(work, frameShape, piece.take, 'sounds.json');
    const list = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    for (const sound of list) if (sound.second >= piece.from && sound.second < piece.to) sounds.push({ name: sound.name, at: piece.at + (sound.second - piece.from), take: piece.take, second: sound.second });
  }
  const sheet = [];
  for (let j = 0; j < frames && !reuse; j += 1) {
    const s = j / FPS;
    const piece = [...plan.pieces].reverse().find((p) => s >= p.at - 1e-9);
    const frame = Math.min(Math.round((piece.from + (s - piece.at)) * FPS), Math.round(piece.to * FPS) - 1);
    const file = path.join(work, frameShape, piece.take, `f_${String(frame).padStart(5, '0')}.png`);
    const raw = await sharp(file).removeAlpha().raw().toBuffer();
    const full = await compose({ raw, shape, s, cut, overlays, frameNo: j });
    const rgb = shape.crop ? full.subarray(shape.crop.top * w * 3, (shape.crop.top + h) * w * 3) : full;
    if (j % (FPS / 4) === 0) sheet.push({ s, image: await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).resize(shape.mobile ? 180 : 320).jpeg({ quality: 85 }).toBuffer() });
    if (!master.stdin.write(rgb)) await new Promise((done) => { master.stdin.once('drain', done); });
    if (j % 60 === 0) process.stdout.write(`  cut ${name} ${s.toFixed(1)}s\r`);
  }
  if (master) {
    master.stdin.end();
    await new Promise((done) => { master.on('close', done); });
  }
  await context.close();

  // The sounds, each at the frame it fired on; with --music, a music bed under them.
  const seconds = (frames / FPS).toFixed(4);
  const length = frames / FPS;
  const inputs = ['-i', silent];
  const graph = [];
  sounds.forEach((sound, i) => {
    inputs.push('-i', path.join(WEB, 'public/holiday-cards/sounds', `${sound.name}.mp3`));
    const ms = Math.max(0, Math.round(sound.at * 1000));
    // As loud as the app plays them (0.85), raised by the cut's soundGain (dB): the same for all three, so their balance holds.
    const volume = 0.85 * 10 ** ((cut.soundGain || 0) / 20);
    graph.push(`[${i + 1}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${volume.toFixed(4)},adelay=${ms}|${ms}[s${i}]`);
  });
  if (sounds.length) graph.push(`${sounds.map((_, i) => `[s${i}]`).join('')}amix=inputs=${sounds.length}:normalize=0:duration=longest,apad,atrim=0:${seconds}[sfx]`);
  else { inputs.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'); graph.push(`[1:a]atrim=0:${seconds}[sfx]`); }
  const musicFile = music && cut.music ? music : null;
  let audioLabel;
  if (musicFile) {
    // The bed: brought to the cut's bed loudness, a breath where the picture dips, ended with a fade; it ducks under
    // each of the table's sounds so they stay clearly above it. Then the whole mix is set to the cut's loudness.
    const measured = ffmpeg(['-nostats', '-i', musicFile, '-af', 'ebur128', '-f', 'null', '-'], true).stderr;
    const musicLoudness = Number((measured.slice(measured.lastIndexOf('Summary:')).match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
    const bedGain = (cut.music.bed ?? -14.5) - musicLoudness;
    const m = sounds.length + (sounds.length ? 1 : 2);
    inputs.push('-i', musicFile);
    const breaths = (cut.music.breaths || []).map(([a, b, c, d, depth]) => {
      const floor = 10 ** (-depth / 20);
      return `(1-${(1 - floor).toFixed(4)}*clip((t-${a})/${(b - a).toFixed(3)},0,1)*(1-clip((t-${c})/${(d - c).toFixed(3)},0,1)))`;
    });
    const fade = cut.music.fade ?? 1.6;
    // Where the piece sits: from the cut's start, or (align 'end') so that its own ending lands on the cut's end. A piece
    // longer than the room starts part way in, faded in; a shorter one starts late, after the table's sounds alone.
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', musicFile], { encoding: 'utf8' });
    const musicLength = Number(probe.stdout.trim());
    const offset = cut.music.align === 'end' ? length - musicLength : 0;
    const placed = offset >= 0
      ? `adelay=${Math.round(offset * 1000)}|${Math.round(offset * 1000)},apad,atrim=0:${seconds}`
      : `atrim=start=${(-offset).toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${cut.music.fadeIn ?? 0.4},apad,atrim=0:${seconds}`;
    // A piece that ends by itself inside the cut needs no fade; one cut short is faded out with the end card.
    const fadeOut = cut.music.align === 'end' ? '' : `,afade=t=out:st=${(length - fade).toFixed(3)}:d=${fade}`;
    graph.push(`[${m}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,${placed},asetpts=PTS-STARTPTS,volume=${bedGain.toFixed(2)}dB`
      + `${breaths.length ? `,volume='${breaths.join('*')}':eval=frame` : ''}${fadeOut}[bed]`);
    // The ducking looks ahead: the key is the sounds as they are, while the music and the sounds in the mix run late by
    // the look-ahead; the music is already down when each sound lands, and the finished mix is moved back into place.
    const ahead = (cut.music.lookahead ?? 0.08).toFixed(3);
    const ms = Math.round(Number(ahead) * 1000);
    const bedLine = graph.findIndex((line) => line.endsWith('[bed]'));
    graph[bedLine] = graph[bedLine].replace(/\[bed\]$/, `,adelay=${ms}|${ms}[bed]`);
    const duck = `sidechaincompress=threshold=${cut.music.duckThreshold ?? 0.02}:ratio=${cut.music.duckRatio ?? 8}:attack=5:release=${cut.music.duckRelease ?? 350}:knee=4`;
    const back = `atrim=start=${ahead},asetpts=PTS-STARTPTS,apad,atrim=0:${seconds}`;
    const mixOf = (ducked) => `[${ducked}][sfx1]amix=inputs=2:normalize=0:duration=first,${back}[mix]`;
    // The check pass writes every branch to a file: the sounds alone, the ducked music alone, and the mix before its
    // loudness is set. Every branch must reach a real output: a split branch sent to anullsink let ffmpeg run the
    // split's input to its end and cut the mix off where the last of the table's sounds ended.
    ffmpeg([...inputs, '-filter_complex', [...graph, '[sfx]asplit=3[sfxlate][key][sfxcheck]', `[sfxlate]adelay=${ms}|${ms}[sfx1]`, `[bed][key]${duck}[ducked]`,
      '[ducked]asplit=2[ducked1][bedlate]', `[bedlate]${back}[bedcheck]`, mixOf('ducked1')].join(';'),
    '-map', '[sfxcheck]', '-c:a', 'pcm_f32le', `${base}-check-sounds.wav`, '-map', '[bedcheck]', '-c:a', 'pcm_f32le', `${base}-check-music.wav`,
    '-map', '[mix]', '-c:a', 'pcm_f32le', `${base}-check-mix.wav`]);
    // The mix's loudness and true peak, measured on that file; one straight gain takes it to the cut's loudness, held
    // back if its peaks would pass the true-peak ceiling.
    const mixMeasure = ffmpeg(['-nostats', '-i', `${base}-check-mix.wav`, '-af', 'ebur128=peak=true', '-f', 'null', '-'], true).stderr;
    const summary = mixMeasure.slice(mixMeasure.lastIndexOf('Summary:'));
    const mixLoudness = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)[1]);
    const mixPeak = Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)[1]);
    const gain = Math.min((cut.music.loudness ?? -14) - mixLoudness, (cut.music.truePeak ?? -1) - mixPeak);
    graph.push('[sfx]asplit=2[sfxlate][key]', `[sfxlate]adelay=${ms}|${ms}[sfx1]`, `[bed][key]${duck}[ducked]`, mixOf('ducked'), `[mix]volume=${gain.toFixed(2)}dB[final]`);
    audioLabel = '[final]';
    fs.writeFileSync(`${base}-mix.json`, JSON.stringify({ music: path.basename(musicFile), musicLength, offset, musicLoudness, bedGain, soundGain: cut.soundGain, mixLoudness, mixPeak, gain }, null, 1));
  } else {
    graph.push('[sfx]anull[final]');
    audioLabel = '[final]';
  }
  const withSound = `${base}-master.mov`;
  ffmpeg([...inputs, '-filter_complex', graph.join(';'), '-map', '0:v', '-map', audioLabel, '-c:v', 'copy', '-c:a', 'pcm_s24le', '-ar', '48000', '-t', seconds, withSound]);
  if (!process.argv.includes('--keep-picture') && !process.argv.includes('--reuse-picture')) fs.rmSync(silent);
  // The film: H.264 High, 4:2:0, limited range, BT.709, about 18 Mbps, AAC 256 kbps 48 kHz, fast start.
  const film = `${base}.mp4`;
  ffmpeg(['-i', withSound, '-vf', `scale=in_range=tv:out_range=tv,format=yuv420p,${TAG_FRAMES}`, '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level:v', '4.2',
    '-b:v', '18M', '-maxrate', '24M', '-bufsize', '36M', '-g', String(FPS), '-bf', '2', '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:range=tv', ...TAGS,
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', film]);
  // A sheet of its frames, four a second, to look the whole cut over at once.
  const tw = shape.mobile ? 180 : 320;
  const th = Math.round((tw * h) / w);
  const cols = shape.mobile ? 12 : 6;
  if (sheet.length) await sharp({ create: { width: cols * (tw + 4), height: Math.ceil(sheet.length / cols) * (th + 4), channels: 3, background: '#111' } })
    .composite(sheet.map((t, i) => ({ input: t.image, left: (i % cols) * (tw + 4), top: Math.floor(i / cols) * (th + 4) }))).jpeg({ quality: 88 }).toFile(`${base}-sheet.jpg`);
  fs.writeFileSync(`${base}-sounds.json`, JSON.stringify(sounds, null, 1));
  return { film, master: withSound, sounds };
}

(async () => {
  const shapeName = argument('shape', 'tall');
  if (!SHAPES[shapeName]) throw new Error(`No shape ${shapeName}: ${Object.keys(SHAPES).join(', ')}.`);
  const work = path.resolve(argument('work', path.join(REPO, 'test-results/card-ad')));
  const out = path.resolve(argument('out', path.join(work, 'out')));
  const art = argument('art') ? path.resolve(argument('art')) : null;
  if (argument('top')) SHAPES[shapeName].top = Number(argument('top'));
  if (argument('bottom')) SHAPES[shapeName].bottom = Number(argument('bottom'));
  const server = await devServer();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    if (argument('strip')) {
      // A row of one take's frames, to look its timing over: --strip open:2.6:3.9:0.1
      const [name, from, to, every] = argument('strip').split(':');
      const shape = { ...SHAPES[shapeName] };
      const wanted = new Set();
      for (let s = Number(from); s <= Number(to) + 1e-9; s += Number(every)) wanted.add(Math.round(s * FPS));
      const take = new Take({ browser, server: server.url, shape, shapeName, name, story: story(), art, work });
      await take.open();
      const dir = path.join(work, 'strips', shapeName, name);
      fs.rmSync(dir, { recursive: true, force: true });
      await take.film(dir, wanted);
      await take.close();
      const files = [...wanted].sort((a, b) => a - b).map((i) => path.join(dir, `f_${String(i).padStart(5, '0')}.png`)).filter((f) => fs.existsSync(f));
      const tw = shape.mobile ? 216 : 480;
      const th = Math.round((tw * shape.height) / shape.width);
      const tiles = await Promise.all(files.map((f) => sharp(f).resize(tw, th).toBuffer()));
      const sheet = path.join(work, 'strips', `${shapeName}-${name}-${from}-${to}.jpg`);
      const cols = Math.min(tiles.length, shape.mobile ? 10 : 5);
      await sharp({ create: { width: cols * (tw + 4), height: Math.ceil(tiles.length / cols) * (th + 4), channels: 3, background: '#111' } })
        .composite(tiles.map((input, i) => ({ input, left: (i % cols) * (tw + 4), top: Math.floor(i / cols) * (th + 4) }))).jpeg({ quality: 85 }).toFile(sheet);
      console.log(`${sheet}  sounds ${take.sounds.map((x) => `${x.name}@${x.second.toFixed(2)}s`).join(' ')}`);
    } else if (process.argv.includes('--overlays')) {
      // Where a cut's words and end card sit, as shares of the frame (for the safe areas, and nothing cut off). --alpha
      // sets how opaque a pixel must be to count (out of 255): 8 takes in the soft shadow, 128 only the letters.
      const cut = SHOTS.cuts[argument('cut', 'main')];
      const alpha = Number(argument('alpha', '8'));
      const shape = { ...SHAPES[shapeName] };
      const [w, fullH] = [shape.width * shape.scale, shape.height * shape.scale];
      const top = shape.crop?.top ?? 0;
      const h = shape.crop?.height ?? fullH;
      const context = await browser.newContext({ viewport: { width: shape.width, height: shape.height }, deviceScaleFactor: shape.scale });
      const overlays = overlayCache(context, shape, server.url, cut.end || SHOTS.end);
      const bounds = (image) => {
        let [x0, y0, x1, y1] = [w, fullH, -1, -1];
        for (let y = 0; y < fullH; y += 1) for (let x = 0; x < w; x += 1) {
          if (image[(y * w + x) * 4 + 3] > alpha) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        const pc = (v, of) => `${((100 * v) / of).toFixed(1)}%`;
        return x1 < 0 ? 'nothing drawn' : `x ${pc(x0, w)}–${pc(x1 + 1, w)}, y ${pc(y0 - top, h)}–${pc(y1 + 1 - top, h)}${y0 < top || y1 >= top + h || x0 <= 0 || x1 >= w - 1 ? '  CUT OFF' : ''}`;
      };
      for (const [a, b, lines] of cut.words) console.log(`words ${a}–${b}s  "${lines.join(' / ')}"  ${bounds(await overlays.words(lines))}`);
      if (cut.end) {
        const parts = await Promise.all(['mark', 'name', 'line', 'badges', 'address'].map((part) => overlays.end(part)));
        const union = Buffer.alloc(parts[0].length);
        for (const image of parts) for (let i = 3; i < image.length; i += 4) union[i] = Math.max(union[i], image[i]);
        console.log(`end card  ${bounds(union)}`);
      }
      await context.close();
    } else if (process.argv.includes('--bars-sheet')) {
      // The platforms' bars over a finished tall cut (from --out) at each of its words and its end card: one row a
      // platform, one column a moment, for the safe-area check on the frames that ship.
      const name = argument('cut', 'main');
      const cut = SHOTS.cuts[name];
      const shape = SHAPES.tall;
      const [w, h] = [shape.width * shape.scale, shape.height * shape.scale];
      const base = path.join(out, `cards-ad-${name}${/^\d+$/.test(name) ? 's' : ''}-tall`);
      const times = [...cut.words.map(([a, b]) => (a + b) / 2), ...(cut.end ? [cut.end.full + 0.6] : [])];
      const context = await browser.newContext({ viewport: { width: shape.width, height: shape.height }, deviceScaleFactor: shape.scale });
      const bars = [];
      for (const platform of ['meta', 'tiktok', 'youtube']) bars.push(await drawOverlay(context, shape, barsHtml(platform)));
      await context.close();
      const [tw, th, lab, gap] = [270, 480, 26, 4];
      const tiles = [];
      for (const [col, t] of times.entries()) {
        const grab = spawnSync('ffmpeg', ['-v', 'error', '-ss', t.toFixed(3), '-i', `${base}.mp4`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: w * h * 4 });
        if (grab.status !== 0 || grab.stdout.length !== w * h * 3) throw new Error(`no frame at ${t} s in ${base}.mp4`);
        for (const [row, overlay] of bars.entries()) {
          const mixed = Buffer.from(grab.stdout);
          for (let p = 0, q = 0; p < mixed.length; p += 3, q += 4) {
            const a = overlay[q + 3] / 255;
            if (a > 0) for (let c = 0; c < 3; c += 1) mixed[p + c] = Math.round(mixed[p + c] * (1 - a) + overlay[q + c] * a);
          }
          tiles.push({ input: await sharp(mixed, { raw: { width: w, height: h, channels: 3 } }).resize(tw, th).png().toBuffer(), left: gap + col * (tw + gap), top: lab + row * (th + gap) });
        }
        tiles.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${lab}"><text x="2" y="18" font-family="Helvetica" font-size="16" fill="#ddd">${t.toFixed(2)} s</text></svg>`), left: gap + col * (tw + gap), top: 0 });
      }
      const sheet = `${base}-bars.jpg`;
      await sharp({ create: { width: gap + times.length * (tw + gap), height: lab + bars.length * (th + gap), channels: 3, background: '#111' } })
        .composite(tiles).jpeg({ quality: 88 }).toFile(sheet);
      console.log(sheet);
    } else if (process.argv.includes('--stills')) {
      const made = await stills({ browser, server: server.url, shapeName, work, out, art });
      console.log(`${made.length} stills in ${out}`);
    } else if (argument('cut')) {
      const made = await filmCut({ browser, server: server.url, shapeName, work, out, name: argument('cut'), music: argument('music') ? path.resolve(argument('music')) : null });
      console.log(`${made.film}\n${made.master}\nsounds ${made.sounds.map((x) => `${x.name}@${x.at.toFixed(3)}s`).join(' ')}`);
    } else {
      await filmTakes({ browser, server: server.url, shapeName, work, art });
    }
  } finally {
    await browser.close();
    server.stop();
  }
})().catch((error) => { console.error(error); process.exit(1); });
