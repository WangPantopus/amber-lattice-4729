/**
 * A one-time code that opens a letter or Christmas card for someone who isn't on Pantopus yet, from the page its link
 * opens (the web's /open/:mailId). The person taps one button; a code goes to the address the letter was sent to (a
 * card by link: an address they type); they enter it and are signed in, with a new account when the address has none.
 *
 * The code is Supabase Auth's own email code, minted with admin.generateLink (as authSessionService.mintSessionForUser
 * does) and checked with verifyOtp, sent through our SMTP like the other auth emails. Entering it proves the address,
 * which is what POST /api/mailbox/claim/:mailId asks of an account. The claim token alone never signs anyone in: it
 * only says which letter and which address, and the code still has to come from that inbox.
 *
 * Routes: POST /api/mailbox/claim/:mailId/code sends it; POST /api/users/mail-code checks it and signs in.
 */

const crypto = require('crypto');
const supabaseAdmin = require('../config/supabaseAdmin');
const emailService = require('./emailService');
const holidayCards = require('./holidayCards');
const logger = require('../utils/logger');

/** How long a code works. Supabase Auth keeps its own, longer expiry; this one is checked when the code is used. */
const CODE_MINUTES = 10;

// ---- The claim token ----

/** Constant-time comparison for claim tokens, so a wrong one takes as long as a right one. */
function timingSafeTokenCompare(stored, provided) {
  if (typeof stored !== 'string' || typeof provided !== 'string') return false;
  const storedBuf = Buffer.from(stored, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (storedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(storedBuf, providedBuf);
}

// The claim token travels only in the link. The letter keeps its SHA-256 (escrow_claim_token_hash), so a Mail row
// read back by a route (most select '*') or a copy of the database never holds a working link.
function hashClaimToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

// Letters stored before the hash kept the token itself.
function claimTokenMatches(mail, provided) {
  if (typeof provided !== 'string' || !provided) return false;
  if (mail.escrow_claim_token_hash) return timingSafeTokenCompare(mail.escrow_claim_token_hash, hashClaimToken(provided));
  return timingSafeTokenCompare(mail.escrow_claim_token, provided);
}

// ---- Which address ----

const normalEmail = (value) => String(value || '').trim().toLowerCase();
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * The address a letter's code goes to: the one it was sent to, or for a card by link (which went to no address) the one
 * the person typed. { address } or { refusal: { status, error, code } }. A letter sent by text has no email to send a
 * code to: its page keeps signing in and creating an account.
 */
function codeAddress(mail, typedEmail) {
  if (holidayCards.isByLink(mail)) {
    const typed = normalEmail(typedEmail);
    if (!typed || !looksLikeEmail(typed)) {
      return { refusal: { status: 400, error: 'Enter your email address.', code: 'CODE_EMAIL_NEEDED' } };
    }
    return { address: typed };
  }
  const sentTo = normalEmail(mail.escrow_recipient_contact);
  if (!sentTo.includes('@')) {
    return { refusal: { status: 400, error: 'This letter came by text. Sign in or create an account with that number to read it.', code: 'CODE_BY_TEXT' } };
  }
  return { address: sentTo };
}

const LINK_INVALID = { status: 404, error: 'This letter link doesn’t work. Check that you opened the whole link.', code: 'MAIL_LINK_INVALID' };

/**
 * The letter behind a link and the address its code goes to. { mail, address } or { refusal }. A read failure throws.
 * Whether the letter can still be claimed is the caller's question (the claim route answers it in its own words).
 */
async function letterAndAddress({ mailId, token, email }) {
  const { data: mail, error } = await supabaseAdmin
    .from('Mail')
    .select('id, sender_user_id, sender_entity_id, sender_business_name, sender_display, recipient_user_id, escrow_recipient_contact, escrow_status, escrow_claim_token, escrow_claim_token_hash, escrow_expires_at, mail_extracted')
    .eq('id', mailId)
    .maybeSingle();
  if (error) throw new Error(`mail read failed: ${error.message}`);
  if (!mail || !claimTokenMatches(mail, token)) return { refusal: LINK_INVALID };
  const found = codeAddress(mail, email);
  return found.refusal ? found : { mail, address: found.address };
}

// ---- Sending it ----

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function codeEmail({ code, senderName, card }) {
  const thing = card ? 'Christmas card' : 'letter';
  const opening = card ? 'open' : 'read';
  const subject = `${code} is your Pantopus code`;
  const intro = `Enter this code on the page your ${thing}’s link opened to ${opening} the ${thing} ${senderName} sent you.`;
  const footnote = `It works for ${CODE_MINUTES} minutes. If you didn’t ask for it, you can ignore this email: nobody can ${opening} the ${thing} without it.`;
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@pantopus.com';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f6f7f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#111827; -webkit-font-smoothing:antialiased;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#f6f7f9;">
    Your code to ${opening} the ${esc(thing)} from ${esc(senderName)}.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f7f9; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px; background:#ffffff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 8px;">
              <div style="font-size:18px; font-weight:700; color:#0284c7; letter-spacing:0.2px;">Pantopus</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;">
              <h1 style="font-size:22px; font-weight:600; margin:0 0 16px; color:#111827;">Your code</h1>
              <p style="font-size:15px; line-height:1.6; color:#374151; margin:0 0 20px;">${esc(intro)}</p>
              <p style="font-size:34px; line-height:1.2; font-weight:700; letter-spacing:8px; color:#111827; margin:0 0 24px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${esc(code)}</p>
              <div style="border-top:1px solid #e5e7eb; padding-top:20px;">
                <p style="font-size:13px; line-height:1.6; color:#6b7280; margin:0;">${esc(footnote)} Never share this code.</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb; border-top:1px solid #e5e7eb; padding:20px 32px;">
              <p style="font-size:12px; line-height:1.6; color:#9ca3af; margin:0;">
                Questions? Reply to this email or write to
                <a href="mailto:${esc(supportEmail)}" style="color:#6b7280; text-decoration:underline;">${esc(supportEmail)}</a>.<br>
                Pantopus — Your household, organized.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const text = `Your code: ${code}

${intro}

${footnote} Never share this code.

Questions? Reply to this email or write to ${supportEmail}.

Pantopus — Your household, organized.
`;
  return { subject, html, text };
}

/**
 * Mint a code for `address` and email it. A new address gets an Auth user that isn't confirmed (Supabase Auth makes it
 * with the code); entering the code confirms it. Each code replaces the address's earlier one. Answers 'sent',
 * 'unavailable' (email can't be delivered now) or 'failed'. Never says whether the address had an account.
 */
async function sendCode({ address, senderName, card }) {
  if (!(await emailService.checkDeliveryAvailability()).available) return 'unavailable';
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: address });
  const code = data?.properties?.email_otp;
  if (error || !code) {
    logger.error('Mail code: generateLink failed', { error: error?.message || 'no email_otp', status: error?.status || null });
    return 'failed';
  }
  const result = await emailService.sendEmail({ to: address, ...codeEmail({ code, senderName, card }) });
  if (!result?.success) {
    logger.error('Mail code: email send failed', { error: result?.error || null });
    return 'failed';
  }
  return 'sent';
}

/**
 * Whether the code just accepted for `user` (the Auth user verifyOtp answered with) was sent less than CODE_MINUTES
 * ago: a new address's code is its confirmation, an account's code its sign-in link (recovery_sent_at).
 */
function codeIsFresh(user, now = Date.now()) {
  const sent = Math.max(Date.parse(user?.confirmation_sent_at || '') || 0, Date.parse(user?.recovery_sent_at || '') || 0);
  return sent > 0 && now - sent <= CODE_MINUTES * 60 * 1000;
}

module.exports = {
  CODE_MINUTES,
  hashClaimToken,
  claimTokenMatches,
  codeAddress,
  letterAndAddress,
  sendCode,
  codeIsFresh,
};
