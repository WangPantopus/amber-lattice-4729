/**
 * Doors and "Leave your card" (~/pantopus-profile-sources/CONTRACT.md P3.3; SPEC "Phase 3", 3B). No switch of their own.
 *
 * Doors are the person's own setting (`User.profile_doors`: at most five `{ key, end, open_to }`). A door builds
 * nothing new: hire, ask, borrow and invite open today's conversation with the person, the door's sentence in the
 * composer, unsent (any signed-in person not blocked may open a direct chat today: routes/chats.js /direct); "Send a
 * card" opens today's card flow, only while the card feature is on. A card left is a `ProfileTie` row of kind `card`
 * (`user_id` the person, `party_user_id` the visitor, `note` up to 120 characters): status `asked` new, `signed` written
 * back, `removed` removed by the person. Cards are the person's alone: never shown or counted for anyone else.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { namesOf } = require('./sources');
const { readShare } = require('./parts');
const { firstWord, localDate, PACIFIC } = require('./compose');

const DOORS_MAX = 5;
const END_MAX = 60;
const NOTE_MAX = 120;
const CARDS_A_DAY = 10;
const KEYS = ['hire', 'ask', 'borrow', 'invite', 'send_card'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_PLAIN = [/(https?:\/\/|www\.)/i, /\b[a-z0-9-]+\.(com|net|org|io|co|app|dev|us|me)\b/i, /(^|\s)@\w/, /\S+@\S+\.\S+/, /(\+?\d[\d\s().-]{8,}\d)/];

class DoorsRefusal extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const invalid = (message) => new DoorsRefusal(400, 'DOORS_INVALID', message);
const notFound = () => new DoorsRefusal(404, 'CARD_NOT_FOUND', 'That card isn\'t here.');

/** A door's sentence: "Hire Maria for carpentry and repairs", "Ask about …", "Borrow …", "Invite to …", "Send a card". */
function doorText(door, first) {
  const end = String(door.end || '').trim();
  return { hire: `Hire ${first} for ${end}`, ask: `Ask about ${end}`, borrow: `Borrow ${end}`, invite: `Invite to ${end}`,
    send_card: 'Send a card' }[door.key];
}

function storedDoors(stored) {
  return (Array.isArray(stored) ? stored : []).filter((d) => d && KEYS.includes(d.key)).slice(0, DOORS_MAX)
    .map((d) => ({ key: d.key, end: d.key === 'send_card' ? null : String(d.end || ''), open_to: d.open_to === 'connections' ? 'connections' : 'anyone' }));
}

async function readUser(userId) {
  const { data, error } = await supabaseAdmin.from('User').select('profile_doors, name, first_name').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data || {};
}

/** The person's doors as their own editor reads them. */
function doorsForOwner(stored, first) {
  return storedDoors(stored).map((d) => ({ key: d.key, end: d.end, text: doorText(d, first), open_to: d.open_to,
    note: d.open_to === 'connections' ? 'Open to connections' : null }));
}

async function getDoors(userId) {
  const user = await readUser(userId);
  return { doors: doorsForOwner(user.profile_doors, firstWord(user.first_name || user.name) || 'you') };
}

