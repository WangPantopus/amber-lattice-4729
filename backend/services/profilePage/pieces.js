/**
 * Pieces, the owner's side (CONTRACT "Phase 2: Work", P2.1–P2.3; SPEC phase 2A). A piece is a UserPortfolio row. The
 * owner adds, changes, pins, hides and removes pieces, starts one from a paid job they did or a plan they hosted that
 * took place (Seen; one piece a job or plan), and attaches files uploaded through today's POST /api/files/portfolio.
 * A piece started from a job never carries the job's address, price or who posted it.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const { readRows } = require('./sources');
const { readShare, reaches } = require('./parts');
const { pieceOf, monthLabel, localDate, PACIFIC } = require('./compose');

const TITLE_MAX = 60;
const WORDS_MAX = 280;
const SKILLS_MAX = 5;
const ATTACH_MAX = 12;
const PASTE_CEILING_MS = 8000;
const PIN_MAX = 3;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const KINDS = ['did', 'built', 'owns'];
const AUDIENCES = ['anyone', 'members', 'connections'];
const PAID_STATUSES = ['captured_hold', 'succeeded', 'transfer_pending', 'transfer_scheduled', 'transferred', 'paid'];
const FILE_TYPES = ['portfolio_image', 'portfolio_video', 'portfolio_document'];
const FIELDS = ['title', 'kind', 'from', 'to', 'city', 'state', 'description', 'skills', 'audience', 'pinned', 'hidden', 'draft',
  'started_from', 'attachments', 'role', 'links'];

class PieceRefusal extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const invalid = (message) => new PieceRefusal(400, 'PIECE_INVALID', message);
const notFound = () => new PieceRefusal(404, 'PIECE_NOT_FOUND', 'That piece isn\'t here.');

function plainText(value, max) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > max) return undefined;
  return text || null;
}

function monthDate(value) {
  if (value === null) return { value: null };
  if (typeof value !== 'string' || !MONTH_RE.test(value)) return null;
  return { value: `${value}-01` };
}

/** Checks a body and turns it into UserPortfolio columns. `create`: a new piece (a title is needed). */
async function columnsFrom(userId, body, { create }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Send the piece\'s fields.');
  const unknown = Object.keys(body).filter((key) => !FIELDS.includes(key));
  if (unknown.length) throw invalid(`A piece doesn't take ${unknown[0]}.`);
  const out = {};
  if (create || body.title !== undefined) {
    const title = plainText(body.title, TITLE_MAX);
    if (!title) throw invalid(`Give the piece a title of 1 to ${TITLE_MAX} characters.`);
    out.title = title;
  }
  if (body.kind !== undefined) {
    if (body.kind !== null && !KINDS.includes(body.kind)) throw invalid('A piece is something you did, built or own.');
    out.piece_kind = body.kind;
  }
  for (const [key, column] of [['from', 'started_on'], ['to', 'completed_at']]) {
    if (body[key] === undefined) continue;
    const month = monthDate(body[key]);
    if (!month) throw invalid('Write months as YYYY-MM.');
    out[column] = month.value;
  }
  for (const [key, column, max] of [['city', 'place_city', 80], ['state', 'place_state', 40]]) {
    if (body[key] === undefined) continue;
    const text = plainText(body[key], max);
    if (text === undefined) throw invalid('A piece\'s place is a city and state, never an address.');
    out[column] = text;
  }
  if (body.role !== undefined) {
    const role = plainText(body.role, 40);
    if (role === undefined) throw invalid('Your part on a piece is a few words, at most 40 characters.');
    out.owner_role = role;
  }
  if (body.description !== undefined) {
    const text = plainText(body.description, WORDS_MAX);
    if (text === undefined) throw invalid(`Your words on a piece are at most ${WORDS_MAX} characters.`);
    out.description = text;
  }
  if (body.skills !== undefined) {
    if (!Array.isArray(body.skills) || body.skills.length > SKILLS_MAX) throw invalid(`A piece shows at most ${SKILLS_MAX} skills.`);
    const skills = body.skills.map((s) => plainText(s, 60));
    if (skills.some((s) => !s)) throw invalid('Each skill is a few words.');
    out.skills_used = [...new Set(skills)];
  }
  if (body.audience !== undefined) {
    if (!AUDIENCES.includes(body.audience)) throw invalid('Who sees a piece: anyone, members or connections.');
    out.audience = body.audience;
  }
  for (const [key, column, flip] of [['pinned', 'is_featured', false], ['hidden', 'is_visible', true], ['draft', 'is_draft', false]]) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'boolean') throw invalid(`${key} is true or false.`);
    out[column] = flip ? !body[key] : body[key];
  }
  if (body.started_from !== undefined) {
    if (!create) throw invalid('A piece is started from a job or plan when it is made.');
    Object.assign(out, await sourceColumns(userId, body.started_from));
  }
  if (body.attachments !== undefined) Object.assign(out, await attachmentColumns(userId, body.attachments));
  return out;
}

