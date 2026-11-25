/**
 * Around you's lists behind the first page (founder, November 24, 2026: "should users be able to keep scrolling as
 * long as there are available ones?"). Every story Around you lets through is a post by the region's curator account
 * (services/aroundYouService.js), and a post stays after its story leaves the first page and after the fetcher's list
 * forgets it. So the posts are the history: these reads page back through them, newest first, by the region and the
 * topics each post carries in post_metadata.around_you ({ item, section, region, topics, story }).
 *
 * Also here: the reply preview a card shows (who replied, and the latest reply), so a story people are talking about
 * says so before it is opened.
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const penName = require('../penName');
const { chatPeopleFrom } = require('../chatPeople');

const PAGE_SIZE = 20;
const TALKED_SIZE = 30;
// "Talked about" and the chips look this far back.
const RECENT_DAYS = 30;
const DAY_MS = 86_400_000;
const ID_CHUNK = 100;
const PREVIEW_LENGTH = 140;
const PREVIEW_PEOPLE = 3;

function chunks(list, size = ID_CHUNK) {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
}

// Where a list continues: the last post's time and id, opaque to the apps.
function encodeCursor(row) {
  return Buffer.from(JSON.stringify([row.created_at, row.id])).toString('base64url');
}

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeCursor(text) {
  if (typeof text !== 'string' || !text || text.length > 200) return null;
  try {
    const [at, id] = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
    return TIME.test(at) && UUID.test(id) ? { at, id } : null;
  } catch {
    return null;
  }
}

// A region's live Around you posts whose metadata holds `want` ({ story: true }, { topics: ['sports'] }, {}).
function regionPosts(regionId, want, columns) {
  return supabaseAdmin.from('Post').select(columns)
    .eq('origin', 'curator')
    .contains('post_metadata', { around_you: { region: regionId, ...want } })
    .eq('moderation_state', 'live')
    .is('archived_at', null);
}

function newestFirst(a, b) {
  return (Date.parse(b.created_at) - Date.parse(a.created_at)) || (a.id < b.id ? 1 : -1);
}

/**
 * One page of the regions' posts that hold `want`, newest first: { ids, next }. `before` is a decoded cursor;
 * `excludeIds` are left out (the first page's own posts, under Earlier). A story two regions both carry shows once.
 */
async function archiveIds({ regionIds, want, before = null, limit = PAGE_SIZE, excludeIds = [] }) {
  const answers = await Promise.all(regionIds.map((regionId) => {
    let query = regionPosts(regionId, want, 'id, created_at, link:post_metadata->>source_url');
    if (before) query = query.or(`created_at.lt.${before.at},and(created_at.eq.${before.at},id.lt.${before.id})`);
    if (excludeIds.length) query = query.not('id', 'in', `(${excludeIds.slice(0, 60).join(',')})`);
    return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
  }));
  const failed = answers.find((answer) => answer.error);
  if (failed) throw failed.error;
  const links = new Set();
  const rows = answers.flatMap((answer) => answer.data || []).sort(newestFirst).filter((row) => {
    if (!row.link) return true;
    if (links.has(row.link)) return false;
    links.add(row.link);
    return true;
  });
  // Any region with more than a page left, or more rows than the page between them: there is a next page.
  const more = rows.length > limit || answers.some((answer) => (answer.data || []).length > limit);
  const page = rows.slice(0, limit);
  return { ids: page.map((row) => row.id), next: more && page.length ? encodeCursor(page[page.length - 1]) : null };
}

