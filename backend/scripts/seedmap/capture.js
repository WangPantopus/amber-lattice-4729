// Where and when a photo or video was taken, read from the file's own metadata: the same reading the apps' composers
// make before an upload (frontend/apps/web/src/components/feed/composer/mediaLocation.ts, ported to Node for
// scripts/seedmap.js). JPEG: the EXIF block. HEIC: the EXIF item its `meta` box points at. MOV and MP4: `©xyz`, `loci`
// or Apple's location key, and the movie's creation time. Answers { latitude, longitude, capturedAt, localTime } with any
// of them missing (null), never throws for a file it can't read.

const fs = require('fs');

const JPEG_HEAD_BYTES = 1024 * 1024;
const MAX_TOP_LEVEL_BOXES = 64;
const MAX_MOOV_BYTES = 32 * 1024 * 1024;
const SECONDS_1904_TO_1970 = 2082844800;
const APPLE_LOCATION_KEY = 'com.apple.quicktime.location.ISO6709';
const APPLE_CREATION_KEY = 'com.apple.quicktime.creationdate';

function readRange(fd, start, end) {
  const length = Math.max(0, end - start);
  const buffer = Buffer.alloc(length);
  const read = fs.readSync(fd, buffer, 0, length, start);
  return buffer.subarray(0, read);
}

const ascii = (buf, start, length) => buf.toString('latin1', start, Math.min(buf.length, start + length));

function isoTime(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function located(latitude, longitude) {
  const valid = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90
    && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0);
  return valid ? { latitude, longitude } : null;
}

// ─── Photos: EXIF ────────────────────────────────────────────

/** An EXIF (TIFF) block: the GPS directory's point and time, else the camera's capture time with its offset. */
function readExif(buf) {
  const order = ascii(buf, 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const little = order === 'II';
  const u16 = (at) => (little ? buf.readUInt16LE(at) : buf.readUInt16BE(at));
  const u32 = (at) => (little ? buf.readUInt32LE(at) : buf.readUInt32BE(at));
  const directory = (at) => {
    const entries = new Map();
    if (at + 2 > buf.length) return entries;
    for (let i = 0; i < u16(at) && at + 2 + i * 12 + 12 <= buf.length; i += 1) entries.set(u16(at + 2 + i * 12), at + 2 + i * 12);
    return entries;
  };
  const text = (entry) => {
    if (entry == null) return '';
    const length = u32(entry + 4);
    return ascii(buf, length > 4 ? u32(entry + 8) : entry + 8, length).split('\0')[0].trim();
  };
  const fractions = (entry) => {
    if (entry == null) return null;
    const at = u32(entry + 8);
    return Array.from({ length: Math.min(3, u32(entry + 4)) }, (_, i) => u32(at + i * 8) / (u32(at + i * 8 + 4) || 1));
  };
  const degrees = (parts, negative) => {
    if (!parts?.length) return Number.NaN;
    const value = parts[0] + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
    return negative ? -value : value;
  };
  const top = directory(u32(4));
  const gpsPointer = top.get(0x8825);
  const gps = gpsPointer == null ? new Map() : directory(u32(gpsPointer + 8));
  const point = located(degrees(fractions(gps.get(2)), text(gps.get(1)) === 'S'),
    degrees(fractions(gps.get(4)), text(gps.get(3)) === 'W'));
  // The GPS block's own time is UTC; else the camera's time in its recorded offset (no offset: read as UTC).
  const gpsDay = text(gps.get(29)).replace(/:/g, '-');
  const gpsClock = fractions(gps.get(7));
  let capturedAt = gpsDay && gpsClock?.length === 3
    ? isoTime(`${gpsDay}T${gpsClock.map((part) => String(Math.floor(part)).padStart(2, '0')).join(':')}Z`)
    : null;
  // With no offset recorded, the camera's clock time is local to where it was: `localTime`, read in that place's zone
  // by the caller.
  let localTime = null;
  const exifPointer = top.get(0x8769);
  if (!capturedAt && exifPointer != null) {
    const exif = directory(u32(exifPointer + 8));
    const original = text(exif.get(0x9003));
    const offset = text(exif.get(0x9011));
    const clock = original.replace(/^(\d+):(\d+):/, '$1-$2-').replace(' ', 'T');
    if (original && /^[+-]\d\d:\d\d$/.test(offset)) capturedAt = isoTime(`${clock}${offset}`);
    else if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(clock)) localTime = clock;
  }
  return { ...(point || {}), capturedAt, localTime };
}

