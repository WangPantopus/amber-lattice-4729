// ============================================================
// DISPUTE SERVICE
// Builds and submits evidence for Stripe disputes.
//
// Pantopus has rich data to fight chargebacks:
//   - Verified addresses from Home profiles
//   - Completion proof (photos, notes, checklists)
//   - Chat logs between parties
//   - Bid history and acceptance records
//   - Timeline events (started_at, completed_at, confirmed_at)
//
// This service compiles all available evidence into Stripe's
// dispute evidence format and submits it automatically.
// ============================================================

const { getStripeClient } = require('./getStripeClient');
const stripe = getStripeClient();
const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');

/**
 * The chat room a payment's conversation happened in. A task's room is retired when its
 * worker changes, so the task's current room can belong to a later worker: prefer the room
 * recorded when this payment was accepted, then the newest room of the task that its payee
 * is in (current or retired), then the task's current room.
 * Returns { data: { id } | null, error }.
 */
async function findPaymentChatRoom(payment) {
  const { data: acceptance, error: acceptanceError } = await supabaseAdmin
    .from('GigPaymentAcceptance')
    .select('room_id')
    .eq('payment_id', payment.id)
    .not('room_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (acceptanceError) return { data: null, error: acceptanceError };
  if (acceptance?.room_id) return { data: { id: acceptance.room_id }, error: null };

  if (payment.payee_id) {
    const { data: rooms, error: roomsError } = await supabaseAdmin
      .from('ChatRoom')
      .select('id')
      .eq('gig_id', payment.gig_id)
      .in('type', ['gig', 'group'])
      .order('created_at', { ascending: false });
    if (roomsError) return { data: null, error: roomsError };
    const roomIds = (rooms || []).map((r) => r.id);
    if (roomIds.length > 0) {
      const { data: memberships, error: membershipError } = await supabaseAdmin
        .from('ChatParticipant')
        .select('room_id')
        .eq('user_id', payment.payee_id)
        .in('room_id', roomIds);
      if (membershipError) return { data: null, error: membershipError };
      const payeeRooms = new Set((memberships || []).map((m) => m.room_id));
      const newest = roomIds.find((id) => payeeRooms.has(id));
      if (newest) return { data: { id: newest }, error: null };
    }
  }

  return supabaseAdmin
    .from('ChatRoom')
    .select('id')
    .eq('gig_id', payment.gig_id)
    .eq('type', 'gig')
    .maybeSingle();
}

/**
 * A plan's evidence for a disputed plan payment (Plans for the holidays, contract 11.4): when the guest joined and by
 * which way in, the check and who started it, when it was paid, and the plan's chat (the guest's and the staff's
 * messages). Null for any other payment.
 */
async function gatherPlanEvidence(payment) {
  if (payment.payment_type !== 'plan_payment' || !payment.metadata?.plan_id) return null;
  const planId = payment.metadata.plan_id;
  const [{ data: plan }, { data: request }, { data: check }] = await Promise.all([
    supabaseAdmin.from('Plan').select('post_id, business_user_id, chat_room_id, post:Post!inner(title, event_date, event_end_date)').eq('post_id', planId).maybeSingle(),
    payment.metadata.request_id
      ? supabaseAdmin.from('PlanRequest').select('id, created_at, decided_at, way_in, status, party_size, kids_count').eq('id', payment.metadata.request_id).maybeSingle()
      : { data: null },
    payment.metadata.check_id
      ? supabaseAdmin.from('BusinessInvoice').select('id, created_at, paid_at, started_by, subtotal_cents, discount_cents, tip_cents, total_cents').eq('id', payment.metadata.check_id).maybeSingle()
      : { data: null },
  ]);
  if (!plan) return null;
  let chatMessages = [];
  if (plan.chat_room_id) {
    const staff = await require('../services/plans/planBusiness').staffToNotify(plan).catch(() => []);
    const authors = [payment.payer_id, ...staff].filter(Boolean);
    const { data: messages, error } = await supabaseAdmin.from('ChatMessage').select('id, user_id, message, created_at')
      .eq('room_id', plan.chat_room_id).eq('deleted', false).eq('type', 'text').in('user_id', authors)
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw new Error(`Unable to load dispute plan messages: ${error.message}`);
    chatMessages = (messages || []).reverse();
  }
  return { plan, request, check, chatMessages };
}

/**
 * Gather all evidence for a disputed payment.
 *
 * @param {string} paymentId - Payment UUID
 * @returns {object} Compiled evidence bundle
 */
async function gatherEvidence(paymentId) {
  // ─── Fetch core records ───
  const { data: payment, error: paymentError } = await supabaseAdmin
    .from('Payment')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (paymentError) throw new Error(`Unable to load dispute payment: ${paymentError.message}`);
  if (!payment) throw new Error(`Payment not found: ${paymentId}`);
  if (!payment.dispute_id) throw new Error('Payment has no associated dispute');

  const gigId = payment.gig_id;

  // Parallel fetches for related data
  const [gigResult, bidResult, payerResult, payeeResult, reviewResult, chatResult] = await Promise.all([
    // Gig with completion proof
    gigId
      ? supabaseAdmin
          .from('Gig')
          .select(`
            id, title, description, status, price,
            created_at, accepted_at, started_at,
            worker_completed_at, owner_confirmed_at,
            completion_note, completion_photos, completion_checklist,
            owner_confirmation_note, owner_satisfaction,
            scheduled_start,
            cancellation_policy
          `)
          .eq('id', gigId)
          .maybeSingle()
      : { data: null },

    // Accepted bid
    gigId
      ? supabaseAdmin
          .from('GigBid')
          .select('id, user_id, bid_amount, message, status, created_at')
          .eq('gig_id', gigId)
          .eq('status', 'accepted')
          .maybeSingle()
      : { data: null },

    // Payer (requester) info
    supabaseAdmin
      .from('User')
      .select('id, username, name, email, created_at')
      .eq('id', payment.payer_id)
      .maybeSingle(),

    // Payee (provider) info
    supabaseAdmin
      .from('User')
      .select('id, username, name, email, created_at')
      .eq('id', payment.payee_id)
      .maybeSingle(),

    // Review (if any)
    gigId
      ? supabaseAdmin
          .from('Review')
          .select('id, rating, comment, created_at')
          .eq('gig_id', gigId)
          .limit(1)
          .maybeSingle()
      : { data: null },

    // Chat messages (last 50 between the parties in this payment's conversation)
    gigId ? findPaymentChatRoom(payment) : { data: null },
  ]);

  for (const [record, result] of Object.entries({
    gig: gigResult, bid: bidResult, payer: payerResult, payee: payeeResult,
    review: reviewResult, chat: chatResult,
  })) {
    if (result.error) throw new Error(`Unable to load dispute ${record}: ${result.error.message}`);
  }

  const gig = gigResult.data;
  const bid = bidResult.data;
  const payer = payerResult.data;
  const payee = payeeResult.data;
  const review = reviewResult.data;

  // Fetch chat messages if chat room exists
  let chatMessages = [];
  if (chatResult.data?.id) {
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('ChatMessage')
      .select('id, user_id, message, created_at')
      .eq('room_id', chatResult.data.id)
      .eq('deleted', false)
      .eq('type', 'text')
      .in('user_id', [payment.payer_id, payment.payee_id].filter(Boolean))
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50);
    if (messagesError) throw new Error(`Unable to load dispute messages: ${messagesError.message}`);
    chatMessages = (messages || []).reverse();
  }

  // A plan payment's own record (B2 to B6): the plan, the guest's place, the check, the plan's chat.
  const planEvidence = await gatherPlanEvidence(payment);
  if (planEvidence?.chatMessages?.length) chatMessages = planEvidence.chatMessages;

  return {
    payment,
    gig,
    bid,
    payer,
    payee,
    review,
    chatMessages,
    plan: planEvidence,
  };
}

