'use strict';

// Pulse, reinvented, phase 2: field cards (coord CONTRACT 7d). A reader taps a `thing` dot (7c) and reads what it
// likely is, one line of why, and a source they can open. The first tap makes the card with one Pantopus AI call on the
// photo cut to the thing's outline; the card is kept with the post (a Moment's post_metadata.moment.cards, a Studio
// post's PostStudio.studio.cards), so every later tap, by anyone, costs nothing. It always says "likely", takes
// corrections ("Not right?", rows of PostAnswer), and never says a plant or mushroom is safe to eat. Pantopus AI never
// makes or alters a picture: the cut is only what the model is shown.

const sharp = require('sharp');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const s3 = require('../s3Service');
const { getAnthropicClient, resolveModel, DRAFT_MODEL } = require('../../config/anthropic');
const { complete, AIRefusalError } = require('../ai/llm');
const { isAssistantOff } = require('../ai/assistantBudget');
const play = require('./play');
const aiSetting = require('./aiSetting');

const MODEL = resolveModel(process.env.ANTHROPIC_FIELD_CARD_MODEL, DRAFT_MODEL);
const ENDPOINT = 'field_card';
const PROMPT_VERSION = 'field_card_v1';
const TIMEOUT_MS = 25 * 1000;
// The outline is widened by this share of its size on each side, so the model sees the thing and a little around it.
const MARGIN = 0.15;
const MAX_EDGE = 1024;
const CAUTION = 'Never eat a wild plant or mushroom on a guess.';
const EATABLE_KINDS = ['plant', 'berry', 'seed', 'mushroom', 'fungus'];
// The sources a card may link to: field guides, government and university pages. Anything else is left out.
const SOURCE_HOSTS = [
  'plants.usda.gov', 'usda.gov', 'fs.usda.gov', 'inaturalist.org', 'www.inaturalist.org', 'en.wikipedia.org',
  'www.audubon.org', 'audubon.org', 'www.allaboutbirds.org', 'allaboutbirds.org', 'birdsoftheworld.org', 'www.nps.gov',
  'nps.gov', 'www.fws.gov', 'fws.gov', 'www.usgs.gov', 'usgs.gov', 'wdfw.wa.gov', 'www.dfw.state.or.us', 'myodfw.com',
  'www.wildlife.ca.gov', 'wildlife.ca.gov',
];
const SOURCE_SUFFIXES = ['.edu', '.gov'];
// A source is asked once before a card is kept; a page that doesn't answer in time is replaced by a search on a guide.
const SOURCE_CHECK_MS = 3000;
const LIVING_KINDS = ['plant', 'berry', 'seed', 'mushroom', 'fungus', 'tree', 'flower', 'bird', 'animal', 'insect'];
// Words that speak of eating, taste, safety or touching: never on a card for something one might eat (CONTRACT 7d).
const EATING_WORDS = /\b(eat|eats|eating|eaten|edible|inedible|taste|tastes|tasty|flavou?r|cook|cooked|cooking|forag\w*|safe|safely|safety|harmless|poison\w*|toxic|toxin\w*|deadly|touch|touching|handle|handling|consum\w*|medicinal|delicious)\b/i;
// Field cards' own daily numbers (LEAD-3, 04:06): apart from the draft caps, so a busy day of cards never stops
// "Write it with AI". Env with defaults in code.
function positiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
const PERSON_DAILY = () => positiveInt(process.env.FIELD_CARD_PERSON_DAILY, 30);
const GLOBAL_DAILY = () => positiveInt(process.env.FIELD_CARD_GLOBAL_DAILY, 2000);

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: ['string', 'null'] },
    scientific: { type: ['string', 'null'] },
    kind: { type: 'string', enum: ['plant', 'berry', 'seed', 'mushroom', 'fungus', 'tree', 'flower', 'bird', 'animal', 'insect', 'rock', 'landmark', 'building', 'object', 'other', 'none'] },
    why: { type: 'string' },
    source_title: { type: ['string', 'null'] },
    source_url: { type: ['string', 'null'] },
  },
  required: ['name', 'scientific', 'kind', 'why', 'source_title', 'source_url'],
  additionalProperties: false,
};

