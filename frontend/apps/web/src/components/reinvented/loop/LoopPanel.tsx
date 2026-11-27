'use client';

// The Studio's Loop panel (CONTRACT §7j): which part of the picked video plays over and over, without sound. The
// preview behind it plays that part as it is chosen.

import { fitSpan, LOOP_MAX_MS, LOOP_MIN_MS, type LoopSpan } from './loop';

const seconds = (ms: number) => (ms / 1000).toFixed(1) + ' s';

export function LoopPanel({
  durationMs,
  maxSeconds,
  span,
  onSpan,
  onOff,
  onDone,
}: {
  /** The video's own length, once the preview has read it. */
  durationMs: number | null;
  /** A longer video is posted in parts, and a loop is one short video. */
  maxSeconds: number;
  span: LoopSpan | null;
  onSpan(span: LoopSpan): void;
  onOff(): void;
  onDone(): void;
}) {
  const tooLong = durationMs != null && durationMs / 1000 - 0.025 > maxSeconds;
  const tooShort = durationMs != null && durationMs < LOOP_MIN_MS;
  const length = span ? span.to_ms - span.from_ms : 0;
  return (
    <div className="st-toolpanel" role="group" aria-label="Loop">
      {durationMs == null ? (
        <p className="st-hint">Reading the video…</p>
      ) : tooShort ? (
        <p className="st-hint">This video is too short to loop.</p>
      ) : tooLong ? (
        <p className="st-hint">A loop is one short video. Choose a video up to {maxSeconds} seconds to loop it.</p>
      ) : (
        <>
          <p className="st-hint">
            This part plays over and over, without sound. Anyone whose app doesn’t loop yet sees the whole video.
          </p>
          {span && (
            <div className="st-picture-row">
              <label className="st-field">
                Starts at {seconds(span.from_ms)}
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, durationMs - LOOP_MIN_MS)}
                  step={100}
                  value={span.from_ms}
                  onChange={(e) => {
                    const from = Number(e.target.value);
                    onSpan(fitSpan({ from_ms: from, to_ms: from + length }, durationMs));
                  }}
                />
              </label>
              <label className="st-field">
                Lasts {seconds(length)}
                <input
                  type="range"
                  min={LOOP_MIN_MS}
                  max={Math.max(LOOP_MIN_MS, Math.min(LOOP_MAX_MS, durationMs - span.from_ms))}
                  step={100}
                  value={length}
                  onChange={(e) => onSpan(fitSpan({ from_ms: span.from_ms, to_ms: span.from_ms + Number(e.target.value) }, durationMs))}
                />
              </label>
            </div>
          )}
        </>
      )}
      <div className="dt-row">
        {span && (
          <button type="button" className="st-chip" onClick={onOff}>
            Take the loop off
          </button>
        )}
        <button type="button" className="st-done" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
