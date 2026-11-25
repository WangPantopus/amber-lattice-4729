// The files scripts/seedmap.js uploads, made the way the apps make them before an upload
// (frontend/apps/ios/Pantopus/Features/Moments/Upload/MomentsMediaExport.swift): a photo becomes an upright JPEG no
// larger than 2048 px with no metadata; a video becomes an H.264 MP4 at 720p with its sound and no metadata, with a
// poster frame and two more frames (1280 px JPEGs) for the picture check. HEIC photos are decoded the way the server
// decodes them (services/photoMetadata.js). Videos need ffmpeg and ffprobe on the PATH (or FFMPEG / FFPROBE).
// Nothing is ever cut: a file too long or too large for a route is reported, and the caller leaves it out.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const { removePhotoMetadata } = require('../../services/photoMetadata');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const PHOTO_EXTENSIONS = /\.(jpe?g|heic|heif|png)$/i;
const VIDEO_EXTENSIONS = /\.(mov|mp4|m4v)$/i;
const MAX_PHOTO_PIXELS = 2048;
const STILL_PIXELS = 1280;
const PREVIEW_PIXELS = 640;

function kindOf(name) {
  if (PHOTO_EXTENSIONS.test(name)) return 'photo';
  if (VIDEO_EXTENSIONS.test(name)) return 'video';
  return null;
}

function run(bin, args) {
  return execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

/** A video's length in seconds (ffprobe), or null when it can't be read. */
function videoSeconds(filePath) {
  try {
    const out = run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath]).toString().trim();
    const seconds = Number(out);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch (_) {
    return null;
  }
}

/** The photo as the apps send it: an upright JPEG, at most 2048 px on its longest side, no metadata. */
async function photoUpload(filePath) {
  const cleaned = await removePhotoMetadata(fs.readFileSync(filePath), { limitInputPixels: 100 * 1000 * 1000 });
  const buffer = await sharp(cleaned.buffer)
    .resize(MAX_PHOTO_PIXELS, MAX_PHOTO_PIXELS, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { buffer, mimetype: 'image/jpeg', size: buffer.length, originalname: 'photo.jpg' };
}

/** One frame of a video at `seconds` as a JPEG at most `pixels` on its longest side (ffmpeg turns it upright). */
function frameAt(filePath, seconds, pixels) {
  const scale = `scale='if(gt(iw,ih),min(${pixels},iw),-2)':'if(gt(iw,ih),-2,min(${pixels},ih))'`;
  return run(FFMPEG, ['-v', 'error', '-ss', String(Math.max(0, seconds)), '-i', filePath, '-frames:v', '1',
    '-vf', scale, '-q:v', '3', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1']);
}

/**
 * The video as the apps send it: { file, poster, frames, seconds } (multer-shaped files). The MP4 is H.264 at 720p on
 * its shorter side (smaller ones keep their size), 3 Mbit/s, AAC sound, metadata removed, made upright.
 */
async function videoUpload(filePath) {
  const seconds = videoSeconds(filePath);
  if (!seconds) throw new Error('the video could not be read');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seedmap-'));
  const out = path.join(dir, 'video.mp4');
  try {
    run(FFMPEG, ['-v', 'error', '-y', '-i', filePath, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)',format=yuv420p",
      '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '3M', '-maxrate', '3.5M', '-bufsize', '7M',
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
      '-map_metadata', '-1', '-map_chapters', '-1', '-movflags', '+faststart', out]);
    const buffer = fs.readFileSync(out);
    const still = (at) => {
      const jpeg = frameAt(out, at, STILL_PIXELS);
      return { buffer: jpeg, mimetype: 'image/jpeg', size: jpeg.length, originalname: 'frame.jpg' };
    };
    return {
      seconds,
      file: { buffer, mimetype: 'video/mp4', size: buffer.length, originalname: 'video.mp4' },
      poster: still(Math.min(0.5, seconds / 2)),
      frames: [still(seconds / 3), still((2 * seconds) / 3)],
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A small JPEG to look at when writing the caption (no metadata): the photo, or a video's middle frame. */
async function writePreview(filePath, kind, previewPath) {
  const source = kind === 'video'
    ? frameAt(filePath, (videoSeconds(filePath) || 0) / 2, PREVIEW_PIXELS)
    : (await removePhotoMetadata(fs.readFileSync(filePath), { limitInputPixels: 100 * 1000 * 1000 })).buffer;
  const jpeg = await sharp(source).resize(PREVIEW_PIXELS, PREVIEW_PIXELS, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75 }).toBuffer();
  fs.mkdirSync(path.dirname(previewPath), { recursive: true });
  fs.writeFileSync(previewPath, jpeg);
}

module.exports = { kindOf, videoSeconds, photoUpload, videoUpload, writePreview };