const SYSTEM = `You write a field card for one thing in a photo that someone shared on Pantopus, a local app. You see the photo cut to the thing, with a little around it. The author may have given a short label of their own; it can be wrong.

Answer with:
- name: the common name of what it most likely is ("Douglas fir", "Great blue heron", "Basalt"). Be as specific as the picture honestly allows; say a broader name ("A fir tree") when you can't tell the species. null if there is nothing you can name.
- scientific: its scientific name when it is a living thing and you named a species or genus; else null.
- kind: what sort of thing it is.
- why: one short sentence of what in the picture points to it ("Flat needles all around the twig and cones with three-pointed bracts."). If you can't name it, say briefly why.
- source_title and source_url: one page a reader can open to learn more about exactly that thing: a field guide, a government or university page (USDA Plants, iNaturalist, Wikipedia, Audubon or Cornell's All About Birds, a park or wildlife agency, a university extension page). Only a page you are sure exists; otherwise null for both. Never invent a link.

Never say or suggest that a plant, berry, seed or mushroom is safe to eat or to touch. Never describe people, faces, license plates, house numbers or anything that could identify a person or a home; if the thing is a person, answer name null. Write plain words for anyone.`;

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

const inFlight = new Map();

/**
 * Whether this person may make a new card now: Pantopus AI on Pantopus-wide, and under field cards' own numbers for
 * the person (24 hours) and for everyone (since midnight UTC), counted from AIRequestLog. A count that can't be read
 * lets the card through, as the draft caps do.
 */
async function cardBudget(userId) {
  if (isAssistantOff()) return { status: 503, code: 'AI_DISABLED', message: 'Pantopus AI is paused right now. Please try again later.' };
  try {
    const day = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const [mine, everyone] = await Promise.all([
      supabaseAdmin.from('AIRequestLog').select('id', { count: 'exact', head: true }).eq('endpoint', ENDPOINT).eq('user_id', userId).gte('created_at', day),
      supabaseAdmin.from('AIRequestLog').select('id', { count: 'exact', head: true }).eq('endpoint', ENDPOINT).gte('created_at', midnight.toISOString()),
    ]);
    if (mine.error || everyone.error) throw new Error((mine.error || everyone.error).message);
    if ((mine.count || 0) >= PERSON_DAILY()) return { status: 429, code: 'AI_BUDGET', message: 'Pantopus AI has named a lot for you today. Try again tomorrow.' };
    if ((everyone.count || 0) >= GLOBAL_DAILY()) return { status: 429, code: 'AI_BUDGET', message: 'Pantopus AI has named a lot today. Try again tomorrow.' };
  } catch (error) {
    logger.warn('field_card.budget_unreadable', { error: error.message });
  }
  return null;
}

/**
 * The source as kept: the model's page when it answers within SOURCE_CHECK_MS (it is on the short list of field guides
 * and public agencies, so it is safe to ask), else a search for the thing on a known guide, which always opens.
 */
async function openingSource(source, { name, scientific, kind }) {
  if (source) {
    // A redirect is followed only to an address that is itself on the short list, hop by hop (LEAD-3, 04:17).
    let url = source.url;
    const deadline = AbortSignal.timeout(SOURCE_CHECK_MS);
    try {
      for (let hop = 0; hop < 4 && url; hop += 1) {
        const answer = await fetch(url, { method: 'GET', redirect: 'manual', signal: deadline, headers: { 'user-agent': 'Pantopus field card check' } });
        if (answer.ok) return { ...source, url };
        const next = answer.status >= 300 && answer.status < 400 ? answer.headers.get('location') : null;
        url = next ? safeSource(source.title, new URL(next, url).toString())?.url || null : null;
      }
    } catch {
      // Falls through to a search on a known guide.
    }
  }
  const query = encodeURIComponent(scientific || name);
  return LIVING_KINDS.includes(kind)
    ? { title: `iNaturalist: ${scientific || name}`, url: `https://www.inaturalist.org/search?q=${query}` }
    : { title: `Wikipedia: ${name}`, url: `https://en.wikipedia.org/w/index.php?search=${query}` };
}

