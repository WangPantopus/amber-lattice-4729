'use strict';

const crypto = require('node:crypto');

const DENTON_FIPS = '48121';
const DENTON_BASELINE_PATH = 'suppressions/48121/2026-11-23.json';
const BASELINE_ACCOUNTS = 51;

function validHashes(values) {
  return Array.isArray(values) && values.every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
}

// The reviewed, create-only baseline has one distinct address and parcel per account.
function validDentonBaseline(list) {
  const complete = values => validHashes(values) && values.length === BASELINE_ACCOUNTS && new Set(values).size === BASELINE_ACCOUNTS;
  return typeof list?.salt === 'string' && Boolean(list.salt) && complete(list.hashes) && complete(list.parcel_hashes?.[DENTON_FIPS]);
}

// An active list may add takedowns. Counts alone cannot establish that it kept every standing one.
function coversDentonExclusions(list, required) {
  if (!required || list?.salt !== required.salt) return false;
  const covers = (values, needed) => {
    if (!validHashes(values)) return false;
    const members = new Set(values);
    return needed.every(value => members.has(value));
  };
  return covers(list.hashes, required.hashes) && covers(list.parcel_hashes?.[DENTON_FIPS], required.parcel_hashes[DENTON_FIPS]);
}

function suppressionHash(salt, fips, address) {
  return crypto.createHash('sha256')
    .update([salt, fips, address.number, address.pre, address.name, address.suffix, address.post, address.unit].join('|')).digest('hex');
}

function addressSuppressed(list, fips, address) {
  return Boolean(address && list?.hashes?.length && list.hashes.includes(suppressionHash(list.salt, fips, address)));
}

// A parcel number is meaningful only within its county. Keep its hashes separate from address takedowns.
function parcelSuppressed(list, fips, parcel) {
  const hashes = list?.parcel_hashes?.[fips];
  if (!parcel || !hashes?.length) return false;
  const hash = crypto.createHash('sha256').update([list.salt, fips, 'parcel', parcel].join('|')).digest('hex');
  return hashes.includes(hash);
}

module.exports = { DENTON_FIPS, DENTON_BASELINE_PATH, validDentonBaseline, coversDentonExclusions, suppressionHash, addressSuppressed, parcelSuppressed };
