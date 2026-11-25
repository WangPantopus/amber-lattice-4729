/**
 * Known for (~/pantopus-profile-sources/CONTRACT.md P3.2; SPEC "Phase 3", 3A): on; PROFILE_KNOWN_FOR=0 is its emergency
 * off. A line is a
 * `ProfileTie` row of kind `known_for`: `user_id` the person it is about, `party_user_id` its writer, `note` the
 * words, `relation` what the writer did with the person, `from_month` when, `piece_id` a piece it is tied to.
 * Status: `asked` waiting for the person, `signed` shown, `declined` kept hidden, `removed` taken back by its writer.
 *
 * Only someone who shares a record with the person may write (profile_known_for_facts); everyone else, a block
 * either way and the person's switch off get the same single answer. One live line a writer a person, twelve a
 * Pacific calendar year counted when written (a line taken back still counts), three a day. The person gets one
 * notification; the writer is never told whether a line is shown.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { namesOf } = require('./sources');
const { readShare } = require('./parts');
const { knownForLineOf, monthOf, monthLabel, firstWord, KNOWN_FOR_YEAR, knownForWaiting } = require('./compose');

const WORDS_MAX = 120;
const A_DAY = 3;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Plain words: no links, domains, handles, email addresses or phone numbers, and never a street address.
const NOT_PLAIN = [
  /(https?:\/\/|www\.)/i, /\b[a-z0-9-]+\.(com|net|org|io|co|app|dev|us|me)\b/i, /(^|\s)@\w/, /\S+@\S+\.\S+/,
  /(\+?\d[\d\s().-]{8,}\d)/,
  /\b\d{1,6}\s+([A-Z0-9][\w'-]*\s+){0,3}(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|ter|terrace|hwy|highway)\b/i,
];

class KnownForRefusal extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const notFound = () => new KnownForRefusal(404, 'KNOWN_FOR_NOT_FOUND', 'That line isn\'t here.');
// One answer for everyone who may not write, with no name in it: a block either way must give nothing away.
const cannotWrite = () => new KnownForRefusal(404, 'KNOWN_FOR_CANNOT_WRITE', 'You can\'t write a line here.');
// After taking a line back, a writer waits 30 days before writing about the same person again (compose.knownForWaiting).
const waiting = (f) => knownForWaiting(f.taken_back_at);

async function facts(writerId, personId) {
  const { data, error } = await supabaseAdmin.rpc('profile_known_for_facts', { p_writer: writerId, p_person: personId });
  if (error) throw error;
  return data || {};
}

const monthWords = (at) => monthLabel(monthOf(at));

/** The records the two share: each a reason the writer may write, and what a line tied to it says they did. */
function reasonsFrom(f, first) {
  const out = [];
  for (const g of f.gigs || []) {
    out.push({ kind: 'gig', id: g.id, relation: g.relation, at: g.at,
      text: g.relation === 'hired' ? `You can, because you hired ${first} for a paid job in ${monthWords(g.at)}.`
        : `You can, because you did a paid job for ${first} in ${monthWords(g.at)}.` });
  }
  for (const p of f.plans || []) {
    const title = p.title ? ` ${p.title}` : '';
    out.push({ kind: 'plan', id: p.id, relation: p.relation, at: p.at, title: p.title || null,
      text: p.relation === 'went_to_plan' ? `You can, because you went to ${first}'s plan${title} in ${monthWords(p.at)}.`
        : `You can, because ${first} went to your plan${title} in ${monthWords(p.at)}.` });
  }
  for (const t of f.trains || []) {
    out.push({ kind: 'train', id: t.id, relation: 'train', at: t.at, text: `You can, because you both helped on a Support Train in ${monthWords(t.at)}.` });
  }
  for (const c of f.credits || []) {
    // A credit's relation is its owner's word about the other: turn it round when the line is about that owner.
    const rel = c.on_person_piece ? ({ led: 'learned', learned_from: 'taught', for: 'hired' }[c.relation] || 'with')
      : ({ led: 'taught', learned_from: 'learned', for: 'did_job_for' }[c.relation] || 'with');
    out.push({ kind: 'piece', id: c.id, relation: rel, at: c.at, piece_id: c.id,
      text: `You can, because you both signed ${c.on_person_piece ? `${first}'s piece` : 'your piece'} ${c.title}.` });
  }
  for (const r of f.roles || []) {
    const rel = r.person_role ? (r.relation === 'learned' ? 'taught' : 'with') : (r.relation === 'learned' ? 'learned' : 'with');
    out.push({ kind: 'role', id: r.id, relation: rel, at: r.at,
      text: `You can, because your business signed ${r.person_role ? `${first}'s role` : 'your role'} ${r.title}.` });
  }
  return out;
}

// Everyone who may not write gets the same answer: a block either way, the person's switch off, a business or a
// curator, themself (and, by the caller, no shared record).
function mayWrite(f, writerId, personId) {
  const person = f.person;
  if (!person || String(writerId) === String(personId) || ['business', 'curator'].includes(person.account_type)) return false;
  return f.blocked !== true && readShare(person.share || null).known_for_enabled;
}

const firstOf = (f, personId) => firstWord(namesOf([f.person_named]).get(String(personId))?.name) || 'them';

/** GET …/:username/known-for/write: why the writer may write, and how many lines they have left this year. */
async function writeSheet(writerId, personId) {
  const f = await facts(writerId, personId);
  const first = firstOf(f, personId);
  const reasons = mayWrite(f, writerId, personId) ? reasonsFrom(f, first) : [];
  if (!reasons.length || f.live || waiting(f)) throw cannotWrite();
  return {
    reasons: reasons.map(({ kind, id, text }) => ({ kind, id, text })),
    left_this_year: Math.max(0, KNOWN_FOR_YEAR - Number(f.lines_this_year || 0)), of: KNOWN_FOR_YEAR, max_chars: WORDS_MAX,
  };
}

async function notifyPerson(row, f) {
  try {
    const { createNotification } = require('../notificationService');
    const writer = namesOf([f.writer]).get(String(row.party_user_id))?.name || 'Someone';
    await createNotification({
      userId: row.user_id, type: 'profile_known_for_line', title: `${writer} wrote a line about you`,
      body: 'It shows on your page only if you choose Show it.', icon: '✍️', link: `/u/${row.user_id}?tab=person`,
      metadata: { tie_id: row.id, from_user_id: row.party_user_id }, idempotencyKey: `profile-known-for:${row.id}`,
    });
  } catch (err) {
    logger.warn('Known-for notification not sent', { tieId: row.id, error: err.message });
  }
}

/** POST …/:username/known-for `{ text, reason: { kind, id }, show_name_on_links }`: 201 with the writer's view. */
async function writeLine(writerId, personId, body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const f = await facts(writerId, personId);
  const first = firstOf(f, personId);
  const reasons = mayWrite(f, writerId, personId) ? reasonsFrom(f, first) : [];
  if (!reasons.length || waiting(f)) throw cannotWrite();
  if (f.live) throw new KnownForRefusal(409, 'KNOWN_FOR_ONE_LINE', `You already have a line about ${first}. Take it back to write another.`);
  const text = typeof b.text === 'string' ? b.text.replace(/\s+/g, ' ').trim() : '';
  if (!text || text.length > WORDS_MAX) throw new KnownForRefusal(400, 'KNOWN_FOR_INVALID', `Write one sentence of 1 to ${WORDS_MAX} characters.`);
  if (NOT_PLAIN.some((re) => re.test(text))) {
    throw new KnownForRefusal(400, 'KNOWN_FOR_INVALID', 'A line is plain words: no links, handles, phone numbers or addresses.');
  }
  if (b.show_name_on_links !== undefined && typeof b.show_name_on_links !== 'boolean') {
    throw new KnownForRefusal(400, 'KNOWN_FOR_INVALID', 'Showing your name on pages opened by a link is on or off.');
  }
  const pick = b.reason && typeof b.reason === 'object'
    ? reasons.find((r) => r.kind === b.reason.kind && String(r.id) === String(b.reason.id)) : null;
  if (!pick) throw new KnownForRefusal(400, 'KNOWN_FOR_INVALID', 'Pick what you did together.');
  if (Number(f.lines_this_year) >= KNOWN_FOR_YEAR) {
    throw new KnownForRefusal(409, 'KNOWN_FOR_YEAR_LIMIT', `You've written your ${KNOWN_FOR_YEAR} lines this year.`);
  }
  if (Number(f.lines_today) >= A_DAY) throw new KnownForRefusal(409, 'KNOWN_FOR_DAY_LIMIT', 'You can write three lines a day. Try again tomorrow.');
  const month = monthOf(pick.at);
  const { data, error } = await supabaseAdmin.from('ProfileTie').insert({
    kind: 'known_for', user_id: personId, party_user_id: writerId, note: text, relation: pick.relation,
    from_month: month ? `${month}-01` : null, piece_id: pick.piece_id || null, status: 'asked', asked_by: writerId,
    asked_at: new Date().toISOString(), name_on_links: b.show_name_on_links === true,
  }).select().single();
  if (error) throw error;
  await notifyPerson(data, f);
  logger.info('Known-for line written', { writerId, tieId: data.id });
  return knownForLineOf({ ...data, party_shown: namesOf([f.writer]).get(String(writerId)) || {}, plan_title: pick.title || null },
    { view: 'member', first, viewerId: writerId });
}

/** DELETE /me/lines-written/:id: the writer takes their line back; it leaves everywhere at once (it still counts). */
async function takeBack(writerId, id) {
  if (!UUID_RE.test(String(id))) throw notFound();
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from('ProfileTie')
    .update({ status: 'removed', removed_by: writerId, removed_at: now, updated_at: now })
    .eq('id', id).eq('kind', 'known_for').eq('party_user_id', writerId).in('status', ['asked', 'signed', 'declined'])
    .select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw notFound();
  return { id, removed: true };
}

const STATUS_WORD = { asked: 'waiting', signed: 'shown', declined: 'hidden' };

/** GET /me/known-for: every line about the person, with its state, and the ones on top (switch off or not). */
async function listMine(personId) {
  const { readRows, knownForFrom } = require('./sources');
  const rows = (await readRows([personId], null)).get(String(personId));
  if (!rows) throw new Error('Profile rows missing');
  const first = firstWord(rows.local_profile?.display_name) || 'you';
  const onTop = readShare(rows.share).known_for_top.map(String);
  const all = knownForFrom({ ...rows, share: { ...(rows.share || {}), known_for_enabled: true } }, { owner: true });
  return {
    lines: all.map((t) => ({ ...knownForLineOf(t, { view: 'owner', first, onTop }), status: STATUS_WORD[t.status] })),
    on_top: onTop.filter((id) => all.some((t) => String(t.id) === id && t.status === 'signed')),
  };
}

/** POST /me/known-for/:id/show | /hide: the person's choice, any time. The writer is never told. */
async function setStatus(personId, id, status) {
  if (!UUID_RE.test(String(id))) throw notFound();
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from('ProfileTie')
    .update({ status, updated_at: now, ...(status === 'signed' ? { signed_at: now } : {}) })
    .eq('id', id).eq('kind', 'known_for').eq('user_id', personId).in('status', ['asked', 'signed', 'declined'])
    .select('id, status').maybeSingle();
  if (error) throw error;
  if (!data) throw notFound();
  return { id, status: STATUS_WORD[data.status] };
}

/** PUT /me/known-for/on-top `{ ids }`: at most two shown lines first on the page, kept with the share settings. */
async function setOnTop(personId, body) {
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.map(String))] : null;
  if (!ids || ids.length > 2 || ids.some((id) => !UUID_RE.test(id))) {
    throw new KnownForRefusal(400, 'KNOWN_FOR_INVALID', 'Put up to two shown lines on top.');
  }
  const mine = await listMine(personId);
  const shown = new Set(mine.lines.filter((l) => l.status === 'shown').map((l) => String(l.id)));
  if (ids.some((id) => !shown.has(id))) throw new KnownForRefusal(400, 'KNOWN_FOR_INVALID', 'Only a shown line can go on top.');
  const { data: user, error: readError } = await supabaseAdmin.from('User').select('profile_share').eq('id', personId).maybeSingle();
  if (readError) throw readError;
  const { error } = await supabaseAdmin.from('User')
    .update({ profile_share: { ...(user?.profile_share || { v: 1 }), known_for_top: ids } }).eq('id', personId);
  if (error) throw error;
  return { on_top: ids };
}

module.exports = { KnownForRefusal, writeSheet, writeLine, takeBack, listMine, setStatus, setOnTop, reasonsFrom };
