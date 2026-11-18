'use strict';

// The Sky's places for Pulse posts (the Sky design, phase A; behind the `sky_places` flag, read for the author when a
// post is made or moved). A personal place post keeps an exact pin only at a tagged venue where its own photo or video
// was taken (never by the author's home; schools and preschools may since November 17, 2026); everything else, a
// Home post included, floats over its area (utils/areaCells.js) and stores only the area's point. Moments follow the
// same rules in routes/moments.js. docs/location-privacy-matrix.md has the rules as readers see them.

const { areaPoint, areaMetadata } = require('../utils/areaCells');

/** Whether the Sky's places apply to `viewer`'s posts (an id, or { id, role }). Off for everyone; failures read off. */
function skyOn(viewer) {
  return require('./moments/momentStore').skyOn(viewer);
}

/**
 * A venue tag at a point: { pinnable, atHome }. `pinnable`: the picker's venue (an `osm:` id) is found near the point
 * and may take a pin (it has a point; a Mapbox place id can't be looked up again and counts as one the
 * picker listed). `atHome`: the point is within ~60 m of a home the author lives at, so the post floats and says only
 * its town.
 */
async function venueCheck({ userId, placeId, latitude, longitude }) {
  const momentPlace = require('./moments/momentPlace');
  const [venue, atHome] = await Promise.all([
    String(placeId || '').startsWith('osm:') ? momentPlace.venueNear(placeId, latitude, longitude) : { pinnable: true },
    momentPlace.isAtHome(userId, latitude, longitude),
  ]);
  return { pinnable: Boolean(venue?.pinnable), atHome };
}

/** The columns a floating post stores for the area over `latitude`, `longitude`, and its area (null with no point). */
async function floatingFields(latitude, longitude) {
  const area = await areaPoint(latitude, longitude);
  if (!area) return null;
  return {
    area,
    fields: {
      latitude: area.latitude,
      longitude: area.longitude,
      effective_latitude: area.latitude,
      effective_longitude: area.longitude,
      location_precision: 'approx_area',
      location_address: null,
    },
    metadata: { area: areaMetadata(area) },
  };
}

module.exports = { skyOn, venueCheck, floatingFields };
