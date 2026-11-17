// ============================================================
// A Christmas card by email's email: sent as the card is stored (routes/mailbox storeCard), or at the sender's 7 a.m. or
// on Christmas morning by jobs/cardEmailSend, which also tries again one that didn't go, and by its sender's "Email it
// again" (POST /api/mailbox/cards/:id/email-again). Three days after it went out, a card still unopened gets one reminder
// (remind, below; jobs/cardEmailSend), behind the server's CARD_EMAIL_REMINDERS switch.
//
// Where it is lives on the card's Mail row, in mail_extracted.card.email ({ state, tries, at, sent_at };
// services/holidayCards emailTrouble), so the sender's Sent can say when it didn't go out. A try first marks the row
// 'sending', only if nobody else did, so two tries never send one card's email twice. Its link is made from the card's
// id (holidayCards.cardEmailToken), so every try carries the same link. The reminder keeps its own state beside it, in
// mail_extracted.card.email.reminder ({ state, tries, at, sent_at }), and never changes what the email's own state means.
// ============================================================

const crypto = require('crypto');
const supabaseAdmin = require('../config/supabaseAdmin');
const emailService = require('./emailService');
const notificationService = require('./notificationService');
const holidayCards = require('./holidayCards');
const mailDelivery = require('./mailDelivery');
const logger = require('../utils/logger');
const { skipForLaunchCut, cardEmailRemindersEnabled } = require('../utils/featureFlags');
const { maskContact } = require('../jobs/mailEscrowExpiry');

