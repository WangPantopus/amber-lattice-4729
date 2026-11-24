/**
 * Credits, signing and "Asked of you" (~/pantopus-profile-sources/CONTRACT.md P2.5; SPEC "Phase 2: Work", 2B), behind
 * PROFILE_TIES (the routes answer 404 PROFILE_TIES_OFF while it is off). One `ProfileTie` row is one credit.
 *
 * The owner of a piece names who was on it: a typed name stays Said; a person on Pantopus is asked, and only someone
 * they are connected to, or the other party of the paid job or the plan the piece started from. Anyone else, a block
 * either way, or a person who turned off "Let people name me on their work" gets the same answer (CREDIT_CANNOT_ASK),
 * so the answer tells nothing. Ten asks a day a person. The one asked gets one notification through today's
 * notifications and a row in "Asked of you"; they sign or say "Not me", and can take their name off at any time. Until
 * they sign, only the owner and they see the credit; a "Not me" stays only as the owner's "did not confirm".
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { namesOf } = require('./sources');
const { pieceOf, creditOf, roleOf, firstWord } = require('./compose');
const { profileTiesEnabled } = require('../../utils/featureFlags');

const ASKS_A_DAY = 10;
const CREDITS_A_PIECE = 20;
const ROLE_MAX = 40;
const NAME_MAX = 60;
const RELATIONS = ['with', 'led', 'learned_from', 'for'];
const ROLE_RELATIONS = ['worked', 'learned'];
const ROLES_A_PERSON = 20;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ASKABLE = ['business', 'curator'];

class TieRefusal extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const invalid = (message) => new TieRefusal(400, 'CREDIT_INVALID', message);
const cannotAsk = () => new TieRefusal(409, 'CREDIT_CANNOT_ASK', 'You can\'t ask this person. Add their name instead.');
const cannotAskBusiness = () => new TieRefusal(409, 'CREDIT_CANNOT_ASK', 'You can\'t ask this business. Type its name instead.');
const askLimit = () => new TieRefusal(409, 'CREDIT_ASK_LIMIT', 'You can ask up to ten people a day. Try again tomorrow.');
const notFound = () => new TieRefusal(404, 'TIE_NOT_FOUND', 'That isn\'t here.');

function plain(value, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? undefined : text;
}

async function rpc(name, args) {
  const { data, error } = await supabaseAdmin.rpc(name, args);
  if (error) throw error;
  return data || {};
}

// ---------- the owner: naming who was on a piece ----------

/** The credit as its owner reads it (compose.creditOf, owner view). */
function ownerCredit(row, partyShown, first) {
  return creditOf({ ...row, party_shown: partyShown }, { view: 'owner', first });
}

async function notifyAsk(row, facts) {
  try {
    const { createNotification } = require('../notificationService');
    const asker = namesOf([facts.asker]).get(String(row.user_id))?.name || 'Someone';
    await createNotification({
      userId: row.party_user_id,
      type: 'profile_credit_ask',
      title: `${asker} asked you to sign a piece`,
      body: [facts.piece.title, row.role].filter(Boolean).join(' · '),
      icon: '✍️',
      // The asked person's own page, on Work, where "Asked of you" is: /u/:id opens a profile on iPhone, Android and
      // the web.
      link: `/u/${row.party_user_id}?tab=work`,
      metadata: { tie_id: row.id, piece_id: row.piece_id, from_user_id: row.user_id },
      idempotencyKey: `profile-credit-ask:${row.id}:${Date.parse(row.asked_at)}`,
    });
  } catch (err) {
    logger.warn('Credit ask notification not sent', { tieId: row.id, error: err.message });
  }
}

