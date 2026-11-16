/**
 * The customer record (the business graph's shared piece 3, docs/product/business-graph/02-shared-pieces-contract.md
 * section 4): one "BusinessCustomer" row a business and a person it has dealt with.
 *
 * recordBusinessContact is the only way a row is written, through the database function record_business_contact:
 *   - no row: one is made with the first meeting (when, the feature, the way in, who brought them); those fields are
 *     never rewritten;
 *   - a row: only the latest dealing moves;
 *   - either way, what the person has paid the business is counted again from its captured Payment rows, so a
 *     repeated call never counts a sale twice and a full refund takes the sale back out.
 * It never throws into the caller: a sale stands whether or not its record was written.
 *
 * Who calls it (section 4.3): an invoice paid ('invoice', own); a plan spot paid or a free business plan joined
 * ('plan', from its way in); a booking ('booking'); a business chosen for a task ('task', pantopus). Chat alone makes
 * no customer (S9).
 */
const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');

const FEATURES = new Set(['invoice', 'plan', 'booking', 'task']);

/**
 * @param {{ businessUserId: string, userId: string, feature: 'invoice'|'plan'|'booking'|'task', wayIn?: string|null,
 *   basis?: 'pantopus'|'own', broughtByUserId?: string|null, at?: string|Date|null }} contact
 * @returns {Promise<object|null>} the row as it now stands, or null when none was written
 */
async function recordBusinessContact({ businessUserId, userId, feature, wayIn = null, basis = 'own', broughtByUserId = null, at = null }) {
  try {
    if (!businessUserId || !userId || !FEATURES.has(feature)) return null;
    const { data, error } = await supabaseAdmin.rpc('record_business_contact', {
      p_business_user_id: businessUserId,
      p_user_id: userId,
      p_feature: feature,
      p_way_in: wayIn,
      p_basis: basis === 'pantopus' ? 'pantopus' : 'own',
      p_brought_by_user_id: broughtByUserId,
      p_at: at ? new Date(at).toISOString() : null,
    });
    if (error) throw error;
    return data?.business_user_id ? data : null;
  } catch (err) {
    logger.warn('Business customer record not written', { businessUserId, userId, feature, error: err.message });
    return null;
  }
}

/**
 * Counts a person's payments to a business again without recording a dealing: after a refund. Never throws.
 */
async function recountBusinessCustomer(businessUserId, userId) {
  try {
    if (!businessUserId || !userId) return null;
    const { data, error } = await supabaseAdmin.rpc('recount_business_customer', {
      p_business_user_id: businessUserId, p_user_id: userId,
    });
    if (error) throw error;
    return data?.business_user_id ? data : null;
  } catch (err) {
    logger.warn('Business customer recount skipped', { businessUserId, userId, error: err.message });
    return null;
  }
}

/**
 * True when the business holds no record of the person (section 4.5): the Plans fee and "new to you" read this, not a
 * count of their own. A read that fails answers false, so nobody is charged a newcomer's rate on a guess.
 */
async function isNewToBusiness(businessUserId, userId) {
  if (!businessUserId || !userId) return false;
  const { data, error } = await supabaseAdmin.from('BusinessCustomer').select('user_id')
    .eq('business_user_id', businessUserId).eq('user_id', userId).maybeSingle();
  if (error) {
    logger.warn('isNewToBusiness: read failed', { businessUserId, userId, error: error.message });
    return false;
  }
  return !data;
}

module.exports = { recordBusinessContact, recountBusinessCustomer, isNewToBusiness };
