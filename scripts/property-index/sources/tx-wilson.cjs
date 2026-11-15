'use strict';
// Wilson County, Texas: the Wilson Central Appraisal District's appraisal roll (PACS layout), on its Reports page, offered with no limit
// stated. Its Plumbing attribute is a bath count (1, 1.5, "2 1/2" ...), kept on about a third of its homes; bedrooms on about one in
// twenty, so the county stays short of the go-live bar until the district adds them.

const { pacsCounty } = require('../lib/pacs-county.cjs');

module.exports = pacsCounty({
  fips: '48493',
  county: 'Wilson County',
  publisher: 'Wilson Central Appraisal District',
  source: 'tx-wilson',
  page: 'https://wilson-cad.org/reports/',
  pattern: String.raw`href="([^"]*\d{4}-[^"/]*(?:APPRAISAL|CERTIFIED)-ROLL[^"]*\.zip)"`,
  bedrooms: ['Number of Bedrooms'],
  baths: ['Plumbing'],
  // The district's state code list: A3 is a house without its land, A4 a travel trailer used as a home, A5 a non-residential improvement.
  uses: { A: 'house', A3: 'house', A4: 'other', A5: 'other', C1I: 'parcel', F1I: 'other' },
  kinds: [[/^SWIM POOL/, 'pool']],
});
