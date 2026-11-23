'use strict';
// Hernando County, Florida: the state's roll (fl-roll.cjs), with each home's bedrooms, bathrooms and floors from the Property
// Appraiser's Comprehensive CAMA Dataset, the free files its Downloads page posts and updates weekly (no terms stated). The
// Structures file gives each building's "Number of Bedrooms" and "Number of Bathrooms", a whole number: the county keeps no
// half baths, so the count is said as the county states it and never split into full and half. Its buildings name a parcel
// by the office's own key; the Parcels file's key and parcel number columns turn that into the roll's parcel number. The
// Parcels file's other columns (owner, mailing, values) are in the same fixed-width lines and are never cut out of them.
// The full weekly ERA file gives living area at parcel level. Add it only when the public roll and the county
// files identify one house at the same situs. Only parcels already on the roll (protected people removed) take a fact.

const path = require('node:path');
const { spawn } = require('node:child_process');
const { download, zipDates, zipMembers, streamLines } = require('../lib/tables.cjs');
const { number, positive, word } = require('../lib/values.cjs');
const { fillHomes, describe, monthOf } = require('../lib/fill.cjs');
const { log } = require('../lib/log.cjs');
const { countyRoll } = require('./fl-roll.cjs');

const FIPS = '12053';
const COUNTY = 'Hernando County';
const SITE = 'https://hernandocountypa-florida.us';
const PAGE = `${SITE}/Downloads`;
const FILES = {
  parcels: `${SITE}/download/PAPAR.ZIP`,
  structures: `${SITE}/download/STRU.ZIP`,
  era: `${SITE}/download/ERAFILE-FULL.ZIP`,
};
// The record layouts ("CCDS - PAPAR File Record Layout", "CCDS - STRU File Record Layout"): [start, end) of each field read.
const PARCEL = { length: 1339, key: [9, 17], number: [25, 50] };
const STRUCTURE = { length: 695, key: [0, 8], type: [8, 10], bedrooms: [661, 663], bathrooms: [663, 665], primary: [675, 676], stories: [690, 693] };
// ERA File Record Layout. Field 199 is the parcel's living area; field 119 is the separate under-roof area.
const ERA = { length: 1184, key: [0, 8], secondary: [74, 83], situs: [84, 134], zip: [167, 172], dorCode: [431, 433], status: [883, 884], living: [1015, 1023] };
// Structure types that are one home: a single family residence, a manufactured home, a villa, a condominium unit.
const DWELLING = new Set(['01', '02', '13', '15']);

