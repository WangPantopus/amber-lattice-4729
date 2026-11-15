'use strict';
// Galveston County, Texas: the Galveston Central Appraisal District's certified roll export (PACS layout 8.0.34), on its Preliminary and
// Certified Roll Export page, offered with no limit stated. Its Plumbing attribute is a bath count (1, 1.5, 2, 2.5 ...). Bedrooms are on
// about 1% of its homes, so the county stays short of the go-live bar until the district adds them.

const { pacsCounty } = require('../lib/pacs-county.cjs');

module.exports = pacsCounty({
  fips: '48167',
  county: 'Galveston County',
  publisher: 'Galveston Central Appraisal District',
  source: 'tx-galveston',
  page: 'https://galvestoncad.org/preliminary-and-certified-roll-export-data/',
  pattern: String.raw`href="([^"]*(?:Cert[^"/]*Export|CERTIFIED[-_ ]ROLL)[^"]*\.zip)"`,
  bedrooms: ['Number of Bedrooms'],
  baths: ['Plumbing'],
  // The district's state code list: O1 is inventory land, O2 an inventory home; XE and E9 are exempt.
  uses: { O1: 'parcel', O2: 'house', XE: 'other', E9: 'other' },
  kinds: [[/^MAIN AREA 1\.5 FLOOR/, 'floor1.5']],
});
