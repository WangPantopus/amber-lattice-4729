/**
 * Writes the feeds job's rows into seeder_content_queue, the list Around you already reads.
 *
 * One thing (a fire, a declaration, a project, an event) keeps one live row: its dedup_hash is
 * sha256("pantopus:aroundfeeds:v1|<region>|<source>|<the feed's own id>"), and the partial unique index on dedup_hash
 * holds one live row per hash. Seen again, the row gets a new fetched_at, and its title and body when the numbers
 * changed, so it keeps its post (reactions, replies) and leaves the page some hours after the feed stops listing it.
 * Rows are written as 'posted' so the Lambda's poster and its stale pass leave them alone.
 *
 * Few round trips (production serves these calls one at a time): live rows are read 50 hashes at a time, every
 * unchanged row of a region is refreshed in one update, new rows go in one insert (one by one only if another run
 * wrote one of them a moment ago), and only a row whose text changed is updated on its own. A region keeps at most 10
 * rows per source, nearest or soonest first.
 */

const { createHash } = require('crypto');
const supabaseAdmin = require('../../../config/supabaseAdmin');

const MAX_TITLE = 500;
const MAX_BODY = 2000;
const HASH_CHUNK = 50;
const MAX_PER_SOURCE = 10;

function dedupHash(region, source, feedId) {
  return createHash('sha256').update(`pantopus:aroundfeeds:v1|${region}|${source}|${feedId}`).digest('hex');
}

function clip(value, max) {
  if (value == null) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

// At most MAX_PER_SOURCE rows per source, lowest rank (distance, start time) first, one per hash.
function capped(region, rows) {
  const bySource = new Map();
  for (const row of rows) {
    if (!row?.title || !row.url) continue;
    if (!bySource.has(row.source)) bySource.set(row.source, []);
    bySource.get(row.source).push(row);
  }
  const unique = new Map();
  for (const list of bySource.values()) {
    list.sort((a, b) => (Number.isFinite(a.rank) ? a.rank : Infinity) - (Number.isFinite(b.rank) ? b.rank : Infinity));
    let kept = 0;
    for (const row of list) {
      if (kept >= MAX_PER_SOURCE) break;
      const hash = dedupHash(region, row.source, row.feedId);
      if (unique.has(hash)) continue;
      unique.set(hash, { ...row, hash, title: clip(row.title, MAX_TITLE), body: clip(row.body, MAX_BODY) });
      kept += 1;
    }
  }
  return unique;
}

async function liveRows(hashes) {
  const out = new Map();
  for (let start = 0; start < hashes.length; start += HASH_CHUNK) {
    const { data, error } = await supabaseAdmin
      .from('seeder_content_queue')
      .select('id, dedup_hash, raw_title, raw_body, source_url, scheduled_for')
      .in('dedup_hash', hashes.slice(start, start + HASH_CHUNK))
      .not('status', 'in', '(filtered_out,skipped)');
    if (error) throw error;
    for (const row of data || []) out.set(row.dedup_hash, row);
  }
  return out;
}

function newRow(region, row, now) {
  return {
    source: row.source,
    source_url: row.url,
    raw_title: row.title,
    raw_body: row.body,
    region,
    category: row.category,
    fetched_at: now,
    status: 'posted',
    dedup_hash: row.hash,
    source_priority: row.priority || 2,
    scope: 'local',
    // A calendar event's start, so the page can list events soonest first (the Lambda's poster reads only queued rows).
    ...(row.startsAt ? { scheduled_for: new Date(row.startsAt).toISOString() } : {}),
  };
}

// rows: [{ source, feedId, category, priority, rank, title, body, url }] for one region. Returns { added, refreshed }.
async function writeRows(region, rows) {
  const unique = capped(region, rows);
  if (!unique.size) return { added: 0, refreshed: 0 };
  const live = await liveRows([...unique.keys()]);
  const now = new Date().toISOString();
  const unchanged = [];
  const changed = [];
  const fresh = [];
  for (const [hash, row] of unique) {
    const kept = live.get(hash);
    if (!kept) fresh.push(row);
    else if (kept.raw_title === row.title && (kept.raw_body || null) === row.body && kept.source_url === row.url
      && (!row.startsAt || Date.parse(kept.scheduled_for) === row.startsAt)) {
      unchanged.push(kept.id);
    } else changed.push({ id: kept.id, row });
  }
  if (unchanged.length) {
    const { error } = await supabaseAdmin.from('seeder_content_queue')
      .update({ fetched_at: now, updated_at: now }).in('id', unchanged);
    if (error) throw error;
  }
  for (const { id, row } of changed) {
    const { error } = await supabaseAdmin.from('seeder_content_queue').update({
      fetched_at: now, updated_at: now, raw_title: row.title, raw_body: row.body, source_url: row.url,
      ...(row.startsAt ? { scheduled_for: new Date(row.startsAt).toISOString() } : {}),
    }).eq('id', id);
    if (error) throw error;
  }
  let added = 0;
  if (fresh.length) {
    const { error } = await supabaseAdmin.from('seeder_content_queue').insert(fresh.map((row) => newRow(region, row, now)));
    if (!error) added = fresh.length;
    else if (error.code === '23505') {
      // Another run wrote one of them a moment ago: that row stands; the others go in one by one.
      for (const row of fresh) {
        const single = await supabaseAdmin.from('seeder_content_queue').insert(newRow(region, row, now));
        if (single.error && single.error.code !== '23505') throw single.error;
        if (!single.error) added += 1;
      }
    } else throw error;
  }
  return { added, refreshed: unchanged.length + changed.length };
}

module.exports = { writeRows, dedupHash };
