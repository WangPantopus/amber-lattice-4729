// ============================================================
// UPLOAD ROUTES — AWS S3-based file uploads
// Profile pictures, gig media, home task media
// ============================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('node:fs');
const rateLimit = require('express-rate-limit');
const { clientIpKey } = require('../utils/clientIpKey');
const supabaseAdmin = require('../config/supabaseAdmin');
const registerHomeTaskMediaRoutes = require('./homeTaskMediaRoutes');
const { S3_BUCKET } = require('../config/aws');
const verifyToken = require('../middleware/verifyToken');
const logger = require('../utils/logger');
const s3 = require('../services/s3Service');
// Letters' enclosures are kept privately (Mail tab, SRV-4).
const mailEnclosures = require('../services/mailEnclosures');
const imageResizeService = require('../services/marketplace/imageResizeService');
const { MediaNotCleanedError, cleanUploadedPhoto, cleanUploadedMedia } = require('../services/photoMetadata');
const { photoReference, pdfFacts, MAX_PDF_BYTES, MAX_PDF_PAGES } = require('../services/ai/photos');
const { calculateAndStoreCompleteness } = require('../utils/businessCompleteness');
const { requireIdentityFirewallEnabled, requirePersonaEnabled } = require('../utils/featureFlags');
const { writeIdentityAuditLog } = require('../utils/identityAudit');
const { ensureLocalProfile, ownLocalProfileView, syncLocalProfileFromAccount } = require('../utils/identityProfiles');
const { actingBusinessInRoom, canActAsBusiness } = require('../services/chatBusinessAccess');
const { isGigRoomClosedTo, isRoomClosedForWrites } = require('../services/chatGigRoomAccess');
const blockService = require('../services/blockService');
const gigBrowseCache = require('../services/gig/browseCacheService');
const {
  createDiskUpload,
  allUploadedFiles,
  readFileBuffer,
  fileUploadBody,
  hashUploadedFile,
  readHeaderBytes,
} = require('../services/diskUploadStorage');

function publishGigMediaChange(req, gigId) {
  gigBrowseCache.clear();
  req.app.get('io')?.to(`gig:${gigId}`).emit('gig:status-change', { gigId, eventType: 'status-change', timestamp: Date.now() });
}


// Rate limit: 30 uploads per 15 minutes per network (IP, IPv6 by its /64)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: clientIpKey,
  message: 'Too many upload requests. Please try again later.',
});

// Try to load sharp for image processing
let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  logger.warn('Sharp not installed — image thumbnails disabled');
}

// ============ MIME VALIDATION & EXIF STRIPPING ============

// Lazy-load ESM-only file-type module.
// Prefer Node 22.12+'s native require(esm) via Node's real builtin module loader
// so magic-byte detection runs identically in production and CommonJS test
// runners (Jest), falling back to dynamic import() on older Node runtimes.
let _fileTypeMod;
async function getFileTypeModule() {
  if (!_fileTypeMod) {
    try {
      const builtinModule = typeof process.getBuiltinModule === 'function'
        ? process.getBuiltinModule('node:module')
        : require('node:module');
      _fileTypeMod = builtinModule.createRequire(__filename)('file-type');
    } catch {
      _fileTypeMod = await import('file-type');
    }
  }
  return _fileTypeMod;
}

// ZIP-based Office formats share the same magic bytes as generic ZIP
const ZIP_BASED_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/**
 * Validate that the file's actual content matches the claimed MIME type.
 * Returns { valid: true } or { valid: false, detected, declared }.
 * Fails closed on detection errors so unreadable or malformed payloads cannot
 * slip past MIME verification. Images, videos and audio always carry
 * recognizable magic bytes, so a media upload whose content isn't identified at
 * all is rejected; other types (plain text, CSV) may stay unidentified.
 */
async function validateFileMime(file) {
  if (!file || (!Buffer.isBuffer(file.buffer) && !file.path)) {
    return { valid: false, detected: null, declared: file?.mimetype, reason: 'missing_buffer' };
  }

  const declaredMedia = /^(image|video|audio)\//.test(file.mimetype || '');
  let detected;
  try {
    const fileType = await getFileTypeModule();
    if (file.path) {
      detected = await fileType.fileTypeFromFile(file.path);
    } else {
      detected = await fileType.fileTypeFromBuffer(file.buffer);
    }
  } catch (err) {
    // Fail closed when magic-byte inspection throws so malformed or unreadable uploads
    // cannot slip past MIME verification into storage.
    logger.warn('MIME detection threw — rejecting upload', {
      originalname: file.originalname,
      declared: file.mimetype,
      error: err.message,
    });
    return { valid: false, detected: null, declared: file.mimetype };
  }

  if (!detected) {
    // file-type can't identify the file. Fine for plain text; a script or page
    // claiming to be an image would otherwise be stored in the public bucket.
    logger.warn(`MIME detection returned undefined — ${declaredMedia ? 'rejecting media' : 'allowing'} upload`, {
      declared: file.mimetype,
      originalname: file.originalname,
    });
    return declaredMedia ? { valid: false, detected: null, declared: file.mimetype } : { valid: true };
  }

  const declaredMime = file.mimetype;
  const detectedMime = detected.mime;

  // Exact match
  if (detectedMime === declaredMime) return { valid: true };

  // ZIP-based Office formats: detected as application/zip but declared as docx/xlsx
  if (detectedMime === 'application/zip' && ZIP_BASED_MIMES.has(declaredMime)) {
    return { valid: true };
  }

  // HEIF/HEIC variants: file-type may detect image/heif vs declared image/heic or vice versa
  const heicVariants = new Set(['image/heic', 'image/heif']);
  if (heicVariants.has(detectedMime) && heicVariants.has(declaredMime)) {
    return { valid: true };
  }

  // Audio/video container MIME aliases where clients and file-type use different IANA/vendor labels
  // for the same container magic bytes (e.g. iOS/Android voice memos declared audio/m4a -> audio/x-m4a
  // or video/mp4, MediaRecorder audio/webm -> video/webm, AVI video/x-msvideo -> video/vnd.avi).
  const mp4AudioDeclared = new Set(['audio/m4a', 'audio/x-m4a', 'audio/mp4', 'audio/aac']);
  const mp4AudioDetected = new Set(['audio/x-m4a', 'audio/mp4', 'audio/aac', 'video/mp4']);
  if (mp4AudioDeclared.has(declaredMime) && mp4AudioDetected.has(detectedMime)) {
    return { valid: true };
  }
  if (declaredMime === 'audio/webm' && (detectedMime === 'video/webm' || detectedMime === 'video/matroska')) {
    return { valid: true };
  }
  if (declaredMime === 'video/x-msvideo' && detectedMime === 'video/vnd.avi') {
    return { valid: true };
  }

  return { valid: false, detected: detectedMime, declared: declaredMime };
}

/**
 * Middleware: validate MIME types and remove metadata for all uploaded files: location, camera and time taken from
 * photos, location and camera from videos. One that can't be cleaned is refused, never stored as it was sent; an
 * iPhone HEIC becomes a JPEG.
 * Must run AFTER multer and AFTER enforceFileSizeLimits.
 */