async function* lines(zip) {
  const [member] = zipMembers(zip).filter((name) => /\.txt$/i.test(name));
  if (!member) throw new Error(`${path.basename(zip)} has no table`);
  const unzip = spawn('unzip', ['-p', zip, member], { stdio: ['ignore', 'pipe', 'ignore'] });
  const exited = new Promise((resolve, reject) => {
    unzip.on('error', reject);
    unzip.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Could not read ${member}`)));
  });
  unzip.stdout.setEncoding('latin1');
  yield* streamLines(unzip.stdout);
  await exited;
}
const cut = (line, [start, end]) => line.slice(start, end).trim();
const count = (text, most) => {
  const value = positive(text);
  return value && value <= most && Number.isInteger(value) ? value : null;
};

async function fillHouseAreas(zip, records, parcels, singleHouse, singleDwellingParcels) {
  const areas = new Map();
  for await (const line of lines(zip)) {
    const parcel = parcels.get(cut(line, ERA.key));
    if (!singleHouse.get(parcel) || !singleDwellingParcels.has(parcel)) continue;
    // An off-layout row cannot establish its status. A second current row cannot identify one area.
    if (line.length !== ERA.length) {
      areas.set(parcel, null);
      continue;
    }
    if (cut(line, ERA.status) !== 'A') continue;
    const living = count(cut(line, ERA.living), 29999);
    const situs = word(cut(line, ERA.situs))?.toUpperCase();
    const eligible = !areas.has(parcel) && living && situs && cut(line, ERA.dorCode) === '01' && !cut(line, ERA.secondary);
    areas.set(parcel, eligible ? { living, situs, zip: cut(line, ERA.zip) } : null);
  }

  let added = 0;
  for (const { kind, home_type, restricted, address, facts } of records) {
    if (kind !== 'property' || home_type !== 'house' || restricted || !address?.zip || address.unit || address.building || !facts || facts.living_sqft !== undefined) continue;
    const area = areas.get(facts.parcel_number);
    if (!area || facts.address_on_record?.toUpperCase() !== area.situs || address.zip !== area.zip) continue;
    facts.living_sqft = area.living;
    added += 1;
  }
  return added;
}

async function* build({ work, today }) {
  const zips = Object.fromEntries(Object.keys(FILES).map((name) => [name, path.join(work, 'fl-hernando', `${name}.zip`)]));
  for (const [name, url] of Object.entries(FILES)) download(url, zips[name]);
  const parcels = new Map();
  for await (const line of lines(zips.parcels)) {
    if (line.length !== PARCEL.length) continue;
    const number_ = cut(line, PARCEL.number);
    if (number_) parcels.set(cut(line, PARCEL.key), number_);
  }
  const dwellings = new Map();
  const singleHouse = new Map();
  let homes = 0;
  let unread = 0;
  for await (const line of lines(zips.structures)) {
    const parcel = parcels.get(cut(line, STRUCTURE.key));
    if (parcel) {
      // ERA is parcel-level. Require exactly one structure, a primary single-family house.
      // An extra or unreadable structure also makes this parcel ineligible for living area.
      const primaryHouse = line.length === STRUCTURE.length && cut(line, STRUCTURE.type) === '01' && cut(line, STRUCTURE.primary) === 'Y';
      singleHouse.set(parcel, !singleHouse.has(parcel) && primaryHouse);
    }
    // A widened character shifts later fields. Such a row disqualifies the parcel's area and supplies no building facts.
    if (line.length !== STRUCTURE.length) {
      unread += 1;
      continue;
    }
    if (!DWELLING.has(cut(line, STRUCTURE.type))) continue;
    if (!parcel) continue;
    homes += 1;
    const stories = number(cut(line, STRUCTURE.stories));
    const facts = {
      bedrooms: count(cut(line, STRUCTURE.bedrooms), 15),
      bathrooms: count(cut(line, STRUCTURE.bathrooms), 12),
      stories: stories >= 1 && stories <= 6 ? stories : null,
    };
    if (!dwellings.has(parcel)) dwellings.set(parcel, []);
    dwellings.get(parcel).push(facts);
  }
  log(`${COUNTY}: ${homes} dwellings on ${dwellings.size} parcels in the Property Appraiser's structures file (${unread} lines off the layout left unread)`);
  const singleDwellingParcels = new Set();
  const roll = await countyRoll(work, FIPS, today, singleDwellingParcels);
  const counts = fillHomes(roll.records, dwellings);
  log(describe(COUNTY, counts));
  const areasAdded = await fillHouseAreas(zips.era, roll.records, parcels, singleHouse, singleDwellingParcels);
  log(`${COUNTY}: ${areasAdded} houses gained ERA living area`);
  yield {
    ...roll,
    name: COUNTY,
    publisher: 'Florida Department of Revenue and the Hernando County Property Appraiser',
    dataset: `${roll.dataset}, ${monthOf([...zipDates(zips.structures).values()][0])} CAMA data and ${monthOf([...zipDates(zips.era).values()][0])} ERA file`,
    method: 'county',
    source: 'fl-hernando',
    title: 'County records',
  };
}

module.exports = {
  build,
  dictionary: {
    page: PAGE,
    facts: {
      bedrooms: 'STRU Number of Bedrooms',
      bathrooms: 'STRU Number of Bathrooms (whole baths as the county counts them)',
      stories: 'STRU Stories',
      living_sqft: 'ERA field 199, Square Footage of Living Area',
    },
  },
};