/** POST /me/pieces/:id/credits: `{ user_id }` or `{ name }`, `role`, `relation`. 201 with the credit (owner view). */
async function addCredit(userId, pieceId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('Send who was on it: { "user_id" } or { "name" }, with what they did and how they were on it.');
  }
  const hasUser = body.user_id !== undefined && body.user_id !== null;
  const hasName = body.name !== undefined && body.name !== null;
  if (hasUser === hasName) throw invalid('Pick a person on Pantopus or type a name.');
  const role = plain(body.role, ROLE_MAX);
  if (role === undefined) throw invalid(`What they did is at most ${ROLE_MAX} characters.`);
  if (!RELATIONS.includes(body.relation)) throw invalid('How they were on it is with, led, learned_from or for.');
  if (!UUID_RE.test(String(pieceId))) throw new TieRefusal(404, 'PIECE_NOT_FOUND', 'That piece isn\'t here.');
  if (hasUser && (typeof body.user_id !== 'string' || !UUID_RE.test(body.user_id))) throw invalid('Pick a person on Pantopus.');
  const partyId = hasUser ? body.user_id.toLowerCase() : null;

  const facts = await rpc('profile_tie_ask_facts', { p_owner: userId, p_party: partyId, p_piece: pieceId });
  if (!facts.piece) throw new TieRefusal(404, 'PIECE_NOT_FOUND', 'That piece isn\'t here.');
  const first = firstWord(namesOf([facts.asker]).get(String(userId))?.name) || 'you';
  if (Number(facts.credits_on_piece) >= CREDITS_A_PIECE) throw invalid(`A piece can name up to ${CREDITS_A_PIECE} people.`);
  const now = new Date().toISOString();

  if (hasName) {
    const name = plain(body.name, NAME_MAX);
    if (!name) throw invalid(`A name is 1 to ${NAME_MAX} characters.`);
    const { data, error } = await supabaseAdmin.from('ProfileTie').insert({
      kind: 'credit', user_id: userId, party_name: name, piece_id: pieceId, role, relation: body.relation, status: 'said',
    }).select().single();
    if (error) throw error;
    return ownerCredit(data, null, first);
  }

  // A person: only a connection, or the other party of the job or plan the piece started from. Everything that stops
  // an ask reads the same.
  if (facts.piece.is_visible === false || facts.piece.is_draft === true) {
    throw invalid('Show this piece before you ask anyone to sign it.');
  }
  const party = facts.party;
  const allowed = party && partyId !== String(userId) && !NOT_ASKABLE.includes(party.account_type)
    && party.ties_enabled === true && facts.blocked !== true
    && (facts.connected === true || facts.job_party === true || facts.plan_party === true);
  if (!allowed) throw cannotAsk();
  const partyShown = namesOf([facts.party_person]).get(partyId) || {};
  const existing = facts.existing;
  if (existing && (existing.status === 'asked' || existing.status === 'signed')) {
    const { data, error } = await supabaseAdmin.from('ProfileTie').select('*').eq('id', existing.id).single();
    if (error) throw error;
    return ownerCredit(data, partyShown, first);
  }
  // Asked again only after the owner took the credit off themself; never after "Not me" or the person taking their
  // name off.
  if (existing && !(existing.status === 'removed' && String(existing.removed_by) === String(userId))) throw cannotAsk();
  if (Number(facts.asks_today) >= ASKS_A_DAY) throw askLimit();
  const fields = {
    role, relation: body.relation, status: 'asked', asked_by: userId, asked_at: now, signed_by: null, signed_at: null,
    removed_by: null, removed_at: null, show_on_party_work: true, name_on_links: false, updated_at: now,
  };
  let row;
  if (existing) {
    const { data, error } = await supabaseAdmin.from('ProfileTie').update(fields)
      .eq('id', existing.id).eq('user_id', userId).eq('status', 'removed').select().maybeSingle();
    if (error) throw error;
    if (!data) throw cannotAsk();
    row = data;
  } else {
    const { data, error } = await supabaseAdmin.from('ProfileTie')
      .insert({ kind: 'credit', user_id: userId, party_user_id: partyId, piece_id: pieceId, ...fields }).select().single();
    if (error?.code === '23505') {
      // Asked at the same moment from another device: answer with that ask.
      const again = await supabaseAdmin.from('ProfileTie').select('*').eq('piece_id', pieceId).eq('party_user_id', partyId)
        .eq('kind', 'credit').single();
      if (again.error) throw again.error;
      return ownerCredit(again.data, partyShown, first);
    }
    if (error) throw error;
    row = data;
  }
  await notifyAsk(row, facts);
  logger.info('Credit asked', { userId, tieId: row.id });
  return ownerCredit(row, partyShown, first);
}

