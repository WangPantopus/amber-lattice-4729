'use strict';
// A house's lot as one simplified ring from the county's own open parcel map, for the home record's photo from above (the
// lot outlined: backend/services/homeRecord, homerec-web). Held under `lot_rings` (format.js `held`) until the founder names
// the county on the switch file's lot_rings list (router.js), served as `copy.lot_ring`. The same parcel layer the measured
// rows read (lib/measure.cjs readParcels, the connector's `parcelShapes`), read once per build.
//
// Only a house, townhouse or mobile home on its own parcel gets one: never a condo's unit or a building (its parcel is the
// complex's land), never a parcel more than one home on record carries, never a parcel drawn as several outer shapes.

const { readParcels, ringSquareMeters } = require('./measure.cjs');
const { log } = require('./log.cjs');

const SWITCH = 'lot_rings';
// Points closer than this to the line between their neighbors go: a lot's corners stay, a curve keeps its shape.
const TOLERANCE_METERS = 1;
// Seven decimals of a degree is about a centimeter; six is about a decimeter, plenty for a photo at a meter a pixel.
const DIGITS = 6;
// A ring with more points than this after simplifying is a survey's curve or a shoreline: kept, but no larger.
const MOST_POINTS = 200;
const METERS_PER_DEGREE = 111320;

/** Douglas-Peucker on a closed ring, in local meters around its first point. */
function simplify(ring) {
  const [x0, y0] = ring[0];
  const kx = METERS_PER_DEGREE * Math.cos((y0 * Math.PI) / 180);
  const local = ring.map(([x, y]) => [(x - x0) * kx, (y - y0) * METERS_PER_DEGREE]);
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = local[first];
    const [bx, by] = local[last];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    let far = -1;
    let farthest = TOLERANCE_METERS;
    for (let i = first + 1; i < last; i += 1) {
      const [px, py] = local[i];
      const distance = length ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / length : Math.hypot(px - ax, py - ay);
      if (distance > farthest) {
        farthest = distance;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([first, far], [far, last]);
    }
  }
  const round = (value) => Number(value.toFixed(DIGITS));
  return ring.filter((_, i) => keep[i]).map(([x, y]) => [round(x), round(y)]);
}

/**
 * Holds `held.lot_rings.lot_ring` ([[lng, lat], ...], closed, simplified) on each house whose parcel the county's map draws
 * as one outer shape. Returns how many it held, or 0 when the county has no parcel layer or it can't be read (the release
 * goes on without rings).
 * @param {object[]} records  a county's records, before release
 * @param {{ fips: string }} county
 * @param {{ work: string, parcelShapes?: object }} options
 */
async function holdLotRings(records, county, { work, parcelShapes = null }) {
  if (!parcelShapes) return 0;
  let parcels;
  try {
    parcels = await readParcels(parcelShapes, county.fips, work);
  } catch (err) {
    log(`${county.fips}: the parcel map couldn't be read (${err.constructor === Error ? err.message : err.name}), so no lot outlines`);
    return 0;
  }
  const houses = records.filter((record) => record.kind === 'property' && !record.restricted && record.facts?.parcel_number);
  // Homes by parcel, by record id: a connector can write one home at two of its addresses (Clark's own text and the map's).
  const homesOn = new Map();
  for (const record of records) {
    if ((record.kind === 'property' || record.kind === 'unit') && record.facts?.parcel_number) {
      const key = String(record.facts.parcel_number);
      if (!homesOn.has(key)) homesOn.set(key, new Set());
      homesOn.get(key).add(record.id);
    }
  }
  const counts = { held: 0, no_shape: 0, shared: 0, several_shapes: 0 };
  for (const record of houses) {
    const key = String(record.facts.parcel_number);
    const parcel = parcels.get(key);
    if (!parcel) {
      counts.no_shape += 1;
      continue;
    }
    if (homesOn.get(key).size > 1) {
      counts.shared += 1;
      continue;
    }
    // Outer rings run clockwise in a map service's shapes (negative area); a hole runs the other way.
    const outer = parcel.rings.filter((ring) => ring.length >= 4 && ringSquareMeters(ring) < 0);
    if (outer.length !== 1) {
      counts.several_shapes += 1;
      continue;
    }
    const ring = simplify(outer[0]);
    if (ring.length < 4 || ring.length > MOST_POINTS) {
      counts.several_shapes += 1;
      continue;
    }
    record.held = { ...record.held, [SWITCH]: { lot_ring: ring } };
    counts.held += 1;
  }
  log(`${county.fips}: lot outlines held for ${counts.held} of ${houses.length} houses; no shape ${counts.no_shape}, a parcel several homes carry ${counts.shared}, several shapes ${counts.several_shapes}`);
  return counts.held;
}

module.exports = { holdLotRings, simplify, SWITCH };
