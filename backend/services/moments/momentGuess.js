// Guess the spot (Pulse, reinvented, phase 0 step 8; behind the `pulse_reinvented` switch; CONTRACT.md section 5).
// A photo or video Moment its author marked `post_metadata.moment.guess` shows its picture without where it was
// taken; a person drops one pin and learns how far off it was (distance only, no points or ranks). Guesses are rows of
// the MomentGuess table (one per person per Moment); a guessed point is never read back to anyone.
// While it is live a guess-the-spot Moment is never listed for anyone but its author (no ring on the map or a profile,
// no count, no push: its pin and place are the answer), and people whose switch is off can't open it at all
// (momentStore.canSee). Once it ends it is an ordinary ended Moment.

const supabaseAdmin = require('../../config/supabaseAdmin');
const { haversineMeters } = require('../../utils/trustState');

const FEET_PER_M = 3.28084;
const METERS_PER_MILE = 1609.344;
const IDS_PER_READ = 100;

const meta = (row) => row?.post_metadata?.moment || {};

/** Whether the Moment is a guess-the-spot one. */
function isGuess(row) {
  return Boolean(meta(row).guess);
}

/** How far off a guess was, in words: "300 ft off", "1.2 mi off", "14 mi off". */
function distanceLabel(distanceM) {
  const miles = distanceM / METERS_PER_MILE;
  if (miles < 0.1) return `${Math.max(50, Math.round((distanceM * FEET_PER_M) / 50) * 50).toLocaleString('en-US')} ft off`;
  if (miles < 10) return `${miles.toFixed(1)} mi off`;
  return `${Math.round(miles).toLocaleString('en-US')} mi off`;
}

/**
 * The guesses on these Moments as one reader sees them: Map(id → { count, mine: { distance_m, label } | null }).
 * Only ids of guess-the-spot Moments are read; others are left out.
 */
async function guessesFor(rows, viewerId) {
  const ids = (rows || []).filter(isGuess).map((row) => row.id);
  const out = new Map(ids.map((id) => [id, { count: 0, mine: null }]));
  for (let at = 0; at < ids.length; at += IDS_PER_READ) {
    const { data, error } = await supabaseAdmin.from('MomentGuess').select('post_id, user_id, distance_m')
      .in('post_id', ids.slice(at, at + IDS_PER_READ));
    if (error) throw new Error(`Failed to load guesses: ${error.message}`);
    for (const guess of data || []) {
      const entry = out.get(guess.post_id);
      if (!entry) continue;
      entry.count += 1;
      if (String(guess.user_id) === String(viewerId)) {
        entry.mine = { distance_m: guess.distance_m, label: distanceLabel(guess.distance_m) };
      }
    }
  }
  return out;
}

/**
 * Keeps `viewerId`'s guess (`point`) on the Moment whose answer is `answer` (the point everyone would see), once: a
 * second guess answers the first again. Returns { distance_m, label }.
 */
async function recordGuess(row, viewerId, point, answer) {
  const distance = Math.round(haversineMeters(point.latitude, point.longitude, answer.latitude, answer.longitude));
  const { error } = await supabaseAdmin.from('MomentGuess').upsert({
    post_id: row.id, user_id: viewerId, latitude: point.latitude, longitude: point.longitude, distance_m: distance,
  }, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
  if (error) throw new Error(`Failed to save the guess: ${error.message}`);
  const { data, error: readError } = await supabaseAdmin.from('MomentGuess').select('distance_m')
    .eq('post_id', row.id).eq('user_id', viewerId).maybeSingle();
  if (readError || !data) throw new Error(`Failed to read the guess: ${readError?.message || 'missing'}`);
  return { distance_m: data.distance_m, label: distanceLabel(data.distance_m) };
}

// The stamps that would give the answer away before a reader has guessed.
const SPOT_STAMPS = new Set(['place', 'postmark', 'elevation', 'home_distance']);

/** A serialized Moment with its spot left out (CONTRACT 5b), for a reader who hasn't guessed yet. */
function withoutSpot(moment) {
  return {
    ...moment,
    latitude: null,
    longitude: null,
    place_label: null,
    area: null,
    floating: false,
    altitude_ft: null,
    flying: false,
    ...(Array.isArray(moment.stamps) ? { stamps: moment.stamps.filter((stamp) => !SPOT_STAMPS.has(stamp.kind)) } : {}),
  };
}

module.exports = { isGuess, distanceLabel, guessesFor, recordGuess, withoutSpot, SPOT_STAMPS };
