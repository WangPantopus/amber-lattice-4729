#!/usr/bin/env node
// ============================================================
// Films the Christmas card share videos: one per card picture, the real card
// table (/dev/card-film) opened frame by frame in headless Chrome and encoded
// with ffmpeg, with the table's own paper sounds. No person's name or note is
// ever in one: the envelope says "For you" from "Pantopus", and the back of the
// card carries the invitation.
//
//   node scripts/film-card-videos.cjs                 every picture
//   node scripts/film-card-videos.cjs --only 8,53,61  just these numbers
//   --out <folder>     where the videos go (default <repo>/test-results/card-videos)
//   --url <address>    a web dev server that is already running (else one is started)
//   --port <number>    the port for the dev server this starts (default 18977)
//   --keep-frames      leave each video's frames beside it
//   --skip-existing    leave a picture alone when its video is already in the folder
//
// Needs Google Chrome, ffmpeg, and this app's node_modules. See "Remaking the
// videos" in docs/product/christmas-card-table/pictures.md.
//
// How it works: the page's clock is replaced once filming starts (the time,
// animation frames and timers), so each frame is exactly 1/30 s after the last
// however long its screenshot takes, and CSS animations (the snow, the candle)
// are stepped by the same clock. The table is driven through the engine the dev
// build leaves on window.__cardTable, with the same calls its buttons make.
// ============================================================
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const WEB = path.resolve(__dirname, '..');
const REPO = path.resolve(WEB, '../../..');
const { chromium } = require(path.join(WEB, 'node_modules/@playwright/test'));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const FPS = 30;
const WIDTH = 360; // the table is laid out for a 360 x 640 phone, filmed at 3x: 1080 x 1920
const HEIGHT = 640;
const SCALE = 3;
/** The film, in milliseconds from its first frame. */
const FILM = {
  length: 12600,
  steps: [
    [0, 'arrive'], // the envelope lands, address side up
    [1550, 'next'], // it turns over: the wax seal
    [2500, 'next'], // the seal breaks and the flap lifts; the card comes out and is laid down by itself
    [5700, 'back'], // a quick look at the back...
    [6120, 'front'], // ...and the picture again
    [7300, 'back'], // turned over to read
    [10400, 'front'], // the picture
  ],
  slip: [11000, 11550], // the paper slip slides in under the card
  // Where the table's drifting light starts, so every video is lit the same way.
  clock: 618265,
};

