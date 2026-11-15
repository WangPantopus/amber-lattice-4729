// ============================================================
// A Christmas card by email's email: sent as the card is stored (routes/mailbox storeCard), tried again by
// jobs/cardEmailRetry, and by its sender's "Email it again" (POST /api/mailbox/cards/:id/email-again).
//
// Where it is lives on the card's Mail row, in mail_extracted.card.email ({ state, tries, at, sent_at };
// services/holidayCards emailTrouble), so the sender's Sent can say when it didn't go out. A try first marks the row
// 'sending', only if nobody else did, so two tries never send one card's email twice. Its link is made from the card's
// id (holidayCards.cardEmailToken), so every try carries the same link.
// ============================================================

const crypto = require('crypto');
const supabaseAdmin = require('../config/supabaseAdmin');
const emailService = require('./emailService');
const notificationService = require('./notificationService');
const holidayCards = require('./holidayCards');
const mailDelivery = require('./mailDelivery');
const logger = require('../utils/logger');
const { skipForLaunchCut } = require('../utils/featureFlags');
const { maskContact } = require('../jobs/mailEscrowExpiry');

// A list of up to 20 addresses sends its emails two at a time, not 20 connections to the mail server at once.
const AT_ONCE = 2;
// A card's first email gets one more try a moment later; after that the retry job tries every 10 minutes.
const QUICK_RETRY_MS = Number(process.env.CARD_EMAIL_QUICK_RETRY_MS || 3000);
const RETRY_EVERY_MS = 10 * 60 * 1000;
const ROW = 'id, sender_user_id, sender_display, created_at, escrow_status, escrow_recipient_contact, escrow_expires_at, escrow_claim_token_hash, mail_extracted';

/**
 * The link emailed or texted to someone not on Pantopus. It opens the web app's public page for the letter or card
 * (frontend/apps/web/src/app/open), on the same base as the other public pages' links
 * (services/residencyLetterService webBaseUrl). routes/mailbox uses it for letters too.
 */
function escrowClaimLink(mailId, token) {
  const base = (process.env.PUBLIC_WEB_URL || process.env.APP_URL || 'https://pantopus.com').trim().replace(/\/+$/, '');
  return `${base}/open/${mailId}?token=${token}`;
}

let running = 0;
const queue = [];
function inTurn(fn) {
  return new Promise((resolve, reject) => {
    const go = () => {
      running += 1;
      fn().then(resolve, reject).finally(() => {
        running -= 1;
        const next = queue.shift();
        if (next) next();
      });
    };
    if (running < AT_ONCE) go(); else queue.push(go);
  });
}

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const emailOf = (mail) => mail?.mail_extracted?.card?.email || null;

