// Made-up names: the names themselves.
//
// A person types the name they want to go by, or leaves it empty and Pantopus gives them one (the founder, 2026-11-25:
// "users can come up with a name themselves otherwise we assign them something"). A typed name is checked before it
// is kept: not taken, not a person's or a business's name on Pantopus, not an official, Pantopus itself or a real
// person's full name, and not abusive. The picture is always drawn here, never a photo.
//
// A pen name is an "AudienceIdentity" row of kind 'pen_name' with no account on it; whose it is lives only behind
// owner.js. Names and pictures never change once taken, so they are kept in memory.

const crypto = require('crypto');
const supabaseAdmin = require('../../config/supabaseAdmin');
const logger = require('../../utils/logger');
const owner = require('./owner');

// A used name may be replaced this long after it was taken. One nothing was written under may be replaced at once.
const MIN_DAYS_BETWEEN_NAMES = 30;
const NAME_MIN = 3;
const NAME_MAX = 24;
const PEN_NAME_COLUMNS = 'id, display_name, avatar_url, status, lineage_id, retired_at, created_at';

const FIRST_WORDS = [
  'Quiet', 'Amber', 'Mossy', 'Silver', 'Misty', 'Gentle', 'Bright', 'Early', 'Late', 'Steady', 'Mellow', 'Breezy',
  'Dusky', 'Sunny', 'Rainy', 'Frosty', 'Golden', 'Copper', 'Velvet', 'Hazel', 'Rustic', 'Tidal', 'Cedar', 'Maple',
  'Willow', 'Juniper', 'Clover', 'Pebble', 'Harbor', 'Meadow', 'Canyon', 'Summit', 'Prairie', 'Coastal', 'Northern',
  'Western', 'Evening', 'Morning', 'Autumn', 'Winter', 'Spring', 'Summer', 'Drifting', 'Wandering', 'Patient',
  'Curious', 'Cheerful', 'Humble', 'Nimble', 'Sturdy', 'Lucky', 'Merry', 'Calm', 'Cozy', 'Daring', 'Eager', 'Fair',
  'Glad', 'Hearty', 'Jolly', 'Keen', 'Lively', 'Mild', 'Noble', 'Plucky', 'Tidy', 'Witty', 'Zesty', 'Bold',
];
const SECOND_WORDS = [
  'Heron', 'Osprey', 'Salmon', 'Otter', 'Marmot', 'Chickadee', 'Kestrel', 'Sparrow', 'Finch', 'Wren', 'Robin',
  'Swallow', 'Plover', 'Egret', 'Loon', 'Grebe', 'Pelican', 'Puffin', 'Falcon', 'Hawk', 'Owl', 'Raven', 'Jay',
  'Beaver', 'Badger', 'Fox', 'Lynx', 'Elk', 'Moose', 'Bison', 'Hare', 'Rabbit', 'Squirrel', 'Chipmunk', 'Hedgehog',
  'Turtle', 'Newt', 'Trout', 'Sturgeon', 'Crab', 'Starfish', 'Urchin', 'Seal', 'Orca', 'Dolphin', 'Firefly',
  'Dragonfly', 'Bumblebee', 'Ladybug', 'Cricket', 'Fern', 'Madrona', 'Alder', 'Aspen', 'Birch', 'Spruce', 'Larch',
  'Huckleberry', 'Thimbleberry', 'Lupine', 'Trillium', 'Sage', 'Thistle', 'Acorn', 'Pinecone', 'Lichen',
  'Driftwood', 'Tidepool', 'Lantern',
];

// Words a typed name may not contain (compared on the folded name): they pose as Pantopus, as someone in charge, or
// as the words the apps use for a writer nobody can name.
const RESERVED = [
  'pantopus', 'admin', 'moderator', 'support', 'staff', 'official', 'police', 'sheriff', 'officer', 'deputy', 'trooper',
  'detective', 'mayor', 'council', 'senator', 'governor', 'government', 'cityof', 'countyof', 'townof', 'stateof',
  'firedept', 'firedepartment', 'firemarshal', 'emergency', 'security', 'verified', 'system', 'anonymous',
  'someonenearby', 'deleted', 'removed', 'member', 'curator', 'helpdesk', 'customerservice', 'postmaster', 'usps',
];

