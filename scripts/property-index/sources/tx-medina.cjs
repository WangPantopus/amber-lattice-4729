'use strict';
// Medina County, Texas: the Medina Central Appraisal District's certified roll (PACS layout), on its Certified Rolls page, offered with no
// limit stated. Its Plumbing attribute is a bath count (1, 1.5, 2, 2.5 ...). Bedrooms are on about a fifth of its homes, so the county
// stays short of the go-live bar until the district adds them.

const { pacsCounty } = require('../lib/pacs-county.cjs');

module.exports = pacsCounty({
  fips: '48325',
  county: 'Medina County',
  publisher: 'Medina Central Appraisal District',
  source: 'tx-medina',
  page: 'https://medinacad.org/certified-rolls/',
  pattern: String.raw`href="([^"]*\d{4}-CERTIFIED[^"]*\.zip)"`,
  bedrooms: ['Number of Bedrooms'],
  baths: ['Plumbing'],
  // The district's state code list: A3 is "Miscellaneous", E3 improvements on land not qualified for open-space appraisal.
  uses: { A3: 'other', M3: 'mobile_home' },
  kinds: [[/^1 1\/2 STORY/, 'floor1.5']],
});