/**
 * Build a Stripe-compatible evidence object from gathered data.
 *
 * @param {object} evidence - Result from gatherEvidence()
 * @returns {object} Stripe dispute evidence fields
 */
function buildStripeEvidence(evidence) {
  const { payment, gig, bid, payer, review, chatMessages } = evidence;

  const stripeEvidence = {};
  const currency = (payment.currency || 'USD').toUpperCase();

  // ─── Product / Service Description ───
  if (gig) {
    const parts = [
      `Service: "${gig.title}"`,
      gig.description ? `Description: ${gig.description.substring(0, 500)}` : null,
      `Agreed price: ${currency} ${Number(bid?.bid_amount ?? payment.amount_subtotal / 100).toFixed(2)}`,
    ].filter(Boolean);

    stripeEvidence.product_description = parts.join('\n');
  }

  // ─── Service Date ───
  if (gig?.started_at) {
    stripeEvidence.service_date = new Date(gig.started_at).toISOString().split('T')[0];
  } else if (gig?.scheduled_start) {
    stripeEvidence.service_date = new Date(gig.scheduled_start).toISOString().split('T')[0];
  }

  // ─── Service Documentation ───
  // Compile a narrative of the service delivery
  const docParts = [];

  // ─── A plan payment (Plans for the holidays, contract 11.4) ───
  if (evidence.plan?.plan) {
    const { plan, request, check } = evidence.plan;
    const usd = (cents) => `${currency} ${(Number(cents || 0) / 100).toFixed(2)}`;
    stripeEvidence.product_description = [
      `In-person plan: "${plan.post.title}"`,
      check ? `Bill at the place: ${usd(check.subtotal_cents)}${check.discount_cents ? `, deal ${usd(check.discount_cents)} off` : ''}${check.tip_cents ? `, tip ${usd(check.tip_cents)}` : ''}`
        : `A spot at the plan, ${usd(payment.amount_total)}`,
    ].join('\n');
    stripeEvidence.service_date = new Date(plan.post.event_date).toISOString().split('T')[0];
    docParts.push('PLAN ATTENDANCE RECORD');
    docParts.push(`Plan starts: ${new Date(plan.post.event_date).toISOString()}`);
    if (request) {
      docParts.push(`Guest joined: ${new Date(request.created_at).toISOString()}${request.way_in ? ` (way in: ${request.way_in})` : ''}`);
      if (request.decided_at) docParts.push(`Guest was in from: ${new Date(request.decided_at).toISOString()}`);
      docParts.push(`Guest's place now: ${request.status}, party of ${(request.party_size || 1) + (request.kids_count || 0)}`);
    }
    if (check) {
      docParts.push(`Check made: ${new Date(check.created_at).toISOString()}, started by ${check.started_by === 'guest' ? 'the guest' : 'the business'}`);
      if (check.paid_at) docParts.push(`Check paid: ${new Date(check.paid_at).toISOString()}, total ${usd(check.total_cents)}`);
    }
  }

  if (gig?.status === 'completed' || gig?.owner_confirmed_at) {
    docParts.push('SERVICE DELIVERY CONFIRMED');
    docParts.push(`Gig status: ${gig.status}`);
  }

  if (gig?.accepted_at) {
    docParts.push(`Bid accepted: ${new Date(gig.accepted_at).toISOString()}`);
  }
  if (gig?.started_at) {
    docParts.push(`Work started: ${new Date(gig.started_at).toISOString()}`);
  }
  if (gig?.worker_completed_at) {
    docParts.push(`Worker marked complete: ${new Date(gig.worker_completed_at).toISOString()}`);
  }
  if (gig?.owner_confirmed_at) {
    docParts.push(`Owner confirmed completion: ${new Date(gig.owner_confirmed_at).toISOString()}`);
  }

  // Completion proof
  if (gig?.completion_note) {
    docParts.push(`\nWorker's completion note: "${gig.completion_note}"`);
  }
  if (gig?.completion_photos?.length > 0) {
    docParts.push(`Worker submitted ${gig.completion_photos.length} photo(s) as proof of work.`);
    // Private completion files are references, not files uploaded to Stripe.
  }
  if (gig?.completion_checklist?.length > 0) {
    const completedItems = gig.completion_checklist.filter(item => item.done).length;
    docParts.push(`Completion checklist: ${completedItems}/${gig.completion_checklist.length} items completed.`);
  }

  // Owner's confirmation
  if (gig?.owner_confirmation_note) {
    docParts.push(`\nRequester's confirmation note: "${gig.owner_confirmation_note}"`);
  }
  if (gig?.owner_satisfaction) {
    docParts.push(`Requester satisfaction rating: ${gig.owner_satisfaction}/5`);
  }

  // Review
  if (review) {
    docParts.push(`\nPost-gig review: ${review.rating}/5 stars`);
    if (review.comment) {
      docParts.push(`Review text: "${review.comment.substring(0, 300)}"`);
    }
  }

  // ─── Customer Communication ───
  let chatLog = '';
  if (chatMessages.length > 0) {
    chatLog = chatMessages
      .map(msg => {
        const sender = msg.user_id === payment.payer_id ? 'Requester' : 'Provider';
        const time = new Date(msg.created_at).toISOString();
        const content = (msg.message || '').substring(0, 200);
        return `[${time}] ${sender}: ${content}`;
      })
      .join('\n');
  }

  // ─── Customer Info ───
  if (payer) {
    stripeEvidence.customer_name = payer.name || payer.username;
    stripeEvidence.customer_email_address = payer.email;
  }

  // ─── Uncategorized Text ───
  // A catch-all for additional context
  const uncategorized = [];
  uncategorized.push(`Pantopus Platform: Marketplace for local services.`);
  uncategorized.push(`Payment ID: ${payment.id}`);
  if (gig) uncategorized.push(`Gig ID: ${gig.id}`);
  if (bid) {
    uncategorized.push(`Bid amount: ${currency} ${Number(bid.bid_amount).toFixed(2)}`);
    uncategorized.push(`Bid placed: ${new Date(bid.created_at).toISOString()}`);
    if (bid.message) uncategorized.push(`Bid message: "${bid.message.substring(0, 200)}"`);
  }
  if (payer) {
    uncategorized.push(`Requester account created: ${new Date(payer.created_at).toISOString()}`);
  }
  uncategorized.push(`Payment created: ${new Date(payment.created_at).toISOString()}`);
  if (payment.captured_at) {
    uncategorized.push(`Payment captured: ${new Date(payment.captured_at).toISOString()}`);
  }

  // Stripe's service_documentation/customer_communication fields require uploaded
  // file IDs. Keep narrative text in the supported text field, within its limit.
  // Bound each section so long completion notes cannot crowd out the conversation.
  if (docParts.length) uncategorized.push(docParts.join('\n').substring(0, 5000));
  if (chatLog) uncategorized.push(`Customer communication:\n${chatLog}`);
  stripeEvidence.uncategorized_text = uncategorized.join('\n').substring(0, 20000);

  return stripeEvidence;
}

