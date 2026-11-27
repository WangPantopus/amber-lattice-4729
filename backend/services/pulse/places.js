'use strict';

// Pulse, reinvented, phase 4: places you follow (coord CONTRACT 9c), such as a hometown or Kyoto, which bring far things
// into Explore. One of the person's own choices, kept in "PersonChoice" (`followed_places`), private to them: nobody else
// is told or shown what someone follows. Today's place follows (PulseFollow) belong to the paused Pulse redesign and name
// only its open areas, so a far place can't ride them.

const crypto = require('crypto');
const supabaseAdmin = require('../../config/supabaseAdmin');
const { haversineMeters } = require('../../utils/trustState');

const CHOICE = 'followed_places';
const MAX_PLACES = 5;
const SAME_PLACE_M = 5000;
const NEAR_M = 30000;

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

const round = (v) => Math.round(v * 100) / 100;

function cleanPlace(place) {
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
  const label = typeof place?.label === 'string' ? place.label.trim().replace(/\s+/g, ' ') : '';
  if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { id: typeof place.id === 'string' ? place.id : null, label: label.slice(0, 60), latitude: round(latitude), longitude: round(longitude) };
}

/** The places this person follows, as kept; [] when none or when the choice can't be read (Explore then lists as before). */
async function placesOf(userId, { orThrow = false } = {}) {
  const { data, error } = await supabaseAdmin.from('PersonChoice').select('value')
    .eq('user_id', userId).eq('choice', CHOICE).maybeSingle();
  if (error) {
    if (orThrow) throw new Error(`Failed to load the places you follow: ${error.message}`);
    return [];
  }
  return (Array.isArray(data?.value?.places) ? data.value.places : []).map(cleanPlace).filter((p) => p && p.id);
}

async function keep(userId, places) {
  const { error } = places.length
    ? await supabaseAdmin.from('PersonChoice').upsert({
      user_id: userId, choice: CHOICE, value: { places }, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,choice' })
    : await supabaseAdmin.from('PersonChoice').delete().eq('user_id', userId).eq('choice', CHOICE);
  if (error) throw new Error(`Failed to keep the places you follow: ${error.message}`);
}

/** GET /places — the places the reader follows. */
async function list(userId) {
  return { places: await placesOf(userId, { orThrow: true }) };
}

/** POST /places — follow a place picked by name. The same place again answers the one kept. */
async function add(userId, body) {
  const place = cleanPlace(body);
  if (!place || String(body?.label || '').trim().length > 60) {
    throw fail(400, 'PLACE_INVALID', 'Pick a place by name (up to 60 characters) with its point.');
  }
  const places = await placesOf(userId, { orThrow: true });
  const same = places.find((p) => haversineMeters(p.latitude, p.longitude, place.latitude, place.longitude) <= SAME_PLACE_M);
  if (same) return { place: same, added: false };
  if (places.length >= MAX_PLACES) throw fail(409, 'PLACES_FULL', `You can follow up to ${MAX_PLACES} places. Let one go to add another.`);
  const kept = { ...place, id: crypto.randomUUID() };
  await keep(userId, [...places, kept]);
  return { place: kept, added: true };
}

/** DELETE /places/:id — stop following it (nothing when it isn't followed). */
async function remove(userId, id) {
  const places = await placesOf(userId, { orThrow: true });
  const left = places.filter((p) => p.id !== id);
  if (left.length !== places.length) await keep(userId, left);
}

/** The followed place an item's shown point is near (within NEAR_M), or null. */
function nearOf(places, point) {
  if (!places.length || point?.latitude == null || point?.longitude == null) return null;
  let best = null;
  for (const p of places) {
    const m = haversineMeters(point.latitude, point.longitude, p.latitude, p.longitude);
    if (m <= NEAR_M && (!best || m < best.m)) best = { place: p, m };
  }
  return best ? best.place : null;
}

module.exports = { list, add, remove, placesOf, nearOf, CHOICE, MAX_PLACES, NEAR_M };
