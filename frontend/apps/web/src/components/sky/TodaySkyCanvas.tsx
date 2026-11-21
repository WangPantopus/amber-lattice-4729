'use client';

// ============================================================
// The Today scene: the Living Sky's canvas and loop with the Today sky's
// rules and drawing. Its own chunk, which SkyCard loads after first paint.
//
// The numbers read over it are the page's, so to a screen reader the picture
// is decoration, as on the apps. With Reduce Motion it is a still picture of
// the same scene.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import SkyCanvas from './SkyCanvas';
import { todaySkyScene, type TodaySkyInput } from './todaySky';
import { todaySkyPainter } from './todaySkyPainter';
import { houseSpots } from './houseSpots';

/** The minute clock: the sky moves from day to dusk while the page stays open. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        setNow(Date.now());
        next();
      }, 60_000 - (Date.now() % 60_000));
    };
    next();
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}

// The first picture this session fades in over the plain sky; after that the chunk is here and it's simply there.
let shownOnce = false;

/** One thing in the picture that can be pressed: what a screen reader says, and what it opens. */
export interface SkyPress { label: string; onPress: () => void }

/** The house on Today's buttons: each shows only while its thing is in the picture. */
export interface SkyHousePresses {
  /** The mailbox, while its flag is up. */
  mail?: SkyPress | null;
  /** The note on the door. */
  note?: SkyPress | null;
  /** The bins at the curb. */
  bins?: SkyPress | null;
}

const TARGET = 44;

/** An invisible 44 px target over a thing in the picture, as the apps' bins button is. */
function Press({ id, at, press }: { id: string; at: readonly [number, number]; press: SkyPress }) {
  return (
    <button
      type="button"
      data-testid={id}
      aria-label={press.label}
      onClick={press.onPress}
      className="absolute z-[2] rounded-full hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      style={{ left: at[0] - TARGET / 2, top: at[1] - TARGET / 2, width: TARGET, height: TARGET }}
    />
  );
}

export default function TodaySkyCanvas({ input, presses = null, onReadingRoom }: {
  input: TodaySkyInput;
  presses?: SkyHousePresses | null;
  /** The larger house: how far from the card's right edge the reading must stop, or null. */
  onReadingRoom?: (right: number | null) => void;
}) {
  const now = useMinuteClock();
  const scene = useMemo(() => {
    try {
      return todaySkyScene(input, now);
    } catch {
      // A picture never takes the page down: the plain sky stays.
      return null;
    }
  }, [input, now]);
  const draw = useMemo(todaySkyPainter, []);

  const [shown, setShown] = useState(shownOnce);
  useEffect(() => {
    shownOnce = true;
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // The house on Today: the picture's own size places the buttons where the painter drew each thing.
  const box = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const larger = !!scene?.objects;
  useEffect(() => {
    const el = box.current;
    if (!larger || !el) return;
    const read = () => setSize((was) => (was && was.w === el.clientWidth && was.h === el.clientHeight ? was : { w: el.clientWidth, h: el.clientHeight }));
    read();
    const watch = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    watch?.observe(el);
    return () => watch?.disconnect();
  }, [larger]);
  const spots = useMemo(() => (scene?.objects && size && size.w > 0 ? houseSpots(size.w, size.h, scene) : null), [scene, size]);
  const room = spots && size ? Math.round(size.w - spots.left + 8) : null;
  useEffect(() => { onReadingRoom?.(room); }, [room, onReadingRoom]);

  if (!scene) return null;
  const objects = scene.objects;
  return (
    // The app's Reduce Motion rule removes the fade (globals.css).
    <div ref={box} className="absolute inset-0" style={{ opacity: shown ? 1 : 0, transition: 'opacity .4s ease' }}>
      <div className="absolute inset-0" aria-hidden="true">
        <SkyCanvas className="absolute inset-0 h-full w-full" label="The sky over your home" draw={draw} options={scene} hour={0} rise={false} />
      </div>
      {spots && objects && presses ? (
        <>
          {objects.mailbox && objects.flagUp && presses.mail ? <Press id="todaySkyMailbox" at={spots.mailbox.centre} press={presses.mail} /> : null}
          {scene.bins.length > 0 && presses.bins ? <Press id="todaySkyBins" at={spots.bins} press={presses.bins} /> : null}
          {objects.note && presses.note ? <Press id="todaySkyNote" at={spots.note} press={presses.note} /> : null}
        </>
      ) : null}
    </div>
  );
}
