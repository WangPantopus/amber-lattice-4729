/**
 * Local events from calendar files: each active seeder_sources row of type 'ical' in a region (a library's, a city's,
 * a chamber's). Kept: events starting in the next 7 days, at most 5 per calendar, soonest first. Title: "<event> ·
 * <weekday, month day, time>" in the region's time zone. Link: the event's own page, else the calendar's site.
 */

const { DateTime } = require('luxon');
const { rrulestr } = require('rrule');
const { readFeed } = require('./http');

const AHEAD_MS = 7 * 24 * 3_600_000;
const MAX_PER_CALENDAR = 5;
const MAX_TITLE = 140;

// Lines folded with a leading space or tab are one line (RFC 5545 3.1).
function unfold(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function unescape(value) {
  return String(value || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// "DTSTART;TZID=America/Los_Angeles:20261124T100000" -> { name, params, value }.
function property(line) {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const [name, ...rest] = line.slice(0, colon).split(';');
  const params = Object.fromEntries(rest.map((part) => {
    const eq = part.indexOf('=');
    return eq < 0 ? [part.toUpperCase(), ''] : [part.slice(0, eq).toUpperCase(), part.slice(eq + 1).replace(/^"|"$/g, '')];
  }));
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

// A date-time property (DTSTART, EXDATE value, RECURRENCE-ID) as a wall clock in its own zone: { wall (a luxon
// DateTime in that zone), allDay, zone }. A TZID luxon does not know gives null, so the event is left out rather than
// shown at a guessed hour.
function wallTime(value, params, calendarZone) {
  const text = String(value || '').trim();
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(text)) {
    const wall = DateTime.fromFormat(text.slice(0, 8), 'yyyyMMdd', { zone: calendarZone });
    return wall.isValid ? { wall, allDay: true, zone: calendarZone } : null;
  }
  const zone = text.endsWith('Z') ? 'utc' : (params.TZID || calendarZone);
  const wall = DateTime.fromFormat(text.replace(/Z$/, ''), "yyyyMMdd'T'HHmmss", { zone });
  return wall.isValid ? { wall, allDay: false, zone } : null;
}

// Every instant (ms) a list of EXDATE / RECURRENCE-ID properties names.
function instantsOf(props, calendarZone) {
  const out = new Set();
  for (const prop of props || []) {
    for (const value of String(prop.value || '').split(',')) {
      const time = wallTime(value, prop.params, calendarZone);
      if (time) out.add(time.wall.toMillis());
    }
  }
  return out;
}

function parseCalendar(text) {
  const lines = unfold(text);
  const calendar = { site: null, events: [] };
  let event = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { event = { exdates: [] }; continue; }
    if (line === 'END:VEVENT') { if (event) calendar.events.push(event); event = null; continue; }
    const prop = property(line);
    if (!prop) continue;
    if (!event) {
      if (prop.name === 'X-ORIGINAL-URL') calendar.site = prop.value.trim();
      continue;
    }
    if (prop.name === 'SUMMARY') event.summary = unescape(prop.value);
    else if (prop.name === 'DTSTART') event.start = prop;
    else if (prop.name === 'URL') event.url = prop.value.trim();
    else if (prop.name === 'UID') event.uid = prop.value.trim();
    else if (prop.name === 'STATUS') event.status = prop.value.trim().toUpperCase();
    else if (prop.name === 'RRULE') event.rrule = prop.value.trim();
    else if (prop.name === 'EXDATE') event.exdates.push(prop);
    else if (prop.name === 'RECURRENCE-ID') event.recurrence = prop;
  }
  return calendar;
}

// A wall clock as rrule's "floating" date (its UTC fields hold the local clock), and back.
function floating(wall) {
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second));
}
function fromFloating(date, zone) {
  return DateTime.fromObject({
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds(),
  }, { zone });
}

