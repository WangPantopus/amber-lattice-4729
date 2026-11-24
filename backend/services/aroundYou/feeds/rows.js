/**
 * Writes the feeds job's rows into seeder_content_queue, the list Around you already reads.
 *
 * One thing (a fire, a declaration, a project, an event) keeps one live row: its dedup_hash is
 * sha256("pantopus:aroundfeeds:v1|<region>|<source>|<the feed's own id>"), and the partial unique index on dedup_hash
 * holds one live row per hash. Seen again, the row gets a new fetched_at, and its title and body when the numbers
 * changed, so it keeps its post (reactions, replies) and leaves the page some hours after the feed stops listing it.
 * Rows are written as 'posted' so the Lambda's poster and its stale pass leave them alone.
 */

const { createHash } = require('crypto');
const supabaseAdmin = require('../../../config/supabaseAdmin');

const MAX_TITLE = 500;
const MAX_BODY = 2000;

function dedupHash(region, source, feedId) {
  return createHash('sha256').update(`pantopus:aroundfeeds:v1|${region}|${source}|${feedId}`).digest('hex');
}

function clip(value, max) {
  if (value == null) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

// rows: [{ source, feedId, category, priority, title, body, url }] for one region. Returns { added, refreshed }.
async function writeRows(region, rows) {
  const unique = new Map();
  for (const row of rows) {
    if (!row?.title || !row.url) continue;
    const hash = dedupHash(region, row.source, row.feedId);
    if (!unique.has(hash)) unique.set(hash, { ...row, hash });
  }
  if (!unique.size) return { added: 0, refreshed: 0 };
  const hashes = [...unique.keys()];
  const { data: live, error } = await supabaseAdmin
    .from('seeder_content_queue')
    .select('id, dedup_hash, raw_title, raw_body, source_url')
    .in('dedup_hash', hashes)
    .not('status', 'in', '(filtered_out,skipped)');
  if (error) throw error;
  const byHash = new Map((live || []).map((row) => [row.dedup_hash, row]));
  const now = new Date().toISOString();
  let added = 0;
  let refreshed = 0;
  for (const [hash, row] of unique) {
    const title = clip(row.title, MAX_TITLE);
    const body = clip(row.body, MAX_BODY);
    const kept = byHash.get(hash);
    if (kept) {
      const changes = { fetched_at: now, updated_at: now };
      if (kept.raw_title !== title) changes.raw_title = title;
      if ((kept.raw_body || null) !== body) changes.raw_body = body;
      if (kept.source_url !== row.url) changes.source_url = row.url;
      const { error: updateError } = await supabaseAdmin.from('seeder_content_queue').update(changes).eq('id', kept.id);
      if (updateError) throw updateError;
      refreshed += 1;
      continue;
    }
    const { error: insertError } = await supabaseAdmin.from('seeder_content_queue').insert({
      source: row.source,
      source_url: row.url,
      raw_title: title,
      raw_body: body,
      region,
      category: row.category,
      fetched_at: now,
      status: 'posted',
      dedup_hash: hash,
      source_priority: row.priority || 2,
      scope: 'local',
    });
    // Another run wrote the same thing a moment ago: that row stands.
    if (insertError && insertError.code !== '23505') throw insertError;
    if (!insertError) added += 1;
  }
  return { added, refreshed };
}

module.exports = { writeRows, dedupHash };