// ---------- link cards (CONTRACT P2.4) ----------

const TRACKING = /^(utm_[a-z]+|ref|ref_src|ref_url|fbclid|gclid|dclid|yclid|msclkid|igshid|si|mc_cid|mc_eid|spm|_hsenc|_hsmi|mkt_tok|s_cid)$/i;
const KIND_HOSTS = [
  ['video', /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|loom\.com)$/],
  ['code', /(^|\.)(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org|npmjs\.com)$/],
  ['app', /(^|\.)(apps\.apple\.com|play\.google\.com|chromewebstore\.google\.com)$/],
  ['paper', /(^|\.)(doi\.org|arxiv\.org|scholar\.google\.com|researchgate\.net|ssrn\.com|pubmed\.ncbi\.nlm\.nih\.gov|jstor\.org)$/],
  ['article', /(^|\.)(medium\.com|substack\.com|nytimes\.com|theguardian\.com|washingtonpost\.com|npr\.org|bbc\.co\.uk|bbc\.com)$/],
];
const linkInvalid = (message) => new PieceRefusal(400, 'LINK_INVALID', message);

/** The link as kept: http(s) only, no credentials, tracking parts and the fragment cut. */
function cleanLink(value) {
  const { parsePublicUrl } = require('../../routes/linkPreview').linkCards;
  if (typeof value !== 'string' || !value.trim()) throw linkInvalid('Paste a link to a page.');
  let url;
  try { url = parsePublicUrl(value.trim()); } catch (_) { throw linkInvalid('That link can\'t be read. Paste a link to a public page.'); }
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.hash = '';
  return url.href;
}

function kindOf(host) {
  const found = KIND_HOSTS.find(([, re]) => re.test(host));
  return found ? found[0] : 'site';
}

/**
 * A piece's links as cards. A link already on the piece keeps its card (and its proof); a new one is read once now,
 * on paste, through linkPreview's guarded fetch (words only). A page that can't be read keeps a plain card.
 */
async function linkCards(userId, links, existing) {
  if (!Array.isArray(links)) throw linkInvalid('Links are a list of { "url" }.');
  const crypto = require('crypto');
  const { previewFor } = require('../../routes/linkPreview').linkCards;
  const byUrl = new Map((existing || []).map((card) => [card.url, card]));
  const urls = [];
  for (const item of links) {
    const url = cleanLink(item && typeof item === 'object' ? item.url : null);
    if (!urls.includes(url)) urls.push(url);
  }
  // New links are read side by side, under linkPreview's own per-person slots, with one ceiling for the whole save;
  // a link that doesn't answer in time keeps a plain card.
  const deadline = new Promise((resolve) => { const t = setTimeout(() => resolve(null), PASTE_CEILING_MS); t.unref?.(); });
  const words = await Promise.all(urls.map((url) => (byUrl.has(url) ? null
    : Promise.race([previewFor(url, userId).catch(() => null), deadline]))));
  return urls.map((url, i) => {
    if (byUrl.has(url)) return byUrl.get(url);
    const host = new URL(url).hostname.replace(/^www\./, '');
    return { id: crypto.randomUUID(), url, site: host, kind: kindOf(host), title: words[i]?.title || null,
      description: words[i]?.description || null, proof_token: null, proven_at: null };
  });
}