// Every start of an event within [now, now + 7 days]. A repeating event is expanded in its own wall time (so the
// weekday and the hour stay the calendar's across daylight time), minus its EXDATEs and the occurrences another event
// with the same UID replaces (RECURRENCE-ID). A rule that cannot be expanded gives nothing: no event beats a wrong time.
function occurrences(event, calendarZone, now, replaced = new Set()) {
  const first = event.start && wallTime(event.start.value, event.start.params, calendarZone);
  if (!first) return [];
  const inWindow = (at) => at >= now && at <= now + AHEAD_MS;
  if (!event.rrule) {
    const at = first.wall.toMillis();
    return inWindow(at) ? [{ at, allDay: first.allDay, zone: first.zone }] : [];
  }
  try {
    const rule = rrulestr(`RRULE:${event.rrule}`, { dtstart: floating(first.wall) });
    const from = floating(DateTime.fromMillis(now - 24 * 3_600_000, { zone: first.zone }));
    const to = floating(DateTime.fromMillis(now + AHEAD_MS + 24 * 3_600_000, { zone: first.zone }));
    const skipped = instantsOf(event.exdates, calendarZone);
    const out = [];
    for (const date of rule.between(from, to, true)) {
      const wall = fromFloating(date, first.zone);
      if (!wall.isValid) return [];
      const at = wall.toMillis();
      if (!inWindow(at) || skipped.has(at) || replaced.has(at)) continue;
      out.push({ at, allDay: first.allDay, zone: first.zone });
      if (out.length >= MAX_PER_CALENDAR) break;
    }
    return out;
  } catch {
    return [];
  }
}

function whenLabel(at, allDay, zone) {
  const time = DateTime.fromMillis(at, { zone });
  return allDay ? time.toFormat('cccc, LLL d') : time.toFormat('cccc, LLL d, h:mm a');
}

function secureLink(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

// The rows for one calendar source row.
function calendarRows(region, source, text, now = Date.now()) {
  const zone = region.timezone || 'America/Los_Angeles';
  const calendar = parseCalendar(text);
  const site = secureLink(calendar.site) || (() => {
    try { return `${new URL(source.url).origin}/`; } catch { return null; }
  })();
  // Occurrences of a series that another event (same UID, RECURRENCE-ID) replaces.
  const replacedBy = new Map();
  for (const event of calendar.events) {
    if (!event.recurrence || !event.uid) continue;
    if (!replacedBy.has(event.uid)) replacedBy.set(event.uid, new Set());
    instantsOf([event.recurrence], zone).forEach((at) => replacedBy.get(event.uid).add(at));
  }
  const found = [];
  for (const event of calendar.events) {
    if (!event.summary || event.status === 'CANCELLED') continue;
    const replaced = event.rrule && event.uid ? (replacedBy.get(event.uid) || new Set()) : new Set();
    for (const occurrence of occurrences(event, zone, now, replaced)) {
      found.push({ event, ...occurrence });
    }
  }
  const seen = new Set();
  return found
    .sort((a, b) => a.at - b.at)
    .filter(({ event, at }) => {
      const key = `${event.summary.toLowerCase()}|${at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_PER_CALENDAR)
    .map(({ event, at, allDay, zone: eventZone }) => {
      const name = event.summary.length > MAX_TITLE ? `${event.summary.slice(0, MAX_TITLE - 1).trimEnd()}…` : event.summary;
      return {
        source: source.source_id,
        feedId: `${event.uid || event.summary}|${at}`,
        category: 'event',
        priority: 2,
        rank: at,
        title: `${name} · ${whenLabel(at, allDay, allDay ? eventZone : zone)}`,
        body: source.display_name ? `From ${source.display_name}.` : null,
        url: secureLink(event.url) || site,
      };
    })
    .filter((row) => row.url);
}

async function readCalendar(source) {
  return readFeed(source.url, { accept: 'text/calendar, text/plain' });
}

module.exports = { readCalendar, calendarRows, parseCalendar };
