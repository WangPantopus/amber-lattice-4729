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
  // Search engines list the page unless the person switched it off (founder, 2026-11-23, item 9.5).
  return { saved, parts, search_engines: !(saved && stored.search_engines === false) };
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
function applyShareChange(current, body, now = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Send the parts to change, each set to anyone, members or connections.' };
  }
  const unknown = Object.keys(body).filter((key) => key !== 'parts' && key !== 'search_engines');
  if (unknown.length) return { error: 'Only parts and search_engines can be saved here.' };
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
  return { value: { v: 1, parts, search_engines: searchEngines, saved_at: now.toISOString() } };
}

module.exports = {
  PART_KEYS, SETTINGS, DEFAULT_PARTS, VIEWS, readShare, reaches, applyShareChange,
};