/** DELETE /me/pieces/:id/credits/:creditId: the owner takes a credit off their piece. */
async function removeCredit(userId, pieceId, creditId) {
  if (!UUID_RE.test(String(pieceId)) || !UUID_RE.test(String(creditId))) throw notFound();
  const { data: tie, error } = await supabaseAdmin.from('ProfileTie').select('id, party_user_id, status')
    .eq('id', creditId).eq('user_id', userId).eq('piece_id', pieceId).eq('kind', 'credit').maybeSingle();
  if (error) throw error;
  if (!tie || tie.status === 'removed') throw notFound();
  // A typed name is the owner's own words: gone. A person's credit is kept as removed, so ten asks a day stay ten.
  const write = tie.party_user_id
    ? supabaseAdmin.from('ProfileTie').update({ status: 'removed', removed_by: userId, removed_at: new Date().toISOString(),
      updated_at: new Date().toISOString() }).eq('id', creditId).eq('user_id', userId)
    : supabaseAdmin.from('ProfileTie').delete().eq('id', creditId).eq('user_id', userId);
  const { error: writeError } = await write;
  if (writeError) throw writeError;
  return { id: creditId, removed: true };
}

// ---------- the one asked ----------

/** GET /me/asks: "Asked of you", newest first. None while the person's own switch is off. */
async function listAsks(userId) {
  const data = await rpc('profile_tie_asks', { p_user: userId });
  if (data.ties_enabled === false) return { asks: [] };
  const asks = data.asks || [];
  const names = namesOf(asks.map((a) => a.owner));
  return {
    asks: asks.map((a) => {
      const from = names.get(String(a.owner_id)) || {};
      let piece = null;
      if (a.piece) {
        const shown = pieceOf(a.piece, firstWord(from.name) || 'them', false).piece;
        piece = { id: shown.id, title: shown.title, kind: shown.kind, when: shown.when, cover_url: shown.cover_url };
      }
      const ask = {
        id: a.id,
        kind: a.kind,
        from: { name: from.name || null, user_id: a.owner_id, username: from.username || null, portrait_url: from.avatar || null },
        piece,
        role: String(a.role || '').trim() || null,
        relation: a.relation || null,
        asked_at: a.asked_at,
      };
      // A role at a business they own: which business, and when.
      if (a.kind === 'role' && a.business) {
        Object.assign(ask, {
          business: { name: a.business.name || null, user_id: a.business.id, username: a.business.username || null,
            picture_url: a.business.picture_url || null },
          when: yearsOf(a.from_month, a.to_month),
        });
      }
      return ask;
    }),
  };
}

async function answerAsk(userId, askId, fields) {
  if (!UUID_RE.test(String(askId))) throw notFound();
  // Only an ask still shown in "Asked of you": not from someone with a block either way, not on a hidden piece, not
  // while the person's own switch is off.
  const data = await rpc('profile_tie_asks', { p_user: userId });
  if (data.ties_enabled === false || !(data.asks || []).some((a) => String(a.id) === String(askId))) throw notFound();
  // The list just proved it is theirs: a credit on their name, or a role at a business they own.
  const { data: row, error } = await supabaseAdmin.from('ProfileTie')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', askId).eq('status', 'asked').select('id, status').maybeSingle();
  if (error) throw error;
  if (!row) throw notFound();
  return row;
}

/** POST /me/asks/:id/sign `{ show_on_my_work = true, show_name_on_links = false }`. */
async function signAsk(userId, askId, body = {}) {
  const choices = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  for (const key of ['show_on_my_work', 'show_name_on_links']) {
    if (choices[key] !== undefined && typeof choices[key] !== 'boolean') throw invalid('Each choice is on or off.');
  }
  const row = await answerAsk(userId, askId, {
    status: 'signed', signed_by: userId, signed_at: new Date().toISOString(),
    show_on_party_work: choices.show_on_my_work !== false, name_on_links: choices.show_name_on_links === true,
  });
  logger.info('Credit signed', { userId, tieId: row.id });
  return { id: row.id, status: 'signed' };
}

