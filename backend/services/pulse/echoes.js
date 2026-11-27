'use strict';

// Pulse, reinvented, phase 4: Echoes and curiosity twins (coord CONTRACT 9e; the founder's decision 11 and its four
// rules: opt-in, public places only, never at home, and names show only when both people say yes). "You and 2 others
// caught tonight's sunset at Lacamas Lake." "You and 1 other both collected 4 chanterelle cards." Read by the person for
// their own day; nothing is pushed, and nothing says which Moment of someone else's, where exactly or when exactly.

const { DateTime } = require('luxon');
const supabaseAdmin = require('../../config/supabaseAdmin');
const { haversineMeters } = require('../../utils/trustState');
const momentGuess = require('../moments/momentGuess');

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');
// eslint-disable-next-line global-require
const play = () => require('./play');
// eslint-disable-next-line global-require
const seal = () => require('./seal');

const CHOICE = 'echoes';
const LEVELS = ['off', 'on', 'names'];
const ZONE = 'America/Los_Angeles';
const SAME_PLACE_M = 300;
const SUNSET_MS = 45 * 60 * 1000;
const PLACE_MS = 2 * 60 * 60 * 1000;
const TWIN_MIN = 3;
const MAX_ECHOES = 5;
const MAX_TWINS = 3;
const MAX_PEOPLE = 50;

/** Each person's Echoes choice: 'off' (the default), 'on' or 'names'. A read that fails counts as off. */
async function levelsOf(userIds) {
  const ids = [...new Set(userIds.map(String))];
  const out = new Map(ids.map((id) => [id, 'off']));
  if (!ids.length) return out;
  const { data, error } = await supabaseAdmin.from('PersonChoice').select('user_id, value').in('user_id', ids.slice(0, 1000)).eq('choice', CHOICE);
  if (error) return out;
  for (const row of data || []) {
    if (LEVELS.includes(row.value?.level)) out.set(String(row.user_id), row.value.level);
  }
  return out;
}

async function levelOf(userId) {
  return (await levelsOf([userId])).get(String(userId));
}

