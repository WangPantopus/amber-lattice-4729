'use strict';
// Bandera County, Texas: the Bandera Central Appraisal District's certified roll (PACS layout), on its Downloads page, whose disclaimer
// leaves the use of the files to the people who download them. Bedrooms and baths are on only a handful of its homes, so the county stays
// short of the go-live bar until the district adds them.

const { pacsCounty } = require('../lib/pacs-county.cjs');

module.exports = pacsCounty({
  fips: '48019',
  county: 'Bandera County',
  publisher: 'Bandera Central Appraisal District',
  source: 'tx-bandera',
  page: 'https://bancad.org/downloads-data-download-disclaimer/',
  pattern: String.raw`href="([^"]*\d{4}-CERTIFIED-ROLL[^"]*\.zip)"`,
  bedrooms: ['Number of Bedrooms'],
  baths: ['Number of Bathrooms'],
  // The district's state code list: E1 is rural land not qualified for open-space appraisal, E2 a house and E3 a mobile home on such land,
  // A3 a house without its land, A4 and E4 outbuildings, A5 a lot with only a well or septic.
  uses: { E1: 'parcel', E2: 'house', E3: 'mobile_home', A3: 'house', A4: 'other', E4: 'other', A5: 'parcel' },
});
