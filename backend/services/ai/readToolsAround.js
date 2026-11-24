/**
 * Around you for the assistant: Today's second half (the At home | Around you switch), read through the page's own
 * service with the person as the viewer.
 *
 * Around you lists what local outlets and public sources report near the place Today shows: alerts, road work,
 * headlines, events, around town, across the state, this season and on this day (services/aroundYouService.js,
 * GET /api/hub/today/around). Each row is a headline as its outlet wrote it and is also a post by the area's curator
 * account, which people react to, reply to and repost. The read here is the one the apps make, for the same place
 * (context/locationResolver), so the sections, their order, what the page leaves out, and the posts the person hid or
 * whose author they blocked all apply as they do on Today.
 *
 * Read only: nothing here marks a post seen or notifies anyone. Pictures, the outlets' links and the point never
 * reach the model; a row's post_id opens it in the app (the `post` button), where the card opens at its outlet.
 * The backend's AROUND_YOU switch decides (utils/featureFlags.aroundYouEnabled): off, the tool isn't offered.
 */
const logger = require('../../utils/logger');
const { aroundYouEnabled } = require('../../utils/featureFlags');
const { aroundYou } = require('../aroundYouService');
const { resolveLocation } = require('../context/locationResolver');
const { SECTIONS } = require('../aroundYou/sections');
const { OTHERS_WORDS, clip, whenLabel } = require('./assistantKit');

// The page's sections, by their ids, and the one it adds when little is going on.
const SECTION_IDS = [...new Set([...(SECTIONS || []).map((section) => section.id), 'on_watch'])];
// Rows in one answer; the page itself holds about thirty.
const MAX_ITEMS = 30;

const aroundReadToolDefinitions = [
  {
    name: 'find_around_you',
    description: "Around you (Today's second half, under the At home | Around you switch): what local outlets and public sources are reporting near the person's home or saved place right now, as the app lists it: alerts, road work, headlines, events, around town, across the state, this season and on this day. Each row is a headline as its outlet wrote it, with the outlet's name, a summary line when the outlet gave one, when it was first seen, how many reactions and replies it has, and its post_id: each row is also a post they can open, react to, reply to (draft_post_reply) and repost. Use it for \"what's happening around here\", \"anything interesting near me\", \"any events this weekend\", \"what's the local news\", road work or closures, and before saying nothing is going on. Read it again each time they ask: it changes through the day.",
    input_schema: {
      type: 'object',
      properties: {
        sections: { type: ['array', 'null'], items: { type: 'string', enum: SECTION_IDS }, description: 'Sections to read, or null for all of them.' },
        query: { type: ['string', 'null'], maxLength: 100, description: 'Words a row must contain (in its headline, summary or outlet), or null to list everything.' },
      },
      required: ['sections', 'query'],
      additionalProperties: false,
    },
  },
];

const AROUND_TOOL_NAMES = new Set(aroundReadToolDefinitions.map((tool) => tool.name));

/** `value` without null and undefined fields (false and 0 stay: they are answers). */
function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
}

const wordsOf = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter((word) => word.length > 1);

/** True when every word asked for begins a word of the row ("road" finds "roadwork", "event" finds "events"). */
function matches(item, asked) {
  if (!asked.length) return true;
  const have = wordsOf(`${item.title} ${item.summary || ''} ${item.source || ''}`);
  return asked.every((word) => have.some((own) => own.startsWith(word)));
}

function itemForModel(item, post, ctx) {
  return compact({
    post_id: post ? item.post_id : null,
    headline_text: clip(item.title, 240),
    summary_text: clip(item.summary, 320),
    outlet: clip(item.source, 80),
    first_seen: whenLabel(item.seen_at, null, ctx.timeZone),
    reactions: post && Number(post.like_count) > 0 ? Number(post.like_count) : null,
    replies: post && Number(post.comment_count) > 0 ? Number(post.comment_count) : null,
  });
}

async function findAroundYou(args, ctx) {
  if (!aroundYouEnabled()) return { error: "Around you isn't available in the app yet." };
  const location = await resolveLocation(ctx.userId);
  if (!location || location.source === 'none') {
    return { empty: 'They have no home or saved place yet, so Today has no Around you. Suggest adding their home on Place.' };
  }
  const page = await aroundYou({ ...location, userId: ctx.userId });
  if (!page?.available) {
    return { empty: "Around you has nothing for their area right now: Today shows no At home | Around you switch for them. Say so plainly; don't guess at local news." };
  }
  const wanted = Array.isArray(args.sections) && args.sections.length ? new Set(args.sections) : null;
  const asked = wordsOf(args.query);
  let left = MAX_ITEMS;
  let total = 0;
  const sections = [];
  for (const section of page.sections || []) {
    if (wanted && !wanted.has(section.id)) continue;
    const posts = new Map((section.posts || []).map((post) => [post.id, post]));
    const found = (section.items || []).filter((item) => matches(item, asked));
    total += found.length;
    const shown = found.slice(0, Math.max(0, left));
    left -= shown.length;
    if (!shown.length) continue;
    sections.push({
      section: section.id,
      title: clip(section.title, 60),
      items: shown.map((item) => itemForModel(item, posts.get(item.post_id), ctx)),
    });
  }
  const shownCount = sections.reduce((count, section) => count + section.items.length, 0);
  return compact({
    note: `${OTHERS_WORDS} Headlines and summaries are each outlet's own words: name the outlet when you pass one on, and never add to what it says. A row with a post_id opens with the post button; the outlet's own page opens from the post.`,
    area: clip(page.area, 80),
    where_in_app: 'Today, under the At home | Around you switch',
    sections,
    more_items: total > shownCount ? total - shownCount : null,
    empty: shownCount ? null : (asked.length || wanted
      ? 'Nothing on Around you matches that right now. Read it again without a query or sections to see what is there.'
      : 'Around you has nothing listed right now.'),
  });
}

async function runAroundReadTool(name, args, ctx) {
  if (name !== 'find_around_you') return null;
  try {
    return await findAroundYou(args || {}, ctx);
  } catch (err) {
    logger.warn('assistant read tool failed', { tool: name, userId: ctx.userId, error: err?.message });
    return { error: `That couldn't be read just now (${name}).` };
  }
}

module.exports = { aroundReadToolDefinitions, runAroundReadTool, AROUND_TOOL_NAMES };