/** The regions' posts people replied or reacted to in the last 30 days, the most replies first. */
async function talkedIds({ regionIds, limit = TALKED_SIZE, now = Date.now() }) {
  const since = new Date(now - RECENT_DAYS * DAY_MS).toISOString();
  const answers = await Promise.all(regionIds.map((regionId) => regionPosts(regionId, {},
    'id, created_at, comment_count, like_count')
    .or('comment_count.gt.0,like_count.gt.0')
    .gte('created_at', since)
    .order('comment_count', { ascending: false })
    .order('like_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)));
  const failed = answers.find((answer) => answer.error);
  if (failed) throw failed.error;
  return answers.flatMap((answer) => answer.data || [])
    .sort((a, b) => (b.comment_count - a.comment_count) || (b.like_count - a.like_count) || newestFirst(a, b))
    .slice(0, limit)
    .map((row) => row.id);
}

/**
 * What the chips can offer: the topics the stories of `regionIds` carry (the last 30 days), and whether anyone
 * replied or reacted to a post in `talkedRegionIds`. A failed read offers nothing more than the first page does.
 */
async function listFacts(regionIds, talkedRegionIds = regionIds, now = Date.now()) {
  const since = new Date(now - RECENT_DAYS * DAY_MS).toISOString();
  const topics = new Set();
  let talked = false;
  await Promise.all([
    ...regionIds.map((regionId) => regionPosts(regionId, { story: true }, 'topics:post_metadata->around_you->topics')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(400)
      .then(({ data }) => {
        for (const row of data || []) for (const topic of Array.isArray(row.topics) ? row.topics : []) topics.add(topic);
      })),
    ...talkedRegionIds.map((regionId) => regionPosts(regionId, {}, 'id')
      .or('comment_count.gt.0,like_count.gt.0').gte('created_at', since).limit(1)
      .then(({ data }) => { if ((data || []).length) talked = true; })),
  ]);
  return { topics, talked };
}

function preview(text) {
  const plain = String(text || '').replace(/\s+/g, ' ').trim();
  if (plain.length <= PREVIEW_LENGTH) return plain;
  const cut = plain.slice(0, PREVIEW_LENGTH - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 80)).replace(/[\s,;:.–—-]+$/, '')}…`;
}

/**
 * The reply preview for each of these posts that has replies: post id → { people: [{ id, name, avatar_url }],
 * latest: { id, user_id, name, text, created_at } }. `people` are the latest repliers, newest first, at most three,
 * named as the reply thread names them (services/chatPeople.js). Replies by anyone in `hiddenUserIds` (a block
 * either way, a mute) are left out, as are held and removed ones. One read: each reply comes with its writer's
 * account and Local Profile, so the page's read takes no round more than its posts do.
 */
async function conversations(posts, hiddenUserIds = new Set()) {
  const ids = posts.filter((post) => post.comment_count > 0).map((post) => post.id);
  if (!ids.length) return new Map();
  const answers = await Promise.all(chunks(ids, 20).map((batch) => supabaseAdmin.from('PostComment')
    .select(`id, post_id, user_id, comment, created_at, moderation_state, identity_context_type, identity_context_id,
      writer:user_id (id, username, name, first_name, middle_name, last_name, profile_picture_url, account_type,
        profile:LocalProfile (user_id, handle, display_name, avatar_url))`)
    .in('post_id', batch)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(300)));
  const failed = answers.find((answer) => answer.error);
  if (failed) throw failed.error;
  const byPost = new Map();
  // A reply under a made-up name (services/penName) is stored under one system account: here it is its made-up name's,
  // so two of them are two people and neither is the account. From here on `user_id` is that name's id on such a row.
  const penRows = answers.flatMap((answer) => answer.data || []).filter(penName.isPenNameRow);
  const penNames = penRows.length ? await penName.names.rowsById(penRows.map((row) => row.identity_context_id)) : new Map();
  const allPenNamesHidden = penRows.length ? await penName.gate.isHidden() : false;
  for (const stored of answers.flatMap((answer) => answer.data || [])) {
    const underPenName = penName.isPenNameRow(stored);
    if (underPenName && allPenNamesHidden) continue;
    const row = underPenName ? { ...stored, user_id: String(stored.identity_context_id), writer: null } : stored;
    if ((row.moderation_state || 'live') !== 'live' || hiddenUserIds.has(row.user_id)) continue;
    if (!byPost.has(row.post_id)) byPost.set(row.post_id, []);
    byPost.get(row.post_id).push(row);
  }
  const wanted = new Map();
  const users = new Map();
  const profiles = new Map();
  for (const [postId, rows] of byPost) {
    const people = [...new Set(rows.map((row) => row.user_id))].slice(0, PREVIEW_PEOPLE);
    wanted.set(postId, { latest: rows[0], people });
    for (const row of rows) {
      if (!row.writer || users.has(row.user_id) || !people.includes(row.user_id)) continue;
      const { profile, ...user } = row.writer;
      users.set(row.user_id, user);
      const own = Array.isArray(profile) ? profile[0] : profile;
      if (own) profiles.set(row.user_id, own);
    }
  }
  const names = chatPeopleFrom([...users.values()], [...profiles.values()]);
  const person = (userId) => {
    const pen = penNames.get(String(userId));
    if (pen) return { id: userId, name: pen.display_name, avatar_url: pen.avatar_url || null };
    const known = names.get(String(userId));
    return { id: userId, name: known?.displayName || 'Someone', avatar_url: known?.avatarUrl || null };
  };
  const out = new Map();
  for (const [postId, { latest, people }] of wanted) {
    out.set(postId, {
      people: people.map(person),
      latest: {
        id: latest.id,
        user_id: latest.user_id,
        name: person(latest.user_id).name,
        text: preview(latest.comment),
        created_at: latest.created_at,
      },
    });
  }
  return out;
}

module.exports = {
  PAGE_SIZE, chunks, encodeCursor, decodeCursor, archiveIds, talkedIds, listFacts, conversations,
};