function readJpeg(buf) {
  let at = 2;
  while (at + 4 <= buf.length) {
    if (buf[at] !== 0xff) return null;
    const marker = buf[at + 1];
    if (marker === 0xff) { at += 1; continue; }
    if (marker === 0xda || marker === 0xd9) return null;
    const length = buf.readUInt16BE(at + 2);
    if (marker === 0xe1 && ascii(buf, at + 4, 6) === 'Exif\0\0') return readExif(buf.subarray(at + 10, at + 2 + length));
    at += 2 + length;
  }
  return null;
}

// ─── HEIC, MOV, MP4: boxes ─────────────────────────────

function boxAt(buf, at, limit) {
  if (at + 8 > buf.length) return null;
  let size = buf.readUInt32BE(at);
  let header = 8;
  if (size === 1) {
    if (at + 16 > buf.length) return null;
    size = buf.readUInt32BE(at + 8) * 2 ** 32 + buf.readUInt32BE(at + 12);
    header = 16;
  } else if (size === 0) {
    size = limit - at;
  }
  return size < header || at + size > limit ? null : { type: ascii(buf, at + 4, 4), start: at + header, end: at + size };
}

function childBoxes(buf, start, end) {
  const boxes = [];
  let at = start;
  while (at + 8 <= end) {
    const box = boxAt(buf, at, end);
    if (!box) break;
    boxes.push(box);
    at = box.end;
  }
  return boxes;
}

/** A HEIC `meta` box: where the EXIF item is in the file. */
function exifExtent(buf, meta) {
  const children = childBoxes(buf, meta.start + 4, meta.end);
  const iinf = children.find((box) => box.type === 'iinf');
  const iloc = children.find((box) => box.type === 'iloc');
  if (!iinf || !iloc) return null;
  const firstInfe = iinf.start + (buf[iinf.start] === 0 ? 6 : 8);
  const exifItem = childBoxes(buf, firstInfe, iinf.end).find((box) => box.type === 'infe'
    && ascii(buf, box.start + (buf[box.start] >= 3 ? 10 : 8), 4) === 'Exif');
  if (!exifItem) return null;
  const exifId = buf[exifItem.start] >= 3 ? buf.readUInt32BE(exifItem.start + 4) : buf.readUInt16BE(exifItem.start + 4);
  const version = buf[iloc.start];
  const offsetSize = buf[iloc.start + 4] >> 4;
  const lengthSize = buf[iloc.start + 4] & 15;
  const baseSize = buf[iloc.start + 5] >> 4;
  const indexSize = version > 0 ? buf[iloc.start + 5] & 15 : 0;
  const uint = (at, size) => {
    if (size === 0) return 0;
    return size === 8 ? buf.readUInt32BE(at) * 2 ** 32 + buf.readUInt32BE(at + 4) : buf.readUInt32BE(at);
  };
  let at = iloc.start + 6;
  const itemCount = version < 2 ? buf.readUInt16BE(at) : buf.readUInt32BE(at);
  at += version < 2 ? 2 : 4;
  for (let i = 0; i < itemCount; i += 1) {
    const id = version < 2 ? buf.readUInt16BE(at) : buf.readUInt32BE(at);
    at += version < 2 ? 2 : 4;
    if (version > 0) at += 2;
    at += 2;
    const base = uint(at, baseSize);
    at += baseSize;
    const extents = buf.readUInt16BE(at);
    at += 2;
    if (id === exifId) {
      return extents > 0
        ? { offset: base + uint(at + indexSize, offsetSize), length: uint(at + indexSize + offsetSize, lengthSize) }
        : null;
    }
    at += extents * (indexSize + offsetSize + lengthSize);
  }
  return null;
}

function readHeic(fd, box) {
  const meta = readRange(fd, box.start, box.end);
  const extent = exifExtent(meta, { start: 0, end: meta.length });
  if (!extent) return null;
  const item = readRange(fd, extent.offset, extent.offset + extent.length);
  const start = 4 + item.readUInt32BE(0);
  return readExif(item.subarray(start));
}