function fail(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

/** A name folded for comparison: no marks, lower case, letters and digits only. "Quiet Héron" and "quiet-heron" match. */
function nameKey(name) {
  return String(name || '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** A typed name as it will be shown: trimmed, single spaces. */
function tidy(name) {
  return String(name || '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * The rules a typed name must meet before anything is looked up. Returns the tidy name, or throws with a sentence
 * the apps show as it is.
 */
function checkTypedShape(raw) {
  const name = tidy(raw);
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw fail('PEN_NAME_LENGTH', `A made-up name is ${NAME_MIN} to ${NAME_MAX} characters long.`);
  }
  if (!/^[\p{L}\p{N} .'-]+$/u.test(name)) {
    throw fail('PEN_NAME_CHARACTERS', 'A made-up name can have letters, numbers, spaces, hyphens, periods and apostrophes.');
  }
  if ((name.match(/\p{L}/gu) || []).length < 2) {
    throw fail('PEN_NAME_CHARACTERS', 'A made-up name needs at least two letters.');
  }
  if (name.split(' ').length > 3) {
    throw fail('PEN_NAME_LENGTH', 'A made-up name is at most three words.');
  }
  const key = nameKey(name);
  if (key.length < 2 || RESERVED.some((word) => key.includes(word))) {
    throw fail('PEN_NAME_RESERVED', "That name isn't available. Try another.");
  }
  return name;
}

/** Whether a person, a business or a profile on Pantopus already goes by these words. Fails closed (true). */
async function matchesSomeone(name) {
  const key = nameKey(name);
  // The name has only letters, digits, spaces, hyphens, periods and apostrophes (checkTypedShape): no pattern characters.
  try {
    const reads = await Promise.all([
      supabaseAdmin.from('LocalProfile').select('id').ilike('display_name', name).limit(1),
      supabaseAdmin.from('LocalProfile').select('id').eq('handle_normalized', key).limit(1),
      supabaseAdmin.from('User').select('id').ilike('name', name).limit(1),
      supabaseAdmin.from('User').select('id').ilike('username', key).limit(1),
      supabaseAdmin.from('PublicPersona').select('id').eq('handle_normalized', key).limit(1),
    ]);
    for (const { data, error } of reads) {
      if (error) throw error;
      if (data?.length) return true;
    }
    return false;
  } catch (error) {
    logger.warn('penName.name_match_unavailable', { error: error.message });
    return true;
  }
}

const NAME_CHECK_SCHEMA = {
  type: 'object',
  properties: { verdict: { type: 'string', enum: ['ok', 'refuse'] } },
  required: ['verdict'],
  additionalProperties: false,
};
const NAME_CHECK_SYSTEM = `You check a made-up name someone wants to post under on Pantopus, an app for people who live near each other. The name hides who they are from the people around them, so it must not pose as anyone.

Answer "refuse" when the name:
- reads as a real person's name: a first and last name, or a title with a name (Dr. Patel, Coach Miller, Mrs. Greene);
- poses as an official, an agency, a company, a school, a place of worship, a public figure or Pantopus;
- is abusive, hateful, sexual or threatening, or hides such a word in other spelling;
- holds a phone number, an address, an email address or a link.

Everything else is "ok": a single ordinary first name or nickname (Sam, Birdie), invented words, and playful names (Quiet Heron, Night Gardener, Tired Dad of Three).`;
const NAME_CHECK_TIMEOUT_MS = 12 * 1000;

/** 'ok', 'refuse', or 'unchecked' when the check can't run. Never throws. */
async function checkTypedMeaning(name) {
  try {
    // eslint-disable-next-line global-require
    const { getAnthropicClient, resolveModel, CHAT_MODEL } = require('../../config/anthropic');
    // eslint-disable-next-line global-require
    const { complete, AIRefusalError } = require('../ai/llm');
    const client = getAnthropicClient();
    if (!client) return 'unchecked';
    try {
      const { text } = await complete({
        client,
        model: resolveModel(process.env.ANTHROPIC_PEN_NAME_CHECK_MODEL, CHAT_MODEL),
        system: NAME_CHECK_SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: `The name: ${JSON.stringify(name)}` }] }],
        effort: 'low',
        schema: NAME_CHECK_SCHEMA,
        maxTokens: 256,
        timeoutMs: NAME_CHECK_TIMEOUT_MS,
        cacheSystem: false,
      });
      const verdict = JSON.parse(text)?.verdict;
      return verdict === 'ok' || verdict === 'refuse' ? verdict : 'unchecked';
    } catch (error) {
      if (error instanceof AIRefusalError) return 'refuse';
      throw error;
    }
  } catch (error) {
    logger.warn('penName.name_check_unavailable', { error: error.message });
    return 'unchecked';
  }
}

function pick(list) {
  return list[crypto.randomInt(list.length)];
}

function drawName() {
  return `${pick(FIRST_WORDS)} ${pick(SECOND_WORDS)}`;
}

/** Up to `count` names Pantopus could give that nobody holds. */
async function suggestions(count = 4) {
  const wanted = Math.min(Math.max(Number(count) || 1, 1), 8);
  const drawn = new Map();
  for (let i = 0; drawn.size < wanted * 3 && i < wanted * 12; i += 1) {
    const name = drawName();
    drawn.set(nameKey(name), name);
  }
  const { data, error } = await supabaseAdmin.from('AudienceIdentity').select('name_key')
    .eq('kind', owner.KIND).in('name_key', [...drawn.keys()]);
  if (error) throw error;
  for (const row of data || []) drawn.delete(row.name_key);
  return [...drawn.values()].slice(0, wanted);
}

// The picture: a small drawn scene (a sky, a sun or moon, two hills) whose colors and shapes come from the name. It is
// shapes only, no letters, so it draws the same wherever the server runs.
const SKIES = ['#2F6F8F', '#4E7A5B', '#8A5A83', '#B9683F', '#3F5F9E', '#6B6F3A', '#9A4F5E', '#2F7F7A'];
const HILLS = ['#1F3D4D', '#27432F', '#45304A', '#5C3320', '#22335A', '#3A3D1E', '#4F2832', '#18433F'];

function pictureSvg(seed) {
  const bytes = crypto.createHash('sha256').update(`pantopus:pen-name-picture:v1:${seed}`).digest();
  const sky = SKIES[bytes[0] % SKIES.length];
  const hill = HILLS[bytes[0] % HILLS.length];
  const sunX = 64 + (bytes[1] % 128);
  const sunY = 56 + (bytes[2] % 56);
  const sunR = 22 + (bytes[3] % 14);
  const crescent = bytes[4] % 2 === 0;
  const ridgeA = 150 + (bytes[5] % 40);
  const ridgeB = 170 + (bytes[6] % 40);
  const peak = 60 + (bytes[7] % 136);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<rect width="256" height="256" fill="${sky}"/>
<circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="#FFFFFF" fill-opacity="0.92"/>
${crescent ? `<circle cx="${sunX + sunR * 0.45}" cy="${sunY - sunR * 0.2}" r="${sunR * 0.9}" fill="${sky}"/>` : ''}
<path d="M0 ${ridgeA} Q ${peak} ${ridgeA - 70} 256 ${ridgeB} L256 256 L0 256 Z" fill="${hill}" fill-opacity="0.55"/>
<path d="M0 ${ridgeB + 20} Q ${256 - peak} ${ridgeB - 30} 256 ${ridgeA + 40} L256 256 L0 256 Z" fill="${hill}"/>
</svg>`;
}

/** Draws and stores the picture for a new name. Returns its address, or null when it can't be stored. */
async function storePicture(seed) {
  try {
    // eslint-disable-next-line global-require
    const sharp = require('sharp');
    // eslint-disable-next-line global-require
    const s3 = require('../s3Service');
    const png = await sharp(Buffer.from(pictureSvg(seed))).png().toBuffer();
    // An opaque file name: it carries no account and no name.
    const { url } = await s3.uploadToS3(png, s3.generateOpaqueS3Key('pen-names', 'picture.png'), 'image/png');
    return url || null;
  } catch (error) {
    logger.warn('penName.picture_unavailable', { error: error.message });
    return null;
  }
}

function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.display_name,
    avatar_url: row.avatar_url || null,
    retired: row.status !== 'active',
    taken_at: row.created_at,
  };
}

// Names by id, for drawing authors. The words and picture never change; only `status` can (a retired name), and no
// card depends on it, so a short life is enough.
const CACHE_MS = 5 * 60 * 1000;
const CACHE_MAX = 5000;
const cache = new Map();

function remember(row) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(String(row.id), { row, at: Date.now() });
}

/** The pen-name rows for these ids: a Map by id. A name that can't be read is left out (its card says "Someone nearby"). */
async function rowsById(ids) {
  const wanted = [...new Set((ids || []).filter(Boolean).map(String))];
  const found = new Map();
  const missing = [];
  for (const id of wanted) {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < CACHE_MS) found.set(id, hit.row);
    else missing.push(id);
  }
  if (missing.length) {
    try {
      const { data, error } = await supabaseAdmin.from('AudienceIdentity').select(PEN_NAME_COLUMNS)
        .eq('kind', owner.KIND).in('id', missing);
      if (error) throw error;
      for (const row of data || []) {
        remember(row);
        found.set(String(row.id), row);
      }
    } catch (error) {
      logger.warn('penName.names_unavailable', { error: error.message });
    }
  }
  return found;
}

/** The account's pen name in use, as its owner reads it, or null. */
async function ofOwner(ownerId) {
  const id = await owner.currentId(ownerId);
  if (!id) return null;
  const row = (await rowsById([id])).get(String(id));
  return row ? { ...serialize(row), row } : null;
}

/**
 * Takes a name for the account. `typed`: the words the person chose; empty lets Pantopus give one. `replace`: give up
 * the name in use (free while nothing was written under it, else once every MIN_DAYS_BETWEEN_NAMES).
 * Throws { code, status, message } with a sentence the apps show as it is.
 */
async function take({ ownerId, typed, replace = false }) {
  const wantsOwn = tidy(typed).length > 0;
  let name;
  if (wantsOwn) {
    name = checkTypedShape(typed);
    if (await matchesSomeone(name)) throw fail('PEN_NAME_TAKEN', 'That name is taken. Try another.', 409);
    const verdict = await checkTypedMeaning(name);
    if (verdict === 'refuse') throw fail('PEN_NAME_REFUSED', "That name can't be used. A made-up name can't be a real person's name, an official or a business.");
    if (verdict !== 'ok') {
      throw fail('PEN_NAME_CHECK_UNAVAILABLE', "We can't check a name right now. Try again in a little while, or let Pantopus pick one for you.", 503);
    }
  }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = wantsOwn ? name : (await suggestions(1))[0] || `${drawName()} ${crypto.randomInt(10, 100)}`;
    const handle = `pn_${crypto.randomBytes(9).toString('hex')}`;
    try {
      const id = await owner.take({
        ownerId, name: candidate, nameKey: nameKey(candidate), handle,
        avatarUrl: await storePicture(handle), source: wantsOwn ? 'user_selected' : 'generated',
        replace, minDays: MIN_DAYS_BETWEEN_NAMES,
      });
      return serialize((await rowsById([id])).get(String(id)) || { id, display_name: candidate, status: 'active' });
    } catch (error) {
      if (error.code === 'PEN_NAME_TAKEN') {
        if (wantsOwn) throw fail('PEN_NAME_TAKEN', 'That name is taken. Try another.', 409);
        continue;
      }
      if (error.code === 'PEN_NAME_EXISTS') throw fail('PEN_NAME_EXISTS', 'You already have a made-up name.', 409);
      if (error.code === 'PEN_NAME_TOO_SOON') {
        throw fail('PEN_NAME_TOO_SOON', `You can change your made-up name once every ${MIN_DAYS_BETWEEN_NAMES} days.`, 409);
      }
      throw error;
    }
  }
  throw fail('PEN_NAME_UNAVAILABLE', "We couldn't find a free name. Please try again.", 503);
}

module.exports = {
  MIN_DAYS_BETWEEN_NAMES,
  NAME_MIN,
  NAME_MAX,
  nameKey,
  checkTypedShape,
  suggestions,
  rowsById,
  ofOwner,
  take,
  serialize,
  pictureSvg,
};
