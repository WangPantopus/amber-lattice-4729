'use strict';

// Checks for the values a "next page" position is made of. A position comes back from the client, so each part is
// checked for its plain shape (a time, an id, a number) before a list query is built from it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// An ISO time as the database returns it or an app re-serializes it: seconds and up to nine fraction digits are
// optional, and the zone is "Z", an offset, or absent.
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/i;

const isUuid = (value) => typeof value === 'string' && UUID.test(value);

const isIsoTime = (value) => typeof value === 'string' && value.length <= 40 && ISO_TIME.test(value)
  && Number.isFinite(Date.parse(value));

/** A finite number, or a plain decimal string for one; anything else is null. */
function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^-?\d{1,15}(?:\.\d{1,10})?$/.test(value)) return Number(value);
  return null;
}

/** The error a list answers 400 with when its position isn't one it handed out. */
function invalidPosition(message = 'This page position is not valid. Reload the list.') {
  return Object.assign(new Error(message), { status: 400, code: 'INVALID_CURSOR' });
}

module.exports = { UUID, ISO_TIME, isUuid, isIsoTime, finiteNumber, invalidPosition };
