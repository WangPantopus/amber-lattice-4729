'use client';

// A Moment's sound in the viewer (Pulse, reinvented, phase 2; coord/CONTRACT.md §7e). Place sound: the few seconds
// kept where the picture was taken, played once as the Moment opens, with a button to hear it again. Voice Spark: the
// person's own voice with their exact words as moving text, each word lit as it is said; the viewer holds still while
// it plays. Sound a browser won't start by itself waits for a tap ("Tap to hear"). Words cleaned of wind say so.

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';
import type { Moment } from '@pantopus/api/endpoints/moments';
import './sound.css';

export interface MomentSound {
  kind: 'voice' | 'place';
  url: string | null;
  duration_ms: number;
  words: { w: string; start_ms: number; end_ms: number }[] | null;
  cleaned: boolean;
}

type SoundMoment = Moment & { sound?: MomentSound | null };

// The Moment whose voice is playing: the viewer reads it through `holds` on its next tick.
let playingOn: string | null = null;

export function holdsForSound(m: Moment): boolean {
  return playingOn === m.id;
}

export function hasSound(m: Moment): boolean {
  return !!(m as SoundMoment).sound?.url;
}

export default function SoundLayer({ moment }: { moment: Moment }) {
  const sound = (moment as SoundMoment).sound;
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false),
    [blocked, setBlocked] = useState(false),
    [at, setAt] = useState(0);
  const voice = sound?.kind === 'voice';
  useEffect(() => {
    const el = audio.current;
    if (!el || !sound?.url) return undefined;
    // Played once as the Moment opens; a browser that wants a tap first gets "Tap to hear".
    el.play().then(
      () => setBlocked(false),
      () => setBlocked(true),
    );
    return () => {
      el.pause();
      if (playingOn === moment.id) playingOn = null;
    };
  }, [sound?.url, moment.id]);
  useEffect(() => {
    if (!voice) return;
    if (playing) playingOn = moment.id;
    else if (playingOn === moment.id) playingOn = null;
  }, [playing, voice, moment.id]);
  useEffect(() => {
    if (!playing || !voice) return undefined;
    let frame = 0;
    const tick = () => {
      setAt((audio.current?.currentTime ?? 0) * 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, voice]);
  if (!sound?.url) return null;
  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      if (el.ended || (!voice && el.currentTime > 0)) el.currentTime = 0;
      void el.play().then(() => setBlocked(false), () => setBlocked(true));
    } else el.pause();
  };
  return (
    <div
      className="sd-layer"
      data-kind={sound.kind}
      // Its buttons are the reader's: they never step or pause the viewer.
      onPointerDown={(e) => e.target !== e.currentTarget && e.stopPropagation()}
      onPointerUp={(e) => e.target !== e.currentTarget && e.stopPropagation()}
      onClick={(e) => e.target !== e.currentTarget && e.stopPropagation()}
    >
      <audio
        ref={audio}
        src={sound.url}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        // Also from the sound itself (a few times a second, even in a background tab where animation frames stop).
        onTimeUpdate={(e) => {
          setAt(e.currentTarget.currentTime * 1000);
          setPlaying(!e.currentTarget.paused);
        }}
        onEnded={() => {
          setPlaying(false);
          setAt(sound.duration_ms);
        }}
      />
      {voice ? (
        <div className="sd-voice">
          <button type="button" className="sd-play" aria-label={playing ? 'Pause' : blocked ? 'Tap to hear' : 'Play'} onClick={toggle}>
            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <p className="sd-words" aria-label={(sound.words || []).map((w) => w.w).join(' ')}>
            {(sound.words || []).map((w, i) => (
              <span key={i} aria-hidden="true" data-said={at >= w.start_ms || undefined} data-now={(at >= w.start_ms && at < w.end_ms) || undefined}>
                {w.w}{' '}
              </span>
            ))}
            {blocked && !playing && <small className="sd-hint">Tap to hear</small>}
          </p>
          {sound.cleaned && <small className="sd-cleaned">Wind cleaned</small>}
        </div>
      ) : (
        <button type="button" className="sd-place" onClick={toggle} aria-label={blocked ? 'Tap to hear the place' : 'Hear the place again'}>
          <Volume2 aria-hidden="true" />
          {blocked ? 'Tap to hear' : playing ? 'Place sound' : 'Hear it again'}
          {sound.cleaned && <small> · wind cleaned</small>}
        </button>
      )}
    </div>
  );
}
