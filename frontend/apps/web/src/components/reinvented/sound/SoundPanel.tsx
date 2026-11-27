'use client';

// The Studio's Sound tool (Pulse, reinvented, phase 2; CONTRACT §7e): Voice Spark (your own voice with your words) and
// place sound (three seconds of where you are), on a photo or video Moment under your own name. A whisper is recorded on
// its dot (Illuminate). Nothing is cleaned or changed: the sound goes as it was recorded.

import { useEffect, useRef } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';
import { canRecord, SOUND_MAX_MS, useRecorder, type Recording, type SoundKind } from './record';
import './sound.css';

const secs = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** Record (tap to start, tap to stop; it stops itself at the kind's length), hear it back, take it off. */
export function RecordButton({
  kind,
  value,
  onChange,
  onWords,
}: {
  kind: SoundKind;
  value: Recording | null;
  onChange(r: Recording | null): void;
  /** Voice: words the browser heard while recording, where it can. */
  onWords?(text: string): void;
}) {
  const rec = useRecorder(kind);
  const heard = useRef<{ stop(): void } | null>(null);
  useEffect(() => {
    if (rec.result && rec.result !== value) onChange(rec.result);
  }, [rec.result]); // eslint-disable-line react-hooks/exhaustive-deps
  function begin() {
    void rec.start();
    // Where the browser can turn speech into words, it fills them in; the person can change them.
    const Speech = (window as unknown as { SpeechRecognition?: new () => SpeechLike; webkitSpeechRecognition?: new () => SpeechLike })
      .SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => SpeechLike }).webkitSpeechRecognition;
    if (kind === 'voice' && onWords && Speech) {
      try {
        const s = new Speech();
        s.continuous = true;
        s.interimResults = false;
        let text = '';
        s.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript + ' ';
          onWords(text.trim());
        };
        s.start();
        heard.current = s;
      } catch {
        // Words are typed instead.
      }
    }
  }
  function end() {
    rec.stop();
    heard.current?.stop();
    heard.current = null;
  }
  if (!canRecord()) return <p className="st-hint">This browser can’t record sound.</p>;
  return (
    <div className="sd-rec">
      {rec.state === 'recording' ? (
        <button type="button" className="st-chip sd-recording" onClick={end}>
          <Square aria-hidden="true" /> Stop · {secs(rec.elapsed)} / {secs(SOUND_MAX_MS[kind])}
        </button>
      ) : (
        <button type="button" className="st-chip" disabled={rec.state === 'asking'} onClick={begin}>
          <Mic aria-hidden="true" /> {value ? 'Record again' : kind === 'voice' ? 'Record your voice' : 'Record 3 seconds'}
        </button>
      )}
      {value && rec.state !== 'recording' && (
        <>
          <audio src={value.url} controls preload="auto" aria-label="Hear it back" />
          <button type="button" className="st-chip" aria-label="Take the sound off" onClick={() => onChange(null)}>
            <Trash2 aria-hidden="true" />
          </button>
        </>
      )}
      {rec.error && <p className="st-hint">{rec.error}</p>}
    </div>
  );
}

interface SpeechLike {
  continuous: boolean;
  interimResults: boolean;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  start(): void;
  stop(): void;
}

export function SoundPanel({
  voice,
  setVoice,
  words,
  setWords,
  place,
  setPlace,
  onDone,
}: {
  voice: Recording | null;
  setVoice(r: Recording | null): void;
  words: string;
  setWords(w: string): void;
  place: Recording | null;
  setPlace(r: Recording | null): void;
  onDone(): void;
}) {
  return (
    <div className="st-toolpanel sd-panel" role="group" aria-label="Sound">
      <p className="st-hint">A Moment carries your voice or its place sound, one of the two.</p>
      <p className="st-tray-head">
        <strong>Your voice</strong>
        <span>Up to a minute, with your words lit as you say them</span>
      </p>
      <RecordButton
        kind="voice"
        value={voice}
        onChange={(r) => {
          setVoice(r);
          if (r) setPlace(null);
        }}
        onWords={setWords}
      />
      {voice && (
        <input
          className="dt-input"
          value={words}
          maxLength={1200}
          placeholder="Your words, as you said them"
          aria-label="Your words, as you said them"
          onChange={(e) => setWords(e.target.value)}
        />
      )}
      <p className="st-tray-head">
        <strong>Place sound</strong>
        <span>Three seconds of where you are</span>
      </p>
      <RecordButton
        kind="place"
        value={place}
        onChange={(r) => {
          setPlace(r);
          if (r) setVoice(null);
        }}
      />
      <div className="dt-row">
        <button type="button" className="st-done" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
