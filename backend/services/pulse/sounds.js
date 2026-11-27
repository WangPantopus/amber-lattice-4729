'use strict';

// Pulse, reinvented, phase 4: listen to the town (coord CONTRACT 9g). "With headphones, drag across the map and hear the
// sound kept with Moments." Only what its author kept as place sound (7e's `place` kind, never a voice or a whisper) on a
// Moment shared with people nearby, that the reader may see in a list, not at home and not floating. Each point and link
// is the one the reader's own answer holds (LEAD-3 08:12).

const supabaseAdmin = require('../../config/supabaseAdmin');

// eslint-disable-next-line global-require
const momentStore = () => require('../moments/momentStore');

const MAX_SOUNDS = 100;
const PAD = 0.01;

/** GET /sounds for `user`: the place sounds in the map's box for its time (6b's rules for which Moments show). */
async function soundsIn(user, box, { time = 'live' } = {}) {
  // eslint-disable-next-line global-require
  const map = require('./map');
  if (map.FORWARD.includes(time)) return { sounds: [] };
  const store = momentStore();
  const userId = user.id;
  const back = map.BACK.includes(time);
  const since = map.backSince(time, box);
  const { data, error } = await supabaseAdmin.from('Post').select(store.MOMENT_SELECT).eq('is_story', true)
    .eq('audience', 'nearby').is('archived_at', null).eq('moderation_state', 'live')
    .eq('post_metadata->moment->sound->>kind', 'place')
    .gte('latitude', box.south - PAD).lte('latitude', box.north + PAD).gte('longitude', box.west - PAD).lte('longitude', box.east + PAD)
    .order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(`Failed to load sounds: ${error.message}`);
  const rows = (data || []).filter((row) => {
    const m = store.meta(row);
    return !m.at_home && !row.post_metadata?.area;
  });
  if (!rows.length) return { sounds: [] };
  await store.markOwn(rows, userId);
  const [ctx, reported] = await Promise.all([store.viewerContext(userId, rows.map((r) => r.user_id), null, rows), store.reportedIds(userId)]);
  const shown = rows.filter((row) => {
    const own = store.isOwn(row, userId);
    if (!own && !(store.canSee(row, ctx) && store.listedFor(row, userId) && !reported.has(row.id))) return false;
    if (since != null && Date.parse(store.shownAt(row)) < since) return false;
    const state = store.momentState(row);
    const kept = Boolean(store.meta(row).kept_post_at);
    // As the map shows them (6b): Live, the live ones and the kept ones that ended; back, the reader's own and the kept.
    return back ? (own && state === 'live') || kept : state === 'live' || (state === 'ended' && kept);
  });
  const answers = await store.serializeMoments(shown, userId, { keptPosts: true });
  const inBox = (m) => m.latitude != null && m.longitude != null && m.latitude >= box.south && m.latitude <= box.north
    && m.longitude >= box.west && m.longitude <= box.east;
  return {
    sounds: answers.filter((m) => m && m.sound?.kind === 'place' && m.sound.url && inBox(m)).slice(0, MAX_SOUNDS).map((m) => ({
      moment_id: m.id, latitude: m.latitude, longitude: m.longitude, url: m.sound.url, duration_ms: m.sound.duration_ms ?? null, at: m.created_at,
    })),
  };
}

module.exports = { soundsIn };
