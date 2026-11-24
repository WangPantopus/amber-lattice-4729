/**
 * What the assistant writes for the person to send from the app's own screens: a Moment, a letter and a Christmas card,
 * with the two lookups a letter or a card needs (who it can go to, and the cards there are).
 *
 * Each draft works as a post draft does (tools.js create_post_draft): the chat sends the app a `draft` event, the app
 * shows it as a card, and its button opens the app's own composer with everything filled in: the Moments composer,
 * the letter wizard in Mail, or the Christmas card screen. The person looks it over there and sends it there, so
 * everything those screens do still happens: where a Moment is pinned and its one-time 18+ confirmation, a letter's
 * address step and seal, a card's stamps, its look and "Seal and send", and on the phones the identity check that
 * opens Mail. Nothing here writes, sends or spends a stamp.
 *
 * A draft goes only to an app that says it can open it (`cards` lists "moment", "letter" or "christmas_card"); other
 * apps never get these tools, and the assistant says where in the app the person does it instead.
 *
 * The checks here are the ones the screens make before the person could send (the card's own look, POST
 * /api/mailbox/cards/preview; who a search may find, GET /api/mailbox/compose/recipients), so a draft never offers
 * something its composer would refuse.
 */
const logger = require('../../utils/logger');
const { areLaunchFeaturesEnabled } = require('../../utils/featureFlags');
const { isFeatureEnabled } = require('../featureFlagService');
const holidayCards = require('../holidayCards');
const mailStamps = require('../mailStamps');
const mailDelivery = require('../mailDelivery');
const momentStore = require('../moments/momentStore');
const { hasVerifiedSenderHome } = require('../../utils/homeMailAccess');
const { OTHERS_WORDS, isUuid, clip } = require('./assistantKit');

const NOTE = 'One short sentence shown under the draft: the assumption that matters most, or a detail worth adding. Nothing is sent until they send it from the screen the draft opens, so write about the draft, never as if it were sent. Null when there is nothing to say.';

// A Moment's own limits and choices (routes/moments.js createSchema).
const MOMENT_TEXT_MAX = 200;
const MOMENT_CAPTION_MAX = 100;
const MOMENT_BACKGROUNDS = ['teal', 'sky', 'green', 'amber', 'rose', 'slate'];
const MOMENT_HOURS = [1, 6, 24, 48];
const MOMENT_AUDIENCES = ['nearby', 'connections'];
// The letter wizard's first choice ("Porch Call"), as the apps name them.
const LETTER_INTENTS = ['say_hello', 'congratulations', 'condolences', 'business_note', 'just_because'];
// A letter's length here: a page or so. The wizard itself takes more.
const LETTER_MAX = 4000;
// Cards in one answer.
const MAX_CARDS = 40;
const ARRIVAL_WORDS = {
  next_morning: 'With the next morning\'s mail',
  sealed_christmas: 'The next morning, sealed until Christmas',
  christmas_morning: 'On Christmas morning',
  now: 'As soon as they open the email',
};

const cardsOn = () => areLaunchFeaturesEnabled(['mailbox', 'holiday_cards']);
const lettersOn = () => areLaunchFeaturesEnabled(['mailbox', 'mail_extras']);

// ─── Definitions ───────────────────────────────────────────────────────────

const draftMomentDefinition = {
  name: 'draft_moment',
  description: `Draft a Moment for the person to post from the Moments composer, which opens with it filled in: a text card (kind "text": up to ${MOMENT_TEXT_MAX} characters on a coloured card), or the caption for a photo or video they will take or pick there (kind "photo": up to ${MOMENT_CAPTION_MAX} characters). The composer pins it where they are and they post it there. Use it when they ask to post, share or put something on Moments. Defaults: 24 hours, everyone nearby.`,
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['text', 'photo'], description: '"text" for a text card; "photo" when they want to post a photo or video, which they take or pick in the composer.' },
      text: { type: 'string', description: `The card's words (kind text) or the caption (kind photo), in their voice. A caption may be empty.` },
      background: { type: ['string', 'null'], enum: [...MOMENT_BACKGROUNDS, null], description: 'A text card\'s colour, or null for teal.' },
      hours: { type: ['integer', 'null'], enum: [...MOMENT_HOURS, null], description: 'How long it stays up, or null for 24.' },
      audience: { type: ['string', 'null'], enum: [...MOMENT_AUDIENCES, null], description: '"nearby" (everyone nearby) or "connections" (only their connections). Null for nearby.' },
      note: { type: ['string', 'null'], description: NOTE },
    },
    required: ['kind', 'text', 'background', 'hours', 'audience', 'note'],
    additionalProperties: false,
  },
};