/** The twelve in all: files and link cards together. */
function checkTwelve(fileIds, links) {
  if ((fileIds || []).length + (links || []).length > ATTACH_MAX) {
    throw new PieceRefusal(409, 'PIECE_ATTACHMENT_LIMIT', `A piece holds ${ATTACH_MAX} attachments at most, files and links together.`);
  }
}

// A paid job the person did that is completed and paid, or a plan they hosted that took place, not yet a piece.
async function sourceColumns(userId, from) {
  if (from === null) return {};
  const bad = () => new PieceRefusal(409, 'PIECE_SOURCE_INVALID', 'That job or plan can\'t start a piece.');
  if (!from || typeof from !== 'object' || !['gig', 'plan'].includes(from.kind) || typeof from.id !== 'string') throw bad();
  if (from.kind === 'gig') {
    const { data, error } = await supabaseAdmin.from('Gig').select('id, accepted_by, status, payment_status, owner_confirmed_at, title')
      .eq('id', from.id).maybeSingle();
    if (error && error.code !== '22P02') throw error;
    if (!data || String(data.accepted_by) !== String(userId) || data.status !== 'completed' || !PAID_STATUSES.includes(data.payment_status)) throw bad();
  } else {
    const { data, error } = await supabaseAdmin.from('Plan').select('post_id, host_user_id, status').eq('post_id', from.id).maybeSingle();
    if (error && error.code !== '22P02') throw error;
    if (!data || String(data.host_user_id) !== String(userId) || data.status !== 'ended') throw bad();
  }
  const column = from.kind === 'gig' ? 'source_gig_id' : 'source_plan_id';
  const { count, error } = await supabaseAdmin.from('UserPortfolio').select('id', { count: 'exact', head: true }).eq(column, from.id);
  if (error) throw error;
  if (count > 0) throw bad();
  return { [column]: from.id };
}

// Files the person uploaded through POST /api/files/portfolio (their own, not deleted). Photos and videos also go in
// media_urls (the cover and the counts); every attachment's id is kept in file_ids, in order.
async function attachmentColumns(userId, attachments) {
  if (!Array.isArray(attachments)) throw invalid('Attachments are a list of uploaded files.');
  if (attachments.length > ATTACH_MAX) throw new PieceRefusal(409, 'PIECE_ATTACHMENT_LIMIT', `A piece holds ${ATTACH_MAX} attachments at most.`);
  const ids = attachments.map((a) => a && typeof a === 'object' ? a.file_id : null);
  if (ids.some((id) => typeof id !== 'string')) throw invalid('Each attachment is { "file_id" } from an upload.');
  if (!ids.length) return { file_ids: [], media_urls: [] };
  const { data, error } = await supabaseAdmin.from('File').select('id, user_id, file_url, file_type, is_deleted').in('id', ids);
  if (error) {
    if (error.code === '22P02') throw invalid('That isn\'t an uploaded file.');
    throw error;
  }
  const byId = new Map((data || []).map((f) => [String(f.id), f]));
  const files = ids.map((id) => byId.get(String(id)));
  if (files.some((f) => !f || String(f.user_id) !== String(userId) || f.is_deleted || !FILE_TYPES.includes(f.file_type))) {
    throw invalid('Attach only your own uploaded photos, videos and documents.');
  }
  return {
    file_ids: files.map((f) => f.id),
    media_urls: files.filter((f) => f.file_type !== 'portfolio_document').map((f) => f.file_url),
  };
}

// ---------- reading the owner's pieces ----------

async function ownRows(userId) {
  const rows = (await readRows([userId], null)).get(String(userId));
  if (!rows) throw new Error('Profile rows missing');
  return rows;
}

