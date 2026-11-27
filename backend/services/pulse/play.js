'use strict';

// Pulse, reinvented, phase 2 (touch and learn): the playable items an author places on a Moment or a Studio post (a
// poll, a slider or spectrum dial, a board, a question box, a guess and reveal, a countdown) and each person's answer
// on them (coord CONTRACT 7b). Only for people whose `pulse_reinvented` switch is on: the items are kept with the post
// (a Moment's post_metadata.moment.play, a Studio post's PostStudio.studio.play), which today's answers never pass on,
// and the answers are rows of "PostAnswer" (migration 20261127113000), which no app role reads. This file decides what
// each reader may see of other people's answers.

const Joi = require('joi');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const { loadChatPeople } = require('../chatPeople');
const blockService = require('../blockService');

const KINDS = ['poll', 'slider', 'board', 'question', 'guess', 'countdown'];
const MAX_ITEMS = 4;
// Faces drawn on a board or a dial; `count` still counts everyone.
const MAX_FACES = 60;
// Answers read for one page's counts. Far above what a rig or a first week holds; past it the counts are of the newest.
const MAX_ANSWERS_READ = 5000;
const AUTHOR_PAGE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const COUNTDOWN_MAX_MS = 30 * DAY_MS;

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

const line = (max) => Joi.string().trim().min(1).max(max);
const placement = {
  id: Joi.string().pattern(/^[a-z0-9_-]{1,40}$/).required(),
  x: Joi.number().min(0).max(1).required(),
  y: Joi.number().min(0).max(1).required(),
  scale: Joi.number().min(0.25).max(4).default(1),
  rotation: Joi.number().min(-180).max(180).default(0),
};
const options = Joi.array().items(line(40)).min(2).max(4);

const itemSchema = Joi.object({ kind: Joi.string().valid(...KINDS).required() }).unknown(true);
const SCHEMAS = {
  poll: Joi.object({ ...placement, kind: Joi.string(), question: line(100).required(), options: options.required() }),
  slider: Joi.object({
    ...placement,
    kind: Joi.string(),
    question: line(100).required(),
    left: line(24).required(),
    right: line(24).required(),
    look: Joi.string().valid('slider', 'dial').default('slider'),
    emoji: Joi.string().max(16).allow(null),
  }),
  board: Joi.object({
    ...placement,
    kind: Joi.string(),
    question: line(100).required(),
    x_axis: Joi.object({ left: line(24).required(), right: line(24).required() }).required(),
    y_axis: Joi.object({ bottom: line(24).required(), top: line(24).required() }).required(),
  }),
  question: Joi.object({ ...placement, kind: Joi.string(), prompt: line(100).required() }),
  guess: Joi.object({
    ...placement,
    kind: Joi.string(),
    prompt: line(100).required(),
    options,
    range: Joi.object({ min: Joi.number().required(), max: Joi.number().required(), unit: Joi.string().trim().max(12).allow('') }),
    answer: Joi.number().required(),
  }).xor('options', 'range'),
  countdown: Joi.object({ ...placement, kind: Joi.string(), title: line(60).required(), ends_at: Joi.string().isoDate().required() }),
};

const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places || 0;

/**
 * The items in `value` as stored, or throws an Error whose message says what is wrong (the caller answers 400 with its
 * own code). Null or missing: [].
 */
function parseItems(value, now = Date.now()) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('play must be a list.');
  if (value.length > MAX_ITEMS) throw new Error(`play holds at most ${MAX_ITEMS} items.`);
  const seen = new Set();
  return value.map((raw, index) => {
    const head = itemSchema.validate(raw);
    if (head.error) throw new Error(`play[${index}]: ${head.error.details[0].message.replace(/"/g, '')}`);
    const { error, value: item } = SCHEMAS[raw.kind].validate(raw, { abortEarly: true, stripUnknown: true });
    if (error) throw new Error(`play[${index}]: ${error.details[0].message.replace(/"/g, '')}`);
    if (seen.has(item.id)) throw new Error(`play[${index}]: each item needs its own id.`);
    seen.add(item.id);
    const stored = {
      ...item,
      kind: raw.kind,
      x: round(item.x, 4),
      y: round(item.y, 4),
      scale: round(item.scale, 3),
      rotation: round(item.rotation, 1),
    };
    if (raw.kind === 'guess') {
      if (item.options) {
        if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= item.options.length) {
          throw new Error(`play[${index}]: answer must be one of the options.`);
        }
      } else if (!(item.range.min < item.range.max) || item.answer < item.range.min || item.answer > item.range.max) {
        throw new Error(`play[${index}]: answer must be inside the range.`);
      }
    }
    if (raw.kind === 'countdown') {
      const ends = Date.parse(item.ends_at);
      if (!(ends > now) || ends - now > COUNTDOWN_MAX_MS) throw new Error(`play[${index}]: ends_at must be within 30 days from now.`);
      stored.ends_at = new Date(ends).toISOString();
    }
    return stored;
  });
}

