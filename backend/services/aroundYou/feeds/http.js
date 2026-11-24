/**
 * One read of a public feed for the Around you feeds job: https only (redirects included), 20 seconds and 5 MB at
 * most. A failure throws; the job skips that feed for the run and logs its host, never a point.
 */

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 5 * 1024 * 1024;
const USER_AGENT = 'Pantopus/1.0 (local feeds; https://pantopus.com)';

function httpsOnly(link) {
  const url = new URL(String(link));
  if (url.protocol !== 'https:') throw new Error(`not https: ${url.host}`);
  return url;
}

async function readFeed(link, { accept = '*/*' } = {}) {
  const url = httpsOnly(link);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept, 'user-agent': USER_AGENT } });
    httpsOnly(res.url || url);
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status} from ${url.host}`);
    }
    if (Number(res.headers.get('content-length')) > MAX_BYTES) {
      await res.body?.cancel();
      throw new Error(`over 5 MB from ${url.host}`);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > MAX_BYTES) {
        controller.abort();
        throw new Error(`over 5 MB from ${url.host}`);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`timed out or cut off: ${url.host}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(link) {
  return JSON.parse(await readFeed(link, { accept: 'application/json, application/geo+json' }));
}

module.exports = { readFeed, readJson, httpsOnly, TIMEOUT_MS, MAX_BYTES };