function firstNameOf(rows, fallback) {
  const name = rows.local_profile?.display_name || fallback || '';
  return String(name).trim().split(/\s+/)[0] || 'you';
}

/** What a piece will be on the page, worked out by the server (board 10's foot). */
function howItWillShow(row, workSetting) {
  const lines = [];
  if (row.source_kind === 'gig') lines.push('Seen: it started from a paid job on Pantopus.');
  else if (row.source_kind === 'plan') lines.push('Seen: it started from a plan that took place on Pantopus.');
  else lines.push('Said: your words, until someone on it signs or a link is proven yours.');
  const unproven = (row.links || []).filter((c) => !c.proven_at).length;
  if (unproven) lines.push(`Said: ${unproven === 1 ? 'the link' : `${unproven} links`}, until proven yours.`);
  if (row.is_draft) lines.push('A draft: nobody else sees it yet.');
  else if (row.is_visible === false) lines.push('Hidden: nobody else sees it.');
  else {
    const order = ['connections', 'members', 'anyone'];
    const reach = order[Math.min(order.indexOf(row.audience || 'anyone'), order.indexOf(workSetting || 'members'))];
    lines.push({ anyone: 'Shows to anyone with your link.', members: 'Shows to people on Pantopus.',
      connections: 'Shows to your connections.' }[reach]);
  }
  return lines;
}

async function offeredFor(userId, rows) {
  const usedGigs = new Set();
  const usedPlans = new Set();
  const { data: used, error } = await supabaseAdmin.from('UserPortfolio').select('source_gig_id, source_plan_id').eq('user_id', userId);
  if (error) throw error;
  for (const r of used || []) {
    if (r.source_gig_id) usedGigs.add(String(r.source_gig_id));
    if (r.source_plan_id) usedPlans.add(String(r.source_plan_id));
  }
  const [gigs, plans] = await Promise.all([
    supabaseAdmin.from('Gig').select('id, title, user_id, owner_confirmed_at, worker_completed_at, updated_at')
      .eq('accepted_by', userId).eq('status', 'completed').in('payment_status', PAID_STATUSES)
      .order('updated_at', { ascending: false }).limit(50),
    supabaseAdmin.from('Plan').select('post_id, ended_at')
      .eq('host_user_id', userId).eq('status', 'ended').order('ended_at', { ascending: false }).limit(50),
  ]);
  if (gigs.error) throw gigs.error;
  if (plans.error) throw plans.error;
  const openGigs = (gigs.data || []).filter((g) => !usedGigs.has(String(g.id)));
  const openPlans = (plans.data || []).filter((p) => !usedPlans.has(String(p.post_id)));
  const titles = new Map();
  if (openPlans.length) {
    const { data, error: postError } = await supabaseAdmin.from('Post').select('id, title, content').in('id', openPlans.map((p) => p.post_id));
    if (postError) throw postError;
    for (const post of data || []) titles.set(String(post.id), String(post.title || post.content || 'A plan').trim().slice(0, 60));
  }
  // The people who hired them, by the name others see (shown to the owner only, never on the piece).
  const posterIds = [...new Set(openGigs.map((g) => g.user_id).filter(Boolean))];
  const names = new Map();
  if (posterIds.length) {
    const { loadChatPeople } = require('../chatPeople');
    const people = await loadChatPeople(posterIds);
    for (const id of posterIds) names.set(String(id), people.get(String(id))?.displayName || null);
  }
  const day = (at) => (at ? new Date(at).toLocaleDateString('en-US', { timeZone: PACIFIC, month: 'long', day: 'numeric', year: 'numeric' }) : null);
  const short = (at) => (at ? new Date(at).toLocaleDateString('en-US', { timeZone: PACIFIC, month: 'long', day: 'numeric' }) : null);
  return [
    ...openGigs.map((g) => {
      const at = g.owner_confirmed_at || g.worker_completed_at || g.updated_at;
      const who = names.get(String(g.user_id));
      return { kind: 'gig', id: g.id, title: g.title || 'A paid job', when: day(at), with: who || null,
        text: who ? `You completed a paid job for ${who} on ${short(at)}.` : `You completed a paid job on ${short(at)}.` };
    }),
    ...openPlans.map((p) => {
      const title = titles.get(String(p.post_id)) || 'A plan';
      return { kind: 'plan', id: p.post_id, title, when: day(p.ended_at), with: null, text: `You hosted ${title} on ${short(p.ended_at)}.` };
    }),
  ];
}

