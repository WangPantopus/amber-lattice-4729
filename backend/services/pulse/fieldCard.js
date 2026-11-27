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
const { checkDraftBudget } = require('../ai/assistantBudget');
const play = require('./play');

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
  const named = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 80) : null;
  return {
    v: 1,
    name: named,
    likely: true,
    scientific: named && typeof parsed.scientific === 'string' && parsed.scientific.trim() ? parsed.scientific.trim().slice(0, 80) : null,
    why: String(parsed.why || '').trim().slice(0, 200) || null,
    source: named ? safeSource(parsed.source_title, parsed.source_url) : null,
    caution: EATABLE_KINDS.includes(parsed.kind) ? CAUTION : null,
    named_by: 'Pantopus AI',
    made_at: new Date().toISOString(),
    model: MODEL,
    corrections: 0,
  };
}

function thingOf(target, dotId) {
  const dot = target.dots.find((candidate) => candidate.id === dotId);
  if (!dot) throw fail(404, 'PLAY_NOT_FOUND', 'This could not be found.');
  if (dot.kind !== 'thing') throw fail(400, 'PLAY_INVALID', 'Only a thing in the photo has a field card.');
  return dot;
}

/** The reader's own correction on this card, or null; and how many people corrected it. */
async function correctionsOf(postId, dotId, viewerId) {
  const { data, error } = await supabaseAdmin.from('PostAnswer').select('user_id, value')
    .eq('post_id', postId).eq('item', dotId).eq('kind', 'correction').limit(5000);
  if (error) throw new Error(`Failed to load the corrections: ${error.message}`);
  const mine = (data || []).find((row) => String(row.user_id) === String(viewerId));
  return { count: (data || []).length, mine: mine ? { name: mine.value?.name || '', note: mine.value?.note || null } : null };
}

async function shownFor(target, dotId, card, viewerId) {
  const { count, mine } = await correctionsOf(target.id, dotId, viewerId);
  return { ...play.shownCard(card), corrections: count, my_correction: mine };
}

/** POST /dots/:id/:dot/card — the thing's field card: kept, or made now with one call and kept. */
async function cardFor(id, dotId, viewerId) {
  const target = await play.reach(id, viewerId);
  const dot = thingOf(target, dotId);
  if (target.cards?.[dotId]) return { card: await shownFor(target, dotId, target.cards[dotId], viewerId) };
  if (target.moment && !target.open) throw fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
  const key = `${id}:${dotId}`;
  if (!inFlight.has(key)) {
    const making = (async () => {
      const blocked = await checkDraftBudget(viewerId);
      if (blocked) throw fail(blocked.error === 'AI_DISABLED' ? 503 : 429, blocked.error, blocked.message);
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
    post_id: id, user_id: viewerId, item: dotId, kind: 'correction', value: { name, note: note || null }, updated_at: new Date().toISOString(),
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

module.exports = { cardFor, correct, safeSource, CAUTION, ENDPOINT };
