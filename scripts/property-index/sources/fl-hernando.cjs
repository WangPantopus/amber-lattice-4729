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
const { number, positive } = require('../lib/values.cjs');
const { fillHomes, describe, monthOf } = require('../lib/fill.cjs');
const { log } = require('../lib/log.cjs');
const { countyRoll } = require('./fl-roll.cjs');
const { parse } = require('../../../backend/services/propertyRecords/addressKey');

const FIPS = '12053';
const COUNTY = 'Hernando County';
const SITE = 'https://hernandocountypa-florida.us';
const PAGE = `${SITE}/Downloads`;
const FILES = {
  parcels: `${SITE}/download/PAPAR.ZIP`,
  structures: `${SITE}/download/STRU.ZIP`,
  era: `${SITE}/download/ERAFILE-FULL.ZIP`,
  locations: `${SITE}/download/LOCA.ZIP`,
};
// The record layouts ("CCDS - PAPAR File Record Layout", "CCDS - STRU File Record Layout"): [start, end) of each field read.
const PARCEL = { length: 1339, key: [9, 17], number: [25, 50] };
const STRUCTURE = { length: 695, key: [0, 8], type: [8, 10], bedrooms: [661, 663], bathrooms: [663, 665], primary: [675, 676], stories: [690, 693] };
// ERA File Record Layout. Field 199 is the parcel's living area; field 119 is the separate under-roof area.
const ERA = { length: 1184, key: [0, 8], number: [9, 29], secondary: [74, 83], situs: [84, 134], zip: [167, 172], dorCode: [431, 433], status: [883, 884], living: [1015, 1023] };
// Structure types that are one home: a single family residence, a manufactured home, a villa, a condominium unit.
const DWELLING = new Set(['01', '02', '13', '15']);
// County structure dictionary: single-family, villa, flat-value single-family, historical single-family, modular single-family.
const HOUSE = new Set(['01', '15', 'FS', 'H1', 'MD']);
// Detached garage, general-purpose barn, barn/shed, stable, utility barn and equipment structure.
const ACCESSORY = new Set(['DG', 'BN', '48', 'SB', 'UB', '50']);

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

function isSimpleAccessory(line, type) {
  if (!ACCESSORY.has(type) || !['', 'N'].includes(cut(line, STRUCTURE.primary))) return false;
  if (![STRUCTURE.bedrooms, STRUCTURE.bathrooms].every((field) => /^0*$/.test(cut(line, field)))) return false;
  // Each structure has twelve 30-character area descriptions. An apartment, finished upper story or
  // any other additional area within the accessory leaves the parcel unresolved.
  for (let start = 59; start < 419; start += 30) {
    const description = line.slice(start, start + 30).trim();
    if (description && description !== 'BASE') return false;
  }
  return true;
}

function streetKey(address) {
  if (!address || address.form !== 'street' || address.unit || address.building || address.urbanization) return null;
  return JSON.stringify([address.number, address.pre, address.name, address.suffix, address.post]);
}

async function readSites(zip, parcels) {
  const sites = new Map();
  for await (const line of lines(zip)) {
    const parcel = parcels.get(line.slice(0, 8).trim());
    if (!parcel) continue;
    // LOCA's address number is a six-byte numeric field. Either secondary locator field disqualifies the site.
    const number = line.slice(8, 14).trim();
    let site = null;
    if (line.length === 55 && /^\d+$/.test(number) && Number(number) > 0 && !line.slice(47, 55).trim()) {
      const street = [Number(number), line.slice(14, 16), line.slice(16, 41), line.slice(41, 45), line.slice(45, 47)].join(' ');
      site = streetKey(parse(street));
    }
    sites.set(parcel, !sites.has(parcel) || sites.get(parcel) === site ? site : null);
  }
  return sites;
}