async function validateAndStripUploads(req, res, next) {
  const files = allUploadedFiles(req);
  if (files.length === 0) return next();

  try {
    for (const file of files) {
      if (!file || (!Buffer.isBuffer(file.buffer) && !file.path)) {
        return res.status(400).json({ error: 'Invalid file: no data received' });
      }

      // 1. MIME validation
      const result = await validateFileMime(file);
      if (!result.valid) {
        if (result.reason === 'missing_buffer') {
          return res.status(400).json({ error: 'Invalid file: no data received' });
        }
        logger.warn('MIME type mismatch rejected', {
          originalname: file.originalname,
          declared: result.declared,
          detected: result.detected,
        });
        return res.status(400).json({
          error: result.detected
            ? `File "${file.originalname}" content does not match its declared type (declared: ${result.declared}, detected: ${result.detected})`
            : `File "${file.originalname}" isn't a valid image, video or audio file.`,
        });
      }

      // 2. Photos and videos lose their metadata (services/photoMetadata.js)
      try {
        await cleanUploadedMedia(file);
      } catch (err) {
        if (!(err instanceof MediaNotCleanedError)) throw err;
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
    }
    next();
  } catch (err) {
    logger.error('File validation error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'File validation failed' });
  }
}

// ============ MULTER CONFIG (DISK-BACKED STREAMING) ============

const maxBytesByCategory = (_req, file) => {
  const category = s3.categorizeFile(file.mimetype);
  return category ? s3.MAX_FILE_SIZES[category] : s3.MAX_FILE_SIZES.document;
};

const upload = createDiskUpload({
  limits: { fieldNameSize: 100, fieldNestingDepth: 3, fieldArrayIndexLimit: 32, fileSize: 100 * 1024 * 1024, files: 10, fields: 32, parts: 42, fieldSize: 32768 },
  maxBytesForFile: maxBytesByCategory,
  fileFilter: (req, file, cb) => {
    if (s3.isAllowedType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`), false);
    }
  },
});

// Nine logical attachments may contain eighteen files when every attachment
// is a Live Photo (a still plus its companion clip).
const postMediaUpload = createDiskUpload({
  limits: { fieldNameSize: 100, fieldNestingDepth: 3, fieldArrayIndexLimit: 32, fileSize: 100 * 1024 * 1024, files: 18, fields: 32, parts: 50, fieldSize: 4096 },
  maxBytesForFile: maxBytesByCategory,
  fileFilter: (_req, file, cb) => {
    const allowed = s3.ALLOWED_IMAGE_TYPES.includes(file.mimetype)
      || s3.ALLOWED_VIDEO_TYPES.includes(file.mimetype) || file.mimetype === 'application/pdf';
    cb(allowed ? null : new Error('Choose an image, video, or PDF'), allowed);
  },
});

/**
 * Middleware to enforce per-category file size limits after multer accepts the file.
 * Disk streaming enforces these while receiving bytes; this keeps the exact per-category
 * guard for any buffered/test inputs as well.
 */
function enforceFileSizeLimits(req, res, next) {
  const files = allUploadedFiles(req);
  for (const file of files) {
    const category = s3.categorizeFile(file.mimetype);
    const maxSize = category ? s3.MAX_FILE_SIZES[category] : s3.MAX_FILE_SIZES.document;
    if (maxSize && file.size > maxSize) {
      return res.status(413).json({
        error: `File "${file.originalname}" exceeds the ${Math.round(maxSize / 1024 / 1024)}MB limit for ${category || 'this'} file type`,
      });
    }
  }
  next();
}

// ============ HELPERS ============

async function generateThumbnail(buffer, mimetype) {
  if (!sharp || !mimetype.startsWith('image/')) return null;
  try {
    const thumbBuffer = await sharp(buffer)
      .resize(400, 400, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();
    return thumbBuffer;
  } catch {
    return null;
  }
}

function resolveStoredMediaUrl(url, key) {
  const cleanUrl = typeof url === 'string' ? url.trim() : '';
  const cleanKey = typeof key === 'string' ? key.trim() : '';

  if (/^https?:\/\//i.test(cleanUrl)) return cleanUrl;
  if (cleanKey) return s3.getPublicUrl(cleanKey);
  if (cleanUrl) return s3.getPublicUrl(cleanUrl.replace(/^\/+/, ''));
  return '';
}

// ============ PROFILE PICTURE ============

/**
 * POST /api/upload/profile-picture
 * Upload or replace user profile picture
 */
router.post('/profile-picture', uploadLimiter, verifyToken, upload.single('file'), enforceFileSizeLimits, validateAndStripUploads, async (req, res) => {
  try {
    const userId = req.user.id;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Profile picture must be an image' });
    }

    // Process image (resize if sharp available)
    const rawBuffer = await readFileBuffer(file);
    let processedBuffer = rawBuffer;
    if (sharp) {
      try {
        processedBuffer = await sharp(rawBuffer)
          .resize(800, 800, { fit: 'cover' })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        processedBuffer = rawBuffer;
      }
    }

    // Upload to S3
    const { url, key } = await s3.uploadProfilePicture(
      processedBuffer,
      file.originalname,
      userId,
      sharp ? 'image/webp' : file.mimetype,
      { abortSignal: req._uploadAbortSignal },
    );

    // The photo as it was: the Local Profile's copy of it follows the upload, a photo the person chose to show
    // neighbors stays (syncLocalProfileFromAccount below).
    const { data: currentUser, error: currentErr } = await supabaseAdmin
      .from('User')
      .select('profile_picture_url')
      .eq('id', userId)
      .single();

    // Update user record
    const { data: updatedUser, error } = await supabaseAdmin
      .from('User')
      .update({
        profile_picture_url: url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('id, profile_picture_url')
      .single();

    if (error) {
      // Rollback: delete uploaded file
      await s3.deleteFromS3(key);
      return res.status(500).json({ error: 'Failed to update profile picture' });
    }

    // Posts, comments and search show the LocalProfile's copy of the photo.
    try {
      await syncLocalProfileFromAccount(updatedUser, ['profile_picture_url'], currentErr ? null : currentUser);
    } catch (syncErr) {
      logger.error('Profile picture local profile sync error', { error: syncErr.message, userId });
      return res.status(500).json({ error: 'Failed to update profile picture' });
    }

    logger.info('Profile picture uploaded via S3', { userId, key });

    res.json({
      message: 'Profile picture uploaded successfully',
      url,
      key,
      user: updatedUser,
    });
  } catch (err) {
    logger.error('Profile picture upload error', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to upload profile picture' });
  }
});

/**
 * POST /api/upload/local-profile-picture
 * The photo neighbors see (How neighbors see you): it goes on the Local Profile only, never the account, and stops
 * following account photo changes (syncLocalProfileFromAccount). Answers as GET /api/local-profiles/me, plus `url`.
 */
router.post('/local-profile-picture', requireIdentityFirewallEnabled, uploadLimiter, verifyToken, upload.single('file'), enforceFileSizeLimits, validateAndStripUploads, async (req, res) => {
  try {
    const userId = req.user.id;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Profile picture must be an image' });
    }

    const profile = await ensureLocalProfile(userId);
    if (!profile) return res.status(404).json({ error: 'Local profile not found' });

    const rawBuffer = await readFileBuffer(file);
    let processedBuffer = rawBuffer;
    let finalMimeType = file.mimetype;
    if (sharp) {
      try {
        processedBuffer = await sharp(rawBuffer)
          .resize(800, 800, { fit: 'cover' })
          .webp({ quality: 85 })
          .toBuffer();
        finalMimeType = 'image/webp';
      } catch {
        processedBuffer = rawBuffer;
      }
    }

    // Keyed by the Local Profile, not the account, and without the file's own name: neighbors see this link.
    const ext = finalMimeType === 'image/webp'
      ? 'webp'
      : (path.extname(file.originalname || '').replace('.', '') || 'jpg').toLowerCase();
    const key = `local-profiles/${profile.id}/avatar-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const { url } = await s3.uploadToS3(processedBuffer, key, finalMimeType);

    const { data: updatedProfile, error } = await supabaseAdmin
      .from('LocalProfile')
      .update({ avatar_url: url, updated_at: new Date().toISOString() })
      .eq('id', profile.id)
      .select()
      .single();

    if (error) {
      await s3.deleteFromS3(key);
      return res.status(500).json({ error: 'Failed to update profile picture' });
    }

    await writeIdentityAuditLog({
      req,
      actorUserId: userId,
      targetUserId: userId,
      action: 'local_profile.avatar_uploaded',
      targetType: 'LocalProfile',
      targetId: profile.id,
    });

    logger.info('Local profile picture uploaded', { userId, key });

    res.json({ ...(await ownLocalProfileView(updatedProfile, userId)), url });
  } catch (err) {
    logger.error('Local profile picture upload error', { error: err.message });
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
});

// ============ PERSONA MEDIA (avatar / banner) ============

/**
 * POST /api/upload/persona-media/:personaId
 * Upload avatar or banner for a Beacon.
 * Query param: type = "avatar" | "banner"
 */
async function authorizePersonaMediaUpload(req, res, next) {
  try {
    const { data: persona, error: personaErr } = await supabaseAdmin
      .from('PublicPersona')
      .select('id, user_id, handle, avatar_url, banner_url, status')
      .eq('id', req.params.personaId)
      .single();
    if (personaErr || !persona) return res.status(404).json({ error: 'Beacon not found' });
    if (persona.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have permission to edit this Beacon' });
    }
    req._uploadTarget = persona;
    return next();
  } catch (err) {
    logger.error('Persona media authz error', { error: err.message });
    return res.status(503).json({ error: 'Could not verify Beacon access. Please retry.' });
  }
}

router.post('/persona-media/:personaId', requirePersonaEnabled, uploadLimiter, verifyToken, authorizePersonaMediaUpload, upload.single('file'), enforceFileSizeLimits, validateAndStripUploads, async (req, res) => {
  try {
    const userId = req.user.id;
    const mediaType = req.query.type || req.body.type;

    if (!['avatar', 'banner'].includes(mediaType)) {
      return res.status(400).json({ error: 'type must be "avatar" or "banner"' });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Beacon media must be an image' });
    }

    const persona = req._uploadTarget;
    const rawBuffer = await readFileBuffer(file);
    let processedBuffer = rawBuffer;
    let finalMimeType = file.mimetype;
    if (sharp) {
      try {
        const resize =
          mediaType === 'avatar'
            ? sharp(rawBuffer).resize(800, 800, { fit: 'cover' })
            : sharp(rawBuffer).resize(1600, 600, { fit: 'cover' });
        processedBuffer = await resize.webp({ quality: 85 }).toBuffer();
        finalMimeType = 'image/webp';
      } catch {
        processedBuffer = rawBuffer;
      }
    }

    const ext = finalMimeType === 'image/webp'
      ? 'webp'
      : (path.extname(file.originalname || '').replace('.', '') || 'jpg').toLowerCase();
    const key = `persona-media/${persona.id}/${mediaType}-${Date.now()}-${require('crypto').randomBytes(4).toString('hex')}.${ext}`;
    const { url } = await s3.uploadToS3(processedBuffer, key, finalMimeType);

    const updateField = mediaType === 'avatar' ? 'avatar_url' : 'banner_url';
    const { data: updatedPersona, error: updateErr } = await supabaseAdmin
      .from('PublicPersona')
      .update({
        [updateField]: url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', persona.id)
      .select('id, handle, avatar_url, banner_url')
      .single();

    if (updateErr) {
      await s3.deleteFromS3(key);
      return res.status(500).json({ error: `Failed to update ${mediaType}` });
    }

    await writeIdentityAuditLog({
      actorUserId: userId,
      targetUserId: userId,
      personaId: persona.id,
      action: `persona.${mediaType}_uploaded`,
      targetType: 'PublicPersona',
      targetId: persona.id,
      metadata: { media_type: mediaType },
      req,
    });

    logger.info('Persona media uploaded', { personaId: persona.id, mediaType, key });

    return res.json({
      message: `${mediaType} uploaded successfully`,
      url,
      key,
      persona: updatedPersona,
    });
  } catch (err) {
    logger.error('Persona media upload error', { error: err.message });
    return res.status(500).json({ error: err.message || 'Failed to upload Beacon media' });
  }
});


// ============ GIG MEDIA ============

/**
 * POST /api/upload/gig-media/:gigId
 * Upload media files for a gig (up to 10)
 */
async function authorizeGigMediaUpload(req, res, next) {
  try {
    const { data: gig, error: gigErr } = await supabaseAdmin.from('Gig')
      .select('id, user_id').eq('id', req.params.gigId).maybeSingle();
    if (gigErr) return res.status(503).json({ error: 'Task could not be checked. Please retry.' });
    if (!gig) return res.status(404).json({ error: 'Gig not found' });
    if (gig.user_id !== req.user.id) return res.status(403).json({ error: 'Only the gig owner can upload media' });
    req._uploadTarget = gig;
    return next();
  } catch (err) {
    logger.error('Gig media authz error', { error: err.message });
    return res.status(503).json({ error: 'Task could not be checked. Please retry.' });
  }
}

router.post('/gig-media/:gigId', uploadLimiter, verifyToken, authorizeGigMediaUpload, upload.array('files', 10), enforceFileSizeLimits, validateAndStripUploads, async (req, res) => {
  const stagedKeys = [];
  let keepStagedFiles = false;
  try {
    const userId = req.user.id;
    const { gigId } = req.params;
    const files = req.files;
    if (!files?.length) return res.status(400).json({ error: 'No files provided' });

    const prepared = [];
    for (const file of files) {
      const { body, contentLength } = fileUploadBody(file);
      const { url, key } = await s3.uploadGigMedia(body, file.originalname, userId, gigId, file.mimetype, {
        contentLength,
        abortSignal: req._uploadAbortSignal,
      });
      stagedKeys.push(key);
      let thumbnailUrl = null;
      const thumbBuffer = file.mimetype.startsWith('image/')
        ? await generateThumbnail(await readFileBuffer(file), file.mimetype)
        : null;
      if (thumbBuffer) {
        const thumbKey = key.replace(/(\.[^.]+)$/, '_thumb.webp');
        stagedKeys.push(thumbKey);
        thumbnailUrl = (await s3.uploadToS3(thumbBuffer, thumbKey, 'image/webp', undefined, { abortSignal: req._uploadAbortSignal })).url;
      }
      prepared.push({ file_url: url, file_key: key, file_name: file.originalname,
        file_type: s3.categorizeFile(file.mimetype) || 'document', mime_type: file.mimetype,
        file_size: file.size, thumbnail_url: thumbnailUrl });
    }
    keepStagedFiles = true; // A lost RPC acknowledgement may still have committed.
    const { data: result, error } = await supabaseAdmin.rpc('attach_gig_media', {
      p_gig_id: gigId, p_actor_id: userId, p_media: prepared,
    });
    // An unknown database acknowledgement must not delete potentially committed files.
    if (error || !result) {
      return res.status(503).json({ error: 'Upload could not be confirmed. Refresh the task before retrying.' });
    }
    if (result.error) {
      keepStagedFiles = false;
      const errors = { NOT_FOUND: [404, 'Gig not found'], FORBIDDEN: [403, 'Only the gig owner can upload media'],
        GIG_MEDIA_LIMIT: [400, 'Maximum 10 media files per gig. Remove a file before uploading more.'] };
      const refusal = errors[result.error] || [503, 'Upload could not be saved. Please retry.'];
      return res.status(refusal[0]).json({ code: result.error, error: refusal[1] });
    }
    if (!Array.isArray(result.media) || result.media.length !== files.length) {
      return res.status(503).json({ error: 'Upload could not be confirmed. Refresh the task before retrying.' });
    }
    publishGigMediaChange(req, gigId);
    return res.json({ message: `${result.media.length} file(s) uploaded successfully`, media: result.media });
  } catch (err) {
    logger.error('Gig media upload error', { error: err.message });
    return res.status(503).json({ error: 'Task photos could not be saved. Please retry.' });
  } finally {
    if (!keepStagedFiles) await Promise.all(stagedKeys.map(key => s3.deleteFromS3(key)));
  }
});

/**
 * GET /api/upload/gig-media/:gigId
 * Get all media for a gig
 */
router.get('/gig-media/:gigId', async (req, res) => {
  try {
    const { gigId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('GigMedia')
      .select('*')
      .eq('gig_id', gigId)
      .order('display_order', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch gig media' });
    }
    const media = (data || []).map((row) => ({
      ...row,
      file_url: resolveStoredMediaUrl(row.file_url, row.file_key),
      thumbnail_url: row.thumbnail_url
        ? resolveStoredMediaUrl(row.thumbnail_url, '')
        : null,
    }));

    res.json({ media });
  } catch (err) {
    logger.error('Gig media fetch error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch gig media' });
  }
});

/**
 * DELETE /api/upload/gig-media/:gigId/:mediaId
 * Delete a gig media file
 */
router.delete('/gig-media/:gigId/:mediaId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { gigId, mediaId } = req.params;

    // Verify ownership
    const { data: media, error: fetchErr } = await supabaseAdmin
      .from('GigMedia')
      .select('*, Gig!inner(user_id)')
      .eq('id', mediaId)
      .eq('gig_id', gigId)
      .single();

    if (fetchErr || !media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Only gig owner can delete
    if (media.Gig?.user_id !== userId) {
      // Fallback check
      const { data: gig } = await supabaseAdmin.from('Gig').select('user_id').eq('id', gigId).single();
      if (!gig || gig.user_id !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
    }

    if (!await s3.deleteFromS3(media.file_key)) return res.status(503).json({ error: 'Media could not be deleted. Please retry.' });
    if (media.thumbnail_url && !await s3.deleteFromS3(media.file_key.replace(/(\.[^.]+)$/, '_thumb.webp'))) {
      return res.status(503).json({ error: 'Media could not be deleted. Please retry.' });
    }
    // The existing media row and its attachment reference are removed together.
    const { error: deleteError } = await supabaseAdmin.from('GigMedia').delete().eq('id', mediaId).eq('file_key', media.file_key);
    if (deleteError) return res.status(503).json({ error: 'Media deletion could not be confirmed. Please retry.' });

    publishGigMediaChange(req, gigId);
    res.json({ message: 'Media deleted successfully' });
  } catch (err) {
    logger.error('Gig media delete error', { error: err.message });
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

/**
 * POST /api/upload/chat-media/:roomId
 * Upload chat attachments (documents/images) and return File records.
 */
const streamedChatUpload = require('../services/chatMediaUpload')({ validateFileMime });
const chatUploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 60,
  keyGenerator: req => req.user.id, standardHeaders: true, legacyHeaders: false,
  handler: (_req, res) => res.status(429).set('Retry-After', '60').json({
    error: 'Too many attachment uploads. Please retry in a minute.', code: 'CHAT_UPLOAD_RATE_LIMITED', retryAfter: 60,
  }),
});
async function authorizeChatUpload(req, res, next) {
  try {
    const { roomId } = req.params;
    if (require('joi').string().uuid().validate(roomId).error) return res.status(400).json({ error: 'Invalid room' });
    const { data: participant, error } = await supabaseAdmin.from('ChatParticipant')
      .select('id').eq('room_id', roomId).eq('user_id', req.user.id).eq('is_active', true).maybeSingle();
    if (error) throw error;
    const actingFor = participant ? null : await actingBusinessInRoom(roomId, req.user.id);
    if ((!participant && !actingFor) || await isGigRoomClosedTo(roomId, req.user.id, actingFor ? [actingFor] : [])
      || await isRoomClosedForWrites(roomId)) {
      return res.status(403).json({ error: 'Not authorized to upload files to this room' });
    }
    next();
  } catch (error) {
    logger.warn('Chat upload access unavailable', { errorCode: error.code });
    res.status(503).json({ error: 'Attachment access is temporarily unavailable. Please retry.' });
  }
}
router.post('/chat-media/:roomId', verifyToken, chatUploadLimiter, authorizeChatUpload,
  streamedChatUpload.receive, streamedChatUpload.prepare, async (req, res) => {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;
    const files = req.files || [];
    const requestId = req.body.client_request_id;

    if (requestId !== undefined && require('joi').string().uuid().validate(requestId).error) {
      return res.status(400).json({ error: 'Invalid upload request ID' });
    }

    if (files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    // Keep both resources as ordinary private File rows, so authorization,
    // retries and message deletion cover the motion clip as well as the still.
    let slots;
    try {
      slots = req.body.media == null ? files.map((_, fileIndex) => ({ fileIndex })) : JSON.parse(req.body.media);
      if (!Array.isArray(slots) || !slots.length || slots.length > 5) throw new Error('Choose up to 5 attachments');
      const used = new Set();
      const take = index => {
        if (!Number.isInteger(index) || !files[index] || used.has(index)) throw new Error('Invalid attachment pairing');
        used.add(index);
        return files[index];
      };
      for (const slot of slots) {
        const still = take(slot?.fileIndex);
        if (slot.liveVideoIndex != null) {
          const clip = take(slot.liveVideoIndex);
          if (!still.mimetype.startsWith('image/') || !clip.mimetype.startsWith('video/')) throw new Error('A Live Photo needs a still and video');
        }
      }
      if (used.size !== files.length) throw new Error('Every file must belong to an attachment');
    } catch (error) {
      return res.status(400).json({ error: error instanceof SyntaxError ? 'Invalid attachment pairing' : error.message });
    }

    const { data: participant } = await supabaseAdmin
      .from('ChatParticipant')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    // A business's owner and staff attach files to its conversations without being members of them.
    if (!participant && !(await actingBusinessInRoom(roomId, userId))) {
      return res.status(403).json({ error: 'Not authorized to upload files to this room' });
    }

    // Bind every part to the same send intent. Include the ordered batch in the
    // fingerprint so a changed retry cannot combine attachments from two drafts.
    const batch = files.map(file => [
      file.originalname, file.mimetype, file.sha256,
    ]);
    const fingerprint = requestId ? crypto.createHash('sha256').update(JSON.stringify(req.body.media == null ? batch : [batch, slots])).digest('hex') : null;
    const recordIds = files.map((_, index) => {
      if (!requestId) return crypto.randomUUID();
      const hex = crypto.createHash('sha256')
        .update(`pantopus:chat-upload:v1:${userId.toLowerCase()}:${roomId.toLowerCase()}:${requestId.toLowerCase()}:${index}`)
        .digest('hex').slice(0, 32);
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    });
    const pairMetadata = files.map(() => ({}));
    for (const slot of slots) {
      if (slot.liveVideoIndex == null) continue;
      pairMetadata[slot.fileIndex] = { live_video_file_id: recordIds[slot.liveVideoIndex] };
      pairMetadata[slot.liveVideoIndex] = { live_photo_file_id: recordIds[slot.fileIndex] };
    }
    const uploaded = [];
    for (const [index, file] of files.entries()) {
      const id = requestId ? recordIds[index] : null;
      const readExisting = async () => {
        const { data, error } = await supabaseAdmin.from('File').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data;
      };
      const conflict = saved => saved.is_deleted || saved.metadata?.upload_fingerprint !== fingerprint;
      const responseFile = saved => ({
        id: saved.id, file_url: `/api/chat/files/${saved.id}`,
        original_filename: saved.original_filename, mime_type: saved.mime_type,
        file_size: saved.file_size, file_type: saved.file_type,
        ...pairMetadata[index],
      });
      if (id) {
        const existing = await readExisting();
        if (existing) {
          if (conflict(existing)) return res.status(409).json({ error: 'This upload request was already used. Send the attachment again.', code: 'CHAT_UPLOAD_REQUEST_REUSED' });
          uploaded.push(responseFile(existing));
          continue;
        }
      }

      const recordId = recordIds[index];
      const objectKey = id ? `chat/${roomId}/${userId}/${id}/${fingerprint}${path.extname(file.originalname).toLowerCase()}`
        : s3.generateS3Key(`chat/${roomId}`, file.originalname, userId);
      const sha256 = file.sha256;
      const storageReference = s3.chatFileStorageReference(recordId, userId, roomId, objectKey, sha256);
      const { key } = await s3.uploadToS3(fs.createReadStream(file.path), objectKey, file.mimetype,
        s3.chatFileObjectMetadata(recordId, userId, sha256),
        { contentLength: file.size, abortSignal: req.chatUpload.controller.signal });

      const ext = (path.extname(file.originalname || '').replace('.', '') || '').toLowerCase();
      const category = s3.categorizeFile(file.mimetype) || 'document';

      // Clients fetch files through GET /api/chat/files/:fileId, which checks room membership and serves the bytes.
      // The row never holds the storage address: its key names the uploader, who may be a business's owner or staff,
      // and messages copy file_url to everyone in the room.
      const row = {
          id: recordId,
          user_id: userId,
          filename: key.split('/').pop() || file.originalname,
          original_filename: file.originalname,
          file_path: key,
          file_url: `/api/chat/files/${recordId}`,
          file_size: file.size,
          mime_type: file.mimetype,
          file_extension: ext,
          file_type: 'chat_file',
          visibility: 'private',
          processing_status: 'completed',
          metadata: {
            ...storageReference,
            room_id: roomId,
            category,
            uploaded_via: 'chat',
            ...pairMetadata[index],
            ...(fingerprint ? { upload_fingerprint: fingerprint } : {}),
          }
        };
      const { data: inserted, error: saveErr } = await (id
        ? supabaseAdmin.from('File').upsert(row, { onConflict: 'id', ignoreDuplicates: true })
        : supabaseAdmin.from('File').insert(row))
        .select('id, file_url, original_filename, mime_type, file_size, file_type')
        .maybeSingle();

      if (saveErr) {
        // An uncertain keyed commit may already own this object. Retry uses
        // exactly the same name; deleting it could break a successful upload.
        if (!id) await s3.deleteFromS3(key);
        return res.status(500).json({ error: 'Failed to save uploaded file metadata' });
      }
      const saved = inserted || (id ? await readExisting() : null);
      if (!saved) throw new Error('Upload returned no file');
      if (id && !inserted && conflict(saved)) {
        // Competing contents have disjoint object names. A tombstone must not
        // acquire late-arriving objects after deletion either.
        if (saved.is_deleted && saved.file_path === key) {
          // A delayed same-key write must invalidate a previous absence receipt
          // before attempting best-effort deletion. Its inventory remains durable.
          const invalidated = await supabaseAdmin.rpc('invalidate_chat_file_cleanup', { p_file_id: id, p_key: key });
          if (invalidated.error) return res.status(503).json({ error: 'Attachment deletion could not be confirmed. Please retry.' });
        }
        await s3.deleteFromS3(key);
        return res.status(409).json({ error: 'This upload request was already used. Send the attachment again.', code: 'CHAT_UPLOAD_REQUEST_REUSED' });
      }

      uploaded.push(responseFile(saved));
    }

    res.json({
      message: `${uploaded.length} file(s) uploaded`,
      media: uploaded,
    });
  } catch (err) {
    logger.error('Chat media upload error', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to upload chat files' });
  }
});

/**
 * POST /api/upload/gig-question-media/:gigId
 * Upload files used in gig Q&A (questions/answers).
 * Returns file URLs so callers can attach them to GigQuestion records.
 */
async function authorizeGigQuestionUpload(req, res, next) {
  try {
    const userId = req.user.id;
    const { data: gig, error: gigErr } = await supabaseAdmin
      .from('Gig')
      .select('id, user_id, status')
      .eq('id', req.params.gigId)
      .maybeSingle();
    if (gigErr) return res.status(503).json({ error: 'Question uploads are temporarily unavailable. Please retry.' });
    if (!gig) return res.status(404).json({ error: 'Gig not found' });
    const [blocked, canAct] = await Promise.all([
      blockService.isBlocked(gig.user_id, userId),
      String(gig.user_id) === String(userId) ? Promise.resolve(true) : canActAsBusiness(gig.user_id, userId),
    ]);
    if (blocked) return res.status(403).json({ error: 'Cannot upload question files for this task' });
    if (!canAct && !['open', 'assigned', 'in_progress'].includes(gig.status)) {
      return res.status(409).json({ error: 'This task is closed to new questions' });
    }
    req._uploadTarget = { gig, isPoster: canAct };
    return next();
  } catch (err) {
    logger.error('Gig question media authz error', { error: err.message });
    return res.status(503).json({ error: 'Question uploads are temporarily unavailable. Please retry.' });
  }
}

router.post('/gig-question-media/:gigId', uploadLimiter, verifyToken, authorizeGigQuestionUpload, upload.array('files', 10), enforceFileSizeLimits, validateAndStripUploads, async (req, res) => {
  try {
    const userId = req.user.id;
    const { gigId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const { gig, isPoster } = req._uploadTarget;

    // A business's owner and staff answer its task's questions as the business, and these files' addresses are public:
    // they go under the business, so an address never names the person behind it.
    const keyOwner = isPoster ? gig.user_id : userId;

    const uploadedFiles = [];
    for (const file of files) {
      const { body, contentLength } = fileUploadBody(file);
      const { url, key } = await s3.uploadGigMedia(
        body,
        file.originalname,
        keyOwner,
        gigId,
        file.mimetype,
        { contentLength, abortSignal: req._uploadAbortSignal },
      );
      const category = s3.categorizeFile(file.mimetype) || 'document';

      let thumbnailUrl = null;
      const thumbBuffer = file.mimetype.startsWith('image/')
        ? await generateThumbnail(await readFileBuffer(file), file.mimetype)
        : null;
      if (thumbBuffer) {
        const thumbKey = key.replace(/(\.[^.]+)$/, '_thumb.webp');
        const thumbResult = await s3.uploadToS3(thumbBuffer, thumbKey, 'image/webp', undefined, { abortSignal: req._uploadAbortSignal });
        thumbnailUrl = thumbResult.url;
      }

      uploadedFiles.push({
        file_url: url,
        file_key: key,
        file_name: file.originalname,
        file_type: category,
        mime_type: file.mimetype,
        file_size: file.size,
        thumbnail_url: thumbnailUrl,
      });
    }

    return res.json({
      message: `${uploadedFiles.length} file(s) uploaded successfully`,
      media: uploadedFiles,
    });
  } catch (err) {
    logger.error('Gig question media upload error', { error: err.message });
    return res.status(503).json({ error: 'Question files could not be saved. Please retry.' });
  }
});

/**
 * POST /api/upload/gig-completion-media/:gigId
 * Upload proof files for completion submissions (assigned worker or gig owner).
 */
async function authorizeGigCompletionUpload(req, res, next) {
  try {
    const actorUserId = req.user.id;
    const { data: gig, error: gigErr } = await supabaseAdmin
      .from('Gig')
      .select('id, user_id, accepted_by')
      .eq('id', req.params.gigId)
      .single();
    if (gigErr || !gig) return res.status(404).json({ error: 'Gig not found' });
    const isOwner = String(gig.user_id) === String(actorUserId);
    const isWorker = gig.accepted_by && String(gig.accepted_by) === String(actorUserId);
    if (!isOwner && !isWorker) {
      return res.status(403).json({ error: 'Only the assigned worker or owner can upload completion files' });
    }
    req._uploadTarget = gig;
    return next();
  } catch (err) {
    logger.warn('Gig completion media authz unavailable', { error: err.message });
    return res.status(503).json({ error: 'Completion proof could not be saved. Please retry.' });
  }
}

router.post('/gig-completion-media/:gigId', uploadLimiter, verifyToken, authorizeGigCompletionUpload, upload.array('files', 10), enforceFileSizeLimits, validateAndStripUploads, async (req, res) => {
  try {
    const actorUserId = req.user.id;
    const { gigId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const uploadedFiles = [];
    for (const file of files) {
      const saved = await s3.createPrivateGigCompletionFile(gigId, actorUserId, file);
      uploadedFiles.push({
        id: saved.id, file_url: saved.file_url, file_key: '', file_name: saved.original_filename,
        file_type: s3.categorizeFile(saved.mime_type), mime_type: saved.mime_type,
        file_size: saved.file_size, thumbnail_url: null,
      });
    }

    return res.json({
      message: `${uploadedFiles.length} file(s) uploaded successfully`,
      media: uploadedFiles,
    });
  } catch (err) {
    logger.warn('Gig completion media upload unavailable', { status: err.statusCode || 503 });
    return res.status(err.statusCode || 503).json({ error: 'Completion proof could not be saved. Please retry.' });
  }
});

// ============ POST MEDIA (FEED) ============

/**
 * POST /api/upload/comment-media/:commentId
 * Upload image files for a post comment (up to 4).
 */
async function authorizeCommentMediaUpload(req, res, next) {
  try {
    const userId = req.user.id;
    const { data: comment, error: commentErr } = await supabaseAdmin
      .from('PostComment')
      .select('id, user_id, post_id, identity_context_type')
      .eq('id', req.params.commentId)
      .single();
    if (commentErr || !comment) return res.status(404).json({ error: 'Comment not found' });
    // A reply under a made-up name is words only (services/penName/gate.js).
    if (comment.identity_context_type === 'pen_name') {
      // eslint-disable-next-line global-require
      const penName = require('../services/penName');
      return (await penName.owner.mine(userId, 'comment', [comment.id])).size
        ? res.status(400).json({ error: penName.gate.WORDS_ONLY.message, code: penName.gate.WORDS_ONLY.code })
        : res.status(403).json({ error: 'Only the comment author can upload media' });
    }
    if (String(comment.user_id) !== String(userId)) {
      return res.status(403).json({ error: 'Only the comment author can upload media' });
    }
    req._uploadTarget = comment;
    return next();
  } catch (err) {
    logger.error('Comment media authz error', { error: err.message });
    return res.status(503).json({ error: 'Comment images could not be checked. Please retry.' });
  }
}

router.post('/comment-media/:commentId', uploadLimiter, verifyToken, authorizeCommentMediaUpload, upload.array('files', 4), enforceFileSizeLimits, validateAndStripUploads, async (req, res) => {
  try {
    const userId = req.user.id;
    const files = req.files || [];

    if (files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const comment = req._uploadTarget;

    const attachmentFields = 'id, comment_id, file_url, original_filename, mime_type, file_size, file_type, created_at';
    const { data: existingFiles, error: existingErr } = await supabaseAdmin
      .from('File')
      .select(attachmentFields)
      .eq('comment_id', comment.id)
      .eq('is_deleted', false);
    if (existingErr) {
      return res.status(503).json({ error: 'Comment images could not be checked. Please retry.' });
    }

    // The multipart filename changes on retries. Scope sanitized image bytes to
    // this author/comment instead, so a lost reply reuses both File and object.
    const pending = new Map();
    for (const file of files) {
      if (s3.categorizeFile(file.mimetype) !== 'image') {
        return res.status(400).json({ error: 'Comment media only supports images' });
      }
      const hashBuilder = crypto.createHash('sha256')
        .update(JSON.stringify(['comment-media-v1', comment.id, userId, file.mimetype]));
      await hashUploadedFile(file, hashBuilder);
      const hash = hashBuilder.digest('hex');
      const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
      pending.set(id, file);
    }
    const attachments = [...(existingFiles || [])];
    const existingIds = new Set(attachments.map((file) => file.id));
    const newCount = [...pending.keys()].filter((id) => !existingIds.has(id)).length;
    if (attachments.length + newCount > 4) {
      return res.status(400).json({ error: `Maximum 4 images per comment. Currently: ${attachments.length}` });
    }

    for (const [id, file] of pending) {
      if (existingIds.has(id)) continue;
      const key = `comments/${comment.id}/${userId}/${id}`;
      const { body, contentLength } = fileUploadBody(file);
      const { url } = await s3.uploadToS3(body, key, file.mimetype, undefined, {
        contentLength,
        abortSignal: req._uploadAbortSignal,
      });
      const ext = (path.extname(file.originalname || '').replace('.', '') || '').toLowerCase();
      const { data: saved, error: saveErr } = await supabaseAdmin
        .from('File')
        .insert({
          id,
          user_id: userId,
          filename: id,
          original_filename: file.originalname,
          file_path: key,
          file_url: url,
          file_size: file.size,
          mime_type: file.mimetype,
          file_extension: ext,
          file_type: 'post_image',
          visibility: 'public',
          processing_status: 'completed',
          post_id: comment.post_id,
          comment_id: comment.id,
          metadata: {
            uploaded_via: 'post_comment',
            comment_id: comment.id,
            post_id: comment.post_id,
          },
        })
        .select(attachmentFields)
        .single();

      if (saveErr) {
        // Another retry may already have committed this same image. Never
        // delete its shared object after a duplicate or uncertain DB response.
        const { data: committed, error: readErr } = await supabaseAdmin
          .from('File').select(attachmentFields)
          .eq('id', id).eq('comment_id', comment.id).eq('user_id', userId)
          .eq('is_deleted', false).maybeSingle();
        if (!readErr && committed) {
          attachments.push(committed);
          continue;
        }
        logger.error('Comment media save error', { error: saveErr.message, commentId });
        return res.status(503).json({ error: 'Comment image could not be confirmed. Please retry.' });
      }
      attachments.push(saved);
    }

    return res.json({
      message: `${attachments.length} image(s) uploaded successfully`,
      attachments,
    });
  } catch (err) {
    logger.error('Comment media upload error', { error: err.message, commentId: req.params.commentId });
    return res.status(500).json({ error: err.message || 'Failed to upload comment media' });
  }
});

// File extensions for the post video types s3Service allows.
const POST_VIDEO_EXTENSIONS = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/webm': 'webm',
};

/** Validate optional slot descriptors before storing anything. Old clients send
 * files alone; new clients associate a Live Photo's still and clip by index. */
async function postMediaSlots(files, raw) {
  const slots = raw == null ? files.map((_, fileIndex) => ({ fileIndex })) : JSON.parse(raw);
  if (!Array.isArray(slots) || !slots.length || slots.length > 9) throw new Error('Choose up to 9 attachments');
  const used = new Set();
  const take = (index) => {
    if (!Number.isInteger(index) || !files[index] || used.has(index)) throw new Error('Invalid attachment pairing');
    used.add(index);
    return files[index];
  };
  const result = [];
  for (const slot of slots) {
    if (!slot || typeof slot !== 'object') throw new Error('Invalid attachment');
    const file = take(slot.fileIndex);
    const category = s3.categorizeFile(file.mimetype);
    if (category !== 'image' && category !== 'video' && file.mimetype !== 'application/pdf') {
      throw new Error('Choose an image, video, or PDF');
    }
    // PDFs must have a PDF signature, including when MIME detection is inconclusive.
    if (file.mimetype === 'application/pdf') {
      const header = await readHeaderBytes(file, 5);
      if (header.toString() !== '%PDF-') throw new Error('This file is not a PDF');
    }
    const clip = slot.liveVideoIndex == null ? null : take(slot.liveVideoIndex);
    if (clip && (category !== 'image' || s3.categorizeFile(clip.mimetype) !== 'video')) {
      throw new Error('A Live Photo needs both a still image and a video');
    }
    result.push({ file, clip, category, type: clip ? 'live_photo' : category });
  }
  if (used.size !== files.length) throw new Error('Every uploaded file must belong to an attachment');
  return result;
}

async function authorizePostMediaUpload(req, res, next) {
  try {
    const userId = req.user.id;
    const { postId } = req.params;
    const { data: postRecord, error: postErr } = await supabaseAdmin
      .from('Post')
      .select('id, user_id, media_urls, media_types, media_thumbnails, media_live_urls, is_story, identity_context_type')
      .eq('id', postId)
      .single();

    if (postErr || !postRecord) {
      logger.error('Post lookup failed for media upload', { postId, error: postErr?.message });
      return res.status(404).json({ error: 'Post not found' });
    }
    // A post under a made-up name is words only (services/penName/gate.js): its writer is told so, and everyone
    // else gets the answer anyone who isn't the post's creator gets.
    if (postRecord.identity_context_type === 'pen_name') {
      // eslint-disable-next-line global-require
      const penName = require('../services/penName');
      return (await penName.owner.mine(userId, 'post', [postRecord.id])).size
        ? res.status(400).json({ error: penName.gate.WORDS_ONLY.message, code: penName.gate.WORDS_ONLY.code })
        : res.status(403).json({ error: 'Only the post creator can upload media' });
    }
    if (String(postRecord.user_id) !== String(userId)) {
      return res.status(403).json({ error: 'Only the post creator can upload media' });
    }
    // A Moment's files go to private storage through POST /api/moments/:id/media; nothing public is attached to one.
    if (postRecord.is_story === true) {
      return res.status(403).json({ error: 'You do not have access to this post' });
    }
    req._uploadTarget = postRecord;
    return next();
  } catch (err) {
    logger.error('Post media authz error', { error: err.message });
    return res.status(503).json({ error: 'Post could not be checked. Please retry.' });
  }
}

/**
 * POST /api/upload/post-media/:postId
 * Upload up to nine images, videos, Live Photos or PDFs for a feed post
 */
router.post('/post-media/:postId', uploadLimiter, verifyToken, authorizePostMediaUpload, postMediaUpload.array('files', 18), enforceFileSizeLimits, validateAndStripUploads, async (req, res) => {
  try {
    const { postId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const postRecord = req._uploadTarget;

    // Match the accepted comment upload contract: multipart filenames can
    // change after a lost reply, but sanitized bytes and MIME remain stable.
    // Images and videos alike get a content-addressed key under this post, so
    // a re-sent upload is recognised as already attached instead of being
    // appended again. Only the post's writer uploads here, and neither the key
    // nor its hash names them: a business post's viewers see these URLs, and
    // the writer's id in them would name the person behind the business.
    let slots;
    try {
      slots = await postMediaSlots(files, req.body.media);
    } catch (error) {
      return res.status(400).json({ error: error instanceof SyntaxError ? 'Invalid attachment pairing' : error.message });
    }
    const pending = new Map();
    for (const { file, clip, category, type } of slots) {
      const hashBuilder = crypto.createHash('sha256')
        .update(JSON.stringify([`post-${clip ? 'live-photo' : category}-v2`, postId, file.mimetype]));
      await hashUploadedFile(file, hashBuilder);
      if (clip) {
        hashBuilder.update(clip.mimetype);
        await hashUploadedFile(clip, hashBuilder);
      }
      const hash = hashBuilder.digest('hex');
      const ext = category === 'document' ? 'pdf' : category === 'image'
        ? file.mimetype.split('/')[1].replace(/[^a-z0-9]/g, '')
        : POST_VIDEO_EXTENSIONS[file.mimetype];
      const key = `posts/${postId}/media_${hash}.${ext}`;
      const clipKey = clip ? `posts/${postId}/media_${hash}_live.${POST_VIDEO_EXTENSIONS[clip.mimetype]}` : null;
      pending.set(key, { file, clip, clipKey, category, type, url: s3.getPublicUrl(key) });
    }
    const existingUrls = new Set(postRecord.media_urls || []);
    const remaining = [...pending.entries()].filter(([, item]) => !existingUrls.has(item.url));
    const existingCount = existingUrls.size;
    if (existingCount + remaining.length > 9) {
      return res.status(400).json({ error: `Maximum 9 media files per post. Currently: ${existingCount}` });
    }

    if (remaining.length === 0) {
      return res.json({
        message: 'Photos already attached',
        media_urls: postRecord.media_urls || [],
        media_types: postRecord.media_types || [],
        media_thumbnails: postRecord.media_thumbnails || [],
        media_live_urls: postRecord.media_live_urls || [],
      });
    }

    const uploadedUrls = [];
    const uploadedTypes = [];
    const thumbnailUrls = [];
    const liveUrls = [];

    for (const [key, { file, clip, clipKey, category, type }] of remaining) {
      const { body, contentLength } = fileUploadBody(file);
      const { url } = await s3.uploadToS3(body, key, file.mimetype, undefined, {
        contentLength,
        abortSignal: req._uploadAbortSignal,
      });

      uploadedUrls.push(url);
      uploadedTypes.push(type);
      if (clip) {
        const clipUpload = fileUploadBody(clip);
        liveUrls.push((await s3.uploadToS3(clipUpload.body, clipKey, clip.mimetype, undefined, {
          contentLength: clipUpload.contentLength,
          abortSignal: req._uploadAbortSignal,
        })).url);
      } else {
        liveUrls.push('');
      }

      // Posts only store/use the thumb. Avoid encoding and uploading the
      // marketplace card/detail/full variants on every foreground post upload.
      let thumbnailUrl = '';
      if (category === 'image') {
        try {
          const imgBuffer = await readFileBuffer(file);
          const variants = await imageResizeService.processListingImage(imgBuffer, key, { thumbnailOnly: true });
          if (variants && variants.thumb) {
            thumbnailUrl = variants.thumb;
          }
        } catch (resizeErr) {
          logger.warn('Post image resize failed, continuing', { postId, error: resizeErr.message });
        }
      }
      thumbnailUrls.push(thumbnailUrl);
    }

    const newMediaUrls = [...(postRecord.media_urls || []), ...uploadedUrls];
    const newMediaTypes = [...(postRecord.media_urls || []).map((_, i) => postRecord.media_types?.[i] || 'image'), ...uploadedTypes];
    // Pad media_live_urls so parallel arrays stay aligned
    const existing = postRecord.media_urls || [];
    const oldLive = postRecord.media_live_urls || [];
    let liveIndex = 0;
    const existingLiveUrls = existing.map((_, i) => postRecord.media_types?.[i] === 'live_photo'
      ? (oldLive.length === existing.length ? oldLive[i] : oldLive[liveIndex++]) || '' : '');
    const newMediaLiveUrls = [...existingLiveUrls, ...liveUrls];

    const updatePayload = {
      media_urls: newMediaUrls,
      media_types: newMediaTypes,
      media_live_urls: newMediaLiveUrls,
      updated_at: new Date().toISOString(),
    };

    const newMediaThumbnails = [...existing.map((_, i) => postRecord.media_thumbnails?.[i] || ''), ...thumbnailUrls];
    updatePayload.media_thumbnails = newMediaThumbnails;

    const { error: updateErr } = await supabaseAdmin
      .from('Post')
      .update(updatePayload)
      .eq('id', postId);

    if (updateErr) {
      logger.error('Post media update error', { error: updateErr.message, postId });
      return res.status(500).json({ error: 'Failed to update post media' });
    }

    return res.json({
      message: `${uploadedUrls.length} file(s) uploaded successfully`,
      media_urls: newMediaUrls,
      media_types: newMediaTypes,
      media_thumbnails: newMediaThumbnails,
      media_live_urls: newMediaLiveUrls,
    });
  } catch (err) {
    logger.error('Post media upload error', { error: err.message });
    return res.status(500).json({ error: err.message || 'Failed to upload media' });
  }
});


// ============ LISTING MEDIA (MARKETPLACE) ============

/**
 * POST /api/upload/listing-media/:listingId
 * Upload media files for a marketplace listing (up to 10)
 */
async function authorizeListingMediaUpload(req, res, next) {
  try {
    const { data: listing, error: listingErr } = await supabaseAdmin
      .from('Listing')
      .select('id, user_id, media_urls, media_types, media_thumbnails')
      .eq('id', req.params.listingId)
      .single();
    if (listingErr || !listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the listing owner can upload media' });
    }
    req._uploadTarget = listing;
    return next();
  } catch (err) {
    logger.error('Listing media authz error', { error: err.message });
    return res.status(503).json({ error: 'Listing could not be checked. Please retry.' });
  }
}

router.post('/listing-media/:listingId', uploadLimiter, verifyToken, authorizeListingMediaUpload, upload.array('files', 10), enforceFileSizeLimits, validateAndStripUploads, async (req, res) => {
  try {
    const userId = req.user.id;
    const { listingId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const listing = req._uploadTarget;

    const existingCount = (listing.media_urls || []).length;
    if (existingCount + files.length > 10) {
      return res.status(400).json({ error: `Maximum 10 media files per listing. Currently: ${existingCount}` });
    }

    const uploadedUrls = [];
    const uploadedTypes = [];
    const thumbnailUrls = [];

    for (const file of files) {
      const { body, contentLength } = fileUploadBody(file);
      const { url, key } = await s3.uploadListingMedia(
        body,
        file.originalname,
        userId,
        listingId,
        file.mimetype,
        { contentLength, abortSignal: req._uploadAbortSignal },
      );

      uploadedUrls.push(url);
      uploadedTypes.push(s3.categorizeFile(file.mimetype) || 'image');

      // Generate resized variants (non-blocking on failure)
      if (s3.categorizeFile(file.mimetype) === 'image') {
        try {
          const imgBuffer = await readFileBuffer(file);
          const variants = await imageResizeService.processListingImage(imgBuffer, key);
          if (variants && variants.thumb) {
            thumbnailUrls.push(variants.thumb);
          }
        } catch (resizeErr) {
          logger.warn('Image resize failed, continuing', { listingId, error: resizeErr.message });
        }
      }
    }

    // Update listing media arrays
    const newMediaUrls = [...(listing.media_urls || []), ...uploadedUrls];
    const newMediaTypes = [...(listing.media_types || []), ...uploadedTypes];

    const updatePayload = {
      media_urls: newMediaUrls,
      media_types: newMediaTypes,
      updated_at: new Date().toISOString(),
    };

    // Update thumbnails if any were generated
    if (thumbnailUrls.length > 0) {
      const existingThumbs = listing.media_thumbnails || [];
      updatePayload.media_thumbnails = [...existingThumbs, ...thumbnailUrls];
    }

    const { error: updateErr } = await supabaseAdmin
      .from('Listing')
      .update(updatePayload)
      .eq('id', listingId);

    if (updateErr) {
      logger.error('Listing media update error', { error: updateErr.message });
      return res.status(500).json({ error: 'Failed to update listing media' });
    }

    logger.info('Listing media uploaded', { listingId, count: uploadedUrls.length, thumbnails: thumbnailUrls.length });

    res.json({
      message: `${uploadedUrls.length} file(s) uploaded successfully`,
      media_urls: newMediaUrls,
      media_types: newMediaTypes,
    });
  } catch (err) {
    logger.error('Listing media upload error', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to upload listing media' });
  }
});

// The storage key of a listing photo, when `url` is in this deployment's public storage and the file is one
// uploadListingMedia wrote for this listing (listings/<listing id>/<uploader id>/<file>). Null for anything else.
function listingMediaKey(url, listingId) {
  if (typeof url !== 'string' || !s3.isPublicStorageUrl(url)) return null;
  let key;
  try {
    key = decodeURIComponent(new URL(url).pathname.slice(new URL(s3.getPublicUrl('')).pathname.length));
  } catch {
    return null;
  }
  const parts = key.split('/');
  const plain = (part) => /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(part) && !part.includes('..');
  return parts.length === 4 && parts[0] === 'listings' && parts[1] === String(listingId) && parts.slice(2).every(plain)
    ? key : null;
}

// True when `key` names a file in this person's own folder, in one of the layouts uploads are written in:
// <folder>/<user id>/<file> (s3Service.generateS3Key) or <folder>/<user id>/<upload id>/<file> (uploads that can be
// retried). No part is empty, "." or "..".
function isOwnFileKey(key, userId) {
  const parts = key.split('/');
  if (parts.length < 3 || !parts.every((part) => part && part !== '.' && part !== '..')) return false;
  return parts[parts.length - 2] === String(userId) || (parts.length >= 4 && parts[parts.length - 3] === String(userId));
}

/**
 * DELETE /api/upload/listing-media/:listingId
 * Remove a media URL from a listing by index
 */
router.delete('/listing-media/:listingId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { listingId } = req.params;
    const { index } = req.body;

    if (index === undefined || index === null) {
      return res.status(400).json({ error: 'Media index is required' });
    }

    const { data: listing, error: fetchErr } = await supabaseAdmin
      .from('Listing')
      .select('user_id, media_urls, media_types')
      .eq('id', listingId)
      .single();

    if (fetchErr || !listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.user_id !== userId) return res.status(403).json({ error: 'Not authorized' });

    const urls = [...(listing.media_urls || [])];
    const types = [...(listing.media_types || [])];

    if (index < 0 || index >= urls.length) {
      return res.status(400).json({ error: 'Invalid media index' });
    }

    // The stored file goes too when the entry is one this listing uploaded; any other entry only leaves the list.
    const key = listingMediaKey(urls[index], listingId);
    if (key) await s3.deleteFromS3(key);

    urls.splice(index, 1);
    types.splice(index, 1);

    await supabaseAdmin
      .from('Listing')
      .update({ media_urls: urls, media_types: types, updated_at: new Date().toISOString() })
      .eq('id', listingId);

    res.json({ message: 'Media removed', media_urls: urls, media_types: types });
  } catch (err) {
    logger.error('Listing media delete error', { error: err.message });
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

// ============ MAIL ATTACHMENTS ============

/**
 * POST /api/upload/mail-attachments
 * Upload files to enclose with a letter. They are stored privately (services/mailEnclosures, Mail tab SRV-4): each
 * answer carries a reference (`url` and `ref`, `enclosure:<token>`, not an address to open) to include in the
 * /api/mailbox/send payload's attachments. Only the person who uploaded a file can send it, and the letter's readers
 * open it through GET /api/mailbox/:id/enclosures/:enclosureId.
 */
router.post('/mail-attachments', uploadLimiter, verifyToken, upload.array('files', 5), enforceFileSizeLimits, validateAndStripUploads, async (req, res) => {
  try {
    const files = req.files || [];

    if (files.length === 0) {
      return res.status(400).json({ error: 'Choose a file to enclose.', code: 'ENCLOSURE_MISSING' });
    }

    const uploaded = [];
    for (const file of files) {
      const buffer = await readFileBuffer(file);
      const stored = await mailEnclosures.store({ buffer, name: file.originalname, mimeType: file.mimetype,
        uploaderId: req.user.id });
      uploaded.push({
        url: stored.ref,
        ref: stored.ref,
        id: stored.id,
        name: stored.name,
        mime_type: stored.mime_type,
        size: stored.size_bytes,
      });
    }

    return res.json({
      message: `${uploaded.length} file(s) uploaded`,
      attachments: uploaded,
    });
  } catch (err) {
    logger.error('Mail attachment upload error', { error: err.message });
    return res.status(err.status === 503 ? 503 : 500).json({ error: "Couldn't keep this file. Try again in a moment.", code: 'ENCLOSURE_UNAVAILABLE' });
  }
});


// ============ HOME TASK MEDIA ============

registerHomeTaskMediaRoutes(router, { verifyToken, uploadLimiter });


// ============ OWNERSHIP EVIDENCE ============

/**
 * POST /api/upload/ownership-evidence/:homeId/:claimId
 * Upload a document as ownership verification evidence (deed, tax bill, etc.)
 * Stores in S3 and creates/updates HomeVerificationEvidence record.
 */
// Evidence uploads are keyed per USER (after auth), not per IP: the
// instant verification door must not be throttled by a shared NAT, and a
// single account must not get 30 tries per IP it can rotate through.
const evidenceUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => (req.user && req.user.id) || req.ip,
  message: 'Too many document uploads. Please try again later.',
});

require('./homeClaimEvidenceRoutes')(router, { verifyToken, evidenceUploadLimiter });


// ============ GENERIC DELETE ============

/**
 * DELETE /api/upload/file
 * Delete any uploaded file by S3 key (requires ownership check)
 */
router.delete('/file', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { key, table, recordId } = req.body;
    if (typeof key !== 'string' || !key) return res.status(400).json({ error: 'S3 key is required' });
    if (!isOwnFileKey(key, userId)) return res.status(403).json({ error: 'Not authorized to delete this file' });
    // Evidentiary chat attachments and completion proofs follow their own domain deletion
    // flows; never allow wiping their underlying objects through the generic key-delete route.
    if (key.startsWith('chat/') || key.startsWith('gig-completion/')) {
      return res.status(403).json({ error: 'Use the domain endpoint to delete this file' });
    }
    const allowedTables = ['GigMedia', 'ListingMedia', 'ReviewMedia', 'PostMedia'];
    if (Boolean(table) !== Boolean(recordId) || (table && !allowedTables.includes(table))) {
      return res.status(400).json({ error: 'A supported media table and record are required together' });
    }
    // Domain-owned object prefixes must always supply their matching DB record so
    // underlying objects cannot be removed behind active gig/listing/review/post rows.
    const domainPrefixRequiringRecord = /^(gigs|listings|reviews|posts)\//;
    if (!table && domainPrefixRequiringRecord.test(key)) {
      return res.status(400).json({ error: 'Media table and recordId are required to delete this file' });
    }
    let thumbnailKey = null;
    let mediaGigId = null;
    if (table) {
      const { data: media, error } = await supabaseAdmin.from(table).select(table === 'GigMedia' ? 'file_key, thumbnail_url, gig_id' : 'file_key').eq('id', recordId).maybeSingle();
      if (error) return res.status(503).json({ error: 'File ownership could not be checked. Please retry.' });
      if (!media) return res.status(404).json({ error: 'Media not found' });
      if (media.file_key !== key) return res.status(403).json({ error: 'Not authorized to delete this media record' });
      if (table === 'GigMedia') mediaGigId = media.gig_id;
      if (table === 'GigMedia' && media.thumbnail_url) thumbnailKey = key.replace(/(\.[^.]+)$/, '_thumb.webp');
    }
    if (!await s3.deleteFromS3(key)) return res.status(503).json({ error: 'File could not be deleted. Please retry.' });
    if (thumbnailKey && !await s3.deleteFromS3(thumbnailKey)) return res.status(503).json({ error: 'File could not be deleted. Please retry.' });
    if (table) {
      const { error } = await supabaseAdmin.from(table).delete().eq('id', recordId).eq('file_key', key);
      if (error) return res.status(503).json({ error: 'File deletion could not be confirmed. Please retry.' });
    }
    if (mediaGigId) publishGigMediaChange(req, mediaGigId);
    return res.json({ message: 'File deleted' });
  } catch (err) {
    logger.error('File delete error', { error: err.message });
    return res.status(503).json({ error: 'File deletion could not be confirmed. Please retry.' });
  }
});


// ============ REVIEW MEDIA UPLOAD ============

/**
 * POST /api/upload/review-media/:reviewId
 * Upload photos/files to attach to a review.
 * Only the review author can upload. Max 5 files.
 */
async function authorizeReviewMediaUpload(req, res, next) {
  try {
    const { data: review, error: reviewErr } = await supabaseAdmin
      .from('Review')
      .select('id, reviewer_id, media_urls')
      .eq('id', req.params.reviewId)
      .single();
    if (reviewErr || !review) return res.status(404).json({ error: 'Review not found' });
    if (String(review.reviewer_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Only the review author can upload media' });
    }
    req._uploadTarget = review;
    return next();
  } catch (err) {
    logger.error('Review media authz error', { error: err.message });
    return res.status(503).json({ error: 'Review could not be checked. Please retry.' });
  }
}

router.post('/review-media/:reviewId', uploadLimiter, verifyToken, authorizeReviewMediaUpload, upload.array('files', 5), enforceFileSizeLimits, validateAndStripUploads, async (req, res) => {
  try {
    const userId = req.user.id;
    const { reviewId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const review = req._uploadTarget;

    const uploadedUrls = [];

    for (const file of files) {
      const category = s3.categorizeFile(file.mimetype);
      if (category !== 'image' && category !== 'document') {
        continue; // Skip unsupported types silently
      }

      const { body, contentLength } = fileUploadBody(file);
      const { url } = await s3.uploadGeneral(
        body,
        file.originalname,
        userId,
        `reviews/${reviewId}`,
        file.mimetype,
        { contentLength, abortSignal: req._uploadAbortSignal },
      );

      uploadedUrls.push(url);
    }

    if (uploadedUrls.length === 0) {
      return res.status(400).json({ error: 'No valid files were uploaded' });
    }

    // Append to existing media_urls
    const existingUrls = review.media_urls || [];
    const newMediaUrls = [...existingUrls, ...uploadedUrls];

    const { error: updateErr } = await supabaseAdmin
      .from('Review')
      .update({
        media_urls: newMediaUrls,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reviewId);

    if (updateErr) {
      logger.error('Review media update error', { error: updateErr.message, reviewId });
      return res.status(500).json({ error: 'Failed to update review with media' });
    }

    logger.info('Review media uploaded', {
      reviewId,
      userId,
      count: uploadedUrls.length,
    });

    return res.json({
      message: `${uploadedUrls.length} file(s) uploaded successfully`,
      media_urls: newMediaUrls,
    });
  } catch (err) {
    logger.error('Review media upload error', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to upload review media' });
  }
});

// ============ BUSINESS MEDIA (logo / banner) ============

const {
  checkBusinessPermission,
} = require('../utils/businessPermissions');

/**
 * POST /api/upload/business-media/:businessId
 * Upload logo or banner for a business profile.
 * Query param: type = "logo" | "banner"
 */
async function authorizeBusinessMediaUpload(req, res, next) {
  try {
    const access = await checkBusinessPermission(req.params.businessId, req.user.id, 'profile.edit');
    if (!access.hasAccess) {
      return res.status(403).json({ error: 'You do not have permission to edit this business profile' });
    }
    return next();
  } catch (err) {
    logger.error('Business media authz error', { error: err.message });
    return res.status(503).json({ error: 'Business access could not be checked. Please retry.' });
  }
}

router.post('/business-media/:businessId', uploadLimiter, verifyToken, authorizeBusinessMediaUpload, upload.single('file'), enforceFileSizeLimits, validateAndStripUploads, async (req, res) => {
  try {
    const userId = req.user.id;
    const { businessId } = req.params;
    const mediaType = req.query.type || req.body.type; // "logo" or "banner"

    if (!['logo', 'banner'].includes(mediaType)) {
      return res.status(400).json({ error: 'type must be "logo" or "banner"' });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Business media must be an image' });
    }

    // Process image
    const rawBuffer = await readFileBuffer(file);
    let processedBuffer = rawBuffer;
    let finalMimeType = file.mimetype;
    if (sharp) {
      try {
        if (mediaType === 'logo') {
          processedBuffer = await sharp(rawBuffer)
            .resize(800, 800, { fit: 'cover' })
            .webp({ quality: 85 })
            .toBuffer();
        } else {
          // Banner: 16:9 aspect, max 1600px wide
          processedBuffer = await sharp(rawBuffer)
            .resize(1600, 900, { fit: 'cover' })
            .webp({ quality: 85 })
            .toBuffer();
        }
        finalMimeType = 'image/webp';
      } catch {
        processedBuffer = rawBuffer;
      }
    }

    // Upload to S3
    const folder = `business-media/${businessId}`;
    const ext = finalMimeType === 'image/webp' ? 'webp' : file.originalname.split('.').pop();
    const key = `${folder}/${mediaType}-${Date.now()}-${require('crypto').randomBytes(4).toString('hex')}.${ext}`;
    const { url } = await s3.uploadToS3(processedBuffer, key, finalMimeType);

    // Create a File record so we have a UUID for the foreign key
    const { data: fileRecord, error: fileErr } = await supabaseAdmin
      .from('File')
      .insert({
        user_id: userId,
        filename: key.split('/').pop(),
        original_filename: file.originalname,
        file_path: key,
        file_url: url,
        file_size: processedBuffer.length,
        mime_type: finalMimeType,
        file_extension: ext,
        file_type: 'other',
        visibility: 'public',
        processing_status: 'completed',
      })
      .select('id')
      .single();

    if (fileErr) {
      await s3.deleteFromS3(key);
      logger.error('Failed to create File record for business media', { error: fileErr.message });
      return res.status(500).json({ error: `Failed to update ${mediaType}` });
    }

    // Update BusinessProfile with the File UUID
    const updateField = mediaType === 'logo' ? 'logo_file_id' : 'banner_file_id';
    const { error: updateErr } = await supabaseAdmin
      .from('BusinessProfile')
      .update({
        [updateField]: fileRecord.id,
        updated_at: new Date().toISOString(),
      })
      .eq('business_user_id', businessId);

    if (updateErr) {
      await supabaseAdmin.from('File').delete().eq('id', fileRecord.id);
      await s3.deleteFromS3(key);
      return res.status(500).json({ error: `Failed to update ${mediaType}` });
    }

    // Also update the corresponding User column so the frontend can display it
    if (mediaType === 'logo') {
      await supabaseAdmin
        .from('User')
        .update({
          profile_picture_url: url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', businessId);
    } else if (mediaType === 'banner') {
      await supabaseAdmin
        .from('User')
        .update({
          cover_photo_url: url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', businessId);
    }

    // Recalculate completeness (logo/banner affect the score)
    calculateAndStoreCompleteness(businessId).catch((err) => {
      logger.error('Post-media-upload completeness calculation failed', { businessId, error: err.message });
    });

    logger.info('Business media uploaded', { businessId, mediaType, key });

    res.json({
      message: `${mediaType} uploaded successfully`,
      url,
      key,
    });
  } catch (err) {
    logger.error('Business media upload error', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to upload business media' });
  }
});

// ============ AI CHAT MEDIA ============

/**
 * POST /api/upload/ai-media
 * Upload photos and PDFs for AI assistant chat (up to 5 files). A PDF (a warranty, a policy,
 * a lease) may be up to 10 MB and 20 pages, and not encrypted, since the assistant couldn't read it.
 * Returns a reference for each (`url`, `ai-photo:<name>`) to pass to the AI chat endpoint or the
 * flyer reader. The files are private: no address to them is handed out, and the request that
 * reads one deletes it (services/ai/photos.js).
 */
router.post('/ai-media', uploadLimiter, verifyToken, upload.array('files', 5), enforceFileSizeLimits, validateAndStripUploads, async (req, res) => {
  try {
    const userId = req.user.id;
    const files = req.files || [];

    if (files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    // Photos, and PDFs of home papers
    const unsupported = files.filter((f) => !f.mimetype.startsWith('image/') && f.mimetype !== 'application/pdf');
    if (unsupported.length > 0) {
      return res.status(400).json({ error: 'Only photos and PDFs can be sent to the assistant', code: 'AI_MEDIA_TYPE' });
    }
    for (const file of files.filter((f) => f.mimetype === 'application/pdf')) {
      if (file.size > MAX_PDF_BYTES) {
        return res.status(413).json({ error: 'That PDF is over 10 MB. Try a smaller one, or photos of the pages that matter.', code: 'PDF_TOO_LARGE' });
      }
      const facts = pdfFacts(await readFileBuffer(file));
      if (!facts || facts.pages === 0) {
        return res.status(400).json({ error: "That PDF can't be read. Try saving it again as a PDF, or send photos of the pages.", code: 'PDF_UNREADABLE' });
      }
      if (facts.encrypted) {
        return res.status(400).json({ error: 'That PDF is password-protected. Send a copy without a password, or photos of the pages.', code: 'PDF_ENCRYPTED' });
      }
      if (facts.pages > MAX_PDF_PAGES) {
        return res.status(400).json({ error: `That PDF has ${facts.pages} pages; the assistant reads up to ${MAX_PDF_PAGES}. Send the pages that matter.`, code: 'PDF_TOO_MANY_PAGES' });
      }
    }

    const uploaded = [];
    for (const file of files) {
      // The stored name becomes the reference, so keep only a plain extension from the phone's file name.
      const extension = /^\.[a-z0-9]{1,10}$/.exec(path.extname(file.originalname || '').toLowerCase())?.[0] || '';
      const pdf = file.mimetype === 'application/pdf';
      const { body, contentLength } = fileUploadBody(file);
      const { key } = await s3.uploadGeneral(
        body,
        pdf ? 'document.pdf' : `photo${extension}`,
        userId,
        'ai-chat',
        file.mimetype,
        { contentLength, abortSignal: req._uploadAbortSignal },
      );

      uploaded.push({
        // Still named url: released apps send it back as one of the chat's images.
        url: photoReference(key),
        name: file.originalname,
        mime_type: file.mimetype,
        size: file.size,
      });
    }

    return res.json({
      message: `${uploaded.length} file(s) uploaded`,
      // Still named images: released apps read this key.
      images: uploaded,
    });
  } catch (err) {
    logger.error('AI media upload error', { error: err.message });
    return res.status(500).json({ error: err.message || 'Failed to upload images' });
  }
});

// ============ LIVE PHOTO (STILL + VIDEO PAIR) ============

const LIVE_PHOTO_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
const LIVE_PHOTO_VIDEO_TYPES = new Set(['video/quicktime', 'video/mp4']);
const LIVE_PHOTO_IMAGE_MAX = 10 * 1024 * 1024;  // 10 MB
const LIVE_PHOTO_VIDEO_MAX = 15 * 1024 * 1024;  // 15 MB

/**
 * POST /api/upload/live-photo
 *
 * Accepts two files:
 *   - "image" (JPEG/HEIC/PNG, ≤ 10 MB) — the still frame
 *   - "video" (MOV/MP4, ≤ 15 MB)       — the companion Live Photo clip
 *
 * Uploads both to S3 with linked keys, which name no uploader (the pair may
 * go into a business's post):
 *   posts/{ts}_{rand}.jpg
 *   posts/{ts}_{rand}_live.{ext}
 *
 * Runs the existing thumbnail pipeline on the still image.
 *
 * Returns { imageUrl, liveVideoUrl, thumbnailUrl }
 */
router.post(
  '/live-photo',
  uploadLimiter,
  verifyToken,
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 },
  ]),
  // Note: enforceFileSizeLimits and validateAndStripUploads expect req.files
  // to be an array, but upload.fields() returns an object. This endpoint does
  // its own type + size validation below and cleans both files itself, so we
  // skip those middlewares.
  async (req, res) => {
    try {
      const userId = req.user.id;

      const imageFile = req.files?.image?.[0];
      const videoFile = req.files?.video?.[0];

      if (!imageFile || !videoFile) {
        return res.status(400).json({ error: 'Both "image" and "video" files are required' });
      }

      // ── Type validation ──
      if (!LIVE_PHOTO_IMAGE_TYPES.has(imageFile.mimetype)) {
        return res.status(400).json({
          error: `Still image must be JPEG, PNG, or HEIC (got ${imageFile.mimetype})`,
        });
      }
      if (!LIVE_PHOTO_VIDEO_TYPES.has(videoFile.mimetype)) {
        return res.status(400).json({
          error: `Live Photo video must be MOV or MP4 (got ${videoFile.mimetype})`,
        });
      }

      // ── Size validation ──
      if (imageFile.size > LIVE_PHOTO_IMAGE_MAX) {
        return res.status(413).json({
          error: `Still image exceeds 10 MB limit (${Math.round(imageFile.size / 1024 / 1024)} MB)`,
        });
      }
      if (videoFile.size > LIVE_PHOTO_VIDEO_MAX) {
        return res.status(413).json({
          error: `Live Photo video exceeds 15 MB limit (${Math.round(videoFile.size / 1024 / 1024)} MB)`,
        });
      }

      // ── Magic-byte MIME validation ──
      for (const f of [imageFile, videoFile]) {
        const mimeCheck = await validateFileMime(f);
        if (!mimeCheck.valid) {
          logger.warn('Live photo MIME mismatch rejected', {
            originalname: f.originalname,
            declared: mimeCheck.declared,
            detected: mimeCheck.detected,
          });
          return res.status(400).json({
            error: mimeCheck.detected
              ? `File "${f.originalname}" content does not match its declared type (declared: ${mimeCheck.declared}, detected: ${mimeCheck.detected})`
              : `File "${f.originalname}" isn't a valid image or video file.`,
          });
        }
      }

      // The still and the clip are stored without their metadata (a HEIC as a JPEG), or not at all.
      try {
        await cleanUploadedMedia(imageFile);
        await cleanUploadedMedia(videoFile);
      } catch (err) {
        if (!(err instanceof MediaNotCleanedError)) throw err;
        return res.status(err.status).json({ error: err.message, code: err.code });
      }

      // ── Generate linked S3 keys ──
      // Use a shared base so the two files are visually linked in S3.
      const ts = Date.now();
      const rand = crypto.randomBytes(8).toString('hex');
      const base = `posts/${ts}_${rand}`;

      const imageExt = imageFile.mimetype === 'image/png' ? '.png' : '.jpg';
      const videoExt = videoFile.mimetype === 'video/mp4' ? '.mp4' : '.mov';

      const imageKey = `${base}${imageExt}`;
      const videoKey = `${base}_live${videoExt}`;

      // ── Upload both to S3 in parallel (streamed from disk) ──
      const imageBody = fileUploadBody(imageFile);
      const videoBody = fileUploadBody(videoFile);
      const [imageResult, videoResult] = await Promise.all([
        s3.uploadToS3(imageBody.body, imageKey, imageFile.mimetype, undefined, {
          contentLength: imageBody.contentLength,
          abortSignal: req._uploadAbortSignal,
        }),
        s3.uploadToS3(videoBody.body, videoKey, videoFile.mimetype, undefined, {
          contentLength: videoBody.contentLength,
          abortSignal: req._uploadAbortSignal,
        }),
      ]);

      // ── Thumbnail generation (non-blocking — best-effort) ──
      let thumbnailUrl = null;
      const thumbBuffer = await generateThumbnail(await readFileBuffer(imageFile), imageFile.mimetype);
      if (thumbBuffer) {
        try {
          const thumbKey = `${base}_thumb.webp`;
          const thumbResult = await s3.uploadToS3(thumbBuffer, thumbKey, 'image/webp', undefined, {
            abortSignal: req._uploadAbortSignal,
          });
          thumbnailUrl = thumbResult.url;
        } catch (thumbErr) {
          logger.warn('Live photo thumbnail upload failed (non-blocking)', { error: thumbErr.message });
        }
      }

      logger.info('Live Photo pair uploaded', {
        userId,
        imageKey,
        videoKey,
        imageSize: imageFile.size,
        videoSize: videoFile.size,
      });

      res.json({
        imageUrl: imageResult.url,
        liveVideoUrl: videoResult.url,
        thumbnailUrl,
      });
    } catch (err) {
      logger.error('Live photo upload error', { error: err.message, userId: req.user?.id });
      res.status(500).json({ error: err.message || 'Failed to upload Live Photo' });
    }
  }
);

module.exports = router;
// P2.12 — exported for direct unit testing of the EXIF strip pipeline.
// The middleware (validateAndStripUploads) runs the same cleaner
// for every multipart upload so the same code path runs in production.
module.exports.stripImageMetadata = cleanUploadedPhoto;
module.exports.validateFileMime = validateFileMime;
