#!/usr/bin/env node
/**
 * Puts the Christmas card share videos (launch key card_share_video) into this server's public file storage, where
 * GET /api/mailbox/cards/share-video/:design points: card-videos/v1/<design id>.mp4. The videos are made by
 * frontend/apps/web/scripts/film-card-videos.cjs and hold no note or name, so they are public on purpose.
 *
 *   node scripts/upload-card-videos.js <folder of videos> [--only christmas-2026-08,...] [--dry-run]
 *
 * Reads the same storage settings as the server (AWS_S3_*, AWS_CLOUDFRONT_URL) from the environment or backend/.env.
 * Only adds or replaces files under card-videos/; touches nothing else. Prints each file's public address.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const folder = process.argv[2];
if (!folder || !fs.existsSync(folder)) {
  console.error('usage: node scripts/upload-card-videos.js <folder of videos> [--only id,id] [--dry-run]');
  process.exit(1);
}
const at = process.argv.indexOf('--only');
const only = at > 0 ? new Set(String(process.argv[at + 1] || '').split(',').filter(Boolean)) : null;
const dryRun = process.argv.includes('--dry-run');
// The server's own list of pictures needs no database; it only checks these are set.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:9';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'upload';
const { DESIGNS } = require('../services/holidayCards');
const { uploadToS3, getPublicUrl } = require('../services/s3Service');

(async () => {
  const unknown = only ? [...only].filter((id) => !DESIGNS.some((design) => design.id === id)) : [];
  if (unknown.length) throw new Error(`Not one of this server's pictures (does it run the release that adds them?): ${unknown.join(', ')}`);
  const wanted = DESIGNS.filter((design) => !only || only.has(design.id));
  const missing = wanted.filter((design) => !fs.existsSync(path.join(folder, `${design.id}.mp4`)));
  if (missing.length) throw new Error(`No video for: ${missing.map((design) => design.id).join(', ')}`);
  for (const design of wanted) {
    const file = path.join(folder, `${design.id}.mp4`);
    const key = `card-videos/v1/${design.id}.mp4`;
    const size = fs.statSync(file).size;
    if (dryRun) { console.log(`would put ${key} (${(size / 1048576).toFixed(1)} MB) at ${getPublicUrl(key)}`); continue; }
    await uploadToS3(fs.readFileSync(file), key, 'video/mp4', undefined, { contentLength: size });
    console.log(`${key}  ${(size / 1048576).toFixed(1)} MB  ${getPublicUrl(key)}`);
  }
})().catch((error) => { console.error(error.message || error); process.exit(1); });