/** POST /me/asks/:id/decline ("Not me"): the credit is gone for everyone but the owner. */
async function declineAsk(userId, askId) {
  const row = await answerAsk(userId, askId, { status: 'declined' });
  return { id: row.id, status: 'declined' };
}

// A signed tie this person signed: their own credit, or a role they signed for a business they own. Else 404.
async function signedBy(userId, tieId) {
  if (!UUID_RE.test(String(tieId))) throw notFound();
  const { data, error } = await supabaseAdmin.rpc('profile_tie_signer', { p_user: userId, p_tie: tieId });
  if (error) throw error;
  if (!data) throw notFound();
  return data;
}

/**
 * DELETE /me/ties/:id: the one who signed takes their name off (or a business's owner its signature); it leaves the
 * piece, their Work and the circle at once.
 */
async function removeTie(userId, tieId) {
  await signedBy(userId, tieId);
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from('ProfileTie')
    .update({ status: 'removed', removed_by: userId, removed_at: now, updated_at: now })
    .eq('id', tieId).eq('status', 'signed').select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw notFound();
  return { id: tieId, removed: true };
}

/** PATCH /me/ties/:id `{ show_on_my_work?, show_name_on_links? }`: the signer changes their two choices later. */
async function changeTie(userId, tieId, body) {
  const choices = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const keys = Object.keys(choices);
  if (!keys.length || keys.some((k) => !['show_on_my_work', 'show_name_on_links'].includes(k))
    || keys.some((k) => typeof choices[k] !== 'boolean')) {
    throw invalid('Send show_on_my_work or show_name_on_links, each on or off.');
  }
  const tie = await signedBy(userId, tieId);
  const fields = { updated_at: new Date().toISOString() };
  if (choices.show_on_my_work !== undefined) fields.show_on_party_work = choices.show_on_my_work;
  if (choices.show_name_on_links !== undefined) fields.name_on_links = choices.show_name_on_links;
  const { data, error } = await supabaseAdmin.from('ProfileTie').update(fields).eq('id', tieId).eq('status', 'signed')
    .select('id, show_on_party_work, name_on_links').maybeSingle();
  if (error) throw error;
  if (!data) throw notFound();
  logger.info('Signature choices changed', { userId, tieId, kind: tie.kind });
  return { id: data.id, show_on_my_work: data.show_on_party_work, show_name_on_links: data.name_on_links };
}

// ---------- who hired them: suggested for "Who was on it" ----------

/**
 * For these completed paid jobs of the owner's: the person who hired them, when they could be asked now (the same test
 * as addCredit: a person, not a business; their switch on; no block either way; not asked, signed, "Not me" or taken
 * off before). Owner's reads only. Map gig id → [suggestion]. A plan suggests nobody (too many joined).
 */
async function suggestionsFor(userId, gigIds) {
  const ids = [...new Set((gigIds || []).filter(Boolean).map(String))];
  if (!ids.length || !profileTiesEnabled()) return new Map();
  const { data, error } = await supabaseAdmin.rpc('profile_tie_suggestions', { p_owner: userId, p_gig_ids: ids });
  if (error) throw error;
  const list = Array.isArray(data) ? data : [];
  const names = namesOf(list.map((x) => x.person));
  const out = new Map();
  for (const x of list) {
    const askable = String(x.poster_id) !== String(userId) && !NOT_ASKABLE.includes(x.account_type)
      && x.ties_enabled === true && x.blocked !== true
      && (!x.existing || (x.existing.status === 'removed' && String(x.existing.removed_by) === String(userId)));
    if (!askable) continue;
    const shown = names.get(String(x.poster_id)) || {};
    out.set(String(x.gig_id), [{ user_id: x.poster_id, name: shown.name || null, username: shown.username || null,
      portrait_url: shown.avatar || null, relation: 'for', role: null, why: 'who hired you' }]);
  }
  return out;
}

// ---------- roles and schools (CONTRACT P2.6) ----------

function yearsOf(from, to) {
  const fy = from ? String(from).slice(0, 4) : null;
  const ty = to ? String(to).slice(0, 4) : null;
  if (!fy) return null;
  if (!ty) return `${fy} to now`;
  return fy === ty ? fy : `${fy} to ${ty}`;
}