const findRecipientsDefinition = {
  name: 'find_recipients',
  description: "Who the person can address a letter or a Christmas card to, by a name: the people in their household, their connections, then anyone on Pantopus their own name search may find, at most ten, as the \"who is it to\" search in Mail lists them. Each has a person_id, the name they show and their town when the person may see it. It also gives `signing_as`, the person's own first name: sign a letter or a card's note with it. Use it before draft_letter or draft_christmas_card to turn a name (\"Maya\", \"my mom Linda\") into a person_id; never guess one. When several match, ask which one in one short question, naming them by name and town.",
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 60, description: 'The name or part of it, as they said it.' },
      people_only: { type: ['boolean', 'null'], description: 'True for a Christmas card, which goes to a person and never to a business. Null or false for a letter.' },
    },
    required: ['name', 'people_only'],
    additionalProperties: false,
  },
};

const findCardsDefinition = {
  name: 'find_cards',
  description: "The Christmas cards they can send from Mail (\"Send a Christmas card\"): the collections, and the cards in one collection or matching some words, each with its design_id and the words printed under its picture. You never see the pictures: choose by the collection (who it says it is for) and those words, and say so if they ask what a picture shows. Also says how many stamps they have left when cards need stamps, when a card can arrive, and the day sending closes. Use it before draft_christmas_card, and for \"what cards are there\".",
  input_schema: {
    type: 'object',
    properties: {
      collection: { type: ['string', 'null'], enum: [...holidayCards.COLLECTIONS.map((c) => c.id), null], description: 'One collection\'s cards, or null.' },
      query: { type: ['string', 'null'], maxLength: 80, description: 'Words to look for in the words under the pictures ("snow", "cookies", "grandma"), or null.' },
    },
    required: ['collection', 'query'],
    additionalProperties: false,
  },
};

const draftLetterDefinition = {
  name: 'draft_letter',
  description: `Draft a letter for the person to send from Mail, where the letter wizard opens with who it is to and the letter filled in; they check the address, pick the paper and seal, and send it there. A letter is to one person or business on Pantopus: find them with find_recipients first. Write the whole letter in their voice, greeting and sign-off included, up to ${LETTER_MAX} characters, in plain paragraphs. Use it when they ask to write, draft or send a letter or mail to someone.`,
  input_schema: {
    type: 'object',
    properties: {
      to_person_id: { type: 'string', description: 'The person_id from find_recipients.' },
      intent: { type: ['string', 'null'], enum: [...LETTER_INTENTS, null], description: 'What kind of letter it is. Null for say_hello.' },
      body: { type: 'string', description: 'The letter, in their voice.' },
      note: { type: ['string', 'null'], description: NOTE },
    },
    required: ['to_person_id', 'intent', 'body', 'note'],
    additionalProperties: false,
  },
};