/**
 * Submit dispute evidence to Stripe.
 *
 * @param {string} paymentId - Payment UUID
 * @param {boolean} submit - If true, submits (finalizes) the evidence. Default false (save draft).
 * @returns {object} Stripe dispute object
 */
async function submitDisputeEvidence(paymentId, submit = true) {
  try {
    const { data: payment } = await supabaseAdmin
      .from('Payment')
      .select('id, dispute_id, dispute_status')
      .eq('id', paymentId)
      .single();

    if (!payment) throw new Error('Payment not found');
    if (!payment.dispute_id) throw new Error('Payment has no dispute');

    // Check if dispute is still open
    if (['won', 'lost'].includes(payment.dispute_status)) {
      throw new Error(`Dispute already resolved: ${payment.dispute_status}`);
    }

    // Gather and build evidence
    const evidence = await gatherEvidence(paymentId);
    const stripeEvidence = buildStripeEvidence(evidence);

    logger.info('Submitting dispute evidence', {
      paymentId,
      disputeId: payment.dispute_id,
      evidenceFields: Object.keys(stripeEvidence),
      submit,
    });

    // Submit to Stripe
    const dispute = await stripe.disputes.update(payment.dispute_id, {
      evidence: stripeEvidence,
      submit,
    });

    // Update payment record
    const nowIso = new Date().toISOString();
    await supabaseAdmin.from('Payment').update({
      dispute_evidence_submitted_at: submit ? nowIso : null,
      dispute_status: dispute.status,
      updated_at: nowIso,
    }).eq('id', paymentId);

    logger.info('Dispute evidence submitted', {
      paymentId,
      disputeId: payment.dispute_id,
      submitted: submit,
      disputeStatus: dispute.status,
    });

    return {
      success: true,
      disputeId: payment.dispute_id,
      disputeStatus: dispute.status,
      evidenceSubmitted: submit,
    };

  } catch (err) {
    logger.error('Error submitting dispute evidence', {
      error: err.message,
      paymentId,
    });
    throw err;
  }
}

/**
 * Get a preview of the evidence that would be submitted.
 * Useful for admin review before submission.
 *
 * @param {string} paymentId - Payment UUID
 * @returns {object} Evidence bundle and formatted Stripe evidence
 */
async function previewDisputeEvidence(paymentId) {
  try {
    const evidence = await gatherEvidence(paymentId);
    const stripeEvidence = buildStripeEvidence(evidence);

    return {
      rawEvidence: {
        hasGig: !!evidence.gig,
        hasCompletionProof: !!(evidence.gig?.completion_photos?.length || evidence.gig?.completion_note),
        hasOwnerConfirmation: !!evidence.gig?.owner_confirmed_at,
        hasReview: !!evidence.review,
        chatMessageCount: evidence.chatMessages.length,
        hasBid: !!evidence.bid,
      },
      stripeEvidence,
    };

  } catch (err) {
    logger.error('Error previewing dispute evidence', { error: err.message, paymentId });
    throw err;
  }
}

module.exports = {
  gatherEvidence,
  buildStripeEvidence,
  submitDisputeEvidence,
  previewDisputeEvidence,
};