function roleMonth(value, label, { allowNull }) {
  if (value === null || value === undefined) {
    if (allowNull) return null;
    throw invalid(`Give the ${label} month as YYYY-MM.`);
  }
  if (typeof value !== 'string' || !MONTH_RE.test(value)) throw invalid(`Give the ${label} month as YYYY-MM.`);
  return `${value}-01`;
}

function roleFields(body, current = null) {
  const out = {};
  if (!current || body.title !== undefined) {
    const title = plain(body.title, ROLE_MAX);
    if (!title) throw invalid(`A role or school is 1 to ${ROLE_MAX} characters.`);
    out.role = title;
  }
  if (!current || body.relation !== undefined) {
    if (!ROLE_RELATIONS.includes(body.relation)) throw invalid('Say whether you worked there or learned there: worked or learned.');
    out.relation = body.relation;
  }
  if (!current || body.from !== undefined) out.from_month = roleMonth(body.from, 'first', { allowNull: false });
  if (!current || body.to !== undefined) out.to_month = roleMonth(body.to, 'last', { allowNull: true });
  const from = out.from_month !== undefined ? out.from_month : current?.from_month;
  const to = out.to_month !== undefined ? out.to_month : current?.to_month;
  const thisMonth = `${new Date().toISOString().slice(0, 7)}-01`;
  if (from && String(from).slice(0, 10) > thisMonth) throw invalid('A role starts this month or earlier.');
  if (to && from && String(to).slice(0, 10) < String(from).slice(0, 10)) throw invalid('A role ends after it starts.');
  if (to && String(to).slice(0, 10) > thisMonth) throw invalid('A role ends this month or earlier, or leave the end empty for now.');
  return out;
}

async function roleFacts(userId, businessId) {
  return rpc('profile_tie_role_facts', { p_owner: userId, p_business: businessId });
}

function businessAskable(facts) {
  return Boolean(facts.business) && facts.business.ties_enabled === true && (facts.owners || []).length > 0
    && facts.blocked !== true && facts.owns_it !== true && facts.refused_before !== true;
}

async function notifyRoleAsk(row, facts) {
  const { createNotification } = require('../notificationService');
  const asker = namesOf([facts.asker]).get(String(row.user_id))?.name || 'Someone';
  await Promise.all((facts.owners || []).map((ownerId) => createNotification({
    userId: ownerId,
    type: 'profile_role_ask',
    title: `${asker} asked ${facts.business.name} to confirm a role`,
    body: [row.role, yearsOf(row.from_month, row.to_month)].filter(Boolean).join(', '),
    icon: '✍️',
    link: `/u/${ownerId}?tab=work`,
    metadata: { tie_id: row.id, business_user_id: row.party_user_id, from_user_id: row.user_id },
    idempotencyKey: `profile-role-ask:${row.id}:${ownerId}:${Date.parse(row.asked_at)}`,
  }).catch((err) => logger.warn('Role ask notification not sent', { tieId: row.id, error: err.message }))));
}

function ownerRole(row, facts) {
  const first = firstWord(namesOf([facts.asker]).get(String(row.user_id))?.name) || 'you';
  const business = row.party_user_id && facts.business ? { id: facts.business.id, name: facts.business.name,
    username: facts.business.username, picture_url: facts.business.picture_url } : null;
  return roleOf({ ...row, party: business }, { view: 'owner', first });
}

/**
 * POST /me/roles `{ title, where: { business_user_id } | { name }, relation: worked | learned, from, to | null }`.
 * A typed place stays Said. A business on Pantopus is asked: each of its active owners gets the ask and one signs for
 * it; until then the role is the person's own words and the business is named to nobody but them.
 */
