// ============================================================
// The homepage's motion: scroll drives one camera scale `u` (scene.ts) through the keys the page's sections carry,
// and everything else that moves with it. Ported from the approved sample's script as it is:
//
// - every element with `data-u` gives the scale at its top, or `fraction:value` pairs along a pinned section; `uAt`
//   interpolates between the keys and a time-based ease moves `u` toward that target;
// - `data-scrim` darkens the sky behind words; `data-dive`, `data-world` and `data-close` drive the lines that light up,
//   the moments on the Earth and the dawn;
// - one synchronous first draw, a frame loop that skips drawing while the tab is hidden, and a watchdog that draws a
//   frame when animation frames stall;
// - videos (and their posters) load near the screen and play only while in view; the film opens in a dialog.
//
// The Earth (globe.ts, three.js) is imported after the first draw, so it never delays the page's first paint. Until
// it is ready, or where WebGL is missing, the sky is stars over the gradient and the drawn town.
//
// State goes on the page as data attributes (`data-on`, `data-solid`, `data-show`, `data-pre`); home.module.css
// styles them.
// ============================================================

import { clamp, drawStars, drawTown, lerp, makeScene, sstep, type View } from './scene';
import type { Globe, GlobeFrame } from './globe';
import { MEDIA } from './media';

export interface StageElements {
  space: HTMLElement;
  scrim: HTMLElement;
  stars: HTMLCanvasElement;
  globe: HTMLCanvasElement;
  town: HTMLCanvasElement;
  rail: HTMLElement;
  you: HTMLElement;
  film: HTMLDialogElement;
  filmVideo: HTMLVideoElement;
  filmClose: HTMLButtonElement;
}

const NARROW = 900;

