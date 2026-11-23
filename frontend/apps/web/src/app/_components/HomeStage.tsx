'use client';

// ============================================================
// The fixed night sky behind the whole homepage (stars, the Earth, the drawn town), the scale rail on the right,
// and the film's dialog. The page's words are server-rendered on top; stage/controller.ts moves the sky with the
// scroll once the page has painted.
// ============================================================

import { useEffect, useRef } from 'react';
import { startHomeStage } from './stage/controller';
import styles from './home.module.css';

const RAIL: Array<{ at: number; bottom: string; label: string }> = [
  { at: 5, bottom: '100%', label: 'Earth · 12,742 km' },
  { at: 3, bottom: '66%', label: 'Town · 5 km' },
  { at: 2, bottom: '40%', label: 'Street · 300 m' },
  { at: 1, bottom: '18%', label: 'Home · 15 m' },
  { at: 0, bottom: '0%', label: 'Window' },
];

export default function HomeStage() {
  const space = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const stars = useRef<HTMLCanvasElement>(null);
  const globe = useRef<HTMLCanvasElement>(null);
  const town = useRef<HTMLCanvasElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const you = useRef<HTMLElement>(null);
  const film = useRef<HTMLDialogElement>(null);
  const filmVideo = useRef<HTMLVideoElement>(null);
  const filmClose = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const els = {
      space: space.current,
      scrim: scrim.current,
      stars: stars.current,
      globe: globe.current,
      town: town.current,
      rail: rail.current,
      you: you.current,
      film: film.current,
      filmVideo: filmVideo.current,
      filmClose: filmClose.current,
    };
    if (Object.values(els).some((el) => !el)) return;
    return startHomeStage(els as { [K in keyof typeof els]: NonNullable<(typeof els)[K]> });
  }, []);

  return (
    <>
      <div className={styles.stage} aria-hidden="true">
        <div ref={space} className={styles.space} />
        <canvas ref={stars} className={styles.canvas} />
        <canvas ref={globe} className={styles.canvas} style={{ opacity: 0 }} />
        <canvas ref={town} className={styles.canvas} />
        <div ref={scrim} className={styles.scrim} />
        <div className={styles.foot} />
      </div>

      <div ref={rail} className={styles.rail} aria-hidden="true">
        {RAIL.map((s) => (
          <span key={s.at} style={{ bottom: s.bottom }} data-at={s.at}>
            {s.label}
          </span>
        ))}
        <i ref={you} className={styles.railYou} />
      </div>

      <dialog ref={film} className={styles.film} aria-label="The Pantopus film">
        <button ref={filmClose} className={styles.filmX} type="button" aria-label="Close">
          ✕
        </button>
        {/* Its poster and source are set when the film first opens (stage/controller.ts). */}
        <video ref={filmVideo} controls playsInline preload="none" />
      </dialog>
    </>
  );
}