async function fillHouseAreas(zip, records, parcels, structures, singleUnitHouses, sites) {
  const areas = new Map();
  for await (const line of lines(zip)) {
    const parcel = parcels.get(cut(line, ERA.key));
    const buildings = structures.get(parcel);
    if (!singleUnitHouses.has(parcel) || buildings?.houses !== 1 || buildings.accessories + 1 !== buildings.total) continue;
    // An off-layout row cannot establish its status. A second current row cannot identify one area.
    if (line.length !== ERA.length) {
      areas.set(parcel, null);
      continue;
    }
    if (cut(line, ERA.status) !== 'A') continue;
    const squareFeet = cut(line, ERA.living);
    const living = /^\d+$/.test(squareFeet) && count(squareFeet, 29999);
    const situs = streetKey(parse(cut(line, ERA.situs)));
    const eligible = !areas.has(parcel) && living && situs && sites.get(parcel) === situs && cut(line, ERA.number) && cut(line, ERA.dorCode) === '01' && !cut(line, ERA.secondary);
    areas.set(parcel, eligible ? { living, situs, zip: cut(line, ERA.zip) } : null);
  }

  let added = 0;
  for (const { kind, home_type, restricted, address, facts } of records) {
    if (kind !== 'property' || home_type !== 'house' || restricted || !address?.zip || address.unit || address.building || !facts || facts.living_sqft !== undefined) continue;
    const area = areas.get(facts.parcel_number);
    if (!area || streetKey(address) !== area.situs || address.zip !== area.zip) continue;
    // The state may count only the house or count the same set of structures. Hold any unexplained building count.
    if (facts.buildings_on_parcel !== 1 && facts.buildings_on_parcel !== structures.get(facts.parcel_number).total) continue;
    facts.living_sqft = area.living;
    added += 1;
  }
  return added;
}

async function* build({ work, today }) {
  const zips = Object.fromEntries(Object.keys(FILES).map((name) => [name, path.join(work, 'fl-hernando', `${name}.zip`)]));
  for (const [name, url] of Object.entries(FILES)) download(url, zips[name]);
  const parcels = new Map();
  const seenParcels = new Set();
  const ambiguousParcels = new Set();
  const unreadableKeys = new Set();
  for await (const line of lines(zips.parcels)) {
    const key = cut(line, PARCEL.key);
    if (line.length !== PARCEL.length) {
      unreadableKeys.add(key);
      continue;
    }
    const number_ = cut(line, PARCEL.number);
    if (parcels.has(key)) {
      ambiguousParcels.add(parcels.get(key));
      ambiguousParcels.add(number_);
    }
    if (!key || !number_) continue;
    if (seenParcels.has(number_)) ambiguousParcels.add(number_);
    seenParcels.add(number_);
    parcels.set(key, number_);
  }
  const dwellings = new Map();
  const structures = new Map();
  let homes = 0;
  let unread = 0;
  for await (const line of lines(zips.structures)) {
    const parcel = parcels.get(cut(line, STRUCTURE.key));
    if (parcel) {
      const counts = structures.get(parcel) || { total: 0, houses: 0, accessories: 0 };
      counts.total += 1;
      if (line.length === STRUCTURE.length) {
        const type = cut(line, STRUCTURE.type);
        if (HOUSE.has(type) && cut(line, STRUCTURE.primary) === 'Y') counts.houses += 1;
        else if (isSimpleAccessory(line, type)) counts.accessories += 1;
      }
      structures.set(parcel, counts);
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
  const singleUnitHouses = new Set();
  const roll = await countyRoll(work, FIPS, today, singleUnitHouses);
  for (const key of unreadableKeys) singleUnitHouses.delete(parcels.get(key));
  for (const parcel of ambiguousParcels) singleUnitHouses.delete(parcel);
  const counts = fillHomes(roll.records, dwellings);
  log(describe(COUNTY, counts));
  const sites = await readSites(zips.locations, parcels);
  const areasAdded = await fillHouseAreas(zips.era, roll.records, parcels, structures, singleUnitHouses, sites);
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