// A name that itself claims safety or eating (never a name that warns: "Poison hemlock" stays as it is).
const SAFE_NAME = /\b(edible|eatable|safe|harmless|tasty|delicious)\b/i;

/**
 * "Never safe to eat", made certain in code on the model's own words (LEAD-3, 04:17): for something one might eat, a
 * `why` that speaks of eating, taste, safety or touching is dropped. The name is never edited: one that claims safety or
 * eating gives way to the scientific name, or to no name. The caution stays either way.
 */
function withoutEating(card, kind, scientific) {
  if (!EATABLE_KINDS.includes(kind)) return card;
  const name = card.name && SAFE_NAME.test(card.name) ? (scientific && !SAFE_NAME.test(scientific) ? scientific : null) : card.name;
  return { ...card, name, why: card.why && EATING_WORDS.test(card.why) ? null : card.why };
}

/** A source link only from the known field guides and public agencies, https only; null otherwise. */
function safeSource(title, url) {
  if (!url || typeof url !== 'string') return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const host = parsed.hostname.toLowerCase();
  const known = SOURCE_HOSTS.includes(host) || SOURCE_SUFFIXES.some((suffix) => host.endsWith(suffix));
  if (parsed.protocol !== 'https:' || !known) return null;
  return { title: String(title || host).slice(0, 120), url: parsed.toString().slice(0, 500) };
}

/** The photo's bytes: a Moment's stored picture, or a Studio post's first photo. Null when there is none. */
async function photoBytes(target) {
  if (target.moment) {
    const stored = target.moment.post_metadata?.moment?.media;
    if (target.moment.post_metadata?.moment?.kind !== 'photo' || !stored?.key) return null;
    // eslint-disable-next-line global-require
    const media = require('../moments/momentMedia');
    return media.download(undefined, stored.key);
  }
  const { data: row, error } = await supabaseAdmin.from('Post').select('media_urls, media_types').eq('id', target.id).maybeSingle();
  if (error) throw new Error(`Failed to load the post's photo: ${error.message}`);
  const urls = row?.media_urls || [];
  const index = urls.findIndex((url, i) => ['image', 'live_photo', undefined, null].includes((row.media_types || [])[i]));
  if (index < 0 || !s3.isPublicStorageUrl(urls[index])) return null;
  const base = new URL(s3.getPublicUrl(''));
  const key = decodeURIComponent(new URL(urls[index]).pathname.slice(base.pathname.length));
  const { body } = await s3.getObjectStream(key);
  if (typeof body?.transformToByteArray === 'function') return Buffer.from(await body.transformToByteArray());
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** The photo cut to the dot's outline (widened by MARGIN), as a JPEG the model reads. */
async function cutTo(bytes, box) {
  const image = sharp(bytes).rotate();
  const { width, height } = await image.metadata().then(async (meta) => {
    // rotate() swaps the sides for a photo taken on its side.
    const turned = (meta.orientation || 1) >= 5;
    return { width: turned ? meta.height : meta.width, height: turned ? meta.width : meta.height };
  });
  const x0 = Math.max(0, box.x - box.w * MARGIN);
  const y0 = Math.max(0, box.y - box.h * MARGIN);
  const x1 = Math.min(1, box.x + box.w * (1 + MARGIN));
  const y1 = Math.min(1, box.y + box.h * (1 + MARGIN));
  const left = Math.floor(x0 * width);
  const top = Math.floor(y0 * height);
  const cut = {
    left, top, width: Math.max(1, Math.min(width - left, Math.round((x1 - x0) * width))), height: Math.max(1, Math.min(height - top, Math.round((y1 - y0) * height))),
  };
  return sharp(await image.toBuffer()).extract(cut)
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 }).toBuffer();
}

