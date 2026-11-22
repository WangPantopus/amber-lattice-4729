'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Disc, Square, SwitchCamera, X } from 'lucide-react';
import { deviceFix, messageOf } from './momentState';
import { canvasOf, jpeg } from './momentArtwork';

export interface CameraCapture {
  file: File;
  at: number;
  position: GeolocationPosition | null;
}
export default function MomentCamera({
  maxSeconds,
  onCapture,
  onClose,
}: {
  maxSeconds: number;
  onCapture(c: CameraCapture): void;
  onClose(): void;
}) {
  const [mode, setMode] = useState<'photo' | 'video'>('photo'),
    [front, setFront] = useState(false),
    [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [note, setNote] = useState('');
  const view = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    rec = useRef<MediaRecorder | null>(null),
    alive = useRef(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setReady(false);
    setNote('');
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('Camera access requires a secure connection and a browser with a camera.');
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: front ? 'user' : 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 1920 },
          },
          audio: mode === 'video',
        });
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (view.current) {
          view.current.srcObject = s;
          await view.current.play();
          if (active) setReady(true);
        }
      } catch (e) {
        if (active) setNote(messageOf(e, 'The camera couldn’t open. Choose a file or try again.'));
      }
    })();
    return () => {
      active = false;
      if (rec.current?.state === 'recording') {
        rec.current.onstop = null;
        rec.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [front, mode, version]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    if (recording && seconds >= maxSeconds && rec.current?.state === 'recording') rec.current.stop();
  }, [recording, seconds, maxSeconds]);
  async function capture() {
    try {
      if (recording) {
        rec.current?.stop();
        return;
      }
      const v = view.current,
        s = stream.current;
      if (!v || !s) return;
      const at = Date.now(),
        position = deviceFix().catch(() => null);
      if (mode === 'photo') {
        const { canvas, ctx } = canvasOf(v.videoWidth, v.videoHeight);
        ctx.drawImage(v, 0, 0);
        const file = new File([await jpeg(canvas, 0.95)], 'camera.jpg', { type: 'image/jpeg' });
        const fix = await position;
        if (alive.current) onCapture({ file, at, position: fix });
        return;
      }
      if (typeof MediaRecorder === 'undefined')
        throw new Error('Video recording is unavailable in this browser. Choose a video from your library.');
      const mime = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find((v) => MediaRecorder.isTypeSupported(v));
      const recorder = new MediaRecorder(s, mime ? { mimeType: mime } : {});
      rec.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onerror = () => {
        setRecording(false);
        setNote('Recording failed. Try again.');
      };
      recorder.onstop = async () => {
        setRecording(false);
        const fix = await position;
        if (alive.current && chunks.length)
          onCapture({
            file: new File(chunks, 'camera.' + (recorder.mimeType.includes('mp4') ? 'mp4' : 'webm'), {
              type: recorder.mimeType.split(';')[0],
            }),
            at,
            position: fix,
          });
      };
      recorder.start(300);
      setSeconds(0);
      setRecording(true);
    } catch (e) {
      setNote(messageOf(e, 'Capture failed.'));
    }
  }
  return (
    <div className="mo-camera">
      <video ref={view} muted playsInline autoPlay />
      <div className="mo-camera-top">
        <button className="mo-icon" onClick={onClose} aria-label="Close camera">
          <X />
        </button>
        <button
          className="mo-icon"
          aria-label="Switch camera"
          disabled={recording}
          onClick={() => setFront((v) => !v)}
        >
          <SwitchCamera />
        </button>
      </div>
      {note && (
        <div role="alert" className="mo-camera-error">
          <p>{note}</p>
          <button onClick={() => setVersion((v) => v + 1)}>Try again</button>
        </div>
      )}
      <div className="mo-capture">
        <div className="mo-editor-tools">
          {(['photo', 'video'] as const).map((m) => (
            <button key={m} disabled={recording} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === 'photo' ? 'Photo' : 'Video'}
            </button>
          ))}
        </div>
        <button
          className="mo-shutter"
          disabled={!ready}
          onClick={() => void capture()}
          aria-label={recording ? 'Stop recording' : mode === 'photo' ? 'Take photo' : 'Start recording'}
        >
          {recording ? <Square /> : mode === 'photo' ? <Camera /> : <Disc />}
        </button>
        {recording && (
          <span>
            {seconds}s / {maxSeconds}s
          </span>
        )}
      </div>
    </div>
  );
}