// Emails go a few at a time, not 20 connections to the mail server at once for a list, nor hundreds on Christmas morning.
const AT_ONCE = 4;
// A card's first email gets one more try a moment later; after that the retry job tries every 10 minutes.
const QUICK_RETRY_MS = Number(process.env.CARD_EMAIL_QUICK_RETRY_MS || 3000);
const RETRY_EVERY_MS = 10 * 60 * 1000;
// One reminder, for a card still unopened 3 days after its email went out, only while its email went out less than about
// 10 days ago: when this shipped, cards emailed long before got none, and a reminder that kept failing stops in time.
const REMIND_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const REMIND_UNTIL_MS = 10 * 24 * 60 * 60 * 1000;
// A reminder that didn't go is tried again 10 minutes later, 3 tries in all; its sender is never told.
const REMIND_TRIES = 3;
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
// not and its picture; its 90 days told by the sender's clock), as the first try had them. `reminder`: its one reminder.
async function sendOnce(mail, { reminder = false } = {}) {
  const token = holidayCards.cardEmailToken(mail.id);
  if (!token) return { ok: false, error: 'NO_LINK_SECRET' };
  const card = mail.mail_extracted?.card || {};
  const timeZone = (await mailDelivery.personTimeZone(mail.sender_user_id)) || mailDelivery.FALLBACK_TIME_ZONE;
  try {
    const sent = await emailService.sendCardWaitingEmail({
      toEmail: mail.escrow_recipient_contact, senderName: mail.sender_display || 'Someone',
      claimLink: escrowClaimLink(mail.id, token), expiresAt: mail.escrow_expires_at,
      sealed: card.arrival === 'sealed_christmas', design: card.design || null, reminder, timeZone,
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
 * Tell a sender once that the emails of these cards (their rows) didn't go out after every try (jobs/cardEmailSend):
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
    // One set for later goes only once it's due ("Email it again" doesn't offer it before).
    if (was.state === 'scheduled' && Date.parse(was.send_at) > Date.now()) return { skipped: true };
    row = await writeEmail(mail, was, { ...was, state: 'sending', at: new Date().toISOString() });
    if (!row) return { skipped: true };
  }
  const sending = emailOf(row);
  // When it was due stays with it, so Sent gives up an hour after its 7 a.m., not an hour after it was sealed.
  const due = sending.send_at ? { send_at: sending.send_at } : {};

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
  const email = result.ok ? { state: 'sent', tries, at: now, sent_at: now, ...due } : { state: 'failed', tries, at: now, ...due };
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
 * The cards by email whose email is due (jobs/cardEmailSend), oldest first, still waiting: those set for a 7 a.m. or
 * Christmas morning that has come ('scheduled'), then those that didn't go (or lost a try while sending) whose last try
 * was 10 minutes ago or more, with fewer than holidayCards.EMAIL_TRIES tries, tried in the last two days. Both read only
 * cards still waiting (the database's partial index on pending escrow).
 */
async function dueToSend(now = new Date(), limit = 200) {
  const waiting = () => supabaseAdmin.from('Mail').select(ROW)
    .eq('escrow_status', 'pending')
    .contains('tags', [holidayCards.CARD_TAG]);
  const [scheduled, again] = await Promise.all([
    waiting().eq('mail_extracted->card->email->>state', 'scheduled')
      .lte('mail_extracted->card->email->>send_at', now.toISOString())
      .order('created_at', { ascending: true }).limit(limit),
    waiting().in('mail_extracted->card->email->>state', ['failed', 'sending'])
      .gt('mail_extracted->card->email->>at', new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true }).limit(limit),
  ]);
  if (scheduled.error || again.error) throw new Error((scheduled.error || again.error).message);
  return [
    ...(scheduled.data || []),
    ...(again.data || []).filter((mail) => {
      const email = emailOf(mail);
      return (Number(email.tries) || 0) < holidayCards.EMAIL_TRIES
        && now.getTime() - Date.parse(email.at || mail.created_at) >= RETRY_EVERY_MS;
    }),
  ];
}

// ---- The one reminder ----

const reminderOf = (mail) => emailOf(mail)?.reminder || null;

// Write where its reminder is now onto the row read as `base`, only while the card waits, its email is still 'sent' and
// its reminder is still where `base` had it (none, or `was`: its state and tries), so two runs never send it twice.
async function writeReminder(base, was, reminder) {
  const email = emailOf(base);
  let query = supabaseAdmin.from('Mail')
    .update({ mail_extracted: { ...base.mail_extracted, card: { ...base.mail_extracted.card, email: { ...email, reminder } } } })
    .eq('id', base.id).eq('escrow_status', 'pending')
    .eq('mail_extracted->card->email->>state', 'sent')
    .eq('mail_extracted->card->email->>sent_at', email.sent_at);
  query = was
    ? query.eq('mail_extracted->card->email->reminder->>state', was.state)
      .eq('mail_extracted->card->email->reminder->>tries', String(was.tries ?? 0))
    : query.is('mail_extracted->card->email->reminder', null);
  const { data, error } = await query.select(ROW);
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

/** Whether this card (its row) is due its reminder now: see dueToRemind. */
function remindable(mail, now = new Date()) {
  const email = emailOf(mail);
  if (!email || email.state !== 'sent' || !email.sent_at || !mail.escrow_recipient_contact) return false;
  if (mail.escrow_status !== 'pending' || !(Date.parse(mail.escrow_expires_at) > now.getTime())) return false;
  const since = now.getTime() - Date.parse(email.sent_at);
  if (!(since >= REMIND_AFTER_MS && since < REMIND_UNTIL_MS)) return false;
  const reminder = email.reminder;
  if (!reminder) return true;
  return reminder.state === 'failed' && (Number(reminder.tries) || 0) < REMIND_TRIES
    && now.getTime() - Date.parse(reminder.at) >= RETRY_EVERY_MS;
}

/**
 * Send a card's one reminder now, if it is due (remindable): its row is marked first, only if nobody else did, then the
 * email goes, a few at a time like the others. Answers { sent: true }, { sent: false, error } once tried, or
 * { skipped: true }. A reminder that doesn't go is left 'failed' for a later run (REMIND_TRIES in all); a reminder whose
 * try was lost midway stays 'sending' and is never sent again, so nobody gets two.
 */
async function remind(mail, now = new Date()) {
  if (skipForLaunchCut(['mailbox', 'holiday_cards'], 'cardEmailReminder')) return { skipped: true };
  if (!cardEmailRemindersEnabled() || !remindable(mail, now)) return { skipped: true };
  const was = reminderOf(mail);
  const tries = (Number(was?.tries) || 0) + 1;
  const row = await writeReminder(mail, was, { ...(was || {}), state: 'sending', tries, at: now.toISOString() });
  if (!row) return { skipped: true };
  const result = await inTurn(() => sendOnce(row, { reminder: true }));
  const at = new Date().toISOString();
  try {
    await writeReminder(row, reminderOf(row), result.ok
      ? { state: 'sent', tries, at, sent_at: at }
      : { state: 'failed', tries, at });
  } catch (err) {
    logger.warn('Card reminder state not kept', { mailId: row.id, error: err.message });
  }
  if (result.ok) {
    logger.info('Card reminder sent', { mailId: row.id });
    return { sent: true };
  }
  logger.warn('Card reminder not delivered', { mailId: row.id, tries, error: result.error });
  return { sent: false, error: result.error };
}

/**
 * The cards by email due their reminder (jobs/cardEmailSend), oldest email first, still waiting and not yet past their
 * 90 days: their email went out 3 to 10 days ago and they have no reminder yet, or theirs didn't go (remindable picks
 * the ones whose last try was 10 minutes ago or more, under REMIND_TRIES). Nothing while CARD_EMAIL_REMINDERS is off.
 */
async function dueToRemind(now = new Date(), limit = 200) {
  if (!cardEmailRemindersEnabled()) return [];
  const window = () => supabaseAdmin.from('Mail').select(ROW)
    .eq('escrow_status', 'pending')
    .contains('tags', [holidayCards.CARD_TAG])
    .gt('escrow_expires_at', now.toISOString())
    .eq('mail_extracted->card->email->>state', 'sent')
    .lte('mail_extracted->card->email->>sent_at', new Date(now.getTime() - REMIND_AFTER_MS).toISOString())
    .gt('mail_extracted->card->email->>sent_at', new Date(now.getTime() - REMIND_UNTIL_MS).toISOString())
    .order('mail_extracted->card->email->>sent_at', { ascending: true }).limit(limit);
  const [fresh, again] = await Promise.all([
    window().is('mail_extracted->card->email->reminder', null),
    window().eq('mail_extracted->card->email->reminder->>state', 'failed'),
  ]);
  if (fresh.error || again.error) throw new Error((fresh.error || again.error).message);
  return [...(fresh.data || []), ...(again.data || [])].filter((mail) => remindable(mail, now));
}

module.exports = { deliver, cardRow, dueToSend, tellSender, escrowClaimLink, remind, dueToRemind, AT_ONCE, RETRY_EVERY_MS };