function argument(name, fallback = null) {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

/** The season's pictures, read from the server's own list (it needs no database for that). */
function designs() {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:9';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'film';
  const cards = require(path.join(REPO, 'backend/services/holidayCards.js'));
  return { year: cards.SEASON.year, list: cards.DESIGNS };
}

const answers = (url) => new Promise((resolve) => {
  const request = http.get(url, (response) => { response.resume(); resolve(response.statusCode); });
  request.on('error', () => resolve(0));
  request.setTimeout(120000, () => { request.destroy(); resolve(0); });
});

/** The web app's dev server, started for the length of the run unless one was named. */
async function devServer() {
  const named = argument('url');
  if (named) return { url: named.replace(/\/$/, ''), stop: () => {} };
  const port = argument('port', '18977');
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', port, '-H', '127.0.0.1'], {
    cwd: WEB,
    // The film page asks the server for nothing; the address only has to be set.
    // Its own build folder, so a dev server already running from this checkout keeps working.
    env: { ...process.env, NEXT_DIST_DIR: '.next-film', NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:9' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (data) => { log += data; });
  child.stderr.on('data', (data) => { log += data; });
  const stop = () => { try { child.kill('SIGTERM'); } catch { /* already gone */ } };
  process.on('exit', stop);
  for (let tries = 0; tries < 120; tries += 1) {
    if (child.exitCode !== null) throw new Error(`The dev server stopped:\n${log.slice(-2000)}`);
    if (await answers(`${url}/dev/card-film`) === 200) return { url, stop };
    await new Promise((done) => { setTimeout(done, 1500); });
  }
  stop();
  throw new Error(`The dev server didn't answer at ${url}:\n${log.slice(-2000)}`);
}

/** Runs in the page before anything else: the page's clock, which filming takes over. */
function clockShim() {
  const real = {
    now: performance.now.bind(performance),
    raf: window.requestAnimationFrame.bind(window),
    caf: window.cancelAnimationFrame.bind(window),
    set: window.setTimeout.bind(window),
    clear: window.clearTimeout.bind(window),
    play: HTMLMediaElement.prototype.play,
  };
  const film = { on: false, t: 0, base: 0, frames: new Map(), timers: new Map(), next: 1e9, sounds: [], seen: new Map(), real };
  performance.now = () => (film.on ? film.base + film.t : real.now());
  window.requestAnimationFrame = (callback) => {
    if (!film.on) return real.raf(callback);
    film.next += 1;
    film.frames.set(film.next, callback);
    return film.next;
  };
  window.cancelAnimationFrame = (id) => { if (!film.frames.delete(id)) real.caf(id); };
  window.setTimeout = (callback, ms, ...rest) => {
    if (!film.on || typeof callback !== 'function') return real.set(callback, ms, ...rest);
    film.next += 1;
    film.timers.set(film.next, { at: film.t + (Number(ms) || 0), callback, rest });
    return film.next;
  };
  window.clearTimeout = (id) => { if (!film.timers.delete(id)) real.clear(id); };
  // A sound isn't played while filming: its moment is written down, and ffmpeg lays it in.
  HTMLMediaElement.prototype.play = function play() {
    if (!film.on) return real.play.call(this).catch(() => {});
    film.sounds.push({ src: this.currentSrc || this.src, at: film.t });
    return Promise.resolve();
  };
  window.__film = film;
}

/** Runs in the page once the envelope has arrived: hides the app's buttons, adds the slip, and starts the film's clock. */
function startFilm(plan) {
  const film = window.__film;
  const table = window.__cardTable;
  const stage = document.querySelector('[role="dialog"][data-mood]');
  const css = document.createElement('style');
  css.textContent = `
    nextjs-portal { display: none !important; }
    [data-ui], [data-el="words"], [data-el="act"] { visibility: hidden !important; }
    #filmSlip { position: absolute; z-index: 25; left: 50%; bottom: 22px; width: 252px; height: 46px; margin-left: -126px; box-sizing: border-box;
      padding-left: 17px; background: #f4ead6 url(/holiday-cards/table/paper.webp); background-size: 220px; background-blend-mode: multiply;
      box-shadow: 1px 2px 5px rgba(0, 0, 0, 0.45); color: #3a2f26; display: flex; flex-direction: column; justify-content: center; gap: 3px;
      border-radius: 1.5px; opacity: 0; }
    #filmSlip b { font: 600 10.5px/1.1 var(--serif); letter-spacing: 0.24em; white-space: nowrap; }
    #filmSlip span { font: 13px/1.25 var(--serif); letter-spacing: 0.03em; white-space: nowrap; color: #5b4d3f; }
  `;
  document.head.append(css);
  const slip = document.createElement('div');
  slip.id = 'filmSlip';
  slip.innerHTML = '<b>PANTOPUS POST</b><span>Send one at pantopus.com/cards</span>';
  stage.append(slip);

  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const steps = plan.steps.map(([at, what]) => ({ at, what, done: false }));
  // The light never waits for a hand: it drifts all through, from the same place in every video.
  const freeLight = () => { table.lastTouch = -1e12; };
  film.base = plan.clock;
  film.t = 0;
  film.on = true;
  table.v.tx.x = Math.sin(film.base / 2900) * 0.62; table.v.tx.t = table.v.tx.x; table.v.tx.v = 0;
  table.v.ty.x = Math.sin(film.base / 4100 + 1) * 0.5; table.v.ty.t = table.v.ty.x; table.v.ty.v = 0;
  freeLight();

  film.advance = (ms) => {
    film.t += ms;
    for (const step of steps) {
      if (step.done || film.t < step.at) continue;
      step.done = true;
      if (step.what === 'arrive') table.restart(true);
      else if (step.what === 'next') table.primary();
      else if (step.what === 'back') table.arrow(-1);
      else if (step.what === 'front') table.arrow(1);
      freeLight();
    }
    for (const [id, timer] of [...film.timers].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at > film.t || !film.timers.delete(id)) continue;
      timer.callback(...timer.rest);
      freeLight();
    }
    const due = [...film.frames.values()];
    film.frames.clear();
    for (const callback of due) callback(film.base + film.t);
    // The snow, the candle and every other CSS animation, on the film's clock.
    for (const animation of document.getAnimations()) {
      if (!film.seen.has(animation)) {
        animation.pause();
        film.seen.set(animation, { t: film.t, at: Number(animation.currentTime) || 0 });
      }
      const seen = film.seen.get(animation);
      animation.currentTime = seen.at + (film.t - seen.t);
    }
    const k = smooth(plan.slip[0], plan.slip[1], film.t);
    slip.style.opacity = String(k);
    slip.style.transform = `translateY(${((1 - k) * 12).toFixed(2)}px) rotate(-1.3deg)`;
    return film.t;
  };
}

/** One picture's video: frames, then ffmpeg. */
async function filmOne(browser, base, design, year, out, keepFrames) {
  const frames = path.join(out, `frames-${design.id}`);
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE, hasTouch: true, isMobile: true, colorScheme: 'dark', reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const trouble = [];
  page.on('pageerror', (error) => trouble.push(error.message));
  await page.addInitScript(clockShim);
  const query = new URLSearchParams({ design: design.id, number: String(design.number), caption: design.caption, paper: design.paper, table: design.table, year: String(year) });
  await page.goto(`${base}/dev/card-film?${query}`, { waitUntil: 'networkidle', timeout: 180000 });
  // The table shows its envelope only once its art, the picture and the pen are ready; then it arrives.
  await page.waitForFunction(() => {
    const front = document.querySelector('[data-el="lFront"]');
    return Boolean(window.__cardTable && front && front.style.visibility !== 'hidden');
  }, null, { timeout: 60000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
  });
  await page.waitForTimeout(1800);
  // The engine stops, its last real frame runs out, and the film's clock takes over.
  await page.evaluate(() => window.__cardTable.setPaused(true));
  await page.waitForTimeout(150);
  await page.evaluate(startFilm, FILM);
  await page.evaluate(() => window.__cardTable.setPaused(false));

  const count = Math.round((FILM.length / 1000) * FPS);
  for (let i = 0; i < count; i += 1) {
    await page.evaluate(async (ms) => {
      window.__film.advance(ms);
      // React's own updates (a state the engine reported) land before the picture is taken.
      await new Promise((done) => { window.__film.real.set(done, 0); });
    }, i === 0 ? 0 : 1000 / FPS);
    await page.screenshot({ path: path.join(frames, `f_${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 95, animations: 'allow', caret: 'initial' });
  }
  const sounds = await page.evaluate(() => window.__film.sounds);
  await context.close();
  if (trouble.length) throw new Error(`${design.id}: the page reported ${trouble.join('; ')}`);

  // The sounds, each at its moment; a film with none still gets a silent track, which some apps expect.
  const video = path.join(out, `${design.id}.mp4`);
  const seconds = (FILM.length / 1000).toFixed(3);
  const inputs = ['-framerate', String(FPS), '-i', path.join(frames, 'f_%05d.jpg')];
  const mix = [];
  sounds.forEach((sound, i) => {
    const file = path.join(WEB, 'public', decodeURIComponent(new URL(sound.src).pathname));
    inputs.push('-i', file);
    const ms = Math.max(0, Math.round(sound.at));
    mix.push(`[${i + 1}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.85,adelay=${ms}|${ms}[s${i}]`);
  });
  if (sounds.length) mix.push(`${sounds.map((_, i) => `[s${i}]`).join('')}amix=inputs=${sounds.length}:normalize=0:duration=longest,apad[a]`);
  else { inputs.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'); mix.push('[1:a]anull[a]'); }
  const filter = [`[0:v]scale=${WIDTH * SCALE}:${HEIGHT * SCALE}:in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p[v]`, ...mix].join(';');
  const encode = spawnSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filter, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', argument('crf', '22'), '-profile:v', 'high', '-level', '4.0',
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-t', seconds, '-movflags', '+faststart', video], { encoding: 'utf8' });
  if (encode.status !== 0) throw new Error(`${design.id}: ffmpeg failed\n${encode.stderr}`);
  // A sheet of its frames, two a second, to look the whole film over at once.
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', 'fps=2,scale=180:-1,tile=13x2', '-frames:v', '1', path.join(out, `${design.id}-sheet.jpg`)]);
  if (!keepFrames) fs.rmSync(frames, { recursive: true, force: true });
  return { video, megabytes: fs.statSync(video).size / 1048576, sounds: sounds.map((sound) => `${path.basename(new URL(sound.src).pathname, '.mp3')}@${(sound.at / 1000).toFixed(2)}s`) };
}

(async () => {
  const out = path.resolve(argument('out', path.join(REPO, 'test-results/card-videos')));
  fs.mkdirSync(out, { recursive: true });
  const only = argument('only');
  const wanted = only ? new Set(only.split(',').map(Number)) : null;
  const { year, list } = designs();
  const picked = list.filter((design) => !wanted || wanted.has(design.number));
  if (!picked.length) throw new Error('No card picture has that number.');
  const server = await devServer();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    for (const design of picked) {
      if (process.argv.includes('--skip-existing') && fs.existsSync(path.join(out, `${design.id}.mp4`))) continue;
      const began = Date.now();
      // A busy machine can make a page miss its wait: each picture gets three tries, each in a fresh tab.
      let made = null;
      for (let attempt = 1; !made; attempt += 1) {
        try {
          made = await filmOne(browser, server.url, design, year, out, process.argv.includes('--keep-frames'));
        } catch (error) {
          if (attempt >= 3) throw error;
          console.log(`${design.id}  try ${attempt} failed (${String(error.message).split('\n')[0]}); trying again`);
        }
      }
      console.log(`${design.id}  ${made.megabytes.toFixed(1)} MB  ${((Date.now() - began) / 1000).toFixed(0)} s  ${made.sounds.join(' ') || 'no sounds'}`);
    }
  } finally {
    await browser.close();
    server.stop();
  }
})().catch((error) => { console.error(error); process.exit(1); });
