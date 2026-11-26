// ============================================================
// DISK-BACKED STREAMING UPLOAD STORAGE
//
// Streams multipart uploads into per-request private temporary directories
// under os.tmpdir() instead of buffering up to 1.8 GB in Node heap/Buffer RAM
// via multer.memoryStorage(). Enforces both per-file and total-batch byte
// ceilings while streaming and cleans up temporary files unconditionally on
// response finish, connection close, or request abort.
// ============================================================

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const multer = require('multer');
const logger = require('../utils/logger');

const DEFAULT_MAX_BATCH_BYTES = 250 * 1024 * 1024; // 250 MB across all files in one request
const DEFAULT_PREFIX = 'pantopus-upload-';
const STALE_DIR_AGE_MS = 24 * 60 * 60 * 1000;

function makeUploadError(message, status = 400, code = 'UPLOAD_INVALID') {
  return Object.assign(new Error(message), { status, code });
}

async function sweepAbandonedDirs(prefix) {
  let entries;
  try {
    entries = await fsp.readdir(os.tmpdir());
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.startsWith(prefix)) continue;
    const dir = path.join(os.tmpdir(), name);
    const stat = await fsp.lstat(dir).catch(() => null);
    if (
      stat?.isDirectory()
      && (typeof process.getuid !== 'function' || stat.uid === process.getuid())
      && Date.now() - stat.mtimeMs > STALE_DIR_AGE_MS
    ) {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Flatten req.file / req.files (array or field-map) into a single file list.
 */
function allUploadedFiles(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
  return [];
}

/**
 * Read a file's bytes from memory or disk (intended for bounded images/documents).
 */
async function readFileBuffer(file) {
  if (!file) throw makeUploadError('Invalid file: no data received', 400);
  if (Buffer.isBuffer(file.buffer)) return file.buffer;
  if (file.path) return fsp.readFile(file.path);
  throw makeUploadError('Invalid file: no data received', 400);
}

/**
 * Build a streaming S3 upload body + contentLength when the file is on disk,
 * or a Buffer body when an in-memory buffer is already attached (e.g. unit tests).
 */
function fileUploadBody(file) {
  if (file?.path) {
    return {
      body: fs.createReadStream(file.path),
      contentLength: file.size,
    };
  }
  return {
    body: file.buffer,
    contentLength: file.buffer.length,
  };
}

/**
 * Stream a file's bytes into a Node crypto.Hash without buffering large videos in RAM.
 */
async function hashUploadedFile(file, hash) {
  if (Buffer.isBuffer(file.buffer)) {
    hash.update(file.buffer);
    return hash;
  }
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(file.path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', resolve);
  });
  return hash;
}

/**
 * Read only the first `length` bytes of an uploaded file (e.g., magic/PDF header check).
 */
async function readHeaderBytes(file, length) {
  if (Buffer.isBuffer(file.buffer)) return file.buffer.subarray(0, length);
  const fh = await fsp.open(file.path, 'r');
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/**
 * Build a disk-backed multer wrapper exposing `.single`, `.array`, and `.fields`.
 *
 * Each request receives an isolated temp dir in os.tmpdir(), streams incoming files
 * through per-file and per-batch byte limits, attaches `req._uploadAbortSignal`,
 * and cleans up the temp dir when the request finishes, closes, or aborts.
 */
function createDiskUpload({
  limits,
  fileFilter,
  maxBytesForFile = null,
  maxBatchBytes = DEFAULT_MAX_BATCH_BYTES,
  prefix = DEFAULT_PREFIX,
  onError = null,
} = {}) {
  sweepAbandonedDirs(prefix).catch(() => {
    logger.warn('Temporary upload directory cleanup deferred');
  });

  const storage = {
    _handleFile(req, file, callback) {
      const ctx = req._diskUpload;
      if (!ctx?.directory) {
        return callback(makeUploadError('Upload storage unavailable', 503, 'UPLOAD_STORAGE_UNAVAILABLE'));
      }
      const filename = crypto.randomUUID();
      const destination = path.join(ctx.directory, filename);
      const maxBytes = typeof maxBytesForFile === 'function' ? maxBytesForFile(req, file) : null;
      let size = 0;

      const bounded = new Transform({
        transform(chunk, _encoding, done) {
          size += chunk.length;
          ctx.bytes += chunk.length;
          if (maxBytes && size > maxBytes) {
            const mb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
            return done(makeUploadError(
              `File "${file.originalname}" exceeds the ${mb}MB limit for this file type`,
              413,
              'UPLOAD_FILE_TOO_LARGE',
            ));
          }
          if (maxBatchBytes && ctx.bytes > maxBatchBytes) {
            const mb = Math.max(1, Math.round(maxBatchBytes / (1024 * 1024)));
            return done(makeUploadError(
              `Total upload size exceeds the ${mb}MB request limit`,
              413,
              'UPLOAD_BATCH_TOO_LARGE',
            ));
          }
          done(null, chunk);
        },
      });

      const write = pipeline(
        file.stream,
        bounded,
        fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
        { signal: ctx.controller.signal },
      );
      ctx.work.add(write);
      write
        .then(() => callback(null, { path: destination, filename, size }))
        .catch((err) => {
          fsp.unlink(destination).catch(() => {});
          callback(err);
        })
        .finally(() => ctx.work.delete(write));
    },
    _removeFile(_req, file, callback) {
      if (!file?.path) return callback(null);
      fs.unlink(file.path, (err) => callback(err?.code === 'ENOENT' ? null : err));
    },
  };

  const instance = multer({ storage, limits, fileFilter });

  function wrap(multerMiddleware) {
    return async function diskUploadMiddleware(req, res, next) {
      const ctx = { controller: new AbortController(), bytes: 0, work: new Set(), directory: null };
      req._diskUpload = ctx;
      req._uploadAbortSignal = ctx.controller.signal;
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        ctx.controller.abort();
        Promise.allSettled([...ctx.work])
          .then(() => (ctx.directory ? fsp.rm(ctx.directory, { recursive: true, force: true }) : null))
          .catch(() => logger.warn('Temporary upload cleanup deferred'));
      };
      res.once('finish', cleanup);
      res.once('close', cleanup);
      req.once('aborted', cleanup);

      try {
        ctx.directory = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
        await fsp.chmod(ctx.directory, 0o700);
      } catch (err) {
        cleanup();
        logger.warn('Temporary upload directory setup failed', { errorCode: err.code });
        return res.status(503).json({ error: 'File upload storage is temporarily unavailable. Please retry.' });
      }

      multerMiddleware(req, res, (err) => {
        if (!err) return next();
        cleanup();
        if (res.destroyed || res.headersSent) return;
        if (typeof onError === 'function') return onError(err, req, res, next);
        if (err.status) {
          return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
        }
        if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'UPLOAD_FILE_TOO_LARGE' || err.code === 'UPLOAD_BATCH_TOO_LARGE') {
          return res.status(413).json({ error: err.message || 'Uploaded file exceeds the size limit' });
        }
        if (['ENOSPC', 'EMFILE', 'ENFILE', 'EACCES', 'EIO'].includes(err.code)) {
          return res.status(503).json({ error: 'File upload storage is temporarily unavailable. Please retry.' });
        }
        return res.status(400).json({ error: err.message || 'Invalid file upload' });
      });
    };
  }

  return {
    single: (field) => wrap(instance.single(field)),
    array: (field, maxCount) => wrap(instance.array(field, maxCount)),
    fields: (fields) => wrap(instance.fields(fields)),
  };
}

module.exports = {
  createDiskUpload,
  allUploadedFiles,
  readFileBuffer,
  fileUploadBody,
  hashUploadedFile,
  readHeaderBytes,
  DEFAULT_MAX_BATCH_BYTES,
};