async function logCall(userId, fields) {
  const { error } = await supabaseAdmin.from('AIRequestLog').insert({
    user_id: userId, endpoint: ENDPOINT, model: MODEL, prompt_version: PROMPT_VERSION, tool_calls_count: 0,
    schema_valid: fields.status === 'success', cache_hit: false, ...fields,
  });
  if (error) logger.warn('field_card.log_failed', { error: error.message });
}

/** One model call for the card; the card as kept. */
async function makeCard(target, dot, viewerId) {
  const client = getAnthropicClient();
  if (!client) throw fail(503, 'AI_DISABLED', 'Pantopus AI is paused right now. Please try again later.');
  const bytes = await photoBytes(target);
  if (!bytes) throw fail(400, 'PLAY_INVALID', 'This thing has no photo to read.');
  const jpeg = await cutTo(bytes, dot.box);
  const started = Date.now();
  let reply;
  try {
    reply = await complete({
      client,
      model: MODEL,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
          { type: 'text', text: dot.label ? `The author's own label: ${dot.label}` : 'The author gave no label.' },
        ],
      }],
      effort: 'low',
      schema: SCHEMA,
      maxTokens: 2048,
      timeoutMs: TIMEOUT_MS,
    });
  } catch (error) {
    await logCall(viewerId, { status: 'error', latency_ms: Date.now() - started, error_message: String(error.message).slice(0, 300) });
    if (error instanceof AIRefusalError) {
      reply = { text: JSON.stringify({ name: null, scientific: null, kind: 'none', why: "Pantopus AI can't name this one.", source_title: null, source_url: null }), inputTokens: 0, outputTokens: 0 };
    } else {
      logger.warn('field_card.failed', { postId: target.id, error: error.message });
      throw fail(503, 'FIELD_CARD_FAILED', "The field card couldn't be made right now. Try again in a moment.");
    }
  }
  let parsed;
  try { parsed = JSON.parse(reply.text); } catch { parsed = null; }
  if (!parsed) throw fail(503, 'FIELD_CARD_FAILED', "The field card couldn't be made right now. Try again in a moment.");
  if (reply.inputTokens || reply.outputTokens) {
    await logCall(viewerId, { status: 'success', latency_ms: Date.now() - started, input_tokens: reply.inputTokens, output_tokens: reply.outputTokens });
  }
  const kind = typeof parsed.kind === 'string' ? parsed.kind : 'other';
  const named = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 80) : null;
  const scientificSaid = named && typeof parsed.scientific === 'string' && parsed.scientific.trim() ? parsed.scientific.trim().slice(0, 80) : null;
  const words = withoutEating({ name: named, why: String(parsed.why || '').trim().slice(0, 200) || null }, kind, scientificSaid);
  const scientific = words.name ? scientificSaid : null;
  return {
    v: 1,
    name: words.name,
    likely: true,
    scientific,
    why: words.why,
    source: words.name ? await openingSource(safeSource(parsed.source_title, parsed.source_url), { name: words.name, scientific, kind }) : null,
    caution: EATABLE_KINDS.includes(kind) ? CAUTION : null,
    named_by: 'Pantopus AI',
    made_at: new Date().toISOString(),
    model: MODEL,
    corrections: 0,
  };
}

/**
 * Whether the post's author has Pantopus AI on. A made-up name's post says nothing of who wrote it here: its things were
 * checked against the author's switch when it was posted (play.parseDots), so it counts as on.
 */
async function authorAiOn(target) {
  const row = target.moment || target.row;
  if (!row || row.identity_context_type === 'pen_name' || !row.user_id) return true;
  return aiSetting.aiOnOrThrow(row.user_id);
}