/** GET /me/pieces: every piece (owner view), the offers and the share sheet's counts. */
async function listMine(userId) {
  const rows = await ownRows(userId);
  const first = firstNameOf(rows);
  const workSetting = readShare(rows.share).parts.work;
  const all = [...(rows.pieces || []), ...(rows.owner_only_pieces || [])];
  const pieces = all.map((row) => ({ ...pieceOf(row, first, true).piece, how_it_will_show: howItWillShow(row, workSetting) }));
  const live = all.filter((row) => !row.is_draft && row.is_visible !== false);
  const linkShown = (row) => reaches({ work: workSetting }, 'work', 'link') && reaches({ piece: row.audience || 'anyone' }, 'piece', 'link');
  return { pieces, offered: await offeredFor(userId, rows), counts: { shown_on_link: live.filter(linkShown).length, total: live.length } };
}

async function answerFor(userId, id) {
  const rows = await ownRows(userId);
  const row = [...(rows.pieces || []), ...(rows.owner_only_pieces || [])].find((r) => String(r.id) === String(id));
  if (!row) throw notFound();
  const piece = pieceOf(row, firstNameOf(rows), true).piece;
  return { ...piece, how_it_will_show: howItWillShow(row, readShare(rows.share).parts.work) };
}

async function pinRoom(userId, exceptId) {
  let query = supabaseAdmin.from('UserPortfolio').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('is_featured', true).eq('is_visible', true).eq('is_draft', false);
  if (exceptId) query = query.neq('id', exceptId);
  const { count, error } = await query;
  if (error) throw error;
  if (count >= PIN_MAX) throw new PieceRefusal(409, 'PIECE_PIN_LIMIT', 'You can pin up to 3 pieces. Unpin one first.');
}

async function createPiece(userId, body) {
  const { links, ...rest } = body || {};
  const columns = await columnsFrom(userId, rest, { create: true });
  if (links !== undefined) columns.links = await linkCards(userId, links, []);
  checkTwelve(columns.file_ids, columns.links);
  if (columns.is_featured) await pinRoom(userId, null);
  const { data, error } = await supabaseAdmin.from('UserPortfolio')
    .insert({ user_id: userId, portfolio_type: 'project', is_visible: true, ...columns }).select('id').single();
  if (error) {
    if (error.code === '23505') throw new PieceRefusal(409, 'PIECE_SOURCE_INVALID', 'That job or plan is already a piece.');
    throw error;
  }
  return answerFor(userId, data.id);
}

/**
 * Files a piece no longer holds go with it, unless another of the person's pieces still holds them: a removed piece's
 * photos must not stay in today's portfolio grid (GET /api/files/portfolio). Marked deleted as files.js deletes them.
 */
async function dropUnheldFiles(userId, fileIds) {
  const ids = [...new Set((fileIds || []).filter(Boolean).map(String))];
  if (!ids.length) return;
  const { data, error } = await supabaseAdmin.from('UserPortfolio').select('file_ids').eq('user_id', userId);
  if (error) throw error;
  const held = new Set((data || []).flatMap((r) => (r.file_ids || []).map(String)));
  const unheld = ids.filter((id) => !held.has(id));
  if (!unheld.length) return;
  const { error: dropError } = await supabaseAdmin.from('File').update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .in('id', unheld).eq('user_id', userId);
  if (dropError) throw dropError;
}

