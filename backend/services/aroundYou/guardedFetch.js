/**
 * Guarded fetch for addresses nobody here chose: the source finder reads addresses a model found on the open web, and
 * every one of them is treated as hostile (Around you everywhere layer, piece 4).
 *
 * - https only, port 443 only, no user name or password in the address;
 * - public addresses only. The check runs on the addresses DNS gives for the connection itself (the socket is handed
 *   only addresses that passed, so no second lookup can swap them) and again on the address the socket reached. An
 *   address literal is checked before anything is sent. Private, loopback, link-local (cloud metadata), carrier-grade
 *   NAT, multicast, reserved and the IPv6 transition ranges are refused, as in routes/linkPreview.js;
 * - at most 3 redirects, each to https on the same site (its host with or without "www.", the seeder's own rule in
 *   pantopus-seeder/src/sources/rss.py, so a feed that passes here is one the fetcher can read), and every redirect is
 *   checked again from the start;
 * - one 20-second deadline for the whole fetch (DNS, redirects, headers and body) and at most 5 MB, counted on the
 *   bytes received and on the decoded body alike.
 *
 * It reads with the seeder's own name (Pantopus-Seeder), so what it sees is what the fetcher will see. It never
 * retries, never changes its name and never works around a refusal.
 */

const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');
const zlib = require('node:zlib');
const ipaddr = require('ipaddr.js');

const MAX_BYTES = 5 * 1024 * 1024;
const DEADLINE_MS = 20_000;
const MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2048;
const USER_AGENT = 'Pantopus-Seeder/1.0 (+https://pantopus.com)';
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const DECODERS = {
  gzip: () => zlib.createGunzip(),
  'x-gzip': () => zlib.createGunzip(),
  deflate: () => zlib.createInflate(),
  br: () => zlib.createBrotliDecompress(),
};

/** A refusal or failure with a short code the finder writes in its notes. */
class GuardError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'GuardError';
    this.code = code;
  }
}

/** True only for global unicast: never loopback, private, link-local/metadata, CGNAT, multicast or transition ranges. */
function publicAddress(address) {
  try {
    // process() turns an IPv4-mapped IPv6 address into its IPv4 address first.
    const parsed = ipaddr.process(String(address || '').replace(/^\[|\]$/g, ''));
    // ipaddr.js counts the deprecated IPv4-compatible block (::/96, e.g. ::7f00:1) as unicast; no public host is there.
    if (parsed.kind() === 'ipv6' && parsed.parts.slice(0, 6).every((part) => part === 0)) return false;
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}

// The site an address belongs to: its host without a leading "www.".
function siteOf(host) {
  const name = String(host || '').toLowerCase();
  return name.startsWith('www.') ? name.slice(4) : name;
}

/** The address as a URL this guard will fetch, or a GuardError saying why not. */
function checkedUrl(value) {
  const text = String(value || '').trim();
  if (!text || text.length > MAX_URL_LENGTH) throw new GuardError('bad_address', 'Not a usable address');
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new GuardError('bad_address', 'Not a usable address');
  }
  if (url.protocol !== 'https:') throw new GuardError('not_https', 'Only https addresses are read');
  if (url.username || url.password) throw new GuardError('bad_address', 'Addresses with a user name are not read');
  if (url.port && url.port !== '443') throw new GuardError('bad_port', 'Only the standard https port is read');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || (net.isIP(host) && !publicAddress(host))) throw new GuardError('private_address', 'Not a public address');
  if (!net.isIP(host) && !host.includes('.')) throw new GuardError('private_address', 'Not a public address');
  url.hash = '';
  return url;
}

