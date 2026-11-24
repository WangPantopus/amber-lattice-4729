/**
 * SPEC rule 4.7 (CONTRACT.md section 8): the old profile reads never tell a signed-out caller more than the main link
 * shows. While PROFILE_SOURCES is on and once the person has saved their parts, GET /api/users/id/:id,
 * /username/:username and the legacy /:username send a signed-out caller (and the owner's `?as=anyone` preview) null
 * or empty values for what the link doesn't show. Every key and type stays, so the store apps keep working.
 * Before a first save, with the switch off, or for a signed-in caller, the reads are exactly as before.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const { profileSourcesEnabled } = require('../../utils/featureFlags');
const { readShare, reaches } = require('./parts');

/** Whether rule 4.7 can apply to this read at all (cheap; no database read). */
function appliesTo(req, audience) {
  if (!profileSourcesEnabled()) return false;
  return audience === 'anyone' || (!audience && !req.user?.id);
}

/** The person's saved parts for the link, or null when they never saved (then nothing changes). */
async function savedLinkParts(userId) {
  const { readShareColumn } = require('./index');
  const share = readShare(await readShareColumn(userId));
  return share.saved ? share.parts : null;
}

function firstNameOf(body) {
  return String(body.name || body.user?.name || '').trim().split(/\s+/)[0] || 'them';
}

/**
 * What each review's writer did, from its job (as the page says it), for reviews whose writer is withheld. Read only
 * when the link shows reviews; a failed read leaves the plainer wording ("worked with").
 */
async function reviewRoles(userId, reviews, parts) {
  if (!reaches(parts, 'reviews', 'link') || !Array.isArray(reviews) || !reviews.length) return new Map();
  const gigIds = [...new Set(reviews.map((r) => r.gig_id).filter(Boolean))];
  if (!gigIds.length) return new Map();
  let data;
  try {
    const read = await supabaseAdmin.from('Gig').select('id, user_id, accepted_by').in('id', gigIds);
    if (read.error) return new Map();
    data = read.data;
  } catch (_) {
    return new Map();
  }
  return new Map((data || []).map((gig) => [gig.id,
    String(gig.accepted_by) === String(userId) ? 'hired' : (String(gig.user_id) === String(userId) ? 'worked_for' : null)]));
}

/**
 * GET /id/:id and /username/:username: the body sendPublicProfile built, as the main link allows it. `parts` from
 * savedLinkParts (non-null), `roles` from reviewRoles.
 */
function limitPublicProfile(body, parts, roles = new Map()) {
  const on = (part) => reaches(parts, part, 'link');
  const out = { ...body };
  if (!on('says')) out.bio = null;
  if (!on('prompts')) out.prompts = [];
  if (!on('city')) {
    out.city = null;
    out.state = null;
    if (out.residency && typeof out.residency === 'object') out.residency = { ...out.residency, city: null, state: null };
  }
  if (!on('work')) out.skills = [];
  if (!on('record_work')) {
    out.gigs_posted = 0;
    out.gigs_completed = 0;
  }
  if (!on('record_others')) out.contributions = null;
  if (!on('reviews')) {
    out.reviews = [];
    out.review_count = 0;
    out.average_rating = 0;
  } else if (Array.isArray(out.reviews) && out.reviews.length) {
    // Other people on a link appear by what they did (rule 4.5, founder item 9.4 "for now").
    const first = firstNameOf(body);
    out.reviews = out.reviews.map((review) => {
      const role = roles.get(review.gig_id);
      const did = role === 'hired' ? `hired ${first}` : (role === 'worked_for' ? `did a job for ${first}` : `worked with ${first}`);
      return {
        ...review, reviewer_id: null, reviewer_avatar: null, reviewer_username: null, reviewer_name: `Someone who ${did}`,
      };
    });
  }
  // Never on a link (SPEC 3, 4.6).
  out.email = null;
  out.phoneNumber = null;
  out.phone_number = null;
  out.showEmail = false;
  out.show_email = false;
  out.showPhone = false;
  out.show_phone = false;
  out.followers_count = 0;
  out.no_show_count = 0;
  out.late_cancel_count = 0;
  out.reliability_score = null;
  out.socialLinks = {};
  return out;
}

/** Legacy GET /:username's `user` object, as the main link allows it. */
function limitLegacyUser(user, parts) {
  const on = (part) => reaches(parts, part, 'link');
  const out = { ...user };
  if (!on('says')) out.bio = null;
  if (!on('prompts')) out.prompts = [];
  if (!on('city')) {
    out.city = null;
    out.state = null;
  }
  if (!on('record_others')) out.contributions = null;
  return out;
}

module.exports = { appliesTo, savedLinkParts, reviewRoles, limitPublicProfile, limitLegacyUser };