// The card's email as it is now: its words come from the card (who it's from, as stored when it was sent; sealed or
// not; its 90 days told by the sender's clock), as the first try had them.
async function sendOnce(mail) {
  const token = holidayCards.cardEmailToken(mail.id);
  if (!token) return { ok: false, error: 'NO_LINK_SECRET' };
  const card = mail.mail_extracted?.card || {};
  const timeZone = (await mailDelivery.personTimeZone(mail.sender_user_id)) || mailDelivery.FALLBACK_TIME_ZONE;
  try {
    const sent = await emailService.sendCardWaitingEmail({
      toEmail: mail.escrow_recipient_contact, senderName: mail.sender_display || 'Someone',
      claimLink: escrowClaimLink(mail.id, token), expiresAt: mail.escrow_expires_at,
      sealed: card.arrival === 'sealed_christmas', timeZone,
    });
    return sent?.success ? { ok: true } : { ok: false, error: sent?.error || 'EMAIL_NOT_SENT' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Write where its email is now onto the row read as `base`, only while it waits and nothing else changed its email
// since (`was`: the state and tries `base` had). Answers the row as written, or null.
async function writeEmail(base, was, email, extra = {}) {
  const { data, error } = await supabaseAdmin.from('Mail')
    .update({ ...extra, mail_extracted: { ...base.mail_extracted, card: { ...base.mail_extracted.card, email } } })
    .eq('id', base.id).eq('escrow_status', 'pending')
    .eq('mail_extracted->card->email->>state', was.state)
    .eq('mail_extracted->card->email->>tries', String(was.tries ?? 0))
    .select(ROW);
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

/**
 * Tell a sender once that the emails of these cards (their rows) didn't go out after every try (jobs/cardEmailRetry):
 * one notice for one card, with its address masked as on a lock screen, or one for several. It opens their Sent, where
 * they can email it again or take it back (the stamp comes back).
 */
async function tellSender(senderId, cards) {
  if (!cards.length) return;
  const one = cards.length === 1 ? cards[0] : null;
  try {
    await notificationService.createNotification({
      userId: senderId,
      type: 'holiday_card_email_failed',
      title: one ? 'Your Christmas card’s email didn’t go out' : 'Some Christmas card emails didn’t go out',
      body: one
        ? `We couldn’t email your card to ${maskContact(one.escrow_recipient_contact || '')}. Open Sent to email it again or take it back.`
        : `We couldn’t email ${cards.length} of your cards. Open Sent to email them again or take them back.`,
      icon: '✉️',
      link: one ? `/app/mailbox/sent/${one.id}` : '/app/mailbox/sent',
      metadata: one ? { mail_id: one.id } : { mail_ids: cards.map((card) => card.id) },
      idempotencyKey: `holiday_card_email_failed:${cards.map((card) => card.id).sort()[0]}`,
    });
  } catch (err) {
    logger.warn('Card email failure notice not sent', { senderId, error: err.message });
  }
}

/**
 * Try a card's email now. `first`: it was just stored, already marked 'sending' (storeCard); it gets one more try a
 * moment later if the first doesn't go. Otherwise the row is marked 'sending' first, only if its email is still where
 * it was read, so a retry that someone else started meanwhile is skipped. Answers { sent: true }, { sent: false, error,
 * gaveUp } once tried (gaveUp: that was its last try, with its row as written), or { skipped: true } when it wasn't tried
 * (taken back, opened, already sent, or another try running).
 */
async function deliver(mail, { first = false } = {}) {
  if (skipForLaunchCut(['mailbox', 'holiday_cards'], 'cardEmail')) return { skipped: true };
  const was = emailOf(mail);
  if (!was || !mail.escrow_recipient_contact || mail.escrow_status !== 'pending') return { skipped: true };
  let row = mail;
  let tries = Number(was.tries) || 0;
  if (!first) {
    if (was.state === 'sent') return { skipped: true };
    row = await writeEmail(mail, was, { ...was, state: 'sending', at: new Date().toISOString() });
    if (!row) return { skipped: true };
  }
  const sending = emailOf(row);

  // A card whose link's hash isn't the one its id makes now (the server's secret changed since): its emails never went,
  // so its link is made again before this one goes.
  const token = holidayCards.cardEmailToken(row.id);
  const hash = token ? crypto.createHash('sha256').update(token, 'utf8').digest('hex') : null;
  const rehash = hash && row.escrow_claim_token_hash !== hash ? { escrow_claim_token_hash: hash } : {};

  let result = await inTurn(() => sendOnce(row));
  tries += 1;
  if (!result.ok && first) {
    await wait(QUICK_RETRY_MS);
    result = await inTurn(() => sendOnce(row));
    tries += 1;
  }
  const now = new Date().toISOString();
  const email = result.ok ? { state: 'sent', tries, at: now, sent_at: now } : { state: 'failed', tries, at: now };
  let written = null;
  try {
    written = await writeEmail(row, sending, email, rehash);
  } catch (err) {
    logger.warn('Card email state not kept', { mailId: row.id, error: err.message });
  }
  if (result.ok) {
    logger.info('Card email sent', { mailId: row.id, tries });
    return { sent: true };
  }
  logger.warn('Card email not delivered', { mailId: row.id, tries, error: result.error });
  return { sent: false, error: result.error, gaveUp: written && tries >= holidayCards.EMAIL_TRIES ? written : null };
}

/** The card's row as deliver needs it, or null. */
async function cardRow(mailId) {
  const { data, error } = await supabaseAdmin.from('Mail').select(ROW).eq('id', mailId).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/**
 * The cards by email whose email is due another try (jobs/cardEmailRetry): it didn't go out and its last try was 10
 * minutes ago or more (or a try was lost while sending), fewer than holidayCards.EMAIL_TRIES tries so far, sent in
 * the last two days and still waiting.
 */
async function dueForRetry(now = new Date(), limit = 200) {
  const { data, error } = await supabaseAdmin.from('Mail').select(ROW)
    .eq('escrow_status', 'pending')
    .contains('tags', [holidayCards.CARD_TAG])
    .gt('created_at', new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString())
    .in('mail_extracted->card->email->>state', ['failed', 'sending'])
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).filter((mail) => {
    const email = emailOf(mail);
    return (Number(email.tries) || 0) < holidayCards.EMAIL_TRIES
      && now.getTime() - Date.parse(email.at || mail.created_at) >= RETRY_EVERY_MS;
  });
}

module.exports = { deliver, cardRow, dueForRetry, tellSender, escrowClaimLink, RETRY_EVERY_MS };