/** PUT /me/doors `{ doors: [{ key, end, open_to }] }`: the whole list, in order. */
async function putDoors(userId, body) {
  const list = body && typeof body === 'object' && !Array.isArray(body) ? body.doors : undefined;
  if (!Array.isArray(list) || list.length > DOORS_MAX) throw invalid(`Send up to ${DOORS_MAX} doors as { "doors": [ { "key", "end", "open_to" } ] }.`);
  const seen = new Set();
  const value = list.map((d) => {
    const door = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
    if (!KEYS.includes(door.key) || seen.has(door.key)) throw invalid('Each door is hire, ask, borrow, invite or send_card, once.');
    seen.add(door.key);
    const openTo = door.open_to === undefined ? 'anyone' : door.open_to;
    if (!['anyone', 'connections'].includes(openTo)) throw invalid('A door is open to anyone on Pantopus or to connections.');
    if (door.key === 'send_card') return { key: door.key, end: null, open_to: openTo };
    const end = typeof door.end === 'string' ? door.end.replace(/\s+/g, ' ').trim() : '';
    if (!end || end.length > END_MAX) throw invalid(`Finish each door in 1 to ${END_MAX} characters.`);
    if (NOT_PLAIN.some((re) => re.test(end))) throw invalid('A door is plain words: no links, handles or phone numbers.');
    return { key: door.key, end, open_to: openTo };
  });
  const { error } = await supabaseAdmin.from('User').update({ profile_doors: value.length ? value : null }).eq('id', userId);
  if (error) throw error;
  return getDoors(userId);
}

// ---------- cards ----------

async function cardFacts(visitorId, personId) {
  const { data, error } = await supabaseAdmin.rpc('profile_card_facts', { p_visitor: visitorId, p_person: personId });
  if (error) throw error;
  return data || {};
}

const dayWords = (at) => new Date(at).toLocaleDateString('en-US', { timeZone: PACIFIC, month: 'long', day: 'numeric' });

/** POST …/:username/card `{ text }`: one card a visitor a person every 30 days, ten a day. */
async function leaveCard(visitorId, personId, body) {
  const f = await cardFacts(visitorId, personId);
  const first = firstWord(namesOf([f.person_named]).get(String(personId))?.name) || 'them';
  const person = f.person;
  // Everyone who may not leave one gets the same answer: themself, a business or curator, a block either way, the
  // person's switch off.
  if (!person || String(visitorId) === String(personId) || ['business', 'curator'].includes(person.account_type)
    || f.blocked === true || !readShare(person.share || null).cards_enabled) {
    throw new DoorsRefusal(404, 'CARD_CANNOT_LEAVE', `You can't leave ${first} a card.`);
  }
  if (f.last_at) throw new DoorsRefusal(409, 'CARD_TOO_SOON', `You left ${first} a card on ${dayWords(f.last_at)}.`);
  if (Number(f.today) >= CARDS_A_DAY) throw new DoorsRefusal(409, 'CARD_DAY_LIMIT', 'You can leave ten cards a day. Try again tomorrow.');
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  let note = null;
  if (b.text !== undefined && b.text !== null) {
    note = typeof b.text === 'string' ? b.text.replace(/\s+/g, ' ').trim() : '';
    if (note.length > NOTE_MAX) throw invalid(`A few words: at most ${NOTE_MAX} characters.`);
    if (note && NOT_PLAIN.some((re) => re.test(note))) throw invalid('A card is plain words: no links, handles or phone numbers.');
    if (!note) note = null;
  }
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from('ProfileTie').insert({
    kind: 'card', user_id: personId, party_user_id: visitorId, note, status: 'asked', asked_by: visitorId, asked_at: now,
  }).select('id, user_id, party_user_id, created_at').single();
  if (error) throw error;
  try {
    const { createNotification } = require('../notificationService');
    const visitor = namesOf([f.visitor]).get(String(visitorId))?.name || 'Someone';
    await createNotification({
      userId: personId, type: 'profile_card_left', title: `${visitor} left you their card`, body: note || null, icon: '👋',
      link: `/u/${personId}?tab=person`, metadata: { tie_id: data.id, from_user_id: visitorId }, idempotencyKey: `profile-card:${data.id}`,
    });
  } catch (err) {
    logger.warn('Card notification not sent', { tieId: data.id, error: err.message });
  }
  logger.info('Card left', { visitorId, tieId: data.id });
  return { left: true, left_at: localDate(new Date(data.created_at), PACIFIC) };
}

/**
 * The person's cards (rows.owner_only_cards, a block either way left out), as their own page and GET /me/cards read
 * them. `seenAs`: account id → the visitor's strongest line as their page shows it to the person (GET /me/cards only).
 */
