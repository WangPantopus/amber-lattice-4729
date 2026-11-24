'use client';

// A clip of the launch film from public/home/, cropped to the phone, as on the homepage. Nothing loads until it nears
// the screen (preload="none", the poster is set then too), so the first paint is text. It plays, muted and looping,
// only while in view, and never for someone who asked for less motion: they get the poster and the controls.

import { useEffect, useRef, useState } from 'react';
import home from '../../_components/home.module.css';
import styles from './public.module.css';

const MEDIA = '/home';

/** `name` picks public/home/clip-<name>.mp4 and poster-<name>.jpg; `src` and `poster` name other files there. `wide`
 *  frames a 16:9 film (the Christmas card) instead of the phone crop. */
export default function PillarClip({
  name,
  label,
  caption,
  src,
  poster,
  wide,
  eager,
}: {
  name: string;
  label: string;
  caption: string;
  src?: string;
  poster?: string;
  wide?: boolean;
  /** Above the fold: the poster (a small JPEG) loads at once so the frame is never empty; the film still waits. */
  eager?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setStill(reduce);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true);
        if (reduce) return;
        if (entry.intersectionRatio >= 0.35) void video.play().catch(() => {});
        else video.pause();
      },
      { rootMargin: '300px 0px', threshold: [0, 0.35] },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  // The caption sits outside the clip, whose edges fade out (home.module.css's mask).
  return (
    <div className={styles.clipBox}>
      <figure className={wide ? styles.wideClip : home.clip}>
        <video
          ref={ref}
          muted
          loop
          playsInline
          preload="none"
          controls={still}
          poster={near || eager ? `${MEDIA}/${poster ?? `poster-${name}.jpg`}` : undefined}
          src={near ? `${MEDIA}/${src ?? `clip-${name}.mp4`}` : undefined}
          aria-label={label}
        />
      </figure>
      <span className={home.caption}>{caption}</span>
    </div>
  );
}
