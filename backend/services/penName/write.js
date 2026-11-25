// Made-up names: saving a row.
//
// The order is what keeps the promise. The gate has passed on the real account; then the writer is recorded behind
// owner.js; then the row is saved under the system account with the made-up name's id. The database refuses a
// made-up-name row whose writer isn't recorded (pen_name_content_guard), so a row can never be without its owner, and
// if saving fails the record is taken back. From here on the account is on nothing the rest of the server reads.

const crypto = require('crypto');
const owner = require('./owner');
const names = require('./names');

function refuse(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

/** The account's made-up name in use, or a refusal the apps answer by opening the "choose your name" screen. */
async function requireName(userId) {
  const pen = await names.ofOwner(userId);
  if (!pen) throw refuse('PEN_NAME_NEEDED', 'Choose your made-up name first.', 409);
  return pen;
}

/** The identity fields of a row written under `pen`: what replaces the account on it. */
function identityFields(pen, kind) {
  return {
    user_id: owner.SYSTEM_ACCOUNT_ID,
    ...(kind === 'post' ? { author_user_id: owner.SYSTEM_ACCOUNT_ID } : {}),
    identity_context_type: owner.KIND,
    identity_context_id: pen.id,
  };
}

/**
 * What a made-up-name post may never carry, whatever the composer sent: nothing that ties it to a home, a business,
 * a profile, the open web or another post, and no exact fix of where the phone was.
 */
function postFields(pen) {
  return {
    ...identityFields(pen, 'post'),
    home_id: null,
    business_id: null,
    business_author_id: null,
    target_place_id: null,
    quoted_post_id: null,
    post_as: 'personal',
    audience: 'nearby',
    visibility: 'neighborhood',
    distribution_targets: ['place'],
    show_on_profile: false,
    profile_visibility_scope: 'hidden',
    allow_external_share: false,
    is_visitor_post: false,
    gps_timestamp: null,
    location_address: null,
    matched_business_ids: [],
    matched_businesses_cache: [],
  };
}

/**
 * Records the writer, then runs `save(id)` (the insert). `id` is the row's id, made here when the caller has none.
 * If `save` throws or answers `{ saved: false }`, the record is taken back.
 */
async function sealed({ kind, id, userId, pen }, save) {
  const contentId = id || crypto.randomUUID();
  await owner.seal({ kind, contentId, ownerId: userId, penNameId: pen.id });
  try {
    const result = await save(contentId);
    if (result && result.saved === false) await owner.unseal({ kind, contentId, ownerId: userId });
    return result;
  } catch (error) {
    await owner.unseal({ kind, contentId, ownerId: userId });
    throw error;
  }
}

module.exports = { requireName, identityFields, postFields, sealed };
