import type { VideoLimits } from '@pantopus/api/endpoints/moments';
import { canvasOf, edited, jpeg, paintMedia, type Artwork } from './momentArtwork';

export interface PreparedMedia {
  file: Blob;
  poster?: Blob;
  frames?: Blob[];
}
async function photo(file: File, a: Artwork) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const transform = edited(a),
      scale = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
    const { ctx, canvas } = canvasOf(
      transform ? 900 : Math.max(1, Math.round(img.naturalWidth * scale)),
      transform ? 1600 : Math.max(1, Math.round(img.naturalHeight * scale)),
    );
    paintMedia(ctx, img, img.naturalWidth, img.naturalHeight, a);
    return { file: await jpeg(canvas, 0.91) };
  } catch {
    if (!edited(a) && ['image/heic', 'image/heif'].includes(file.type) && file.size <= 10 * 1024 * 1024)
      return { file };
    throw new Error('This photo couldn’t be opened. Choose a JPEG, PNG or a photo your browser can display.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
function mediaEvent(v: HTMLVideoElement, type: string, action: () => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      v.removeEventListener(type, ok);
      v.removeEventListener('error', fail);
      signal.removeEventListener('abort', fail);
    };
    const ok = () => {
        stop();
        resolve();
      },
      fail = () => {
        stop();
        reject(new Error('This video could not be read in this browser.'));
      };
    const timer = setTimeout(fail, 12000);
    v.addEventListener(type, ok, { once: true });
    v.addEventListener('error', fail, { once: true });
    signal.addEventListener('abort', fail, { once: true });
    if (signal.aborted) fail();
    else action();
  });
}
async function stills(blob: Blob, signal: AbortSignal) {
  const v = document.createElement('video'),
    url = URL.createObjectURL(blob);
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  try {
    await mediaEvent(
      v,
      'loadeddata',
      () => {
        v.src = url;
        v.load();
      },
      signal,
    );
    const duration = v.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('This video has no readable duration.');
    const scale = Math.min(1, 840 / Math.max(v.videoWidth, v.videoHeight));
    const { ctx, canvas } = canvasOf(
      Math.max(1, Math.round(v.videoWidth * scale)),
      Math.max(1, Math.round(v.videoHeight * scale)),
    );
    const images: Blob[] = [];
    for (const fraction of [0.02, 0.33, 0.8]) {
      const time = Math.min(duration * 0.99, duration * fraction);
      if (Math.abs(time - v.currentTime) > 0.001)
        await mediaEvent(
          v,
          'seeked',
          () => {
            v.currentTime = time;
          },
          signal,
        );
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      images.push(await jpeg(canvas, 0.85));
    }
    return { poster: images[0], frames: images.slice(1) };
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}
export async function prepareMedia(
  file: File,
  a: Artwork,
  limits: VideoLimits,
  signal: AbortSignal,
  progress: (fraction: number) => void,
): Promise<PreparedMedia[]> {
  signal.throwIfAborted();
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name))
    return [await photo(file, a)];
  const mb = await import('mediabunny');
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Choose a file with a video track.');
    const start = await input.getFirstTimestamp();
    const duration = (await input.computeDuration()) - start;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('This video has no readable duration.');
    const count = Math.max(1, Math.ceil((duration - 0.025) / limits.max_seconds));
    if (count > limits.max_parts)
      throw new Error('Choose a video up to ' + limits.max_seconds * limits.max_parts + ' seconds long.');
    const parts: PreparedMedia[] = [];
    const transform = edited(a);
    const sw = await track.getDisplayWidth(),
      sh = await track.getDisplayHeight();
    const source = transform ? canvasOf(sw, sh) : null,
      output = transform ? canvasOf(720, 1280) : null;
    for (let part = 0; part < count; part++) {
      signal.throwIfAborted();
      const target = new mb.BufferTarget(),
        writer = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
      const conversion = await mb.Conversion.init({
        input,
        output: writer,
        tracks: 'primary',
        tags: {},
        showWarnings: false,
        ...(count > 1
          ? {
              trim: {
                start: start + part * limits.max_seconds,
                end: Math.min(start + duration, start + (part + 1) * limits.max_seconds),
              },
            }
          : {}),
        video: {
          codec: 'avc',
          bitrate: Math.min(
            4_000_000,
            Math.floor((limits.max_bytes * 6) / Math.min(duration, limits.max_seconds)),
          ),
          ...(transform && source && output
            ? {
                width: Math.min(1280, sw),
                forceTranscode: true,
                processedWidth: 720,
                processedHeight: 1280,
                process: (sample: InstanceType<typeof mb.VideoSample>) => {
                  sample.drawWithFit(source.ctx, { fit: 'contain' });
                  paintMedia(output.ctx, source.canvas, sw, sh, a);
                  return output.canvas;
                },
              }
            : file.size / count > limits.max_bytes
              ? { width: Math.min(1280, sw), forceTranscode: true }
              : {}),
        },
        audio: { codec: 'aac' },
      });
      if (
        !conversion.isValid ||
        conversion.discardedTracks.some((t) => t.track.type === 'audio' || t.track.type === 'video')
      )
        throw new Error(
          'This browser cannot export this video with its sound. Try an H.264 MP4 with AAC audio, or use another browser.',
        );
      conversion.onProgress = (f) => progress((part + f * 0.88) / count);
      const cancel = () => {
        void conversion.cancel().catch(() => {});
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        signal.throwIfAborted();
        await conversion.execute();
      } finally {
        signal.removeEventListener('abort', cancel);
      }
      if (!target.buffer) throw new Error('The video could not be exported.');
      const blob = new Blob([target.buffer], { type: 'video/mp4' });
      if (blob.size > limits.max_bytes)
        throw new Error('The exported video is too large. Try a shorter or smaller video.');
      parts.push({ file: blob, ...(await stills(blob, signal)) });
      progress((part + 1) / count);
    }
    return parts;
  } finally {
    input.dispose();
  }
}
