/**
 * What a claimant is told about their own home claim while it waits: a reviewer asked for more (Request info), a
 * document is still missing, or the claim closed after 30 days without one. Each goes to the app (bell and push)
 * and, since 2026-11-27, by email too: someone who added a home and never opened the app again heard nothing.
 *
 * Email is best effort and never changes the outcome of the action that sends it. The address named is the one the
 * claimant entered, so their own notice may name it.
 */
const db = require('../config/supabaseAdmin');
const logger = require('../utils/logger');

const CLOSE_AFTER_DAYS = 30;

/** The web page where a claimant adds documents to this claim (the apps open the claim's waiting room instead). */
function claimPagePath({ homeId, claimId, claimType }) {
  const page = claimType === 'resident' ? 'verify-residency' : 'claim-owner/evidence';
  return `/app/homes/${homeId}/${page}?claimId=${claimId}`;
}

function addressOf(home) {
  const address = [home?.address, home?.address2].map(part => part?.trim()).filter(Boolean).join(' ');
  return address || 'your home';
}

function proofWords(claimType) {
  return claimType === 'resident'
    ? 'a document that shows you live there, like a utility bill or lease'
    : 'a document that shows you own it, like a deed, closing statement or property tax bill';
}

/** One email to the claimant. False when they have no address on file or the mailer didn't take it. */
async function emailClaimant({ userId, heading, paragraphs, quote = null, buttonLabel, path }) {
  try {
    const { data } = await db.from('User').select('email').eq('id', userId).maybeSingle();
    if (!data?.email) return false;
    const sent = await require('./emailService').sendClaimNoticeEmail({
      toEmail: data.email, heading, paragraphs, quote, buttonLabel, path,
    });
    return sent?.success === true;
  } catch (error) {
    logger.warn('Claim notice email failed (non-fatal)', { errorCode: error?.code });
    return false;
  }
}

/** Request info by email: the reviewer's note in full, and a button to the claim. The app notice went out already. */
function emailMoreInfo({ userId, homeId, claimId, claimType, address, note }) {
  const where = address || 'your home';
  const quote = typeof note === 'string' && note.trim() ? note.trim() : null;
  return emailClaimant({
    userId,
    heading: 'Pantopus needs one more thing for your home claim',
    paragraphs: [
      quote ? `A Pantopus reviewer looked at your claim for ${where} and asked:`
        : `A Pantopus reviewer looked at your claim for ${where} and needs more from you.`,
      'Open your claim to respond.',
    ],
    quote,
    buttonLabel: 'Open your claim',
    path: claimPagePath({ homeId, claimId, claimType }),
  });
}

/**
 * A claim still without a document: the first reminder a day after filing, the second after a week. One notice per
 * claim and stage (`key`), however often it is asked for; the email goes only with a notice that was created now.
 * `claim` carries id, home_id, claimant_user_id, claim_type and home { address, address2 }.
 */
async function remindAboutDocument({ claim, stage, key }) {
  const where = addressOf(claim.home);
  const title = stage === 1 ? 'Add a document to verify your home' : 'Your home claim still needs a document';
  const needs = `Your claim for ${where} can't be reviewed until it has ${proofWords(claim.claim_type)}.`;
  const closes = `A claim with no document closes ${CLOSE_AFTER_DAYS} days after it was filed. You can file again any time.`;
  // The same notice type and link Request info uses, so every app opens the claim's upload from it.
  const notice = await require('./notificationService').createNotification({
    userId: claim.claimant_user_id,
    type: 'ownership_claim_needs_more_info',
    title,
    body: `${needs}${stage === 1 ? '' : ` ${closes}`} Open your claim to add one.`,
    icon: '📋',
    link: `/homes/${claim.home_id}/waiting-room`,
    metadata: { home_id: claim.home_id, claim_id: claim.id, claim_type: claim.claim_type },
    idempotencyKey: key,
  });
  if (!notice) return false;
  await emailClaimant({
    userId: claim.claimant_user_id,
    heading: title,
    paragraphs: stage === 1 ? [needs] : [needs, closes],
    buttonLabel: 'Add a document',
    path: claimPagePath({ homeId: claim.home_id, claimId: claim.id, claimType: claim.claim_type }),
  });
  return true;
}

/**
 * The claim closed because no document came in 30 days. Nothing else about the home changed, and the person can file
 * again. The notice opens their home in the apps and My Homes on the web, as a declined claim's does.
 */
async function tellClaimClosed({ claim, key }) {
  const where = addressOf(claim.home);
  const title = 'Your home claim was closed';
  const closed = `Your claim for ${where} was closed because no document was added in ${CLOSE_AFTER_DAYS} days.`;
  const again = 'Nothing else about your home changed, and you can file again any time.';
  const notice = await require('./notificationService').createNotification({
    userId: claim.claimant_user_id,
    type: 'ownership_claim_rejected',
    title,
    body: `${closed} ${again}`,
    icon: '📋',
    link: `/app/homes/${claim.home_id}/dashboard`,
    metadata: { home_id: claim.home_id, claim_id: claim.id, claim_type: claim.claim_type, closed: 'no_document' },
    idempotencyKey: key,
  });
  if (!notice) return false;
  await emailClaimant({
    userId: claim.claimant_user_id,
    heading: title,
    paragraphs: [closed, again],
    buttonLabel: 'Open My Homes',
    path: '/app/homes',
  });
  return true;
}

module.exports = { CLOSE_AFTER_DAYS, claimPagePath, emailClaimant, emailMoreInfo, remindAboutDocument, tellClaimClosed };
