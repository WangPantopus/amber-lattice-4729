'use strict';

// The verify postcard's scan side (FASTVERIFY, behind home_postcard_scan, off by default). With the switch on for the
// person who asked for the card, its message side carries a QR picture of
// https://pantopus.com/app/homes/<home id>/verify-postcard#c=<code>, made here in our own process (never by a QR
// service: the code is a bearer credential for the address), and the section 6 words, including the "This wasn't me"
// line for a resident who didn't ask for it. The code rides in the link's fragment, which a browser never sends to a
// server, so no server and no log sees it. A configured Lob template id keeps today's card.

const QRCode = require('qrcode');
const db = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const featureFlagService = require('./featureFlagService');

const FLAG = 'home_postcard_scan';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The web's address for the card's link: the public site on a hosted server, the rig's own web locally. */
function webBase() {
  const configured = String(process.env.PUBLIC_WEB_URL || process.env.APP_URL || '').trim().replace(/\/+$/, '');
  const hosted = ['staging', 'production'].includes(String(process.env.APP_ENV || '').toLowerCase());
  if (configured && (/^https:\/\//.test(configured) || !hosted)) return configured;
  return 'https://pantopus.com';
}

/** The link the square opens: the code screen with the code filled in (read from the fragment by the apps and the web). */
function scanUrl(homeId, code) {
  return `${webBase()}/app/homes/${encodeURIComponent(homeId)}/verify-postcard#c=${encodeURIComponent(String(code))}`;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "December 17, 2026", in the home's own country's way of writing it (US). */
function goodUntil(expiresAt) {
  const date = new Date(expiresAt);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
}

/**
 * Should this card carry the scan side? Reads the card (who asked, when it ends) and the switch for that person.
 * Null when not (switch off, no such card, or it can't be read: today's card goes out).
 */
async function scanFor(homePostcardId) {
  if (!UUID.test(homePostcardId || '')) return null;
  try {
    const { data, error } = await db.from('HomePostcardCode').select('user_id, home_id, expires_at')
      .eq('id', homePostcardId).maybeSingle();
    if (error || !data?.user_id) return null;
    const on = await featureFlagService.isFeatureEnabled(FLAG, data.user_id).catch(() => false);
    return on ? { homeId: data.home_id, expiresAt: data.expires_at } : null;
  } catch (error) {
    logger.warn('postcard_scan.read_failed', { error: error.message });
    return null;
  }
}

/** The QR picture as an inline SVG data URI, drawn in this process. */
async function qrDataUri(text) {
  const svg = await QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#0f172a', light: '#ffffff' } });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** The card's message side with the square (section 6 words). `scan` is scanFor's answer. */
async function buildScanBackHtml(code, scan) {
  const url = scanUrl(scan.homeId, code);
  const qr = await qrDataUri(url);
  const until = goodUntil(scan.expiresAt);
  return `
<html>
<head>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 18px 20px; background: #ffffff; color: #0f172a; }
    .wrap { display: flex; gap: 18px; align-items: flex-start; }
    .text { flex: 1; }
    .brand { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
    .title { font-size: 15px; font-weight: 700; margin-bottom: 10px; }
    .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
    .code { font-size: 30px; font-weight: 700; letter-spacing: 6px; font-family: 'Courier New', monospace; margin-bottom: 8px; }
    .how { font-size: 10.5px; color: #334155; line-height: 1.45; margin-bottom: 6px; }
    .until { font-size: 10.5px; color: #334155; margin-bottom: 10px; }
    .notme { font-size: 9.5px; color: #64748b; line-height: 1.4; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    .square { width: 128px; text-align: center; }
    .square img { width: 128px; height: 128px; display: block; }
    .scan { font-size: 10px; font-weight: 700; color: #0f172a; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="text">
      <div class="brand">Pantopus</div>
      <div class="title">Your code to verify this home</div>
      <div class="label">Your code</div>
      <div class="code">${escapeHtml(code)}</div>
      <div class="how">Point your phone's camera at the square. Pantopus opens with the code filled in. Or open Pantopus, go to Place and tap Enter mailed code.</div>
      ${until ? `<div class="until">Good until ${escapeHtml(until)}.</div>` : ''}
      <div class="notme">Didn't ask for this card? Someone entered your address on Pantopus. Scan the square and tap This wasn't me, and we stop it.</div>
    </div>
    <div class="square">
      <img src="${qr}" alt="">
      <div class="scan">Scan to finish</div>
    </div>
  </div>
</body>
</html>`.trim();
}

module.exports = { FLAG, scanFor, scanUrl, buildScanBackHtml, goodUntil, webBase };
