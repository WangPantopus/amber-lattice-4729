'use client';

// In today's Moment viewer while `pulse_reinvented` is on (its `studio` slots): a loop plays only its span, over and
// over (CONTRACT §7j). The viewer itself keeps it muted and on a photo's timer (`loops`); this drives the span on the
// viewer's own video, as the stamps layer finds the picture it sits on.

import { useEffect, useRef, useState } from 'react';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { loopOf, useSpanLoop } from './loop';

export function LoopDriver({ moment }: { moment: Moment }) {
  const span = loopOf(moment);
  const mark = useRef<HTMLSpanElement>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const on = !!span;
  useEffect(() => {
    setVideo(on ? (mark.current?.parentElement?.querySelector<HTMLVideoElement>('video.mo-watch-media') ?? null) : null);
  }, [on, moment.id, moment.media_url]);
  useSpanLoop(video, span);
  return span ? <span ref={mark} hidden /> : null;
}
