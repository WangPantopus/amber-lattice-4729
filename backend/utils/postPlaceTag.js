'use strict';

// What a post's place tag from the picker names, from its kind (geocode_accuracy: Mapbox's "poi", "place",
// "address"…, or an OpenStreetMap category such as "restaurant") or, failing that, its id's prefix ("poi.123"). A town
// or an area is a big shape whose point is its middle, an address may be someone's home, and anything else is a venue.
// POST /api/posts decides a photo's pin with it, and feedService reads posts already made with it (the Sky: only a
// venue keeps an exact pin).
const AREA_PLACE_KINDS = new Set(['place', 'locality', 'neighborhood', 'district', 'region', 'postcode', 'country',
  'city', 'town', 'village', 'hamlet', 'suburb', 'county', 'state']);
const ADDRESS_PLACE_KINDS = new Set(['address', 'street', 'house']);

/** 'venue' | 'address' | 'area', or null with no tag. */
function taggedPlaceKind(placeId, kind) {
  if (!placeId) return null;
  for (const name of [String(kind || '').toLowerCase(), String(placeId).split('.')[0].toLowerCase()]) {
    if (ADDRESS_PLACE_KINDS.has(name)) return 'address';
    if (AREA_PLACE_KINDS.has(name)) return 'area';
  }
  return 'venue';
}

module.exports = { taggedPlaceKind };
