'use client';

// Loop (Pulse, reinvented; coord/CONTRACT.md §7j): a short span of a video Moment that the new viewers play over and
// over, silently, for as long as a photo shows. It rides today's video Moment: the file stays the whole video, so an
// app that knows nothing of loops plays it once as today. The web sends a picked MP4 or QuickTime video as today's
// composer prepares it, with the span to repeat; never for a recording the browser made.

import { useEffect } from 'react';
import type { Moment } from '@pantopus/api/endpoints/moments';
import { canvasOf, jpeg } from '@/components/moments/momentArtwork';

/** Half a second to six seconds (§7j). */
export const LOOP_MIN_MS = 500;
export const LOOP_MAX_MS = 6000;
/** What the Studio offers first: the first three seconds, or the whole video when it is shorter. */
export const LOOP_FIRST_MS = 3000;

export interface LoopSpan {
  from_ms: number;
  to_ms: number;
}

/** The span a switch-on reader's answer carries, or null for every other Moment (and for a switch-off answer). */
export function loopOf(m: Moment | null | undefined): LoopSpan | null {
  if (!m || m.kind !== 'video') return null;
  const loop = (m as Moment & { loop?: { from_ms?: unknown; to_ms?: unknown } | null }).loop;
  if (!loop || typeof loop !== 'object') return null;
  const from = Number(loop.from_ms),
    to = Number(loop.to_ms);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to - from < LOOP_MIN_MS) return null;
  return { from_ms: from, to_ms: to };
}

/** A picked MP4 or QuickTime video (a video Moment's own formats); never a WebM the browser recorded. */
export function loopsFile(file: File | null | undefined) {
  if (!file) return false;
  if (/^video\/(mp4|quicktime|x-m4v)$/i.test(file.type)) return true;
  return !file.type && /\.(mp4|mov|m4v)$/i.test(file.name);
}

/** The span the person picked, kept inside the video and inside half a second to six seconds. */
export function fitSpan(span: LoopSpan, durationMs: number): LoopSpan {
  const length = Math.min(LOOP_MAX_MS, Math.max(LOOP_MIN_MS, span.to_ms - span.from_ms));
  const from = Math.max(0, Math.min(span.from_ms, durationMs - LOOP_MIN_MS));
  return { from_ms: Math.round(from), to_ms: Math.round(Math.min(durationMs, from + length)) };
}

/**
 * Plays only the span of this video, over and over: it starts at the span's beginning and goes back there at its end
 * (or when the file ends first). Playing and pausing stay the caller's; nothing here makes a sound or a request.
 */
export function useSpanLoop(video: HTMLVideoElement | null, span: LoopSpan | null) {
  const from = span?.from_ms,
    to = span?.to_ms;
  useEffect(() => {
    if (!video || from == null || to == null) return;
    const start = from / 1000,
      end = to / 1000;
    let frame = 0;
    const toStart = () => {
      try {
        video.currentTime = start;
      } catch {
        /* not seekable yet: the next check tries again */
      }
    };
    // Past the span's end, or back before its start (the file wrapped or was reloaded): go to its start. Looked at every
    // frame, and on the video's own time updates where frames are slowed (a page in the background).
    const wrap = () => {
      if (video.readyState >= 1 && !video.seeking && (video.currentTime >= end || video.currentTime < start - 0.25)) toStart();
    };
    const check = () => {
      wrap();
      frame = requestAnimationFrame(check);
    };
    const ended = () => {
      toStart();
      void video.play().catch(() => {});
    };
    if (video.readyState >= 1) toStart();
    else video.addEventListener('loadedmetadata', toStart, { once: true });
    video.addEventListener('ended', ended);
    video.addEventListener('timeupdate', wrap);
    frame = requestAnimationFrame(check);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener('loadedmetadata', toStart);
      video.removeEventListener('ended', ended);
      video.removeEventListener('timeupdate', wrap);
    };
  }, [video, from, to]);
}

/**
 * The still for a loop: the prepared video's frame where the loop starts, at the size today's composer makes posters
 * (840 px on the long side), so every list and card shows the part that loops. Null when the browser can't read it
 * (the poster today's composer made is kept then).
 */
export async function loopPoster(file: Blob, fromMs: number, signal: AbortSignal): Promise<Blob | null> {
  const v = document.createElement('video'),
    url = URL.createObjectURL(file);
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  const wait = (type: string, action: () => void) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 12000);
      const done = (ok: boolean) => () => {
        clearTimeout(timer);
        if (ok) resolve();
        else reject(new Error('unreadable'));
      };
      v.addEventListener(type, done(true), { once: true });
      v.addEventListener('error', done(false), { once: true });
      signal.addEventListener('abort', done(false), { once: true });
      action();
    });
  try {
    await wait('loadeddata', () => {
      v.src = url;
      v.load();
    });
    const at = Math.min(Math.max(0, fromMs / 1000), Math.max(0, v.duration * 0.99));
    if (Math.abs(at - v.currentTime) > 0.001)
      await wait('seeked', () => {
        v.currentTime = at;
      });
    const scale = Math.min(1, 840 / Math.max(v.videoWidth, v.videoHeight));
    const { ctx, canvas } = canvasOf(
      Math.max(1, Math.round(v.videoWidth * scale)),
      Math.max(1, Math.round(v.videoHeight * scale)),
    );
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return await jpeg(canvas, 0.85);
  } catch {
    signal.throwIfAborted();
    return null;
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}