const draftChristmasCardDefinition = {
  name: 'draft_christmas_card',
  description: `Draft a Christmas card for the person to send from Mail, where the card screen opens with the picture, who it is to, the note on the back and when it arrives filled in; they look it over, sign it if they like, and seal and send it there. It goes to one person on Pantopus (to_person_id from find_recipients) or to an email address they gave you. Pick the design with find_cards. The note is in their voice, up to ${holidayCards.MESSAGE_LIMIT} characters. Arrival: next_morning, sealed_christmas (comes the next morning, opens on Christmas morning) or christmas_morning; null for next_morning. Use it when they ask to send, make or write a Christmas card.`,
  input_schema: {
    type: 'object',
    properties: {
      design_id: { type: 'string', description: 'The design_id from find_cards.' },
      to_person_id: { type: ['string', 'null'], description: 'The person_id from find_recipients, or null when it goes by email.' },
      to_email: { type: ['string', 'null'], description: 'An email address they gave you, for someone not on Pantopus. Null otherwise.' },
      message: { type: 'string', description: 'The note on the back, in their voice.' },
      arrival: { type: ['string', 'null'], enum: ['next_morning', 'sealed_christmas', 'christmas_morning', null] },
      note: { type: ['string', 'null'], description: NOTE },
    },
    required: ['design_id', 'to_person_id', 'to_email', 'message', 'arrival', 'note'],
    additionalProperties: false,
  },
};

const composeToolDefinitions = [
  draftMomentDefinition, findRecipientsDefinition, findCardsDefinition, draftLetterDefinition, draftChristmasCardDefinition,
];
const COMPOSE_TOOL_NAMES = new Set(composeToolDefinitions.map((tool) => tool.name));
// The draft type each tool's card has, as the app's `cards` names it.
const COMPOSE_DRAFT_TYPES = { draft_moment: 'moment', draft_letter: 'letter', draft_christmas_card: 'christmas_card' };
const COMPOSE_CLOSINGS = {
  draft_moment: "Here's your Moment. Open it in Moments to post it.",
  draft_letter: "Here's your letter. Open it in Mail to address and send it.",
  draft_christmas_card: "Here's your card. Open it to look it over and send it.",
};

/**
 * Which of these tools a chat gets. `momentDrafts`, `letterDrafts` and `cardDrafts` say the app can open that draft
 * (`cards` lists "moment", "letter", "christmas_card"); `moments` is the person's Moments flag. The lookups go wherever
 * one of the drafts they serve goes; find_cards also answers "what cards are there" for any app while cards are on.
 */
function composeToolOffered(name, { momentDrafts = false, letterDrafts = false, cardDrafts = false, moments = false } = {}) {
  const letter = lettersOn() && letterDrafts;
  const card = cardsOn() && cardDrafts;
  if (name === 'draft_moment') return Boolean(moments) && momentDrafts;
  if (name === 'draft_letter') return letter;
  if (name === 'draft_christmas_card') return card;
  if (name === 'find_recipients') return letter || card;
  if (name === 'find_cards') return cardsOn();
  return false;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
}

/** Their words kept as written: line breaks stay, edges and runs of blank lines go. */
function ownWords(value, max) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return [...text].slice(0, max).join('');
}

const lettersIn = (text) => [...text].length;

function drafted(type, draft, note, tool) {
  const text = typeof note === 'string' && note.trim() ? clip(note, 300) : null;
  return { draftType: type, draft, valid: true, note: text, closing: COMPOSE_CLOSINGS[tool] };
}

// The compose routes live in the routes' own files; required when first used, since those files load the assistant.
const mailCompose = () => require('../../routes/mailCompose');
const mailbox = () => require('../../routes/mailbox');

async function zoneOf(ctx) {
  return (await mailDelivery.personTimeZone(ctx.userId).catch(() => null)) || ctx.timeZone || mailDelivery.FALLBACK_TIME_ZONE;
}

// ─── A Moment ──────────────────────────────────────────────────────────────

async function draftMoment(args, ctx) {
  const on = typeof ctx.momentsEnabled === 'boolean' ? ctx.momentsEnabled : await isFeatureEnabled('moments', ctx.user).catch(() => false);
  if (!on) return { error: "Moments aren't available for this person yet." };
  const kind = args.kind === 'photo' ? 'photo' : 'text';
  const max = kind === 'text' ? MOMENT_TEXT_MAX : MOMENT_CAPTION_MAX;
  const text = ownWords(args.text, 4000).replace(/\s*\n\s*/g, ' ');
  if (kind === 'text' && !text) return { error: 'A text card needs its words. Ask what they want it to say, in one short question.' };
  if (lettersIn(text) > max) {
    return { error: `${kind === 'text' ? 'A text card holds' : 'A caption holds'} up to ${max} characters and this has ${lettersIn(text)}. Write it again, shorter.` };
  }
  const draft = compact({
    kind,
    ...(kind === 'text' ? { text, background: MOMENT_BACKGROUNDS.includes(args.background) ? args.background : 'teal' } : { caption: text || null }),
    hours: (momentStore.HOURS || MOMENT_HOURS).includes(args.hours) ? args.hours : 24,
    audience: MOMENT_AUDIENCES.includes(args.audience) ? args.audience : 'nearby',
  });
  return drafted('moment', draft, args.note, 'draft_moment');
}

