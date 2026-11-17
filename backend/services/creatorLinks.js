// ============================================================
// Creator links for Christmas cards (founder, November 16, 2026).
//
// A creator is an existing account the founder gives a readable code such as GRACEFM: one more UserReferral row
// for that account with source 'creator' and no referred_user_id. Their link is <web>/cards?ref=GRACEFM. Someone
// who creates an account from it is recorded against the creator by creditReferralJoin (routes/users.js), with
// source 'creator_link' on the joiner's row, so the sales report counts only people who came through that code.
//
// Letter case: creator codes are stored in capitals, and a link typed in any case finds one (GraceFM, gracefm).
// Everyone's own invite codes are random mixed-case letters and stay exact: an exact match always wins, and a
// creator code is refused while any code, in any case, already reads the same.
// ============================================================

const supabaseAdmin = require('../config/supabaseAdmin');

const CREATOR_SOURCE = 'creator';
const CREATOR_JOIN_SOURCE = 'creator_link';
// 6 to 12 letters and digits: the register form's invite_code (6–12) and the card pages' ref (4–32) both take it.
const CREATOR_CODE_SHAPE = /^[A-Za-z0-9]{6,12}$/;

/** This deployment's web address (pantopus.com in production), as invite links use it. */
function webBase() {
  return (process.env.PUBLIC_WEB_URL || process.env.APP_URL || 'https://pantopus.com').trim().replace(/\/+$/, '');
}

/** The link a creator shares: the Christmas cards page carrying their code. */
function creatorLink(code) {
  return `${webBase()}/cards?ref=${encodeURIComponent(code)}`;
}

/**
 * The UserReferral row a code names, or null. Exact first (everyone's own codes are case-sensitive); then a
 * creator's code in capitals, so a creator's link typed in another case still finds them.
 */
async function findReferralLink(code, columns = 'id, referrer_id, invite_code, source') {
  if (typeof code !== 'string' || !code) return null;
  const { data: exact, error } = await supabaseAdmin
    .from('UserReferral')
    .select(columns)
    .eq('invite_code', code)
    .maybeSingle();
  if (error) throw error;
  if (exact) return exact;
  const upper = code.toUpperCase();
  if (upper === code || !CREATOR_CODE_SHAPE.test(code)) return null;
  const { data: creator, error: creatorErr } = await supabaseAdmin
    .from('UserReferral')
    .select(columns)
    .eq('invite_code', upper)
    .eq('source', CREATOR_SOURCE)
    .maybeSingle();
  if (creatorErr) throw creatorErr;
  return creator || null;
}

// ── The founder's admin page (routes/admin.js) ───────────────────

const PAGE = 1000; // PostgREST's row cap per answer
const IN_CHUNK = 200; // ids per .in() filter, so the request address stays short

/** Every row a query gives, a page at a time. `query(from, to)` builds one page. */
async function allRows(query) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function rowsWhereIn(table, columns, column, ids, narrow = (q) => q) {
  const rows = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    rows.push(...await allRows((from, to) => narrow(supabaseAdmin.from(table).select(columns).in(column, chunk))
      .order('id', { ascending: true })
      .range(from, to)));
  }
  return rows;
}

const accountName = (u) => u?.name || [u?.first_name, u?.last_name].filter(Boolean).join(' ') || null;

const showAccount = (u, code = null) => ({
  id: u.id,
  username: u.username || null,
  name: accountName(u),
  email: u.email || null,
  creator_code: code,
});

/**
 * Accounts the founder may give a code: an exact email address (any case) or an exact username (with or without
 * the @). At most five, with the creator code each already has.
 */
async function findAccounts(query) {
  const text = typeof query === 'string' ? query.trim().replace(/^@+/, '') : '';
  if (text.length < 2 || text.length > 254) return [];
  const { escapeIlike } = require('../utils/escapeIlike');
  const columns = 'id, username, name, first_name, last_name, email';
  const lookups = [supabaseAdmin.from('User').select(columns).ilike('email', escapeIlike(text)).limit(5)];
  if (/^[A-Za-z0-9_.-]+$/.test(text)) {
    lookups.push(supabaseAdmin.from('User').select(columns).ilike('username', escapeIlike(text)).limit(5));
  }
  const answers = await Promise.all(lookups);
  const byId = new Map();
  for (const { data, error } of answers) {
    if (error) throw error;
    for (const u of data || []) byId.set(u.id, u);
  }
  const users = [...byId.values()].slice(0, 5);
  if (!users.length) return [];
  const { data: codes, error } = await supabaseAdmin
    .from('UserReferral')
    .select('referrer_id, invite_code')
    .eq('source', CREATOR_SOURCE)
    .in('referrer_id', users.map((u) => u.id));
  if (error) throw error;
  const codeOf = new Map((codes || []).map((c) => [c.referrer_id, c.invite_code]));
  return users.map((u) => showAccount(u, codeOf.get(u.id) || null));
}

/** A refusal the admin page shows as it is. */
class CreatorCodeRefusal extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Gives an existing account its creator code. The code is kept in capitals; it is refused when it has the wrong
 * shape, when any code already reads the same in any letter case, or when the account already has one.
 */