/** Sets the person's Echoes choice. Off removes the row, so the default is what's left. */
async function setLevel(userId, level) {
  const { error } = level === 'off'
    ? await supabaseAdmin.from('PersonChoice').delete().eq('user_id', userId).eq('choice', CHOICE)
    : await supabaseAdmin.from('PersonChoice').upsert({
      user_id: userId, choice: CHOICE, value: { level }, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,choice' });
  if (error) throw new Error(`Failed to keep the Echoes setting: ${error.message}`);
}

/**
 * Whether a Moment may echo (the four rules): labelled with a picked public place, shared with people nearby, not at
 * home, not floating, not under a made-up name, not a live guess spot or an unopened relic, live or kept as a post.
 */
function echoable(row, now = Date.now()) {
  const store = momentStore();
  const m = store.meta(row);
  if (row.archived_at || row.moderation_state !== 'live' || row.audience !== 'nearby') return false;
  if (m.label_kind !== 'place' || !row.location_name || m.at_home || row.post_metadata?.area) return false;
  // eslint-disable-next-line global-require
  if (require('../penName').isPenNameRow(row)) return false;
  if (momentGuess.isGuess(row) && !store.hasEnded(row, now)) return false;
  if (m.seal && seal().isSealed(row, now)) return false;
  return store.momentState(row, now) === 'live' || Boolean(m.kept_post_at);
}

/** People either side hides (a block or a mute, either way), for the reader and these others. */
async function hiddenEitherWay(readerId, others) {
  const [mine, theirs] = await Promise.all([
    play().hiddenPeople(readerId),
    Promise.all(others.slice(0, MAX_PEOPLE).map((id) => play().hiddenPeople(id).then((set) => [id, set]))),
  ]);
  const hidden = new Set([...mine].map(String));
  for (const [id, set] of theirs) if (set.has(String(readerId))) hidden.add(String(id));
  for (const id of others.slice(MAX_PEOPLE)) hidden.add(String(id));
  return hidden;
}

function firstNames(ids, authors) {
  return ids.map((id) => String(authors.get(id)?.first_name || authors.get(id)?.name || '').trim().split(/\s+/)[0]).filter(Boolean);
}

const others = (n) => `${n} other${n === 1 ? '' : 's'}`;

function echoLine(kind, n, place, convergenceKind) {
  if (kind === 'convergence') {
    return `You and ${others(n)} caught ${convergenceKind === 'first_snow' ? 'the first snow' : "tonight's sky"} at ${place}.`;
  }
  if (kind === 'sunset') return `You and ${others(n)} caught tonight's sunset at ${place}.`;
  return `You and ${others(n)} were at ${place} today.`;
}

/** The kind an echo between these two Moments is, or null when they don't echo. */
function kindOf(mine, theirs) {
  const store = momentStore();
  const a = store.meta(mine);
  const b = store.meta(theirs);
  if (a.convergence?.id && a.convergence.id === b.convergence?.id) return 'convergence';
  const at = (row) => Date.parse(store.shownAt(row));
  const sunset = Date.parse(a.stamp_values?.sunset?.at || '');
  if (Number.isFinite(sunset) && Math.abs(at(mine) - sunset) <= SUNSET_MS && Math.abs(at(theirs) - sunset) <= SUNSET_MS) return 'sunset';
  return Math.abs(at(mine) - at(theirs)) <= PLACE_MS ? 'place' : null;
}

async function echoesOf(userId, level, now) {
  const store = momentStore();
  const start = DateTime.fromMillis(now, { zone: ZONE }).startOf('day').toUTC().toISO();
  const { data: own, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true).eq('user_id', userId)
    .gte('created_at', start).is('archived_at', null).eq('moderation_state', 'live').eq('post_metadata->moment->>label_kind', 'place')
    .order('created_at', { ascending: false }).limit(20);
  if (error) throw new Error(`Failed to load your Moments: ${error.message}`);
  const mine = (own || []).filter((row) => echoable(row, now));
  if (!mine.length) return [];
  const { data: near, error: nearError } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)
    .neq('user_id', userId).gte('created_at', start).is('archived_at', null).eq('moderation_state', 'live')
    .eq('post_metadata->moment->>label_kind', 'place').in('location_name', [...new Set(mine.map((r) => r.location_name))])
    .limit(2000);
  if (nearError) throw new Error(`Failed to load Moments at the same places: ${nearError.message}`);
  const theirs = (near || []).filter((row) => echoable(row, now));
  const authorIds = [...new Set(theirs.map((r) => String(r.user_id)))];
  if (!authorIds.length) return [];
  const [levels, hidden] = await Promise.all([levelsOf(authorIds), hiddenEitherWay(userId, authorIds)]);
  const taking = theirs.filter((row) => levels.get(String(row.user_id)) !== 'off' && !hidden.has(String(row.user_id)));
  const out = [];
  for (const row of mine) {
    const here = store.displayedPoint(row);
    const byPerson = new Map();
    for (const other of taking) {
      if (other.location_name !== row.location_name) continue;
      const there = store.displayedPoint(other);
      if (here.latitude == null || there.latitude == null
        || haversineMeters(here.latitude, here.longitude, there.latitude, there.longitude) > SAME_PLACE_M) continue;
      const kind = kindOf(row, other);
      if (!kind) continue;
      const rank = { convergence: 3, sunset: 2, place: 1 }[kind];
      const id = String(other.user_id);
      if ((byPerson.get(id)?.rank || 0) < rank) byPerson.set(id, { kind, rank });
    }
    if (!byPerson.size) continue;
    // One echo per place (the reader's newest Moment there): the strongest kind any of them shares, everyone counted.
    const held = out.find((e) => e.row.location_name === row.location_name);
    if (held) {
      for (const [id, v] of byPerson) if ((held.byPerson.get(id)?.rank || 0) < v.rank) held.byPerson.set(id, v);
    } else {
      out.push({ row, byPerson });
    }
  }
  for (const e of out) {
    e.kind = [...e.byPerson.values()].sort((a, b) => b.rank - a.rank)[0].kind;
    e.people = [...e.byPerson.keys()];
  }
  const named = level === 'names' ? out.flatMap((e) => e.people.filter((id) => levels.get(id) === 'names')) : [];
  const authors = named.length ? await store.loadAuthors(named) : new Map();
  return out.slice(0, MAX_ECHOES).map(({ row, kind, people }) => ({
    moment_id: row.id,
    kind,
    place: row.location_name,
    others: people.length,
    names: level === 'names' ? firstNames(people.filter((id) => levels.get(id) === 'names'), authors) : [],
    line: echoLine(kind, people.length, row.location_name, store.meta(row).convergence?.kind),
  }));
}

async function twinsOf(userId, level) {
  const { data: mine, error } = await supabaseAdmin.from('PostAnswer').select('value').eq('user_id', userId).eq('kind', 'collect').limit(1000);
  if (error) throw new Error(`Failed to load the field guide: ${error.message}`);
  const counts = new Map();
  for (const row of mine || []) {
    const name = typeof row.value?.name === 'string' ? row.value.name.trim() : '';
    if (name && !row.value?.deck) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const names = [...counts.entries()].filter(([, n]) => n >= TWIN_MIN).map(([name]) => name);
  if (!names.length) return [];
  const { data: theirs, error: theirError } = await supabaseAdmin.from('PostAnswer').select('user_id, value').eq('kind', 'collect')
    .neq('user_id', userId).in('value->>name', names).limit(5000);
  if (theirError) throw new Error(`Failed to load others' field guides: ${theirError.message}`);
  const byName = new Map();
  for (const row of theirs || []) {
    const key = `${row.value?.name}\u0000${row.user_id}`;
    byName.set(key, (byName.get(key) || 0) + 1);
  }
  const people = new Map();
  for (const [key, n] of byName) {
    const [name, id] = key.split('\u0000');
    if (n < TWIN_MIN) continue;
    if (!people.has(name)) people.set(name, []);
    people.get(name).push(String(id));
  }
  const ids = [...new Set([...people.values()].flat())];
  if (!ids.length) return [];
  const [levels, hidden] = await Promise.all([levelsOf(ids), hiddenEitherWay(userId, ids)]);
  const out = [];
  for (const [card, who] of people) {
    const taking = who.filter((id) => levels.get(id) !== 'off' && !hidden.has(id));
    if (taking.length) out.push({ card, count: counts.get(card), people: taking });
  }
  const named = level === 'names' ? out.flatMap((t) => t.people.filter((id) => levels.get(id) === 'names')) : [];
  const authors = named.length ? await momentStore().loadAuthors(named) : new Map();
  return out.sort((a, b) => b.count - a.count).slice(0, MAX_TWINS).map(({ card, count, people: who }) => ({
    card,
    count,
    others: who.length,
    names: level === 'names' ? firstNames(who.filter((id) => levels.get(id) === 'names'), authors) : [],
    line: `You and ${others(who.length)} both collected ${count} ${card} cards.`,
  }));
}

/** GET /echoes for `userId` (CONTRACT 9e): today's echoes and the twins, only when the reader takes part. */
async function echoesFor(userId, now = Date.now()) {
  const level = await levelOf(userId);
  if (level === 'off') return { echoes: [], twins: [], choice: 'off' };
  const [echoes, twins] = await Promise.all([echoesOf(userId, level, now), twinsOf(userId, level)]);
  return { echoes, twins, choice: level };
}

module.exports = { echoesFor, levelOf, setLevel, LEVELS, CHOICE };