function thingOf(target, dotId) {
  const dot = target.dots.find((candidate) => candidate.id === dotId);
  if (!dot) throw fail(404, 'PLAY_NOT_FOUND', 'This could not be found.');
  if (dot.kind !== 'thing') throw fail(400, 'PLAY_INVALID', 'Only a thing in the photo has a field card.');
  return dot;
}

/** How many people corrected this card, the reader's own correction or null, and whether the reader collected it. */
async function readerSide(postId, dotId, viewerId) {
  const corrections = play.dotItem('correction', dotId);
  const collect = play.dotItem('collect', dotId);
  const [all, mine] = await Promise.all([
    supabaseAdmin.from('PostAnswer').select('id', { count: 'exact', head: true }).eq('post_id', postId).eq('item', corrections),
    supabaseAdmin.from('PostAnswer').select('item, value').eq('post_id', postId).eq('user_id', viewerId).in('item', [corrections, collect]),
  ]);
  if (all.error || mine.error) throw new Error(`Failed to load the card's answers: ${(all.error || mine.error).message}`);
  const own = (mine.data || []).find((row) => row.item === corrections);
  return {
    count: all.count || 0,
    mine: own ? { name: own.value?.name || '', note: own.value?.note || null } : null,
    collected: (mine.data || []).some((row) => row.item === collect),
  };
}

async function shownFor(target, dotId, card, viewerId) {
  const { count, mine, collected } = await readerSide(target.id, dotId, viewerId);
  return { ...play.shownCard(card), corrections: count, my_correction: mine, collected };
}

/** POST /dots/:id/:dot/card — the thing's field card: kept, or made now with one call and kept. */
async function cardFor(id, dotId, viewerId) {
  const target = await play.reach(id, viewerId);
  const dot = thingOf(target, dotId);
  if (target.cards?.[dotId]) return { card: await shownFor(target, dotId, target.cards[dotId], viewerId) };
  if (target.moment && !target.open) throw fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
  // A person's own Pantopus AI switch (CONTRACT 7d): the reader's (nothing is written for them), then the author's (no
  // photo of theirs goes to the model). A kept card is shown either way, above.
  // A choice that can't be read makes no call: 503 PANTOPUS_AI_UNAVAILABLE, try again.
  const [readerOn, authorOn] = await Promise.all([aiSetting.aiOnOrThrow(viewerId), authorAiOn(target)]);
  if (!readerOn) throw aiSetting.offError();
  if (!authorOn) throw fail(403, 'FIELD_CARD_OFF', 'The author keeps Pantopus AI off for their photos.');
  const key = `${id}:${dotId}`;
  if (!inFlight.has(key)) {
    const making = (async () => {
      const blocked = await cardBudget(viewerId);
      if (blocked) throw fail(blocked.status, blocked.code, blocked.message);
      const card = await makeCard(target, dot, viewerId);
      // Kept with the post; a card another tap kept meanwhile (on another server) stays.
      await play.keepWith(target, (kept) => ({ cards: { [dotId]: card, ...(kept.cards || {}) } }));
      logger.info('field_card.made', { postId: id, named: Boolean(card.name), source: Boolean(card.source), moment: Boolean(target.moment) });
      return card;
    })();
    inFlight.set(key, making);
    making.finally(() => inFlight.delete(key)).catch(() => {});
  }
  const card = await inFlight.get(key);
  return { card: await shownFor(target, dotId, card, viewerId) };
}

