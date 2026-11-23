import { moments } from '@pantopus/api';
import { ApiRequestError } from '@pantopus/api/client';
import type { Moment, NewMoment } from '@pantopus/api/endpoints/moments';
import { peekMe } from '@/lib/me';
import type { PreparedMedia } from './momentMedia';
import {
  deviceFix,
  distance,
  gpsLocation,
  PIN_REVIEW_DISTANCE_M,
  recentFix,
  type DeviceFix,
} from './momentState';

export interface Part {
  body: NewMoment;
  media?: PreparedMedia;
}
export interface Job {
  id: string;
  account: string;
  parts: Part[];
  created: number;
  memoryOnly?: boolean;
}
interface Cipher {
  iv: Uint8Array<ArrayBuffer>;
  bytes: ArrayBuffer;
  type: string;
}
interface Stored {
  account: string;
  created: number;
  id: string;
  key: CryptoKey;
  body: Cipher;
  media: Cipher[][];
}
const DB = 'pantopus-moment-uploads-v1',
  shelf = 'jobs',
  day = 86400000;
let epoch = 0;
const active = new Set<AbortController>();
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(shelf, { keyPath: 'id' });
    r.onsuccess = () => {
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
  });
}
async function operation<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(shelf, mode),
      r = run(tx.objectStore(shelf));
    tx.oncomplete = () => {
      db.close();
      resolve(r.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Browser storage is unavailable.'));
    };
  });
}
export function clearMomentUploads() {
  epoch++;
  for (const controller of active) controller.abort();
  if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(DB);
}
export async function discardJob(id: string) {
  await operation('readwrite', (s) => s.delete(id));
}
function assertAccount(account: string, version: number) {
  if (version !== epoch || peekMe()?.id !== account)
    throw new Error('Your account changed. Reopen Moments to continue.');
}
export async function keepJob(job: Job) {
  const version = epoch;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const seal = async (b: Blob): Promise<Cipher> => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return {
      iv,
      bytes: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await b.arrayBuffer()),
      type: b.type,
    };
  };
  const body = await seal(new Blob([JSON.stringify(job.parts.map((p) => p.body))]));
  const media: Cipher[][] = [];
  for (const p of job.parts) {
    const files = p.media
      ? [p.media.file, ...(p.media.poster ? [p.media.poster] : []), ...(p.media.frames || [])]
      : [];
    const part: Cipher[] = [];
    for (const b of files) part.push(await seal(b));
    media.push(part);
  }
  assertAccount(job.account, version);
  const saved: Stored = { id: job.id, account: job.account, created: job.created, key, body, media };
  await operation('readwrite', (s) => s.add(saved));
}
export async function pendingJobs(account: string): Promise<Job[]> {
  const version = epoch,
    result: Job[] = [];
  const ids = await operation('readonly', (s) => s.getAllKeys());
  for (const id of ids) {
    const entry = await operation<Stored | undefined>('readonly', (s) => s.get(id));
    if (!entry) continue;
    if (Date.now() - entry.created > day) {
      await discardJob(entry.id);
      continue;
    }
    if (entry.account !== account) continue;
    const open = async (c: Cipher) =>
      new Blob([await crypto.subtle.decrypt({ name: 'AES-GCM', iv: c.iv }, entry.key, c.bytes)], {
        type: c.type,
      });
    const bodies = JSON.parse(await (await open(entry.body)).text()) as NewMoment[],
      parts: Part[] = [];
    for (let i = 0; i < bodies.length; i++) {
      const files: Blob[] = [];
      for (const c of entry.media[i]) files.push(await open(c));
      parts.push({
        body: bodies[i],
        ...(files.length ? { media: { file: files[0], poster: files[1], frames: files.slice(2) } } : {}),
      });
    }
    assertAccount(account, version);
    result.push({ id: entry.id, created: entry.created, account, parts });
  }
  return result.sort((a, b) => a.created - b.created);
}

function rejectedFix(error: unknown) {
  return error instanceof ApiRequestError && error.code === 'LOCATION_TOO_OLD';
}

async function createPart(body: NewMoment, signal: AbortSignal, refresh: () => Promise<DeviceFix>) {
  // The original request ID may already have created the Moment. In that case the server
  // returns it before checking the old fix, and the file can resume without location access.
  try {
    return await moments.create(body, signal);
  } catch (error) {
    if (!rejectedFix(error) || body.location.source !== 'gps') throw error;
  }

  const fix = await refresh();
  if (distance(body.location, fix.coords) > PIN_REVIEW_DISTANCE_M)
    throw new Error(
      'This Moment is saved for the original location. Return to that spot to continue sharing.',
    );
  const { altitude, altitudeAccuracy, speed } = fix.coords;
  try {
    return await moments.create(
      {
        ...body,
        location: gpsLocation(fix),
        altitude:
          body.altitude && altitude != null
            ? { meters: altitude, accuracy_m: altitudeAccuracy, speed_mps: speed }
            : undefined,
        // A later fix cannot attest that the camera captured the file here just now.
        taken_here: false,
        show_weather: false,
      },
      signal,
    );
  } catch (error) {
    if (rejectedFix(error))
      throw new Error(
        'Your location time is still out of sync. Check automatic date and time on this device, then try again.',
      );
    throw error;
  }
}

export async function postJob(
  job: Job,
  signal: AbortSignal,
  stage: (text: string) => void,
): Promise<Moment[]> {
  const version = epoch,
    controller = new AbortController(),
    cancel = () => controller.abort();
  active.add(controller);
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const send = async () => {
    const results: Moment[] = [];
    let freshFix: DeviceFix | undefined;
    for (const [i, part] of job.parts.entries()) {
      controller.signal.throwIfAborted();
      assertAccount(job.account, version);
      const label = job.parts.length > 1 ? 'Part ' + (i + 1) + ' of ' + job.parts.length + ' · ' : '';
      stage(label + 'Sharing…');
      let { moment } = await createPart(part.body, controller.signal, async () => {
        stage(label + 'Updating your location…');
        if (!freshFix || !recentFix(freshFix.timestamp)) freshFix = await deviceFix(0, controller.signal);
        controller.signal.throwIfAborted();
        assertAccount(job.account, version);
        return freshFix;
      });
      if (part.media && moment.state === 'uploading') {
        assertAccount(job.account, version);
        stage(label + 'Uploading ' + part.body.kind + '…');
        const { file, poster, frames } = part.media;
        ({ moment } = await moments.upload(moment.id, file, poster, frames, controller.signal));
      }
      results.push(moment);
    }
    await discardJob(job.id).catch(() => {});
    return results;
  };
  try {
    return navigator.locks
      ? await navigator.locks.request('moment-' + job.id, { signal: controller.signal }, send)
      : await send();
  } finally {
    active.delete(controller);
    signal.removeEventListener('abort', cancel);
  }
}
