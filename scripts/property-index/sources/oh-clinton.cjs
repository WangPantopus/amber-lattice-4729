'use strict';
// The Auditor publishes the daily ISSG extract. Clinton County GIS publishes the tax-year parcel polygons
// and the Engineer's physical address nodes on its Data Downloads page. The map notice is for reference use.
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parse } = require('../../../backend/services/propertyRecords/addressKey');
const { issgCounty } = require('../lib/issg.cjs');
const { download, zipDates } = require('../lib/tables.cjs');
const { shapeRings } = require('../lib/counties.cjs');
const { dbfRows } = require('../lib/dbf.cjs');
const { zipCode, realUnit } = require('../lib/addresses.cjs');
const { markMapLot } = require('../lib/held.cjs');

const auditor = issgCounty({
  fips: '39027', county: 'Clinton County', publisher: 'Clinton County Auditor', source: 'oh-clinton', strictParcelIdentity: true, retries: 0,
  file: 'https://clintoncountyauditor.org/api/Document/PublicRecordsXML.zip',
});
const ITEMS = 'https://www.arcgis.com/sharing/rest/content/items/';
const PARCELS = '3c7673fd8b364515933cb950b115b32c';
const SITES = '424d6efc421342a5ab43d246f96e7f1b';

function clintonRings(shp, shx) {
  // Clinton writes empty XY polygons as a 44-byte polygon header with no parts or points.
  // Give the shared reader a null shape at that same ordinal. Leave every coordinate untouched.
  if (shx.length < 100 || (shx.length - 100) % 8 || shx.readUInt32BE(24) * 2 !== shx.length) {
    throw new Error('Invalid Clinton shape index');
  }
  for (let i = 100; i < shx.length; i += 8) {
    if (shx.readUInt32BE(i + 4) !== 22) continue; // SHX lengths are in 16-bit words.
    const at = shx.readUInt32BE(i) * 2;
    if (at < 100 || at + 52 > shp.length || shp.readUInt32BE(at) !== 1 + (i - 100) / 8 || shp.readUInt32BE(at + 4) !== 22) {
      throw new Error('Clinton shape index and data disagree');
    }
    if (shp.readUInt32LE(at + 8) === 5 && shp.readUInt32LE(at + 44) === 0 && shp.readUInt32LE(at + 48) === 0) {
      shp.writeUInt32LE(0, at + 8);
    }
  }
  return shapeRings(shp);
}

async function parcelMap(file) {
  const member = (suffix) => execFileSync('unzip', ['-p', file, 'cntyparcels.' + suffix], { maxBuffer: 256 * 1024 * 1024 });
  const projection = member('prj').toString();
  if (!projection.startsWith('PROJCS["NAD_1983_StatePlane_Ohio_South_FIPS_3402_Feet",') ||
      !/UNIT\["Foot_US",0\.3048006096\d*\]\]\s*$/.test(projection)) throw new Error('The Clinton parcel projection changed');
  const polygons = clintonRings(member('shp'), member('shx'));
  const rows = dbfRows(file, 'cntyparcels.dbf', ['Parcel_Num', 'Tax_Year'], { includeDeleted: true });
  const parcels = new Map();
  const boxes = new Set();
  const shared = new Set();
  for await (const row of rows) {
    const shape = polygons.next();
    if (shape.done) throw new Error('Clinton parcel rows and shapes do not align');
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity, twiceArea = 0;
    // The rings have opposite winding around holes. Work in local coordinates to avoid losing precision.
    for (const ring of shape.value) {
      for (let i = 0; i < ring.length; i += 2) {
        const x = ring[i], y = ring[i + 1];
        xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
        ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
        if (i) twiceArea += (ring[i - 2] - ring[0]) * (y - ring[1]) - (x - ring[0]) * (ring[i - 1] - ring[1]);
      }
    }
    const box = [xmin, ymin, xmax, ymax].join('|');
    if (boxes.has(box)) shared.add(box);
    boxes.add(box);
    if (!row?.Parcel_Num) continue;
    // The publisher repeats polygons for some condos. Repeated parcels or coincident bounds cannot supply a private lot.
    parcels.set(row.Parcel_Num, parcels.has(row.Parcel_Num) ? null : { year: Number(row.Tax_Year), sqft: Math.round(Math.abs(twiceArea) / 2), box });
  }
  if (!polygons.next().done) throw new Error('Clinton parcel rows and shapes do not align');
  for (const [id, parcel] of parcels) if (!parcel?.sqft || shared.has(parcel.box)) parcels.delete(id);
  return parcels;
}

function siteKey(address) {
  return JSON.stringify([address.number, address.pre, address.name, address.suffix, address.post, address.unit, address.building]);
}

async function sitePlaces(file) {
  const places = new Map();
  const fields = ['HOUSENUM', 'ADDNUM_SUF', 'UNITNUM', 'ST_PREFIX', 'ST_NAME', 'ST_TYPE', 'ST_SUFFIX', 'USPS_CITY', 'ZIPCODE'];
  for await (const row of dbfRows(file, 'Addresses_ft.dbf', fields)) {
    const suffix = row.ADDNUM_SUF.trim();
    const number = /^\d\/\d$/.test(suffix) ? row.HOUSENUM + ' ' + suffix : row.HOUSENUM + suffix;
    const line = [number, row.ST_PREFIX, row.ST_NAME, row.ST_TYPE, row.ST_SUFFIX].filter(Boolean).join(' ');
    const address = parse(line, realUnit(row.UNITNUM));
    const zip = zipCode(row.ZIPCODE);
    const city = row.USPS_CITY.trim().toUpperCase();
    if (address?.form !== 'street' || !zip || !city) continue;
    const key = siteKey(address);
    const previous = places.get(key);
    if (!places.has(key)) places.set(key, { zip, city });
    else if (previous && (previous.zip !== zip || previous.city !== city)) places.set(key, null);
  }
  return places;
}

async function* build(options) {
  const dir = path.join(options.work, 'oh-clinton');
  const parcelFile = path.join(dir, 'cntyparcels.zip');
  const siteFile = path.join(dir, 'address-nodes.zip');
  download(ITEMS + PARCELS + '/data', parcelFile, {}, { retries: 0 });
  download(ITEMS + SITES + '/data', siteFile, {}, { retries: 0 });
  const areas = await parcelMap(parcelFile);
  const mapDate = zipDates(parcelFile).get('cntyparcels.shp');
  if (!mapDate) throw new Error('The Clinton parcel map is undated');
  const places = await sitePlaces(siteFile);
  for await (const county of auditor.build(options)) {
    for (const record of county.records) {
      const { address, facts } = record;
      const place = places.get(siteKey(address));
      if (place && (!address.city || address.city === place.city) && (!address.zip || address.zip === place.zip)) {
        address.city = place.city;
        address.zip = place.zip;
      }
      if (record.home_type !== 'house' || record.kind !== 'property' || address.unit || !facts.living_sqft || facts.lot_acres) continue;
      const parcel = areas.get(facts.parcel_number);
      if (parcel && parcel.year === facts.value_year) {
        facts.lot_sqft = parcel.sqft;
        markMapLot(record, 'lot_sqft');
      }
    }
    const from = 'Measured from Clinton County’s parcel map (' + mapDate + ')';
    county.held_from = { mapped_lots: { lot_sqft: from, lot_acres: from } };
    county.require_mapped_lot_label = true;
    yield county;
  }
}

module.exports = {
  build,
  dictionary: { ...auditor.dictionary, facts: { ...auditor.dictionary.facts, lot_sqft: 'polygon area()' } },
};