async function addRole(userId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Send a title, where, worked or learned, and the months.');
  const where = body.where && typeof body.where === 'object' && !Array.isArray(body.where) ? body.where : {};
  const hasBusiness = where.business_user_id !== undefined && where.business_user_id !== null;
  const hasName = where.name !== undefined && where.name !== null;
  if (hasBusiness === hasName) throw invalid('Pick a business on Pantopus or type the place\'s name.');
  const fields = roleFields(body);
  if (hasBusiness && (typeof where.business_user_id !== 'string' || !UUID_RE.test(where.business_user_id))) {
    throw invalid('Pick a business on Pantopus.');
  }
  const businessId = hasBusiness ? where.business_user_id.toLowerCase() : null;
  const facts = await roleFacts(userId, businessId);
  if (Number(facts.roles) >= ROLES_A_PERSON) throw invalid(`You can list up to ${ROLES_A_PERSON} roles and schools.`);
  if (hasName) {
    const name = plain(where.name, NAME_MAX);
    if (!name) throw invalid(`A place's name is 1 to ${NAME_MAX} characters.`);
    const { data, error } = await supabaseAdmin.from('ProfileTie')
      .insert({ kind: 'role', user_id: userId, party_name: name, ...fields, status: 'said' }).select().single();
    if (error) throw error;
    return ownerRole(data, facts);
  }
  if (!businessAskable(facts)) throw cannotAskBusiness();
  if (Number(facts.asks_today) >= ASKS_A_DAY) throw askLimit();
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from('ProfileTie').insert({
    kind: 'role', user_id: userId, party_user_id: businessId, ...fields, status: 'asked', asked_by: userId, asked_at: now,
  }).select().single();
  if (error) throw error;
  await notifyRoleAsk(data, facts);
  logger.info('Role asked', { userId, tieId: data.id });
  return ownerRole(data, facts);
}

async function ownRole(userId, id) {
  if (!UUID_RE.test(String(id))) throw notFound();
  const { data, error } = await supabaseAdmin.from('ProfileTie').select('*')
    .eq('id', id).eq('user_id', userId).eq('kind', 'role').neq('status', 'removed').maybeSingle();
  if (error) throw error;
  if (!data) throw notFound();
  return data;
}

/**
 * PATCH /me/roles/:id: title, relation, from, to (the place stays; remove and add to change it). A signed role whose
 * words change goes back to its business as a new ask (counted), since the business signed the old words.
 */
async function updateRole(userId, id, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Send the fields to change.');
  if (body.where !== undefined) throw invalid('To change the place, remove this one and add it again.');
  const row = await ownRole(userId, id);
  const fields = roleFields(body, row);
  const facts = await roleFacts(userId, row.party_user_id);
  // Months compare as dates (the database answers YYYY-MM-DD).
  const norm = (k, v) => (v === null || v === undefined ? '' : (k.endsWith('_month') ? String(v).slice(0, 10) : String(v)));
  const changed = Object.keys(fields).some((k) => norm(k, fields[k]) !== norm(k, row[k]));
  let reask = false;
  if (row.status === 'signed' && changed) {
    if (!businessAskable(facts)) throw cannotAskBusiness();
    if (Number(facts.asks_today) >= ASKS_A_DAY) throw askLimit();
    const now = new Date().toISOString();
    Object.assign(fields, { status: 'asked', asked_by: userId, asked_at: now, signed_by: null, signed_at: null, name_on_links: false });
    reask = true;
  }
  const { data, error } = await supabaseAdmin.from('ProfileTie').update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId).select().single();
  if (error) throw error;
  if (reask) await notifyRoleAsk(data, facts);
  return ownerRole(data, facts);
}

/** DELETE /me/roles/:id. A typed place is gone; a business's role is kept as removed, so ten asks a day stay ten. */
async function removeRole(userId, id) {
  const row = await ownRole(userId, id);
  const now = new Date().toISOString();
  const write = row.party_user_id
    ? supabaseAdmin.from('ProfileTie').update({ status: 'removed', removed_by: userId, removed_at: now, updated_at: now }).eq('id', id).eq('user_id', userId)
    : supabaseAdmin.from('ProfileTie').delete().eq('id', id).eq('user_id', userId);
  const { error } = await write;
  if (error) throw error;
  return { id, removed: true };
}

module.exports = {
  TieRefusal, addCredit, removeCredit, listAsks, signAsk, declineAsk, removeTie, changeTie, suggestionsFor,
  addRole, updateRole, removeRole, ASKS_A_DAY,
};
