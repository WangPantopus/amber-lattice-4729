'use strict';
// Caldwell County, Texas: the Caldwell Central Appraisal District's certified export (PACS layout), on its Publicly Available Data page,
// offered with no limit stated. Its Plumbing attribute is a bath count (1, 1.5, 2, 2.5 ...). Bedrooms and baths are on about 70% of its
// houses, so the county stays short of the go-live bar until the district fills them.

const { pacsCounty } = require('../lib/pacs-county.cjs');

module.exports = pacsCounty({
  fips: '48055',
  county: 'Caldwell County',
  publisher: 'Caldwell Central Appraisal District',
  source: 'tx-caldwell',
  page: 'https://caldwellcad.org/publicly-available-data/',
  pattern: String.raw`href="([^"]*Certified-Export[^"]*\.zip)"`,
  bedrooms: ['Number of Bedrooms'],
  baths: ['Plumbing'],
  // The district's state code list: A9 and E1 are non-residential improvements, M2 and M3 aircraft and vehicles, O inventory lots.
  uses: { A9: 'other', E1: 'other', M2: 'other', M3: 'other', O: 'parcel' },
});