// ─── Who it can go to ──────────────────────────────────────────────────────

const HOW_KNOWN = ['in their household', 'a connection', 'found by name on Pantopus'];

/** The compose search's own list for this name (routes/mailCompose.searchRecipients), ranks kept. */
async function recipientsFor(ctx, name, peopleOnly) {
  const query = String(name || '').trim();
  if (query.length < 2) return [];
  return mailCompose().searchRecipients(ctx.userId, { query, homeId: null, peopleOnly: Boolean(peopleOnly) });
}

async function findRecipients(args, ctx) {
  const name = clip(args.name, 60);
  if (!name || name.length < 2) return { error: 'Give at least two letters of the name.' };
  const [found, signingAs] = await Promise.all([recipientsFor(ctx, name, args.people_only), ownFirstName(ctx)]);
  // What a turn's drafts may address: only people this search showed the person.
  ctx.recipients ||= new Map();
  for (const person of found) ctx.recipients.set(String(person.userId).toLowerCase(), person);
  return compact({
    note: `${OTHERS_WORDS} Names are as each person shows theirs.`,
    signing_as: signingAs,
    people: found.map((person) => compact({
      person_id: person.userId,
      name_text: clip(person.name, 80),
      handle_text: clip(person.username, 40),
      town: clip(person.homeAddress, 80),
      verified: person.isVerified ? true : null,
    })),
    empty: found.length ? null : `Nobody they can write to matches "${name}". They may not be on Pantopus, or may not let people find them by name. A Christmas card can also go to an email address.`,
  });
}

/** The person's own first name as others read it, to sign with; null when it can't be read. */
async function ownFirstName(ctx) {
  try {
    const { loadChatPeople } = require('../chatPeople');
    const person = (await loadChatPeople([ctx.userId])).get(String(ctx.userId));
    const name = clip(person?.displayName, 80);
    return name ? name.split(' ')[0] : null;
  } catch {
    return null;
  }
}

/** The person a draft is for, from this turn's search or looked up again by id. null when they can't be written to. */
async function recipientOf(ctx, personId, peopleOnly) {
  if (!isUuid(personId)) return null;
  const id = personId.toLowerCase();
  if (String(ctx.userId).toLowerCase() === id) return null;
  const known = ctx.recipients?.get(id);
  if (known) return known;
  // A person_id from an earlier turn: allowed only if the card's own rule still finds them.
  if (!(await mailCompose().personFindableBy(ctx.userId, id))) return null;
  const supabaseAdmin = require('../../config/supabaseAdmin');
  const { data: user } = await supabaseAdmin.from('User').select('id, name, username, verified, account_type').eq('id', id).maybeSingle();
  if (!user || (peopleOnly && user.account_type === 'business')) return null;
  const { loadChatPeople } = require('../chatPeople');
  const person = (await loadChatPeople([user.id]).catch(() => new Map())).get(String(user.id));
  return {
    userId: user.id,
    name: person?.displayName || user.name || user.username,
    username: person?.handle || user.username || null,
    homeId: null,
    homeAddress: null,
    isVerified: Boolean(user.verified),
    homeMediaUrl: null,
    isOnPantopus: true,
  };
}

// ─── A letter ──────────────────────────────────────────────────────────────