async function ownPiece(userId, id) {
  const { data, error } = await supabaseAdmin.from('UserPortfolio').select('id, is_featured, file_ids, links').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) {
    if (error.code === '22P02') throw notFound();
    throw error;
  }
  if (!data) throw notFound();
  return data;
}

async function updatePiece(userId, id, body) {
  const before = await ownPiece(userId, id);
  const { links, ...rest } = body || {};
  const columns = await columnsFrom(userId, rest, { create: false });
  if (links !== undefined) columns.links = await linkCards(userId, links, before.links || []);
  checkTwelve(columns.file_ids ?? before.file_ids, columns.links ?? before.links);
  if (columns.is_featured === true) await pinRoom(userId, id);
  if (Object.keys(columns).length) {
    const { error } = await supabaseAdmin.from('UserPortfolio').update({ ...columns, updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', userId);
    if (error) throw error;
    // Attachments taken off the piece go, unless another piece holds them.
    if (columns.file_ids) {
      const kept = new Set(columns.file_ids.map(String));
      await dropUnheldFiles(userId, (before.file_ids || []).filter((f) => !kept.has(String(f))));
    }
  }
  return answerFor(userId, id);
}

async function deletePiece(userId, id) {
  const before = await ownPiece(userId, id);
  const { error } = await supabaseAdmin.from('UserPortfolio').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
  await dropUnheldFiles(userId, before.file_ids);
  return { id, deleted: true };
}

/** POST /me/pieces/:id/links/:linkId/proof: the short line to put on the page (made once, kept). */
async function proofLine(userId, id, linkId) {
  const piece = await ownPiece(userId, id);
  const links = piece.links || [];
  const card = links.find((c) => c.id === linkId);
  if (!card) throw new PieceRefusal(404, 'PIECE_NOT_FOUND', 'That link isn\'t on this piece.');
  if (!card.proof_token) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = require('crypto').randomBytes(8);
    const token = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    card.proof_token = `${token.slice(0, 4)}-${token.slice(4)}`;
    const { error } = await supabaseAdmin.from('UserPortfolio').update({ links }).eq('id', id).eq('user_id', userId);
    if (error) throw error;
  }
  return {
    line: `pantopus-proof: ${card.proof_token}`,
    meta: `<meta name="pantopus-proof" content="${card.proof_token}">`,
    how: 'Put this line in the page\'s title or description, then check. On your own site, a meta tag works. A line in comments doesn\'t count.',
  };
}

/** POST …/check: reads the page through the same guarded fetch; Seen once the line is there. */
async function checkProof(userId, id, linkId) {
  const piece = await ownPiece(userId, id);
  const links = piece.links || [];
  const card = links.find((c) => c.id === linkId);
  if (!card) throw new PieceRefusal(404, 'PIECE_NOT_FOUND', 'That link isn\'t on this piece.');
  if (!card.proof_token) throw new PieceRefusal(409, 'PROOF_NOT_FOUND', 'Get your line first, then put it on the page.');
  const { headCarries } = require('../../routes/linkPreview').linkCards;
  let found;
  try { found = await headCarries(card.url, card.proof_token, userId); } catch (_) {
    throw new PieceRefusal(409, 'LINK_UNREADABLE', 'That page can\'t be read right now. Try again later.');
  }
  if (!found) throw new PieceRefusal(409, 'PROOF_NOT_FOUND', 'Your line isn\'t on the page yet.');
  card.proven_at = card.proven_at || new Date().toISOString();
  const { error } = await supabaseAdmin.from('UserPortfolio').update({ links }).eq('id', id).eq('user_id', userId);
  if (error) throw error;
  const rows = await ownRows(userId);
  return require('./compose').cardOf(card, firstNameOf(rows), true);
}

/** POST /me/pieces/preview: how a piece with these fields would show; nothing saved. */
async function previewPiece(userId, body) {
  const columns = await columnsFrom(userId, { ...body, title: body?.title ?? 'Preview' }, { create: true });
  const rows = await ownRows(userId);
  const row = { audience: 'anyone', is_visible: true, is_draft: false, ...columns,
    source_kind: columns.source_gig_id ? 'gig' : (columns.source_plan_id ? 'plan' : null) };
  return { how_it_will_show: howItWillShow(row, readShare(rows.share).parts.work) };
}

/** PUT /me/work: "Tools she brings", one Said line on Owns (at most 140 characters; null removes it). */
async function saveWork(userId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => k !== 'tools')) {
    throw invalid('Send { "tools": "…" } or { "tools": null }.');
  }
  const tools = plainText(body.tools, 140);
  if (tools === undefined) throw invalid('Tools are one line of at most 140 characters.');
  const { error } = await supabaseAdmin.from('User').update({ profile_tools: tools }).eq('id', userId);
  if (error) throw error;
  return { tools };
}