/** POST /dots/:id/:dot/card/correction — "Not right?": one per person per card; a second replaces the first. */
async function correct(id, dotId, viewerId, body) {
  const target = await play.reach(id, viewerId);
  thingOf(target, dotId);
  const card = target.cards?.[dotId];
  if (!card) throw fail(404, 'PLAY_NOT_FOUND', 'This card could not be found.');
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (!name || name.length > 60 || note.length > 140) throw fail(400, 'PLAY_INVALID', 'Say what it is (up to 60 characters), and a note of up to 140 if you like.');
  const { error } = await supabaseAdmin.from('PostAnswer').upsert({
    post_id: id, user_id: viewerId, item: play.dotItem('correction', dotId), kind: 'correction', value: { name, note: note || null },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'post_id,item,user_id' });
  if (error) throw new Error(`Failed to keep the correction: ${error.message}`);
  const shown = await shownFor(target, dotId, card, viewerId);
  // The count every reader sees on the card in a list, kept with the card; the card itself never changes by this.
  await play.keepWith(target, (kept) => ({
    cards: { ...(kept.cards || {}), ...(kept.cards?.[dotId] ? { [dotId]: { ...kept.cards[dotId], corrections: shown.corrections } } : {}) },
  })).catch((keepError) => logger.warn('field_card.count_not_kept', { error: keepError.message }));
  logger.info('field_card.corrected', { postId: id });
  return { card: shown };
}

// ─── Collect: the reader's field guide (CONTRACT 7f) ────────────────────────

const GUIDE_PAGE = 30;

/** POST /dots/:id/:dot/collect — keeps a kept card's words in the reader's own field guide. */
async function collect(id, dotId, viewerId) {
  const target = await play.reach(id, viewerId);
  thingOf(target, dotId);
  const card = target.cards?.[dotId];
  if (!card) throw fail(404, 'PLAY_NOT_FOUND', 'This card could not be found.');
  const words = {
    dot: dotId, name: card.name || null, scientific: card.scientific || null, why: card.why || null,
    source: card.source || null, caution: card.caution || null,
  };
  const { error } = await supabaseAdmin.from('PostAnswer').upsert({
    post_id: id, user_id: viewerId, item: play.dotItem('collect', dotId), kind: 'collect', value: words,
  }, { onConflict: 'post_id,item,user_id', ignoreDuplicates: true });
  if (error) throw new Error(`Failed to collect the card: ${error.message}`);
  logger.info('field_card.collected', { postId: id });
  return { card: await shownFor(target, dotId, card, viewerId) };
}

/** DELETE /dots/:id/:dot/collect — lets a card go from the reader's field guide (even after the post is gone). */
async function letGo(id, dotId, viewerId) {
  const { error } = await supabaseAdmin.from('PostAnswer').delete()
    .eq('post_id', id).eq('item', play.dotItem('collect', dotId)).eq('user_id', viewerId);
  if (error) throw new Error(`Failed to let the card go: ${error.message}`);
}

/** GET /field-guide — the reader's own collected cards, newest first, with whether each post still opens for them. */
async function fieldGuide(viewerId, cursor) {
  const offset = Math.max(0, Number.parseInt(cursor || '0', 10) || 0);
  const { data, error } = await supabaseAdmin.from('PostAnswer').select('post_id, value, created_at')
    .eq('user_id', viewerId).eq('kind', 'collect').order('created_at', { ascending: false }).range(offset, offset + GUIDE_PAGE);
  if (error) throw new Error(`Failed to load the field guide: ${error.message}`);
  const rows = (data || []).slice(0, GUIDE_PAGE);
  const open = await Promise.all(rows.map((row) => play.reach(row.post_id, viewerId).then(() => true, () => false)));
  return {
    cards: rows.map((row, index) => ({
      post_id: row.post_id,
      dot_id: row.value?.dot || null,
      collected_at: row.created_at,
      card: {
        name: row.value?.name || null, scientific: row.value?.scientific || null, why: row.value?.why || null,
        source: row.value?.source || null, caution: row.value?.caution || null, likely: true,
      },
      open: open[index],
    })),
    next_cursor: (data || []).length > GUIDE_PAGE ? String(offset + GUIDE_PAGE) : null,
  };
}

module.exports = { cardFor, correct, collect, letGo, fieldGuide, safeSource, CAUTION, ENDPOINT };