// The lookup the socket uses: every address DNS gives must be public, and the socket gets only those.
function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(new GuardError('dns', 'The name did not resolve'));
    if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
      return callback(new GuardError('private_address', 'Not a public address'));
    }
    if (options && options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

// One request, no redirect followed: { location } for a redirect, else { status, headers, body }.
function requestOnce(url, { accept, signal, maxBytes }) {
  return new Promise((resolve, reject) => {
    let decoder = null;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      decoder?.destroy();
      reject(error);
    };
    const request = https.get(url, {
      agent: false,
      lookup: publicLookup,
      signal,
      maxHeaderSize: 32 * 1024,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: accept || '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    }, (response) => {
      const stop = (error) => {
        response.destroy();
        fail(error);
      };
      response.on('error', (error) => fail(error.name === 'AbortError' ? error : new GuardError('network', 'The read failed')));
      // The address the socket reached, checked once more.
      const remote = response.socket?.remoteAddress;
      if (remote && !publicAddress(remote)) return stop(new GuardError('private_address', 'Not a public address'));
      if (REDIRECTS.has(response.statusCode)) {
        const location = response.headers.location;
        response.destroy();
        settled = true;
        return resolve({ location: location || null, status: response.statusCode });
      }
      // Only a success is read; any other answer is its status alone.
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy();
        settled = true;
        return resolve({ status: response.statusCode, headers: response.headers, body: Buffer.alloc(0) });
      }
      const encoding = String(response.headers['content-encoding'] || 'identity').trim().toLowerCase();
      if (encoding !== 'identity' && !DECODERS[encoding]) return stop(new GuardError('encoding', 'Unreadable encoding'));
      let received = 0;
      response.on('data', (chunk) => {
        received += chunk.length;
        if (received > maxBytes) stop(new GuardError('too_large', 'Larger than 5 MB'));
      });
      let body = response;
      if (encoding !== 'identity') {
        decoder = DECODERS[encoding]();
        decoder.on('error', () => stop(new GuardError('encoding', 'Unreadable encoding')));
        body = response.pipe(decoder);
      }
      const chunks = [];
      let size = 0;
      body.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) return stop(new GuardError('too_large', 'Larger than 5 MB'));
        chunks.push(chunk);
      });
      body.on('end', () => {
        if (settled) return;
        settled = true;
        resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) });
      });
    });
    request.on('socket', (socket) => {
      socket.once('secureConnect', () => {
        if (!publicAddress(socket.remoteAddress)) request.destroy(new GuardError('private_address', 'Not a public address'));
      });
    });
    request.on('error', (error) => {
      if (error instanceof GuardError) return fail(error);
      if (error.name === 'AbortError') return fail(new GuardError('timeout', 'No answer within 20 seconds'));
      if (/CERT|^ERR_TLS|^ERR_SSL/.test(String(error.code || ''))) {
        return fail(new GuardError('tls', "The site's certificate did not check out"));
      }
      return fail(new GuardError('network', 'The read failed'));
    });
    request.on('upgrade', (_response, socket) => {
      socket.destroy();
      fail(new GuardError('network', 'The read failed'));
    });
  });
}

/**
 * GET an address under the guard.
 *
 * @param {string} address
 * @param {object} [options]
 * @param {string} [options.accept]     The Accept header.
 * @param {number} [options.timeoutMs]  The whole fetch's deadline (at most 20 seconds).
 * @param {number} [options.maxBytes]   At most 5 MB.
 * @returns {Promise<{status:number, url:string, headers:object, body:Buffer, redirects:number}>} `url` is where the
 *   answer came from after redirects. A non-2xx answer comes back with its status and an empty body.
 * @throws {GuardError} with code not_https, bad_address, bad_port, private_address, dns, redirect_off_site,
 *   too_many_redirects, too_large, timeout, tls, encoding or network.
 */
async function guardedFetch(address, { accept, timeoutMs = DEADLINE_MS, maxBytes = MAX_BYTES } = {}) {
  const first = checkedUrl(address);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, DEADLINE_MS));
  try {
    let url = first;
    for (let redirects = 0; ; redirects += 1) {
      const answer = await requestOnce(url, {
        accept, signal: controller.signal, maxBytes: Math.min(maxBytes, MAX_BYTES),
      });
      if (!('location' in answer)) return { ...answer, url: url.href, redirects };
      if (redirects >= MAX_REDIRECTS || !answer.location) {
        throw new GuardError('too_many_redirects', 'More than 3 redirects');
      }
      let next;
      try {
        next = checkedUrl(new URL(answer.location, url).href);
      } catch (error) {
        throw error.code === 'not_https' ? new GuardError('redirect_off_site', 'Redirected away from https') : error;
      }
      if (siteOf(next.hostname) !== siteOf(first.hostname)) {
        throw new GuardError('redirect_off_site', 'Redirected to another site');
      }
      url = next;
    }
  } catch (error) {
    if (error instanceof GuardError) throw error;
    if (error?.name === 'AbortError' || controller.signal.aborted) throw new GuardError('timeout', 'No answer within 20 seconds');
    throw new GuardError('network', 'The read failed');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  guardedFetch, GuardError, publicAddress, checkedUrl, siteOf, USER_AGENT, MAX_BYTES, DEADLINE_MS, MAX_REDIRECTS,
};