async function draftLetter(args, ctx) {
  if (!lettersOn()) return { error: "Letters aren't available in the app yet." };
  const body = ownWords(args.body, LETTER_MAX + 1);
  if (!body) return { error: 'A letter needs its words. Ask what they want to say, in one short question.' };
  if (lettersIn(body) > LETTER_MAX) return { error: `Keep the letter under ${LETTER_MAX} characters. Write it again, shorter.` };
  // The send's own first rule (POST /api/mailbox/send): letters go out from a verified home address.
  if (!(await hasVerifiedSenderHome(ctx.userId))) {
    return { error: "They can't send letters yet: a letter goes out from a verified home address. Say so, and that they verify their address on Place (the home_verify_postcard or home_claim_status button)." };
  }
  const recipient = await recipientOf(ctx, args.to_person_id, false);
  if (!recipient) return { error: 'That person can\'t be written to from here. Use find_recipients with their name and take the person_id from it.' };
  return drafted('letter', {
    // The recipient as the letter wizard's own search gives one, so the app fills its "who is it to" with it.
    recipient,
    intent: LETTER_INTENTS.includes(args.intent) ? args.intent : 'say_hello',
    body,
  }, args.note, 'draft_letter');
}

// ─── A Christmas card ──────────────────────────────────────────────────────

const designForModel = (design) => ({
  design_id: design.id,
  words_under_picture: design.caption,
  collection: holidayCards.COLLECTIONS.find((c) => c.id === design.collection)?.name || null,
});

const wordsOf = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter((word) => word.length > 1);

async function findCards(args, ctx) {
  if (!cardsOn()) return { error: "Christmas cards aren't available in the app yet." };
  const zone = await zoneOf(ctx);
  if (!holidayCards.seasonOpen(zone)) return { empty: `Christmas cards closed for the season on ${holidayCards.SEASON.closes_on}. Cards already sent stay in Sent.` };
  const collection = holidayCards.COLLECTIONS.find((c) => c.id === args.collection) || null;
  const asked = wordsOf(args.query);
  let stamps = null;
  // The Stamps wallet is in Mail, which the phones open only after their identity check: the count is read only once
  // that check has passed (tools.js PRIVATE_TOOL_NAMES follows the same rule for Mail and the Wallet).
  if (mailStamps.enabled(ctx.userId) && !ctx.identity) {
    stamps = { each_card_uses: 1, count: 'Their stamp count shows on the card screen and in Mail, Stamps; it isn\'t read here.' };
  } else if (mailStamps.enabled(ctx.userId)) {
    const balance = await mailStamps.balance(ctx.userId).catch(() => null);
    stamps = balance
      ? { each_card_uses: 1, free_left: Math.max(0, Number(balance.free_remaining) || 0), bought_left: Math.max(0, Number(balance.paid_remaining) || 0) }
      : { each_card_uses: 1, not_checked: "Their stamps couldn't be read just now." };
  }
  const about = compact({
    where_in_app: 'Mail, "Send a Christmas card" (also in the side menu)',
    sending_closes: holidayCards.SEASON.closes_on,
    note_limit: holidayCards.MESSAGE_LIMIT,
    arrives: 'The next morning with the mail; the next morning sealed until Christmas; or on Christmas morning. By email, when they open it.',
    stamps: stamps || 'No stamps needed: one card a day.',
  });
  if (!collection && !asked.length) {
    return {
      ...about,
      collections: holidayCards.COLLECTIONS.map((c) => ({ collection: c.id, name: c.name, for: c.line, cards: c.designs.length })),
      next: 'Read one collection, or give words to look for, to get design_ids.',
    };
  }
  const pool = collection ? holidayCards.DESIGNS.filter((design) => design.collection === collection.id) : holidayCards.DESIGNS;
  const found = pool.filter((design) => {
    if (!asked.length) return true;
    const have = wordsOf(`${design.caption} ${holidayCards.COLLECTIONS.find((c) => c.id === design.collection)?.name || ''}`);
    return asked.every((word) => have.some((own) => own.startsWith(word)));
  });
  const shown = found.slice(0, MAX_CARDS);
  return compact({
    ...about,
    collection: collection ? { collection: collection.id, name: collection.name, for: collection.line } : null,
    cards: shown.map(designForModel),
    more: found.length > shown.length ? found.length - shown.length : null,
    empty: shown.length ? null : 'No card has those words under its picture. Try other words, or read a collection.',
  });
}

