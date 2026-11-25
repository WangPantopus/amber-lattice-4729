/**
 * Around you's topics (founder, November 24, 2026): the row of chips over the list (Events, Kids & schools, Sports,
 * Government, Business, Roads & safety), and which of them an item belongs to. Pure: no reads.
 *
 * An item's topics come, in this order, from where it shows (a calendar event is an event; an alert or a road project
 * is Roads & safety), from its source when the source is about one thing (seeder_sources.topic: an outlet's sports
 * feed), from the outlet's own labels for the story (seeder_content_queue.outlet_tags: "Schools", "Prep Sports",
 * "Vancouver City Council", read from the outlet's feed by services/aroundYou/feeds/outletTags.js), and only when the
 * outlet gave no label that says anything, from whole words in the headline (the summary's passing words misfile too
 * many stories). No model.
 */

const TOPICS = [
  { id: 'events', title: 'Events' },
  { id: 'kids', title: 'Kids & schools' },
  { id: 'sports', title: 'Sports' },
  { id: 'government', title: 'Government' },
  { id: 'business', title: 'Business' },
  { id: 'safety', title: 'Roads & safety' },
];
const TOPIC_IDS = TOPICS.map((topic) => topic.id);
// Two more lists the apps offer beside the topics: everything, and what people replied or reacted to.
const ALL = 'all';
const TALKED = 'talked';
const LISTS = [ALL, TALKED, ...TOPIC_IDS];
const MAX_TOPICS = 3;
// The sections whose items are stories: they stay listed after they leave the first page.
const STORY_SECTIONS = new Set(['headlines', 'around_town', 'across_state', 'more']);

const words = (list) => new RegExp(`\\b(${list.join('|')})\\b`, 'i');

// The outlet's own labels, one label at a time ("Prep Sports", "Battle Ground Public Schools").
const TAG_RULES = {
  sports: words(['sports?', 'prep', 'athletics?', 'football', 'basketball', 'baseball', 'softball', 'soccer',
    'volleyball', 'wrestling', 'golf', 'tennis', 'hockey', 'blazers', 'timbers', 'thorns', 'seahawks', 'mariners',
    'kraken', 'sounders', 'winterhawks', 'outdoors', 'fishing', 'hunting']),
  kids: words(['schools?', 'education', 'students?', 'teachers?', 'k-?12', 'kids', 'children', 'youth', 'famil(y|ies)',
    'parent(s|ing)?', 'child ?care']),
  government: words(['politics', 'elections?', 'government', 'council', 'commission(ers)?', 'legislature', 'ballot',
    'lev(y|ies)', 'mayor', 'city hall', 'public meetings?', 'taxes', 'budget']),
  business: words(['business(es)?', 'econom(y|ic)', 'real estate', 'housing', 'jobs?', 'employment', 'retail',
    'restaurants?', 'dining', 'food (&|and) drink', 'breweries', 'tourism', 'working']),
  safety: words(['traffic', 'roads?', 'transportation', 'transit', 'weather', 'wildfires?', 'emergenc(y|ies)',
    'outages?', 'construction', 'bridges?']),
};

// The headline, for a story whose outlet gave no telling label.
const WORD_RULES = {
  sports: words(['football', 'basketball', 'baseball', 'softball', 'soccer', 'volleyball', 'wrestling', 'lacrosse',
    'track and field', 'cross[- ]country', 'swim(ming)? (meet|team)', 'playoffs?', 'semifinals?', 'quarterfinals?',
    'state title', 'league title', 'varsity', 'scoreboard', 'prep (sports|roundup)', 'trail blazers', 'blazers',
    'timbers', 'thorns', 'seahawks', 'mariners', 'kraken', 'sounders', 'winterhawks', 'head coach', 'quarterback',
    'touchdowns?']),
  kids: words(['schools?', 'students?', 'teachers?', 'kindergarten', 'preschool', 'pre-k', 'child ?care', 'day ?care',
    'ptsa?', 'kids', 'children', 'toddlers?', 'teens?', 'youth', 'family[- ]friendly', 'storytime',
    'story time', 'playgrounds?', 'graduat(es?|ion)', 'superintendent', 'classrooms?']),
  government: words(['city council', 'county council', 'council (members?|votes?|approves?|meeting)', 'councilors?',
    'commissioners?', 'mayor', 'ordinance', 'ballot', 'elections?', 'voters?', 'lev(y|ies)', 'bond measure',
    'initiative', 'legislature', 'lawmakers?', 'legislators?', 'governor', 'state (senate|house|budget)', 'budget',
    'tax(es)?', 'public hearing', 'town hall', 'zoning', 'rezon(e|ing)', 'land use', 'moratorium', 'city manager',
    'county manager', 'port commission', 'annexation', 'permits?']),
  business: words(['business(es)?', 'restaurants?', 'brewer(y|ies)', 'brewpub', 'cafe', 'bakery', 'retail(ers?)?',
    'compan(y|ies)', 'jobs?', 'layoffs?', 'hiring', 'employers?', 'unemployment', 'econom(y|ic)', 'housing market',
    'home (prices|sales)', 'rents?', 'real estate', 'developers?', 'apartments?', 'subdivision', 'startup',
    'manufactur(er|ing)', 'chamber of commerce', 'dealerships?', 'storefronts?', 'grand opening', 'stores?',
    'shops?', 'boutique', 'closing after', 'going out of business', 'new location', 'expansion']),
  safety: words(['road ?work', 'closures?', 'detours?', 'lane (closures?|restrictions?)', 'traffic', 'crash(es)?',
    'collision', 'outages?', 'storms?', 'flood(ing|s)?', 'wildfires?', 'brush fire', 'house fire',
    'fire (crews|department|district)', 'evacuat(e|ed|ion|ions)', 'wind advisory', 'winter (storm|weather)', 'snow',
    'icy', 'ice storm', 'heat (wave|advisory)', 'smoke', 'air quality', 'burn ban', 'landslides?', 'boil[- ]water',
    'recalls?', 'scams?']),
};

