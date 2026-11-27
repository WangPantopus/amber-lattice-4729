'use client';

// Recording sound in the Studio (Pulse, reinvented, phase 2; coord/CONTRACT.md §7e): Voice Spark (the person's own
// voice, up to 60 s), place sound (3 s) and a dot's whisper (3 s), from the browser's microphone as WebM (or Ogg), and
// sent after the Moment is made. Words are the person's own: heard by the browser where it can, or typed; their times
// are spread over the recording by length, as the web has no word timings of its own.

import { useEffect, useRef, useState } from 'react';
import { post } from '@pantopus/api/client';

export type SoundKind = 'voice' | 'place' | 'whisper';
export const SOUND_MAX_MS: Record<SoundKind, number> = { voice: 60_000, place: 3_000, whisper: 3_000 };

export interface Recording {
  blob: Blob;
  ms: number;
  url: string;
}

function mime(): string {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
  return options.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || '';
}

export function canRecord(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && !!mime();
}

/** One recording at a time: start, stop (or it stops itself at the kind's length), and the result. */
export function useRecorder(kind: SoundKind) {
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; started: number; timer: number } | null>(null);
  const [state, setState] = useState<'idle' | 'asking' | 'recording'>('idle'),
    [elapsed, setElapsed] = useState(0),
    [error, setError] = useState('');
  const [result, setResult] = useState<Recording | null>(null);
  useEffect(() => {
    if (state !== 'recording') return undefined;
    const t = setInterval(() => setElapsed(Date.now() - (rec.current?.started ?? Date.now())), 100);
    return () => clearInterval(t);
  }, [state]);
  useEffect(
    () => () => {
      rec.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function start() {
    if (state !== 'idle') return;
    setError('');
    setState('asking');
    try {
      // The sound as it was: no cleaning by the browser (anything cleaned would have to say so, §7e).
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: false, echoCancellation: false, autoGainControl: false } });
      const type = mime();
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        const started = rec.current?.started ?? Date.now();
        window.clearTimeout(rec.current?.timer);
        stream.getTracks().forEach((t) => t.stop());
        rec.current = null;
        const ms = Math.min(SOUND_MAX_MS[kind], Date.now() - started);
        const blob = new Blob(chunks, { type: (recorder.mimeType || type).split(';')[0] });
        setResult((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { blob, ms, url: URL.createObjectURL(blob) };
        });
        setState('idle');
      };
      recorder.start(250);
      rec.current = { recorder, stream, started: Date.now(), timer: window.setTimeout(() => recorder.state === 'recording' && recorder.stop(), SOUND_MAX_MS[kind]) };
      setElapsed(0);
      setState('recording');
    } catch {
      setState('idle');
      setError('The microphone isn’t available here. Allow it for this site and try again.');
    }
  }
  function stop() {
    if (rec.current?.recorder.state === 'recording') rec.current.recorder.stop();
  }
  function clear() {
    setResult((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
  }
  return { state, elapsed, error, result, start, stop, clear };
}

/** Typed (or heard) words with times spread over the recording by each word's length. */
export function timedWords(text: string, ms: number): { w: string; start_ms: number; end_ms: number }[] {
  const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 200);
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  let at = 0;
  return words.map((w) => {
    const span = total ? Math.round(((w.length + 1) / total) * ms) : 0;
    const word = { w, start_ms: at, end_ms: Math.min(ms, at + span) };
    at += span;
    return word;
  });
}

/** Sends a recording to the Moment just made (the author only, before it ends). */
export function uploadSound(
  momentId: string,
  rec: Recording,
  kind: SoundKind,
  extra: { dot?: string; words?: { w: string; start_ms: number; end_ms: number }[] } = {},
) {
  const data = new FormData();
  const ext = rec.blob.type.includes('ogg') ? 'ogg' : 'webm';
  data.append('file', rec.blob, `${kind}.${ext}`);
  data.append('kind', kind);
  data.append('duration_ms', String(Math.max(1, Math.round(rec.ms))));
  if (extra.dot) data.append('dot', extra.dot);
  if (extra.words?.length) data.append('words', JSON.stringify(extra.words));
  return post(`/api/reinvented/moments/${encodeURIComponent(momentId)}/sound`, data, { timeout: 120_000 });
}