async function giveCreatorCode({ userId, code, adminId }) {
  const typed = typeof code === 'string' ? code.trim() : '';
  if (!CREATOR_CODE_SHAPE.test(typed)) {
    throw new CreatorCodeRefusal('A code is 6 to 12 letters and digits, with no spaces, dashes or other marks.');
  }
  const wanted = typed.toUpperCase();
  if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new CreatorCodeRefusal('Find the account first, then give it a code.');
  }

  const { data: user, error: userErr } = await supabaseAdmin
    .from('User')
    .select('id, username, name, first_name, last_name, email')
    .eq('id', userId)
    .maybeSingle();
  if (userErr) throw userErr;
  if (!user) throw new CreatorCodeRefusal('That account no longer exists.', 404);

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('UserReferral')
    .select('invite_code')
    .eq('referrer_id', userId)
    .eq('source', CREATOR_SOURCE)
    .limit(1);
  if (existingErr) throw existingErr;
  if (existing?.length) {
    throw new CreatorCodeRefusal(`This account already has the code ${existing[0].invite_code}. Each account has one code.`, 409);
  }

  // Codes are letters and digits only, so the pattern has nothing to escape: this finds the same code in any case.
  const { data: taken, error: takenErr } = await supabaseAdmin
    .from('UserReferral')
    .select('id')
    .ilike('invite_code', wanted)
    .limit(1);
  if (takenErr) throw takenErr;
  const takenMessage = `${wanted} is already in use as a Pantopus invite code. Pick another.`;
  if (taken?.length) throw new CreatorCodeRefusal(takenMessage, 409);

  const { error: insertErr } = await supabaseAdmin.from('UserReferral').insert({
    referrer_id: userId,
    invite_code: wanted,
    source: CREATOR_SOURCE,
  });
  if (insertErr) {
    if (insertErr.code === '23505') throw new CreatorCodeRefusal(takenMessage, 409);
    throw insertErr;
  }
  const logger = require('../utils/logger');
  logger.info('admin.creator_code.given', { adminId, userId, code: wanted });
  return { account: showAccount(user, wanted), code: wanted, link: creatorLink(wanted) };
}

/**
 * The sales report: for every account with a creator code, the people who joined through it and the stamp books
 * those people bought, by size. Refunded books are counted apart and left out of the totals. Counts and sums only:
 * nothing about any buyer.
 */
async function salesReport() {
  const { BOOKS } = require('./mailStamps');
  const sizes = BOOKS.map((b) => b.credits);
  const priceOf = new Map(BOOKS.map((b) => [b.credits, b.price_cents]));
  const emptySizes = () => Object.fromEntries(sizes.map((n) => [n, 0]));

  const codes = await allRows((from, to) => supabaseAdmin
    .from('UserReferral')
    .select('id, referrer_id, invite_code, created_at')
    .eq('source', CREATOR_SOURCE)
    .order('created_at', { ascending: true })
    .range(from, to));
  if (!codes.length) return { creators: [], books: BOOKS.map(({ credits, price_cents }) => ({ credits, price_cents })) };

  const creatorIds = [...new Set(codes.map((c) => c.referrer_id))];
  const users = await rowsWhereIn('User', 'id, username, name, first_name, last_name, email', 'id', creatorIds);
  const userById = new Map(users.map((u) => [u.id, u]));

  const joins = await rowsWhereIn('UserReferral', 'id, referrer_id, referred_user_id', 'referrer_id', creatorIds,
    (q) => q.eq('source', CREATOR_JOIN_SOURCE).not('referred_user_id', 'is', null));
  const creatorOfJoiner = new Map(joins.map((j) => [j.referred_user_id, j.referrer_id]));

  const purchases = await rowsWhereIn('MailStampPurchase', 'id, user_id, credits, revoked', 'user_id', [...creatorOfJoiner.keys()]);

  const tally = new Map(creatorIds.map((id) => [id, { joined: 0, buyers: new Set(), books: emptySizes(), refunded: emptySizes(), sales_cents: 0 }]));
  for (const j of joins) tally.get(j.referrer_id).joined += 1;
  for (const p of purchases) {
    const t = tally.get(creatorOfJoiner.get(p.user_id));
    if (!t || !priceOf.has(p.credits)) continue;
    if (p.revoked) {
      t.refunded[p.credits] += 1;
    } else {
      t.books[p.credits] += 1;
      t.sales_cents += priceOf.get(p.credits);
      t.buyers.add(p.user_id);
    }
  }

  const creators = codes.map((c) => {
    const t = tally.get(c.referrer_id);
    const user = userById.get(c.referrer_id);
    return {
      code: c.invite_code,
      link: creatorLink(c.invite_code),
      since: c.created_at,
      account: user ? showAccount(user, c.invite_code) : null,
      joined: t.joined,
      buyers: t.buyers.size,
      books: t.books,
      refunded: t.refunded,
      books_total: sizes.reduce((sum, n) => sum + t.books[n], 0),
      refunded_total: sizes.reduce((sum, n) => sum + t.refunded[n], 0),
      sales_cents: t.sales_cents,
    };
  });
  return { creators, books: BOOKS.map(({ credits, price_cents }) => ({ credits, price_cents })) };
}

module.exports = {
  CREATOR_SOURCE,
  CREATOR_JOIN_SOURCE,
  CREATOR_CODE_SHAPE,
  CreatorCodeRefusal,
  webBase,
  creatorLink,
  findReferralLink,
  findAccounts,
  giveCreatorCode,
  salesReport,
};