// Labels that say a story is not one for this page, whatever else it is labelled.
const NOT_NEWS_TAG = /^\s*(legal notices?|public notices?|obituar(y|ies)|death notices?|opinions?|letters?( to the editor)?|editorials?|columns?|sponsored( content)?|classifieds?|advertorial|horoscopes?|comics|puzzles)\s*$/i;
// A wire story: labelled for the nation or the world and not for anywhere local.
const WIRE_TAG = /^\s*(nation( (&|and) world)?|national|world|u\.?s\.?( news)?|associated press|ap|wire)\s*$/i;
const LOCAL_TAG = /\b(local|county|city|neighbou?rhood|community)\b/i;

function cleanTags(tags) {
  return (Array.isArray(tags) ? tags : [])
    .filter((tag) => typeof tag === 'string')
    .map((tag) => tag.replace(/\s+/g, ' ').trim())
    .filter((tag) => tag && tag.length <= 80)
    .slice(0, 24);
}

/**
 * Whether the outlet's own labels keep a story off the page: a notice, an obituary or an opinion piece; or a wire
 * story (labelled for the nation or the world) with no label for anywhere local. `placeWords` are the region's own
 * (its city, its county), so "Clark County News" or "Camas" counts as local.
 */
function leftOutByTags(tags, placeWords = []) {
  const list = cleanTags(tags);
  if (!list.length) return false;
  if (list.some((tag) => NOT_NEWS_TAG.test(tag))) return true;
  if (!list.some((tag) => WIRE_TAG.test(tag))) return false;
  return !list.some((tag) => LOCAL_TAG.test(tag) || placeWords.some((word) => word.test(tag)));
}

function byRules(rules, text) {
  return TOPIC_IDS.filter((id) => rules[id] && rules[id].test(text));
}

/**
 * An item's topics, at most three, in the chips' order. `sectionId` is the section that took it, `kind` its source's
 * kind ('rss', 'ical', 'wildfire', …), `sourceTopic` its source row's topic, `tags` the outlet's labels.
 */
function topicsOf({ sectionId, kind, sourceTopic, tags, title }) {
  const found = new Set();
  if (sectionId === 'events' || kind === 'ical') found.add('events');
  if (sectionId === 'alerts' || sectionId === 'roads') found.add('safety');
  if (TOPIC_IDS.includes(sourceTopic)) found.add(sourceTopic);
  // A tip, a day in history and the On watch card are not about a topic.
  if (!STORY_SECTIONS.has(sectionId)) return TOPIC_IDS.filter((id) => found.has(id));
  const fromTags = new Set(cleanTags(tags).flatMap((tag) => byRules(TAG_RULES, tag)));
  const fromOutlet = fromTags.size ? fromTags : new Set(byRules(WORD_RULES, String(title || '')));
  for (const id of fromOutlet) found.add(id);
  return TOPIC_IDS.filter((id) => found.has(id)).slice(0, MAX_TOPICS);
}

function topicTitle(id) {
  return TOPICS.find((topic) => topic.id === id)?.title || null;
}

module.exports = {
  TOPICS, TOPIC_IDS, ALL, TALKED, LISTS, STORY_SECTIONS, topicsOf, topicTitle, leftOutByTags, cleanTags,
};
