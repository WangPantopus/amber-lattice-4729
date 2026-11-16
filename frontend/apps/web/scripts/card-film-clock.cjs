// ============================================================
// The film clock shared by the card films: the share videos
// (film-card-videos.cjs) and the Christmas cards ad (film-card-ad.cjs).
// Both film the real card table on /dev/card-film in headless Chrome, frame
// by frame, on a clock the film owns.
//
// clockShim runs in the page before anything else. Once filming starts
// (window.__film.on), performance.now, requestAnimationFrame and setTimeout
// answer to the film's time instead of the real one, and a sound isn't played
// but written down with its moment, for ffmpeg to lay in. The film then steps
// its clock: runTimers, runFrames and stepAnimations (which pauses every CSS
// animation and transition and sets it to the film's time).
// ============================================================
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const WEB = path.resolve(__dirname, '..');
const REPO = path.resolve(WEB, '../../..');
const { chromium } = require(path.join(WEB, 'node_modules/@playwright/test'));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
  /** The timers that are due by the film's time, in order; `after` runs after each. */
  film.runTimers = (after) => {
    for (const [id, timer] of [...film.timers].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at > film.t || !film.timers.delete(id)) continue;
      timer.callback(...timer.rest);
      if (after) after();
    }
  };
  /** One animation frame, at the film's time. */
  film.runFrames = () => {
    const due = [...film.frames.values()];
    film.frames.clear();
    for (const callback of due) callback(film.base + film.t);
  };
  /**
   * The snow, the candle and every other CSS animation and transition, on the film's clock. One seen for the first time
   * keeps the time it had run (the share videos), or starts from nothing (`fromZero`: the ad, so every run is the same).
   */
  film.stepAnimations = (fromZero = false) => {
    for (const animation of document.getAnimations()) {
      if (!film.seen.has(animation)) {
        animation.pause();
        film.seen.set(animation, { t: film.t, at: fromZero ? 0 : Number(animation.currentTime) || 0 });
      }
      const seen = film.seen.get(animation);
      animation.currentTime = seen.at + (film.t - seen.t);
    }
  };
  window.__film = film;
}

module.exports = { WEB, REPO, chromium, CHROME, argument, designs, answers, devServer, clockShim };