/** Every word an author typed in these items, for the made-up-name words check (with the caption, as one check). */
function wordsOf(items) {
  return (items || []).flatMap((item) => [
    item.question, item.prompt, item.title, item.left, item.right,
    ...(item.options || []),
    item.x_axis?.left, item.x_axis?.right, item.y_axis?.bottom, item.y_axis?.top, item.range?.unit,
  ]).filter((word) => typeof word === 'string' && word.trim());
}

// ─── Dots: living objects (CONTRACT 7c) ─────────────────────────────────────

const DOT_KINDS = ['note', 'rating', 'link', 'thing'];
const MAX_DOTS = 8;
const dotPlace = {
  id: placement.id,
  x: placement.x,
  y: placement.y,
};
const unit = Joi.number().min(0).max(1);
const DOT_SCHEMAS = {
  note: Joi.object({ ...dotPlace, kind: Joi.string(), text: line(140).required() }),
  rating: Joi.object({ ...dotPlace, kind: Joi.string(), label: line(40).required(), stars: Joi.number().integer().min(1).max(5).required() }),
  link: Joi.object({
    ...dotPlace,
    kind: Joi.string(),
    url: Joi.string().trim().max(500).uri({ scheme: ['https'] }).required(),
    title: Joi.string().trim().max(60).allow('', null),
  }),
  thing: Joi.object({
    ...dotPlace,
    kind: Joi.string(),
    box: Joi.object({ x: unit.required(), y: unit.required(), w: unit.greater(0).required(), h: unit.greater(0).required() }).required(),
    label: Joi.string().trim().max(40).allow('', null),
  }),
};

/**
 * The dots in `value` as stored, or throws an Error whose message says what is wrong (the caller answers 400 with its
 * own code). `photo`: the post's picture is a photo (a `thing` needs one); `media`: it has a picture at all; `penName`:
 * under a made-up name (no links). Null or missing: [].
 */
function parseDots(value, { photo = false, media = false, penName = false } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('dots must be a list.');
  if (!value.length) return [];
  if (!media) throw new Error('Dots go on a photo or a video.');
  if (value.length > MAX_DOTS) throw new Error(`dots holds at most ${MAX_DOTS}.`);
  const seen = new Set();
  return value.map((raw, index) => {
    if (raw?.kind === 'whisper') throw new Error(`dots[${index}]: a voice whisper can't be posted yet.`);
    const schema = DOT_SCHEMAS[raw?.kind];
    if (!schema) throw new Error(`dots[${index}]: kind must be one of ${DOT_KINDS.join(', ')}.`);
    const { error, value: dot } = schema.validate(raw, { abortEarly: true, stripUnknown: true });
    if (error) throw new Error(`dots[${index}]: ${error.details[0].message.replace(/"/g, '')}`);
    if (seen.has(dot.id)) throw new Error(`dots[${index}]: each dot needs its own id.`);
    seen.add(dot.id);
    if (dot.kind === 'link' && penName) throw new Error("A made-up name can't post a link.");
    if (dot.kind === 'thing' && !photo) throw new Error(`dots[${index}]: a thing to name needs a photo.`);
    const stored = { ...dot, kind: raw.kind, x: round(dot.x, 4), y: round(dot.y, 4) };
    if (dot.kind === 'thing') {
      const box = { x: round(dot.box.x, 4), y: round(dot.box.y, 4), w: round(dot.box.w, 4), h: round(dot.box.h, 4) };
      stored.box = { ...box, w: Math.min(box.w, 1 - box.x) || box.w, h: Math.min(box.h, 1 - box.y) || box.h };
      stored.label = dot.label || null;
    }
    if (dot.kind === 'link') stored.title = dot.title || null;
    return stored;
  });
}

/** Every word an author typed in these dots, for the made-up-name words check. */
function wordsOfDots(dots) {
  return (dots || []).flatMap((dot) => [dot.text, dot.label, dot.title]).filter((word) => typeof word === 'string' && word.trim());
}

