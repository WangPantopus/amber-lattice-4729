'use strict';
// Dallas publishes the certified polygon in State Plane US survey feet. Its Acct is the roll's GIS_PARCEL_ID,
// which may belong to several accounts. Keep the keys as text, including leading zeroes.
// https://www.dallascad.org/GISDataProducts.aspx and https://www.dallascad.org/PARCEL_GEOM.pdf
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { download, zipMembers } = require('./tables.cjs');
const { dbfRows } = require('./dbf.cjs');
const { shapeRings } = require('./counties.cjs');
const { markMapLot } = require('./held.cjs');
const { parse, sortKey, city } = require('../../../backend/services/propertyRecords/addressKey');
const { resolve } = require('../../../backend/services/propertyRecords/identity');
const { log } = require('./log.cjs');

function measure(rings) {
  let twiceArea = 0;
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const ring of rings) {
    const [x0, y0] = ring;
    if (ring.length < 8 || ring.at(-2) !== x0 || ring.at(-1) !== y0) return null;
    let px = 0, py = 0;
    for (let i = 2; i < ring.length; i += 2) {
      const x = ring[i], y = ring[i + 1];
      xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
      ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
      const dx = x - x0, dy = y - y0;
      twiceArea += px * dy - dx * py;
      px = dx; py = dy;
    }
  }
  // Opposite winding subtracts holes. Compare bounds and rounded area conservatively, including non-house parcels.
  const sqft = Math.abs(twiceArea) / 2;
  return Number.isFinite(sqft) && Math.round(sqft) > 0
    ? { sqft, signature: [xmin, ymin, xmax, ymax, Math.round(sqft)].join('|') } : null;
}

async function fillDallasLots(dir, year, parcelAccounts, records, ambiguousAccounts, output) {
  const name = `PARCEL${year}`;
  const zip = path.join(dir, `${name}.zip`);
  const url = 'https://www.dallascad.org/ViewPDFs.aspx?type=3&id=%5C%5CDCAD.ORG%5CWEB%5CWEBDATA%5CWEBFORMS%5CGIS%20PRODUCTS%5C';
  download(url + name + '.zip', zip, {}, { retries: 0 });
  const files = zipMembers(zip).filter((file) => path.posix.basename(file).toUpperCase() === name + '.SHP');
  if (files.length !== 1) throw new Error('Expected one Dallas certified parcel layer for the appraisal year');
  const base = files[0].slice(0, -4);
  const projection = execFileSync('unzip', ['-p', zip, base + '.prj'], { encoding: 'utf8' }).trim();
  if (!projection.startsWith('PROJCS["NAD_1983_StatePlane_Texas_North_Central_FIPS_4202_Feet"') ||
      !/UNIT\["Foot_US",0\.30480060960\d*\]\]$/.test(projection)) throw new Error('Unrecognized Dallas parcel projection');
  const bytes = execFileSync('unzip', ['-p', zip, files[0]], { maxBuffer: 512 * 1024 * 1024 });
  if (![5, 15, 25].includes(bytes.readUInt32LE(32))) throw new Error('Expected Dallas parcel polygons');
  const shapes = shapeRings(bytes);
  const signatures = new Map();
  const areas = new Map();
  for await (const row of dbfRows(zip, base + '.dbf', ['Acct'], { includeDeleted: true })) {
    const entry = shapes.next();
    if (entry.done) throw new Error('Dallas parcel table is longer than its shape file');
    if (!row) continue;
    const id = row.Acct;
    const measured = measure(entry.value);
    const repeated = areas.has(id);
    areas.set(id, repeated ? null : measured?.sqft);
    if (!measured) continue;
    const previous = signatures.get(measured.signature);
    if (previous !== undefined && previous !== id) {
      areas.set(previous, null);
      areas.set(id, null);
    } else {
      signatures.set(measured.signature, id);
    }
  }
  if (!shapes.next().done) throw new Error('Dallas shape file is longer than its parcel table');

  const candidates = [];
  const neighbors = new Map();
  let compared = 0, agree = 0;
  for (const [id, account] of parcelAccounts) {
    if (!account || ambiguousAccounts.has(account)) continue;
    const sqft = areas.get(id);
    const record = records.get(account);
    if (!sqft || !record || record.restricted || record.kind !== 'property' || record.home_type !== 'house' || record.address.unit) continue;
    const facts = record.facts;
    if (facts.value_year !== year) continue;
    const recorded = facts.lot_sqft || facts.lot_acres * 43560;
    if (recorded > 0) {
      compared += 1;
      if (Math.abs(sqft - recorded) <= 0.1 * recorded) agree += 1;
    } else {
      const { zip } = record.address;
      const parsed = parse(facts.address_on_record, '', { state: 'TX', zip });
      if (!parsed || parsed.unit) continue;
      const key = sortKey(parsed);
      if (!neighbors.has(key)) neighbors.set(key, []);
      candidates.push({ record, sqft, key, query: { ...parsed, zip, city: city(record.address.city) } });
    }
  }
  if (compared < 100 || agree < 0.9 * compared) throw new Error('Dallas certified parcel areas failed the recorded-lot comparison');
  // Distinct parcel accounts can still share a site address. Apply the same identity decision as the app,
  // including restricted records and generated condo buildings, before assigning a missing house lot.
  for (const record of output) neighbors.get(sortKey(record.address))?.push(record);
  let filled = 0;
  for (const { record, sqft, key, query } of candidates) {
    const answer = resolve(query, neighbors.get(key));
    if (answer.match !== 'exact' || answer.record.id !== record.id) continue;
    record.facts.lot_sqft = Math.round(sqft);
    markMapLot(record, 'lot_sqft');
    filled += 1;
  }
  log(`Dallas ${year} certified map: ${filled} missing house lots measured; ${agree} of ${compared} recorded lots agree within 10%`);
}
module.exports = { fillDallasLots };