function iso6709(value) {
  const match = /^\s*([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(value || '');
  return match ? located(Number(match[1]), Number(match[2])) : null;
}

/** Apple's `keys` + `ilst` metadata: the value at a key's number. */
function appleValue(buf, meta, wanted) {
  const start = ascii(buf, meta.start + 4, 4) === 'hdlr' ? meta.start : meta.start + 4;
  const children = childBoxes(buf, start, meta.end);
  const keys = children.find((box) => box.type === 'keys');
  const ilst = children.find((box) => box.type === 'ilst');
  if (!keys || !ilst) return null;
  let at = keys.start + 8;
  for (let number = 1; number <= buf.readUInt32BE(keys.start + 4); number += 1) {
    const size = buf.readUInt32BE(at);
    if (size < 8) return null;
    if (ascii(buf, at + 8, size - 8) === wanted) {
      const item = childBoxes(buf, ilst.start, ilst.end).find((box) => buf.readUInt32BE(box.start - 4) === number);
      const data = item && childBoxes(buf, item.start, item.end).find((box) => box.type === 'data');
      return data ? ascii(buf, data.start + 8, data.end - data.start - 8) : null;
    }
    at += size;
  }
  return null;
}

function readMovie(buf) {
  const boxes = childBoxes(buf, 0, buf.length);
  const udta = boxes.find((box) => box.type === 'udta');
  let point = null;
  let appleCreated = null;
  for (const box of [...boxes, ...(udta ? childBoxes(buf, udta.start, udta.end) : [])]) {
    if (box.type === '\u00a9xyz' && !point) point = iso6709(ascii(buf, box.start + 4, buf.readUInt16BE(box.start)));
    if (box.type === 'meta') {
      if (!point) point = iso6709(appleValue(buf, box, APPLE_LOCATION_KEY));
      appleCreated = appleCreated || appleValue(buf, box, APPLE_CREATION_KEY);
    }
    if (box.type === 'loci' && !point) {
      let at = box.start + 6;
      while (at < box.end && buf[at] !== 0) at += 1;
      point = located(buf.readInt32BE(at + 6) / 65536, buf.readInt32BE(at + 2) / 65536);
    }
  }
  const mvhd = boxes.find((box) => box.type === 'mvhd');
  const seconds = mvhd ? buf.readUInt32BE(mvhd.start + (buf[mvhd.start] === 1 ? 8 : 4)) : 0;
  // Apple's own creation date carries the phone's offset ("2026-11-02T11:04:31-0800"); the movie header's is UTC.
  const capturedAt = (appleCreated && isoTime(appleCreated.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')))
    || (seconds > SECONDS_1904_TO_1970 ? new Date((seconds - SECONDS_1904_TO_1970) * 1000).toISOString() : null);
  return { ...(point || {}), capturedAt };
}

/** { latitude, longitude, capturedAt } read from the file at `filePath` (nulls where it says nothing). */
function readCapture(filePath) {
  const none = { latitude: null, longitude: null, capturedAt: null, localTime: null };
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const size = fs.fstatSync(fd).size;
    const head = readRange(fd, 0, 2);
    let found = null;
    if (head[0] === 0xff && head[1] === 0xd8) {
      found = readJpeg(readRange(fd, 0, Math.min(size, JPEG_HEAD_BYTES)));
    } else {
      let at = 0;
      for (let i = 0; i < MAX_TOP_LEVEL_BOXES && at + 8 <= size; i += 1) {
        const header = readRange(fd, at, at + 16);
        const box = boxAt(header, 0, size - at);
        if (!box) break;
        const payload = { type: box.type, start: at + box.start, end: at + box.end };
        if (box.type === 'meta') { found = readHeic(fd, payload); break; }
        if (box.type === 'moov') {
          found = payload.end - payload.start > MAX_MOOV_BYTES ? null : readMovie(readRange(fd, payload.start, payload.end));
          break;
        }
        at = payload.end;
      }
    }
    return { ...none, ...(found || {}) };
  } catch (_) {
    return none;
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

module.exports = { readCapture };
