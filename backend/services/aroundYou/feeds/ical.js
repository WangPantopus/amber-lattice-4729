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

// A DTSTART as an instant, and whether it is a whole day.
function startOf(prop, zone) {
  const value = String(prop.value || '').trim();
  if (prop.params.VALUE === 'DATE' || /^\d{8}$/.test(value)) {
    const day = DateTime.fromFormat(value.slice(0, 8), 'yyyyMMdd', { zone });
    return day.isValid ? { at: day.toMillis(), allDay: true } : null;
  }
  const utc = value.endsWith('Z');
  const at = DateTime.fromFormat(value.replace(/Z$/, ''), "yyyyMMdd'T'HHmmss", {
    zone: utc ? 'utc' : (prop.params.TZID || zone),
  });
  if (!at.isValid) {
    const fallback = DateTime.fromFormat(value.replace(/Z$/, ''), "yyyyMMdd'T'HHmmss", { zone: utc ? 'utc' : zone });
    return fallback.isValid ? { at: fallback.toMillis(), allDay: false } : null;
  }
  return { at: at.toMillis(), allDay: false };
}

function parseCalendar(text) {
  const lines = unfold(text);
  const calendar = { site: null, events: [] };
  let event = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { event = { raw: [] }; continue; }
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
    else if (prop.name === 'RECURRENCE-ID') event.recurrence = prop.value.trim();
  }
  return calendar;
}

// Every start of an event within [now, now + 7 days].
function occurrences(event, zone, now) {
  const first = event.start && startOf(event.start, zone);
  if (!first) return [];
  if (!event.rrule) return first.at >= now && first.at <= now + AHEAD_MS ? [first] : [];
  try {
    const rule = rrulestr(`RRULE:${event.rrule}`, { dtstart: new Date(first.at) });
    return rule.between(new Date(now), new Date(now + AHEAD_MS), true).slice(0, MAX_PER_CALENDAR)
      .map((at) => ({ at: at.getTime(), allDay: first.allDay }));
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
  const found = [];
  for (const event of calendar.events) {
    if (!event.summary || event.status === 'CANCELLED') continue;
    for (const occurrence of occurrences(event, zone, now)) {
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
    .map(({ event, at, allDay }) => {
      const name = event.summary.length > MAX_TITLE ? `${event.summary.slice(0, MAX_TITLE - 1).trimEnd()}…` : event.summary;
      return {
        source: source.source_id,
        feedId: `${event.uid || event.summary}|${at}`,
        category: 'event',
        priority: 2,
        title: `${name} · ${whenLabel(at, allDay, zone)}`,
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