async function draftChristmasCard(args, ctx) {
  if (!cardsOn()) return { error: "Christmas cards aren't available in the app yet." };
  const design = holidayCards.designById(args.design_id);
  if (!design) return { error: 'That is not a card. Use find_cards and take a design_id from it.' };
  const message = ownWords(args.message, 4000);
  if (!message) return { error: 'A card needs a note on the back. Write a short one in their voice, or ask what they want to say.' };
  if (lettersIn(message) > holidayCards.MESSAGE_LIMIT) {
    return { error: `The back of a card holds ${holidayCards.MESSAGE_LIMIT} characters and this note has ${lettersIn(message)}. Write it again, shorter.` };
  }
  const email = typeof args.to_email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.to_email.trim()) ? args.to_email.trim() : null;
  let recipient = null;
  if (args.to_person_id) {
    recipient = await recipientOf(ctx, args.to_person_id, true);
    if (!recipient) return { error: 'A card can\'t go to that person from here. Use find_recipients with their name (people_only true) and take the person_id from it.' };
  } else if (!email) {
    return { error: 'Say who the card is to: a person_id from find_recipients, or an email address they gave you.' };
  }
  const to = recipient ? { user_id: recipient.userId } : { email };
  const wanted = Object.keys(ARRIVAL_WORDS).includes(args.arrival) ? args.arrival : 'next_morning';

  // The card screen's own look (POST /api/mailbox/cards/preview): the design, the note, the season, the day's cards,
  // the person or the address, and when it can arrive by their clock.
  let arrival = wanted;
  const look = async (choice) => mailbox().checkCard(ctx.userId, { design: design.id, message, arrival: choice, to }, new Date());
  let checked = await look(arrival);
  if (checked.refusal && arrival !== 'next_morning') {
    // A choice that has closed for them (too near Christmas where they live): the plain one still goes.
    const plain = await look('next_morning');
    if (!plain.refusal) {
      arrival = 'next_morning';
      checked = plain;
    }
  }
  if (checked.refusal) {
    const words = checked.refusal.body?.error || checked.refusal.body?.message || "This card can't be sent right now.";
    return { error: `The card screen would refuse this card: ${clip(String(words), 240)} Say so in your own words; don't draft it again unless something changes.` };
  }
  return drafted('christmas_card', compact({
    design: { id: design.id, caption: design.caption, collection: design.collection },
    to: recipient ? { user_id: recipient.userId, name: clip(recipient.name, 80) } : { email },
    message,
    arrival,
    arrival_label: ARRIVAL_WORDS[arrival],
    arrival_changed: arrival !== wanted ? `It can't arrive "${ARRIVAL_WORDS[wanted].toLowerCase()}" anymore, so it's set to come with the next morning's mail.` : null,
  }), args.note, 'draft_christmas_card');
}

// ─── Dispatch ──────────────────────────────────────────────────────────────

const EXECUTORS = {
  draft_moment: draftMoment,
  find_recipients: findRecipients,
  find_cards: findCards,
  draft_letter: draftLetter,
  draft_christmas_card: draftChristmasCard,
};

async function runComposeTool(name, args, ctx) {
  const executor = EXECUTORS[name];
  if (!executor) return null;
  try {
    return await executor(args || {}, ctx);
  } catch (err) {
    logger.warn('assistant compose tool failed', { tool: name, userId: ctx.userId, error: err?.message });
    return { error: `That couldn't be done just now (${name}). Say so, and that they can do it in the app.` };
  }
}

module.exports = {
  composeToolDefinitions,
  runComposeTool,
  composeToolOffered,
  COMPOSE_TOOL_NAMES,
  COMPOSE_DRAFT_TYPES,
  COMPOSE_CLOSINGS,
  cardsOn,
  lettersOn,
};
