/**
 * The parts of a person's main link (~/pantopus-profile-sources/CONTRACT.md section 4): which part reaches which view,
 * the defaults until the person saves, and the saved shape in `User.profile_share`.
 *
 * Settings: anyone (the link, signed out, and every signed-in view), members (people signed in to Pantopus) and
 * connections (connections and the people they live with). The owner always sees every part.
 */

const PART_KEYS = Object.freeze([
  'says', 'prompts', 'shelf', 'city', 'work', 'known_for', 'record_work', 'record_home', 'record_others', 'met', 'doors',
  'reviews',
]);

const SETTINGS = Object.freeze(['anyone', 'members', 'connections']);

// Until a person saves, the link shows no more than a signed-out caller gets from today's profile read (SPEC 4.7):
// the bio, the prompts and the city (still capped by "Who sees your city"). Everything else starts at members.
const DEFAULT_PARTS = Object.freeze({
  says: 'anyone',
  prompts: 'anyone',
  shelf: 'members',
  city: 'anyone',
  work: 'members',
  known_for: 'members',
  record_work: 'members',
  record_home: 'members',
  record_others: 'members',
  met: 'members',
  doors: 'members',
  reviews: 'members',
});

const VIEWS = Object.freeze(['owner', 'household', 'connection', 'member', 'link']);

const REACH = Object.freeze({
  anyone: new Set(['link', 'member', 'connection', 'household']),
  members: new Set(['member', 'connection', 'household']),
  connections: new Set(['connection', 'household']),
});

/** The saved share (or null when never saved) as { saved, parts, search_engines }, every part filled in. */
function readShare(stored) {
  const saved = Boolean(stored && typeof stored === 'object' && stored.parts && typeof stored.parts === 'object');
  const parts = { ...DEFAULT_PARTS };
  if (saved) {
    for (const key of PART_KEYS) {
      if (SETTINGS.includes(stored.parts[key])) parts[key] = stored.parts[key];
    }
  }
  // Search engines list the page unless the person switched it off (founder, 2026-11-23, item 9.5). Links for one
  // purpose are on unless the person turned them off (item 9.1); that switch alone isn't a save of the parts.
  return {
    saved,
    parts,
    search_engines: !(saved && stored.search_engines === false),
    links_enabled: !(stored && typeof stored === 'object' && stored.links_enabled === false),
    // "Let people name me on their work" (phase 2B): on unless the person turned it off.
    ties_enabled: !(stored && typeof stored === 'object' && stored.ties_enabled === false),
    // Phase 3: "Let people write lines about me", "Let people leave me a card" (on unless turned off), and the at most
    // two shown lines the person put on top.
    known_for_enabled: !(stored && typeof stored === 'object' && stored.known_for_enabled === false),
    cards_enabled: !(stored && typeof stored === 'object' && stored.cards_enabled === false),
    known_for_top: Array.isArray(stored?.known_for_top) ? stored.known_for_top.filter((id) => typeof id === 'string').slice(0, 2) : [],
  };
}

/** Does `part` reach `view` under these settings? The owner sees everything. */
function reaches(parts, part, view) {
  if (view === 'owner') return true;
  const setting = parts[part] || DEFAULT_PARTS[part];
  return REACH[setting]?.has(view) === true;
}

/**
 * Checks a PUT /me/share body. Returns { value } (the share to store) or { error } (a sentence to show). Parts not sent
 * keep their setting; a first save stores all twelve.
 */
function applyShareChange(current, body, now = new Date(), { links = false, ties = false, knownFor = false, doors = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Send the parts to change, each set to anyone, members or connections.' };
  }
  const allowed = ['parts', 'search_engines', ...(links ? ['links_enabled'] : []), ...(ties ? ['ties_enabled'] : []),
    ...(knownFor ? ['known_for_enabled'] : []), ...(doors ? ['cards_enabled'] : [])];
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    const named = ['the parts', 'search engines', ...(links ? ['links for one purpose'] : []),
      ...(ties ? ['whether people can name you on their work'] : []),
      ...(knownFor ? ['whether people can write lines about you'] : []), ...(doors ? ['whether people can leave you a card'] : [])];
    return { error: `Only ${named.slice(0, -1).join(', ')} and ${named[named.length - 1]} can be saved here.` };
  }
  const parts = { ...current.parts };
  if (body.parts !== undefined) {
    if (!body.parts || typeof body.parts !== 'object' || Array.isArray(body.parts)) {
      return { error: 'Send the parts as an object, each set to anyone, members or connections.' };
    }
    for (const [key, setting] of Object.entries(body.parts)) {
      if (!PART_KEYS.includes(key)) return { error: 'That part isn\'t one a profile link has.' };
      if (!SETTINGS.includes(setting)) return { error: 'Each part is anyone, members or connections.' };
      parts[key] = setting;
    }
  }
  let searchEngines = current.search_engines;
  if (body.search_engines !== undefined) {
    if (typeof body.search_engines !== 'boolean') return { error: 'Search engines is on or off.' };
    searchEngines = body.search_engines;
  }
  let linksEnabled = current.links_enabled !== false;
  if (body.links_enabled !== undefined) {
    if (typeof body.links_enabled !== 'boolean') return { error: 'Links for one purpose are on or off.' };
    linksEnabled = body.links_enabled;
  }
  let tiesEnabled = current.ties_enabled !== false;
  if (body.ties_enabled !== undefined) {
    if (typeof body.ties_enabled !== 'boolean') return { error: 'Letting people name you on their work is on or off.' };
    tiesEnabled = body.ties_enabled;
  }
  const switchOf = (key, label) => {
    if (body[key] === undefined) return { value: current[key] !== false };
    if (typeof body[key] !== 'boolean') return { error: `${label} is on or off.` };
    return { value: body[key] };
  };
  const knownForEnabled = switchOf('known_for_enabled', 'Letting people write lines about you');
  const cardsEnabled = switchOf('cards_enabled', 'Letting people leave you a card');
  if (knownForEnabled.error || cardsEnabled.error) return { error: knownForEnabled.error || cardsEnabled.error };
  // Turning links or naming on or off alone doesn't save the parts (rule 4.7 starts only with a save of the parts).
  const savesParts = current.saved || body.parts !== undefined || body.search_engines !== undefined;
  const value = { v: 1, links_enabled: linksEnabled, ties_enabled: tiesEnabled, known_for_enabled: knownForEnabled.value,
    cards_enabled: cardsEnabled.value, known_for_top: current.known_for_top || [] };
  if (savesParts) Object.assign(value, { parts, search_engines: searchEngines, saved_at: now.toISOString() });
  return { value };
}

module.exports = {
  PART_KEYS, SETTINGS, DEFAULT_PARTS, VIEWS, readShare, reaches, applyShareChange,
};