function cardsFrom(rows, seenAs = new Map()) {
  const list = (rows?.owner_only_cards || []).filter((c) => c.party_blocked !== true);
  const names = namesOf(list.map((c) => c.party));
  return list.map((c) => {
    const n = names.get(String(c.party_user_id)) || {};
    return { id: c.id, from: { name: n.name || null, user_id: c.party_user_id, username: n.username || null, portrait_url: n.avatar || null,
      seen_as: seenAs.get(String(c.party_user_id)) || null }, text: c.note || null, left_at: localDate(new Date(c.created_at), PACIFIC),
      written_back: c.status === 'signed' };
  });
}

/** Each visitor's strongest key line as their own page shows it to the person: one read for them all. */
async function seenAsFor(personId, visitorIds) {
  const ids = [...new Set(visitorIds.map(String))];
  if (!ids.length) return new Map();
  const { readRows, sourcesFrom } = require('./sources');
  const { buildRecord } = require('./compose');
  const { readShare: share, reaches } = require('./parts');
  const byId = await readRows(ids, personId, { oldestFirst: true, rowLimit: 200 });
  const out = new Map();
  for (const [id, rows] of byId) {
    const { parts } = share(rows.share);
    const view = rows.shares_home === true ? 'household' : (rows.relationship?.status === 'accepted' ? 'connection' : 'member');
    const sources = await sourcesFrom(id, rows, { pinned: false });
    const record = buildRecord({ firstName: 'them', userData: { id }, view, parts }, sources, { now: new Date() });
    const key = record.entries.filter((e) => e.place === 'key' && e.parts.every((p) => reaches(parts, p, view)))
      .sort((a, b) => a.rank - b.rank)[0];
    const ln = key ? (key.make ? key.make(false) : key.line) : null;
    if (ln?.text) out.set(String(id), ln.text);
  }
  return out;
}

/** GET /me/cards. */
async function listCards(personId) {
  const { readRows } = require('./sources');
  const rows = (await readRows([personId], null)).get(String(personId));
  const plain = cardsFrom(rows);
  return { cards: cardsFrom(rows, await seenAsFor(personId, plain.map((c) => c.from.user_id))) };
}

/**
 * POST /me/cards/:id/write-back: the person's one reply. The card is marked answered and the answer is a link to
 * today's conversation with the visitor (today's messages already allow it); nothing in Messages changes.
 */
async function writeBack(personId, id) {
  if (!UUID_RE.test(String(id))) throw notFound();
  const { data: card, error } = await supabaseAdmin.from('ProfileTie').select('id, party_user_id, status')
    .eq('id', id).eq('kind', 'card').eq('user_id', personId).in('status', ['asked', 'signed']).maybeSingle();
  if (error) throw error;
  if (!card) throw notFound();
  if (card.status === 'signed') throw new DoorsRefusal(409, 'CARD_WRITTEN_BACK', 'You wrote back to this card already.');
  const now = new Date().toISOString();
  const { error: upError } = await supabaseAdmin.from('ProfileTie').update({ status: 'signed', signed_by: personId, signed_at: now, updated_at: now })
    .eq('id', id).eq('status', 'asked');
  if (upError) throw upError;
  return { id, written_back: true, link: { kind: 'message', user_id: card.party_user_id, text: null } };
}

/** DELETE /me/cards/:id. */
async function removeCard(personId, id) {
  if (!UUID_RE.test(String(id))) throw notFound();
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from('ProfileTie').update({ status: 'removed', removed_by: personId, removed_at: now, updated_at: now })
    .eq('id', id).eq('kind', 'card').eq('user_id', personId).in('status', ['asked', 'signed']).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw notFound();
  return { id, removed: true };
}

module.exports = {
  DoorsRefusal, KEYS, doorText, storedDoors, doorsForOwner, getDoors, putDoors, leaveCard, cardsFrom, listCards, writeBack, removeCard,
};
