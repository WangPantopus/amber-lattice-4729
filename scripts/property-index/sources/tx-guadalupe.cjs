'use strict';
// Guadalupe County, Texas: the Guadalupe Appraisal District's certified appraisal roll as of its newest supplement (PACS layout 8.0.34), on
// its Certified Appraisal Roll page, offered with no limit stated. Its Plumbing attribute holds either the water and sewer source or a bath
// count ("2.5 BATH"): only the bath count is read. Bedrooms are on about half its homes, so the county stays short of the go-live bar.

const { pacsCounty } = require('../lib/pacs-county.cjs');

module.exports = pacsCounty({
  fips: '48187',
  county: 'Guadalupe County',
  publisher: 'Guadalupe Appraisal District',
  source: 'tx-guadalupe',
  page: 'https://guadalupead.org/certified-appraisal-roll/',
  pattern: String.raw`href="([^"]*-CERTIFIED-APPRAISAL-ROLL-SUPPLEMENT-\d+\.zip)"`,
  bedrooms: ['Number of Bedrooms'],
  baths: ['Plumbing'],
  accept: (name, value) => name !== 'Plumbing' || /^\d+(\.\d+)? BATHS?$/.test(value),
  // The district's state code list: A3 is a non-residential improvement, A4 and E4 residential leaseholds, A6 and E6 land with its owner's
  // mobile home, A7 and E7 land under someone else's mobile home, E5 rural land.
  uses: { A3: 'other', A4: 'house', E4: 'house', A6: 'mobile_home', E6: 'mobile_home', A7: 'parcel', E7: 'parcel', E5: 'parcel', O2: 'other' },
  kinds: [[/^MAIN FLOOR RESIDENTIAL/, 'floor1'], [/^MANUFACTURED HOUSE/, 'floor1']],
});
