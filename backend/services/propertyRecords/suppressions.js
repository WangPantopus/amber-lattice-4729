'use strict';

const crypto = require('node:crypto');

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

module.exports = { suppressionHash, addressSuppressed, parcelSuppressed };