/** The dots as a reader gets them: as placed, a `thing` with its kept field card (7d) or null. */
function dotsFor(dots, cards = {}) {
  return (dots || []).map((dot) => (dot.kind === 'thing' ? { ...dot, card: cards?.[dot.id] ? shownCard(cards[dot.id]) : null } : dot));
}

/** A kept field card as every reader sees it (7d); the reader's own correction is added by the card route. */
function shownCard(card) {
  const { v: _v, model: _model, ...shown } = card || {};
  return { ...shown, corrections: Number(card?.corrections) || 0, my_correction: null };
}

// ─── A reader's answer ──────────────────────────────────────────────────────

const ANSWER_SCHEMAS = {
  poll: Joi.object({ choice: Joi.number().integer().min(0).required() }),
  slider: Joi.object({ value: Joi.number().min(0).max(1).required() }),
  board: Joi.object({
    x: Joi.number().min(0).max(1).required(),
    y: Joi.number().min(0).max(1).required(),
    note: Joi.string().trim().max(60).allow('', null),
  }),
  question: Joi.object({ text: Joi.string().trim().min(1).max(200).required() }),
  guess: Joi.object({ choice: Joi.number().integer().min(0), value: Joi.number() }).xor('choice', 'value'),
};

/** The answer to store for `item` from a reader's `body`, or throws 400 PLAY_INVALID. */
function parseAnswer(item, body) {
  const schema = ANSWER_SCHEMAS[item.kind];
  if (!schema) throw fail(400, 'PLAY_INVALID', 'Nothing to answer here.');
  const { error, value } = schema.validate(body || {}, { abortEarly: true, stripUnknown: true });
  if (error) throw fail(400, 'PLAY_INVALID', error.details[0].message.replace(/"/g, ''));
  const bad = () => fail(400, 'PLAY_INVALID', 'That answer doesn\'t fit this item.');
  switch (item.kind) {
    case 'poll':
      if (value.choice >= item.options.length) throw bad();
      return { choice: value.choice };
    case 'slider':
      return { value: round(value.value, 3) };
    case 'board':
      return { x: round(value.x, 3), y: round(value.y, 3), note: value.note ? value.note : null };
    case 'question':
      return { text: value.text };
    default:
      // guess
      if (item.options) {
        if (value.choice == null || value.choice >= item.options.length) throw bad();
        return { choice: value.choice };
      }
      if (value.value == null || value.value < item.range.min || value.value > item.range.max) throw bad();
      return { value: value.value };
  }
}

// ─── What a reader sees ─────────────────────────────────────────────────────

function initialsOf(name) {
  const words = String(name || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
}

function personOf(id, people) {
  const person = people.get(String(id));
  const name = person?.displayName || 'Pantopus member';
  return { id: String(id), name, first_name: name.split(/\s+/)[0], avatar_url: person?.avatarUrl || null, initials: initialsOf(name) };
}

/** The item as placed, without what only the author or a reader who has tried may see. */
function baseOf(item, revealed) {
  const { answer, ...shown } = item;
  return item.kind === 'guess' && revealed ? { ...shown, answer } : shown;
}

function countsOf(rows, size) {
  const counts = new Array(size).fill(0);
  for (const row of rows) if (Number.isInteger(row.value?.choice) && row.value.choice < size) counts[row.value.choice] += 1;
  return { counts, total: rows.length };
}

function averageOf(rows, key = 'value') {
  const values = rows.map((row) => Number(row.value?.[key])).filter(Number.isFinite);
  return { average: values.length ? round(values.reduce((a, b) => a + b, 0) / values.length, 2) : null, count: rows.length };
}

/** Faces on a board or a dial: the reader's own first, then newest; named only for the reader and their connections. */
function facesOf(item, rows, { viewerId, connected, blocked, people }) {
  const shown = rows.filter((row) => !blocked.has(String(row.user_id)));
  const mine = shown.filter((row) => String(row.user_id) === String(viewerId));
  const others = shown.filter((row) => String(row.user_id) !== String(viewerId));
  return [...mine, ...others].slice(0, MAX_FACES).map((row) => {
    const own = String(row.user_id) === String(viewerId);
    return {
      ...(item.kind === 'board' ? { x: row.value.x, y: row.value.y, note: row.value.note || null } : { x: row.value.value }),
      mine: own,
      person: own || connected.has(String(row.user_id)) ? personOf(row.user_id, people) : null,
    };
  });
}

/**
 * One item as `viewerId` reads it (CONTRACT 7b). `rows`: every answer on this item (newest first); `own`: the reader
 * is the author; `open`: answers are taken now on this post.
 */
function itemFor(item, rows, { viewerId, own, open, connected, blocked, people }) {
  const mineRow = own ? null : rows.find((row) => String(row.user_id) === String(viewerId)) || null;
  const answered = Boolean(mineRow);
  const sees = own || answered;
  const answerable = item.kind !== 'countdown';
  const base = baseOf(item, sees);
  const faces = () => facesOf(item, rows, { viewerId, connected, blocked, people });
  let results = null;
  let mine = mineRow ? { ...mineRow.value } : null;
  switch (item.kind) {
    case 'poll':
      if (sees) results = countsOf(rows, item.options.length);
      break;
    case 'slider':
      if (item.look === 'dial') results = { ...(sees ? averageOf(rows) : { average: null, count: rows.length }), faces: faces() };
      else if (sees) results = averageOf(rows);
      break;
    case 'board':
      results = { count: rows.length, faces: faces() };
      break;
    case 'question':
      if (own) results = { count: rows.length };
      break;
    case 'guess':
      if (sees) results = item.options ? countsOf(rows, item.options.length) : averageOf(rows);
      if (mine) {
        mine = item.options
          ? { choice: mine.choice, right: mine.choice === item.answer }
          : { value: mine.value, off_by: round(Math.abs(Number(mine.value) - item.answer), 2) };
      }
      break;
    default:
      break;
  }
  return { ...base, mine, results, open: Boolean(open && answerable && !own) };
}

/**
 * The items of each post for `viewerId`, by post id. `posts`: [{ id, items, own, open }] (posts without items may be
 * left out). `answers`: answersOn() already read for them (a page reads it alongside its posts). One read of the
 * answers for all of them, the reader's connections and blocks alongside, and one read of
 * the people shown by name.
 */
async function playFor(posts, viewerId, { answers: given = null } = {}) {
  const withItems = (posts || []).filter((post) => post.items?.length);
  const out = new Map((posts || []).map((post) => [post.id, []]));
  if (!withItems.length) return out;
  const ids = withItems.map((post) => post.id);
  const needsPeople = withItems.some((post) => post.items.some((item) => item.kind === 'board' || (item.kind === 'slider' && item.look === 'dial')));
  const [answers, connections, blocked] = await Promise.all([
    given || answersOn(ids),
    needsPeople ? connectionIds(viewerId) : [],
    needsPeople ? blockService.blockedUserIds(viewerId).catch(() => new Set()) : new Set(),
  ]);
  const connected = new Set(connections.map(String));
  const blockedSet = new Set([...(blocked || [])].map(String));
  // The people a face names: the reader and their connections among the answerers of a board or a dial.
  const named = new Set();
  for (const post of withItems) {
    for (const item of post.items) {
      if (!(item.kind === 'board' || (item.kind === 'slider' && item.look === 'dial'))) continue;
      for (const row of answers.get(`${post.id}:${item.id}`) || []) {
        const who = String(row.user_id);
        if (who === String(viewerId) || connected.has(who)) named.add(who);
      }
    }
  }
  const people = named.size ? await loadChatPeople([...named]) : new Map();
  for (const post of withItems) {
    out.set(post.id, post.items.map((item) => itemFor(item, answers.get(`${post.id}:${item.id}`) || [], {
      viewerId, own: post.own, open: post.open, connected, blocked: blockedSet, people,
    })));
  }
  return out;
}

/** Every answer on these posts, by `${post_id}:${item}`, newest first. */
async function answersOn(postIds) {
  const { data, error } = await supabaseAdmin.from('PostAnswer').select('id, post_id, user_id, item, kind, value, updated_at')
    .in('post_id', postIds).order('updated_at', { ascending: false }).limit(MAX_ANSWERS_READ);
  if (error) throw new Error(`Failed to load the answers: ${error.message}`);
  const byItem = new Map();
  for (const row of data || []) {
    const key = `${row.post_id}:${row.item}`;
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key).push(row);
  }
  return byItem;
}

// Required when used, not at the top: momentStore requires this file for its answers.
// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');

function connectionIds(viewerId) {
  return momentStore().connectionIds(viewerId);
}

// ─── The post an answer is on ───────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => fail(404, 'PLAY_NOT_FOUND', 'This could not be found.');

/**
 * The post or Moment `id` as `viewerId` may reach it now: { id, items, own, open, moment }. A Moment through the
 * Moments store's own rules (canSee, live only, its author's own included); a post through today's post read rules.
 * 404 PLAY_NOT_FOUND where the reader may not see it; 410 MOMENT_ENDED for a Moment that ended.
 */
async function reach(id, viewerId) {
  if (!UUID.test(String(id || ''))) throw notFound();
  const store = momentStore();
  // eslint-disable-next-line global-require
  const { canReadPost, POST_READ_SELECT } = require('./readAccess');
  const { data: row, error } = await supabaseAdmin.from('Post').select(POST_READ_SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load the post: ${error.message}`);
  if (!row) throw notFound();
  if (row.is_story === true) {
    let moment;
    try {
      moment = await store.openMoment(id, viewerId);
    } catch (openError) {
      if (openError.status === 404) throw notFound();
      throw openError;
    }
    const m = moment.post_metadata?.moment || {};
    return {
      id,
      items: m.play || [],
      dots: m.dots || [],
      cards: m.cards || {},
      own: store.isOwn(moment, viewerId),
      open: store.momentState(moment) === 'live',
      moment,
    };
  }
  const [readable, studio, own] = await Promise.all([
    canReadPost(row, viewerId),
    supabaseAdmin.from('PostStudio').select('studio').eq('post_id', id).maybeSingle(),
    ownPost(row, viewerId),
  ]);
  if (!readable) throw notFound();
  if (studio.error) throw new Error(`Failed to load the post's items: ${studio.error.message}`);
  const kept = studio.data?.studio || {};
  return { id, items: kept.play || [], dots: kept.dots || [], cards: kept.cards || {}, own, open: true, moment: null, studio: studio.data ? kept : null };
}

/**
 * Whether `viewerId` wrote this post. A made-up-name post's user_id is Pantopus's own account, so its writer is found
 * by the made-up names' owner record.
 */
async function ownPost(row, viewerId) {
  // eslint-disable-next-line global-require
  const penName = require('../penName');
  if (!penName.isPenNameRow(row)) return String(row.user_id) === String(viewerId);
  return (await penName.owner.mine(viewerId, 'post', [row.id])).has(String(row.id));
}

function itemOf(target, itemId) {
  const item = target.items.find((candidate) => candidate.id === itemId);
  if (!item) throw notFound();
  return item;
}

async function itemAnswer(target, item, viewerId) {
  const map = await playFor([{ id: target.id, items: [item], own: target.own, open: target.open }], viewerId);
  return map.get(target.id)[0];
}

/** GET /play/:id — the post's items and dots for this reader. */
async function playOf(id, viewerId) {
  const target = await reach(id, viewerId);
  const map = await playFor([{ id: target.id, items: target.items, own: target.own, open: target.open }], viewerId);
  return { play: map.get(target.id) || [], dots: dotsFor(target.dots, target.cards) };
}

/**
 * Writes what the server keeps with a post after posting (its dots, its field cards) through `change`, a function from
 * the kept part (a Moment's post_metadata.moment, a post's PostStudio.studio) to the parts that change.
 */
async function keepWith(target, change) {
  if (target.moment) {
    const store = momentStore();
    const updated = await store.updateMoment(target.moment, { moment: change(target.moment.post_metadata?.moment || {}) });
    if (!updated) throw fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
    return;
  }
  if (!target.studio) throw notFound();
  const next = { ...target.studio, ...change(target.studio) };
  const { error } = await supabaseAdmin.from('PostStudio').update({ studio: next }).eq('post_id', target.id);
  if (error) throw new Error(`Failed to keep the change: ${error.message}`);
}

/** DELETE /dots/:id/:dot — the author removes one dot (and its field card) from their post. */
async function removeDot(id, dotId, viewerId) {
  const target = await reach(id, viewerId);
  if (!target.own || !target.dots.some((dot) => dot.id === dotId)) throw notFound();
  if (target.moment && !target.open) throw fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
  await keepWith(target, (kept) => {
    const { [dotId]: _gone, ...cards } = kept.cards || {};
    return { dots: (kept.dots || []).filter((dot) => dot.id !== dotId), cards };
  });
  logger.info('play.dot_removed', { postId: id, moment: Boolean(target.moment) });
}

/** PUT /play/:id/:item — the reader's answer (CONTRACT 7b). A guess is one try: a second answers the first again. */
async function answer(id, itemId, viewerId, body) {
  const target = await reach(id, viewerId);
  const item = itemOf(target, itemId);
  if (target.own) throw fail(400, 'PLAY_OWN', 'You can\'t answer your own.');
  if (item.kind === 'countdown') throw fail(400, 'PLAY_INVALID', 'Nothing to answer here.');
  if (!target.open) throw fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
  const value = parseAnswer(item, body);
  if (item.kind === 'guess') {
    const { error } = await supabaseAdmin.from('PostAnswer')
      .upsert({ post_id: id, user_id: viewerId, item: item.id, kind: 'guess', value }, { onConflict: 'post_id,item,user_id', ignoreDuplicates: true });
    if (error) throw new Error(`Failed to keep the answer: ${error.message}`);
  } else {
    const { error } = await supabaseAdmin.from('PostAnswer')
      .upsert({ post_id: id, user_id: viewerId, item: item.id, kind: item.kind, value, updated_at: new Date().toISOString() },
        { onConflict: 'post_id,item,user_id' });
    if (error) throw new Error(`Failed to keep the answer: ${error.message}`);
  }
  logger.info('play.answered', { postId: id, item: item.id, kind: item.kind, moment: Boolean(target.moment) });
  return { item: await itemAnswer(target, item, viewerId) };
}

/** DELETE /play/:id/:item — the reader takes their answer back (never a guess). */
async function takeBack(id, itemId, viewerId) {
  const target = await reach(id, viewerId);
  const item = itemOf(target, itemId);
  if (item.kind === 'guess') throw fail(400, 'PLAY_INVALID', 'A guess can\'t be taken back.');
  if (item.kind === 'countdown') throw fail(400, 'PLAY_INVALID', 'Nothing to answer here.');
  if (!target.open) throw fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
  const { error } = await supabaseAdmin.from('PostAnswer').delete().eq('post_id', id).eq('item', item.id).eq('user_id', viewerId);
  if (error) throw new Error(`Failed to take the answer back: ${error.message}`);
}

/** GET /play/:id/:item/answers — the question box's answers or a board's notes, for the author only, newest first. */
async function authorAnswers(id, itemId, viewerId, cursor) {
  const target = await reach(id, viewerId);
  // A thing dot's field card corrections ("Not right?", CONTRACT 7d) are read here too.
  const thing = target.dots.find((dot) => dot.id === itemId && dot.kind === 'thing');
  const item = thing ? { id: thing.id, kind: 'correction' } : itemOf(target, itemId);
  if (!target.own || !['question', 'board', 'correction'].includes(item.kind)) throw notFound();
  const offset = Math.max(0, Number.parseInt(cursor || '0', 10) || 0);
  let query = supabaseAdmin.from('PostAnswer').select('id, user_id, value, updated_at')
    .eq('post_id', id).eq('item', item.id).order('updated_at', { ascending: false }).range(offset, offset + AUTHOR_PAGE);
  if (item.kind === 'board') query = query.not('value->>note', 'is', null);
  if (item.kind === 'correction') query = query.eq('kind', 'correction');
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load the answers: ${error.message}`);
  const rows = (data || []).slice(0, AUTHOR_PAGE);
  const people = await loadChatPeople(rows.map((row) => row.user_id));
  return {
    answers: rows.map((row) => ({
      id: row.id,
      ...(item.kind === 'question' ? { text: row.value?.text || '' }
        : item.kind === 'correction' ? { name: row.value?.name || '', note: row.value?.note || null }
          : { note: row.value?.note || '' }),
      at: row.updated_at,
      person: personOf(row.user_id, people),
    })),
    next_cursor: (data || []).length > AUTHOR_PAGE ? String(offset + AUTHOR_PAGE) : null,
  };
}

/** DELETE /play/:id/:item/answers/:answer — the author removes one answer on their post. */
async function removeAnswer(id, itemId, answerId, viewerId) {
  const target = await reach(id, viewerId);
  const item = itemOf(target, itemId);
  if (!target.own || !UUID.test(String(answerId || ''))) throw notFound();
  const { data, error } = await supabaseAdmin.from('PostAnswer').delete().eq('id', answerId).eq('post_id', id).eq('item', item.id).select('id');
  if (error) throw new Error(`Failed to remove the answer: ${error.message}`);
  if (!data?.length) throw notFound();
  logger.info('play.answer_removed', { postId: id, item: item.id });
}

module.exports = {
  KINDS, MAX_ITEMS, parseItems, wordsOf, parseAnswer, itemFor, playFor, answersOn,
  DOT_KINDS, MAX_DOTS, parseDots, wordsOfDots, dotsFor, shownCard, removeDot, reach, keepWith, playOf, answer, takeBack, authorAnswers, removeAnswer,
};