/**
 * Today's public portfolio grid (GET /api/files/portfolio/:userId, which the released apps draw, signed in or not)
 * never shows more than the person's pieces do: a file held by a piece that doesn't reach everyone (hidden, a draft,
 * members- or connections-only) is left out, and once the person saved a Work part that doesn't reach anyone, every
 * file a piece holds is. Files no piece holds are listed as before. Cost: no read when the grid is empty, otherwise
 * one read (the person's pieces with their saved parts beside them). A failed read throws, and the route answers 500
 * with no files, as its own failed read does.
 */
async function publicGridFilter(userId, files) {
  if (!Array.isArray(files) || !files.length) return files;
  const pieces = await supabaseAdmin.from('UserPortfolio')
    .select('file_ids, is_visible, is_draft, audience, owner:user_id ( profile_share )')
    .eq('user_id', userId).not('file_ids', 'is', null);
  if (pieces.error) throw pieces.error;
  const listed = new Set(files.map((f) => String(f.id)));
  const rows = (pieces.data || []).filter((r) => (r.file_ids || []).some((id) => listed.has(String(id))));
  if (!rows.length) return files;
  const share = readShare(rows[0].owner?.profile_share);
  const workOpen = !share.saved || reaches(share.parts, 'work', 'link');
  const closed = new Set();
  for (const r of rows) {
    const open = workOpen && r.is_visible !== false && r.is_draft !== true && (r.audience || 'anyone') === 'anyone';
    if (!open) for (const id of r.file_ids || []) closed.add(String(id));
  }
  return files.filter((f) => !closed.has(String(f.id)));
}

// ---------- the piece read's extra parts ----------

/** Attachments of a piece: its files, in order, as the piece read sends them (CONTRACT P2.2). */
async function attachmentsOf(row) {
  const ids = (row.file_ids || []).filter(Boolean);
  if (!ids.length) {
    return (row.media_urls || []).map((url, i) => ({ id: `${row.id}:${i}`, kind: /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? 'video' : 'photo',
      url, thumbnail_url: null, title: null, detail: null }));
  }
  const { data, error } = await supabaseAdmin.from('File').select('id, file_url, file_type, original_filename, mime_type, metadata, is_deleted')
    .in('id', ids);
  if (error) throw error;
  const byId = new Map((data || []).filter((f) => !f.is_deleted).map((f) => [String(f.id), f]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean).map((f) => {
    const kind = f.file_type === 'portfolio_video' ? 'video' : (f.file_type === 'portfolio_document' ? 'document' : 'photo');
    const thumbs = f.metadata?.thumbnails || {};
    const ext = String(f.original_filename || '').split('.').pop()?.toUpperCase();
    return { id: f.id, kind, url: f.file_url, thumbnail_url: thumbs.medium || thumbs.small || null, title: null,
      detail: kind === 'document' ? `Document${ext && ext.length <= 5 ? ` · ${ext}` : ''}` : (kind === 'video' ? 'Video' : null) };
  });
}

module.exports = {
  PieceRefusal, listMine, saveWork, publicGridFilter, proofLine, checkProof, createPiece, updatePiece, deletePiece, previewPiece, attachmentsOf, howItWillShow, monthLabel,
  localDate,
};
