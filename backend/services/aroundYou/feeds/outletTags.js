/**
 * The outlet's own labels for its stories (Around you's topics, November 24, 2026). A local paper files each story
 * under its own desks ("Schools", "Prep Sports", "Clark County Business", "Vancouver City Council") and says so in
 * its feed (<category>). The seeder Lambda keeps a story's headline, summary and link but not those labels, so once
 * an hour this reads each news feed again and writes the labels beside the stories the fetcher already has
 * (seeder_content_queue.outlet_tags). The page then sorts a story into topics by its outlet's word for it, and leaves
 * out what the outlet marks as a notice, an obituary, an opinion piece or a wire story from elsewhere
 * (services/aroundYou/topics.js).
 *
 * One read per feed address a run, through the guarded reader (a source's address can come from the source finder).
 * A feed that fails is skipped for the run. A story the feed lists without labels gets an empty list, which says
 * "looked, none"; one the feed no longer lists gets the same after six hours, so nothing is asked about forever.
 */

const { parseDocument, DomUtils } = require('htmlparser2');
const supabaseAdmin = require('../../../config/supabaseAdmin');
const logger = require('../../../utils/logger');
const { guardedFetch } = require('../guardedFetch');
const { cleanTags } = require('../topics');

const HOUR_MS = 3_600_000;
const LOOK_BACK_HOURS = 168;
const GIVE_UP_HOURS = 6;
const MAX_ITEMS = 200;
const WRITES_AT_ONCE = 5;

// A link as two feeds may write it: no fragment, no tracking query, no trailing slash, lower-case host.
function linkKey(value) {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_|ref$|cmp$)/i.test(name)) url.searchParams.delete(name);
    }
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '')}${url.search}`;
  } catch {
    return null;
  }
}

function textOf(node) {
  return DomUtils.textContent(node).replace(/\s+/g, ' ').trim();
}

/** A feed's stories with their labels: [{ link, tags }]. RSS (<item>, <category>) and Atom (<entry>, term=). */
function parseLabels(xml) {
  const document = parseDocument(String(xml || ''), { xmlMode: true });
  const items = DomUtils.getElementsByTagName((name) => name === 'item' || name === 'entry', document.children, true, MAX_ITEMS);
  const out = [];
  for (const item of items) {
    const children = (item.children || []).filter((child) => child.type === 'tag');
    const linkNode = children.find((child) => child.name === 'link' && (textOf(child) || child.attribs?.href));
    const link = linkKey(linkNode ? (textOf(linkNode) || linkNode.attribs.href) : null);
    if (!link) continue;
    const tags = cleanTags(children.filter((child) => child.name === 'category')
      .map((child) => textOf(child) || child.attribs?.term || ''));
    out.push({ link, tags: [...new Set(tags)] });
  }
  return out;
}

async function newsSources(regionIds) {
  const { data, error } = await supabaseAdmin
    .from('seeder_sources')
    .select('source_id, url, region')
    .eq('source_type', 'rss')
    .eq('active', true)
    .in('category', ['local_news', 'community_resource'])
    .in('region', regionIds);
  if (error) throw error;
  // A state outlet's stories show by a word list of their own (Across <State>); its labels are not read.
  return (data || []).filter((row) => row.url && !String(row.source_id).startsWith('rss:state_'));
}

async function unlabelled(regionIds, sourceIds) {
  const since = new Date(Date.now() - LOOK_BACK_HOURS * HOUR_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from('seeder_content_queue')
    .select('id, source, source_url, region, fetched_at')
    .in('region', regionIds)
    .in('source', sourceIds)
    .is('outlet_tags', null)
    .gte('fetched_at', since)
    .order('fetched_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data || [];
}

/**
 * One run for these regions: { feeds, labelled, failed_feeds }. Never throws for one feed; a read error of the
 * tables themselves does, and the job logs it.
 */
async function run(regions) {
  const stats = { feeds: 0, labelled: 0, failed_feeds: 0 };
  const regionIds = regions.map((region) => region.region);
  if (!regionIds.length) return stats;
  const sources = await newsSources(regionIds);
  if (!sources.length) return stats;
  const rows = await unlabelled(regionIds, [...new Set(sources.map((source) => source.source_id))]);
  if (!rows.length) return stats;
  // Only the feeds that have a story waiting are read.
  const waiting = new Set(rows.map((row) => `${row.region}|${row.source}`));
  const labelsByUrl = new Map();
  for (const source of sources.filter((row) => waiting.has(`${row.region}|${row.source_id}`))) {
    if (labelsByUrl.has(source.url)) continue;
    try {
      const answer = await guardedFetch(source.url, {
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      });
      if (answer.status < 200 || answer.status >= 300) throw new Error(`HTTP ${answer.status}`);
      labelsByUrl.set(source.url, new Map(parseLabels(answer.body.toString('utf8')).map((item) => [item.link, item.tags])));
      stats.feeds += 1;
    } catch (err) {
      stats.failed_feeds += 1;
      labelsByUrl.set(source.url, null);
      let host = 'unknown';
      try { host = new URL(source.url).host; } catch { /* named unknown */ }
      logger.warn('Around you labels: a feed was skipped this run', { host, error: err.message });
    }
  }
  const urlOf = new Map(sources.map((source) => [`${source.region}|${source.source_id}`, source.url]));
  const writes = [];
  for (const row of rows) {
    const labels = labelsByUrl.get(urlOf.get(`${row.region}|${row.source}`));
    if (!labels) continue;
    const found = labels.get(linkKey(row.source_url));
    if (found) writes.push({ id: row.id, tags: found });
    else if (Date.now() - Date.parse(row.fetched_at) > GIVE_UP_HOURS * HOUR_MS) writes.push({ id: row.id, tags: [] });
  }
  for (let start = 0; start < writes.length; start += WRITES_AT_ONCE) {
    const results = await Promise.all(writes.slice(start, start + WRITES_AT_ONCE).map(({ id, tags }) => supabaseAdmin
      .from('seeder_content_queue').update({ outlet_tags: tags }).eq('id', id).is('outlet_tags', null)));
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;
    stats.labelled += results.length;
  }
  return stats;
}

module.exports = { run, parseLabels, linkKey };