export function startHomeStage(els: StageElements): () => void {
  const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s);
  const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cleanups: Array<() => void> = [];
  const on = <K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  let W = window.innerWidth, H = window.innerHeight, narrow = W < NARROW;
  let u = 5, uT = 5; // the camera's scale: 0 window, 1 home, 2 street, 3 town, 4 Earth close, 5 Earth far
  let scrim = 0.2, scrimT = 0.2;
  let keys: Array<[number, number]> = [], scrims: Array<[number, number, number]> = [];
  let worldP = 0, closeP = 0, diveP = 0;
  let d = 1; // the 2D canvases' pixel ratio

  // ---------- scroll to scale ----------
  const pageTop = (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY;
  function buildKeys() {
    keys = [];
    scrims = [];
    for (const el of $$('[data-u]')) {
      const t = pageTop(el), h = el.offsetHeight, L = Math.max(1, h - H), spec = el.dataset.u ?? '5';
      if (spec.includes(':')) {
        for (const p of spec.split(',')) {
          const [f, v] = p.split(':').map(Number);
          keys.push([t + L * f, v]);
        }
      } else keys.push([t, Number(spec)]);
      scrims.push([t, t + h, Number(el.dataset.scrim || 0)]);
    }
    keys.sort((a, b) => a[0] - b[0]);
  }
  function uAt(y: number) {
    if (!keys.length) return 5;
    if (y <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (y <= keys[i][0]) {
        const [y0, v0] = keys[i - 1], [y1, v1] = keys[i];
        return y1 === y0 ? v1 : lerp(v0, v1, (y - y0) / (y1 - y0));
      }
    }
    return keys[keys.length - 1][1];
  }
  const prog = (el: HTMLElement | null) => {
    if (!el) return 0;
    const t = pageTop(el), L = Math.max(1, el.offsetHeight - H);
    return clamp((window.scrollY - t) / L, 0, 1);
  };
  const dive = $('[data-dive]'), world = $('[data-world]'), closeEl = $('[data-close]');
  const ladder = $$('[data-ladder] > li'), ladderNote = $('[data-ladder-note]'), truths = $$('[data-truths] > li');
  const nav = $('[data-nav]'), railStops = $$<HTMLElement>('[data-at]', els.rail);
  const flag = (el: Element | null | undefined, name: string, value: boolean) => el?.toggleAttribute(name, value);

  function onScroll() {
    const y = window.scrollY;
    uT = uAt(y);
    const mid = y + H * 0.5;
    let s = 0;
    for (const [a, b, v] of scrims) if (mid >= a && mid < b) s = v;
    scrimT = narrow && s < 0.5 ? 0.5 : s;
    diveP = prog(dive);
    worldP = prog(world);
    if (closeEl) {
      const ct = pageTop(closeEl);
      closeP = clamp((y + H - ct) / (closeEl.offsetHeight + H * 0.2), 0, 1);
    }
    if (ladder.length === 3) {
      flag(ladder[0], 'data-on', diveP < 0.34);
      flag(ladder[1], 'data-on', diveP >= 0.34 && diveP < 0.74);
      flag(ladder[2], 'data-on', diveP >= 0.74);
    }
    flag(ladderNote, 'data-on', diveP >= 0.9);
    truths.forEach((li, i) => flag(li, 'data-on', worldP >= 0.16 + i * 0.18));
    flag(nav, 'data-solid', y > H * 0.6);
    flag(els.rail, 'data-show', y > H * 0.7 && closeP < 0.5 && (scrimT < 0.6 || W >= 1580));
  }

  // ---------- the sky ----------
  const scene = makeScene();
  const sx = els.stars.getContext('2d'), cx = els.town.getContext('2d');
  let globe: Globe | null = null;
  let disposed = false;

  const view = (t: number): View => ({ W, H, d, narrow, u, t, reduced });

  function size() {
    W = window.innerWidth;
    H = window.innerHeight;
    narrow = W < NARROW;
    d = Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 2);
    for (const c of [els.stars, els.town]) {
      c.width = Math.round(W * d);
      c.height = Math.round(H * d);
    }
    globe?.size(W, H, narrow);
    buildKeys();
    onScroll();
  }

  let last = 0, shown = !document.hidden;
  function draw(now: number) {
    const t = now / 1000, dt = Math.min(0.25, Math.max(0.001, (now - (last || now)) / 1000));
    u += (uT - u) * (reduced ? 1 : 1 - Math.exp(-dt * 7));
    if (Math.abs(uT - u) < 0.0005) u = uT;
    scrim += (scrimT - scrim) * (reduced ? 1 : 1 - Math.exp(-dt * 5));
    const gA = sstep(3.22, 3.72, u), tA = 1 - sstep(3.3, 3.78, u);
    els.space.style.opacity = gA.toFixed(3);
    els.scrim.style.opacity = scrim.toFixed(3);
    const v = view(t);
    if (sx) drawStars(sx, scene, v);
    if (cx) drawTown(cx, scene, v, tA);
    if (globe) {
      const f: GlobeFrame = { W, H, narrow, u, t, reduced, worldP, closeP };
      globe.draw(f, gA);
    } else els.globe.style.opacity = '0';
    els.you.style.bottom = (u <= 1 ? lerp(0, 18, u) : u <= 2 ? lerp(18, 40, u - 1) : u <= 3 ? lerp(40, 66, u - 2) : lerp(66, 100, (u - 3) / 2)).toFixed(1) + '%';
    for (const s of railStops) flag(s, 'data-on', Math.abs(u - Number(s.dataset.at)) < (s.dataset.at === '5' ? 1.2 : 0.5));
    last = now;
  }

  let raf = 0;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (shown) draw(now);
  }
  const onVisibility = () => {
    shown = !document.hidden;
  };
  document.addEventListener('visibilitychange', onVisibility);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
  on(window, 'scroll', onScroll, { passive: true });
  on(window, 'resize', size);
  on(window, 'load', () => {
    buildKeys();
    onScroll();
  });

  // Chapters off screen skip layout until the page has painted once (home.module.css). Lay them all out right after
  // the first frame, before anyone scrolls; a visit that opened on an anchor (/#get-the-app) goes back to it, since
  // the browser aimed at it while the chapters above still had their estimated heights.
  // (A tab opened in the background paints no frames, so a timer stands in after a second.)
  const root = document.documentElement;
  let readyTimer = 0;
  const layOut = () => {
    if (root.hasAttribute('data-home-ready')) return;
    root.setAttribute('data-home-ready', '');
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (target) target.scrollIntoView();
    // The camera starts where the measured page puts it, without easing across the correction.
    buildKeys();
    onScroll();
    u = uT;
    scrim = scrimT;
  };
  const readyFrame = requestAnimationFrame(() => {
    readyTimer = window.setTimeout(layOut, 0);
  });
  const readyFallback = window.setTimeout(layOut, 1000);
  cleanups.push(() => {
    cancelAnimationFrame(readyFrame);
    window.clearTimeout(readyTimer);
    window.clearTimeout(readyFallback);
    root.removeAttribute('data-home-ready');
  });

  size();
  u = uT;
  scrim = scrimT;
  draw(performance.now()); // one synchronous first draw
  const watchdog = window.setInterval(() => {
    if (shown && performance.now() - last > 450) draw(performance.now());
  }, 500);
  cleanups.push(() => window.clearInterval(watchdog));
  document.fonts?.ready.then(() => {
    if (disposed) return;
    buildKeys();
    onScroll();
  });
  // The page's height changes after first paint (the hero's facts, fonts, the closing section's app links), and
  // every key depends on it.
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => {
      buildKeys();
      onScroll();
    });
    ro.observe(document.body);
    cleanups.push(() => ro.disconnect());
  }
  raf = requestAnimationFrame(frame);
  cleanups.push(() => cancelAnimationFrame(raf));

  // ---------- the Earth, after first paint ----------
  const startGlobe = () => {
    import('./globe')
      .then(({ createGlobe }) => {
        if (disposed) return;
        globe = createGlobe(els.globe, { W, H, narrow, base: MEDIA });
      })
      .catch(() => {
        // No Earth: the stars and the drawn town still carry the page.
      });
  };
  // Safari has no requestIdleCallback.
  const idle = 'requestIdleCallback' in window;
  const globeTimer = idle ? window.requestIdleCallback(startGlobe, { timeout: 1200 }) : window.setTimeout(startGlobe, 200);
  cleanups.push(() => {
    if (idle) window.cancelIdleCallback(globeTimer);
    else window.clearTimeout(globeTimer);
  });

  // ---------- video: load near the screen, play while in view ----------
  const vids = $$<HTMLVideoElement>('video[data-src]');
  for (const v of vids) {
    // React renders `muted` as a property only, so the server's HTML lacks it; a video must be muted to play inline.
    v.muted = true;
    v.defaultMuted = true;
    if (reduced) v.controls = true;
  }
  if ('IntersectionObserver' in window) {
    const near = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          const v = e.target as HTMLVideoElement;
          if (!v.getAttribute('poster') && v.dataset.poster) v.poster = v.dataset.poster;
          if (!v.getAttribute('src') && v.dataset.src) {
            v.src = v.dataset.src;
            v.load();
          }
          near.unobserve(v);
        }),
      { rootMargin: '700px 0px' },
    );
    const seen = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting && !reduced) v.play()?.catch(() => {});
          else v.pause();
        }),
      { threshold: 0.3 },
    );
    vids.forEach((v) => {
      near.observe(v);
      seen.observe(v);
    });
    // reveal: visible by default; arm only what starts below the fold
    const rvs = $$('[data-rv]');
    const show = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.removeAttribute('data-pre');
            show.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -8% 0px' },
    );
    if (!reduced) {
      rvs.forEach((el) => {
        if (el.getBoundingClientRect().top > window.innerHeight) {
          el.setAttribute('data-pre', '');
          show.observe(el);
        }
      });
    }
    const unpre = window.setTimeout(() => {
      rvs.forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) el.removeAttribute('data-pre');
      });
    }, 2500);
    cleanups.push(() => {
      near.disconnect();
      seen.disconnect();
      show.disconnect();
      window.clearTimeout(unpre);
      rvs.forEach((el) => el.removeAttribute('data-pre'));
    });
  } else {
    vids.forEach((v) => {
      if (v.dataset.poster) v.poster = v.dataset.poster;
      if (v.dataset.src) v.src = v.dataset.src;
      v.controls = true;
    });
  }

  // ---------- the film ----------
  const { film, filmVideo, filmClose } = els;
  const openFilm = (e: MouseEvent) => {
    const button = (e.target as Element | null)?.closest?.('[data-film]');
    if (!button) return;
    if (!filmVideo.getAttribute('src')) {
      filmVideo.poster = `${MEDIA}/film-poster.jpg`;
      filmVideo.src = `${MEDIA}/film.mp4`;
    }
    if (typeof film.showModal === 'function') film.showModal();
    else film.setAttribute('open', '');
    filmVideo.play()?.catch(() => {});
  };
  const shut = () => {
    filmVideo.pause();
    if (typeof film.close === 'function') film.close();
    else film.removeAttribute('open');
  };
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === film) shut();
  };
  const onClosed = () => filmVideo.pause();
  document.addEventListener('click', openFilm);
  filmClose.addEventListener('click', shut);
  film.addEventListener('click', onBackdrop);
  film.addEventListener('close', onClosed);
  cleanups.push(() => {
    document.removeEventListener('click', openFilm);
    filmClose.removeEventListener('click', shut);
    film.removeEventListener('click', onBackdrop);
    film.removeEventListener('close', onClosed);
  });

  return () => {
    disposed = true;
    for (const c of cleanups.splice(0)) c();
    globe?.dispose();
    globe = null;
  };
}
