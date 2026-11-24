'use strict';

/**
 * City pages (/property-records/<state>/<county>/<city>): a city inside a county that has a page, with the city's own
 * offices read by hand on the city's own site (data/cities.json) and the Census's figures for the city. A city page
 * holds only what is the city's. The county's offices, hazards and records stay on the county page, which the city
 * page links back to once. No Pantopus count below the county, ever.
 *
 * Released by CITIES below, a reviewed list like the counties' COUNTIES. A listed city without its building permits
 * and zoning rows, or whose county has no page, has no page.
 */

const data = require('./data/cities.json');
const places = require('./places');
const { dateWords, host } = require('./offices');

// Released cities, by Census place GEOID, in the order they went out.
const CITIES = [
  // November 23, 2026, first: Vancouver, Seattle and Tacoma, WA; Portland, OR; Tampa, FL; Dallas, TX; Saint Paul, MN;
  // Riverside, CA.
  '5374060', '5363000', '5370000', '4159000', '1271000', '4819000', '2758000', '0662000',
  // November 23, 2026, second: Stockton and Santa Rosa, CA; Gainesville and Kissimmee, FL; Boulder, CO; Fayetteville,
  // NC; Reading, PA; Bellevue, WA; Canton, OH; Gresham, OR.
  '0675000', '0670098', '1225175', '1236950', '0807850', '3722920', '4263624', '5305210', '3912000', '4131250',
  // November 24, 2026, third: Los Angeles, CA; Chicago, IL; Miami, FL; Las Vegas and Henderson, NV; Columbus, OH;
  // Pittsburgh, PA; Madison, WI; Oklahoma City, OK; Kansas City, MO.
  '0644000', '1714000', '1245000', '3240000', '3231900', '3918000', '4261000', '5548000', '4055000', '2938000',
  // November 24, 2026, fourth: Long Beach and Moreno Valley, CA; Garland and Sugar Land, TX; Sarasota, FL.
  '0643000', '0649270', '4829000', '4870808', '1264175',
  // November 24, 2026, fifth: Denton, TX; North Las Vegas, NV; Edmond, OK.
  '4819972', '3251800', '4023200',
  // November 24, 2026, sixth: Kirkland, Redmond, Federal Way and Auburn, WA (King County); Lakewood, WA; Lewisville and
  // Flower Mound, TX; Independence and Lee's Summit, MO; Evanston, IL.
  '5335940', '5357535', '5323515', '5303180', '5338038', '4842508', '4826232', '2935000', '2941348', '1724582',
  // November 24, 2026, seventh: San Bernardino, Fontana, Rancho Cucamonga and Ontario (San Bernardino County); Temecula
  // and Murrieta (Riverside County); Tracy, Manteca and Lodi (San Joaquin County); Petaluma (Sonoma County), CA.
  '0665000', '0624680', '0659451', '0653896', '0678120', '0650076', '0680238', '0645484', '0642202', '0656784',
  // November 24, 2026, eighth: Pasadena, Torrance and Pomona (Los Angeles County), Vallejo, Fairfield and Vacaville
  // (Solano County), CA; Mesquite and Baytown, TX.
  '0656000', '0680000', '0658072', '0681666', '0623182', '0681554', '4847892', '4806128',
  // November 24, 2026, ninth: Hialeah and Miami Beach (Miami-Dade County), Altamonte Springs and North Port, FL; Sun
  // Prairie and Fitchburg (Dane County), West Allis and Wauwatosa (Milwaukee County), WI.
  '1230000', '1245025', '1200950', '1249675', '5578600', '5525950', '5585300', '5584675',
  // November 24, 2026, tenth: Thornton and Longmont, CO; Missouri City, TX.
  '0877290', '0845970', '4848804',
  // November 24, 2026, eleventh: Palmdale and Lancaster (Los Angeles County), Corona (Riverside County) and Chino (San
  // Bernardino County), CA.
  '0655156', '0640130', '0616350', '0613210',
  // November 24, 2026, twelfth: Upper Arlington, Grove City and Gahanna (Franklin County), OH; Skokie (Cook County), IL.
  '3979002', '3932592', '3929106', '1770122',
  // November 24, 2026, thirteenth: Inglewood and Downey (Los Angeles County), Victorville (San Bernardino County) and
  // Palm Desert (Riverside County), CA; Miami Gardens (Miami-Dade County), FL.
  '0636546', '0619766', '0682590', '0655184', '1245060',
  // November 24, 2026, fourteenth: West Covina, Alhambra, Redondo Beach and El Monte (Los Angeles County), Hesperia (San
  // Bernardino County), CA; Arlington Heights (Cook County), IL.
  '0684200', '0600884', '0660018', '0622230', '0633434', '1702154',
  // November 24, 2026, fifteenth: Santa Clarita (Los Angeles County), Jurupa Valley (Riverside County) and Rialto (San
  // Bernardino County), CA.
  '0669088', '0637692', '0660466',
  // November 24, 2026, sixteenth: Midwest City (Oklahoma County), OK; Aventura (Miami-Dade County), FL; Redlands (San
  // Bernardino County), CA.
  '4048350', '1202681', '0659962',
  // November 24, 2026, seventeenth: Homestead and Doral (Miami-Dade County), FL; Chino Hills (San Bernardino County),
  // CA; Palatine (Cook County), IL.
  '1232275', '1217935', '0613214', '1757225',
  // November 24, 2026, eighteenth: Des Plaines (Cook County), IL; Sanford (Seminole County), FL.
  '1719642', '1263650',
];

// The two rows a city needs, read on its own site, before it has a page.
const REQUIRED = ['permits', 'zoning'];

const released = new Set(CITIES);
const httpsOnly = (url) => typeof url === 'string' && /^https:\/\//.test(url) && !url.includes('{');

function rowsOf(entry) {
  const read = dateWords(entry.read);
  return (Array.isArray(entry.rows) ? entry.rows : [])
    .filter((row) => row && row.id && row.title && row.office && httpsOnly(row.url))
    .map((row) => ({
      id: row.id,
      title: row.title,
      office: row.office,
      url: row.url,
      host: host(row.url),
      ...(row.line ? { line: row.line } : {}),
      ...(row.q && row.a ? { q: row.q, a: row.a } : {}),
      from: read ? `Read on the city's own site, ${read}.` : null,
    }));
}

const median = (n) => (Number.isFinite(n) && n > 0 ? n : null);
// 'below' or 'above' where the median falls in the survey's open-ended lowest or highest interval (build-data.cjs).
const openSide = (side) => (side === 'below' || side === 'above' ? side : null);

// Every city in the file, by GEOID, under the county its page sits in.
const byGeoid = new Map();
const byCounty = new Map();
for (const [geoid, entry] of Object.entries(data.cities || {})) {
  const county = places.countyByFips(entry?.county);
  if (!/^\d{7}$/.test(geoid) || !county || geoid.slice(0, 2) !== county.state.fips || typeof entry.name !== 'string') continue;
  const city = {
    geoid,
    name: entry.name,
    slug: places.slugify(entry.name),
    county,
    otherCounties: entry.other_counties === true,
    rows: rowsOf(entry),
    built: median(entry.built),
    builtOpen: openSide(entry.built_open),
    value: median(entry.value),
    valueOpen: openSide(entry.value_open),
  };
  if (!byCounty.has(county.fips)) byCounty.set(county.fips, new Map());
  const inCounty = byCounty.get(county.fips);
  if (inCounty.has(city.slug)) throw new Error(`Two city pages share ${county.state.slug}/${county.slug}/${city.slug}`);
  inCounty.set(city.slug, city);
  byGeoid.set(geoid, city);
}

/** Whether a city is listed for release and holds both rows it needs (its county's page is the caller's to check). */
const ready = (city) => Boolean(city) && released.has(city.geoid)
  && REQUIRED.every((id) => city.rows.some((row) => row.id === id));

/** The released cities of a county, by name. */
const citiesOf = (county) => [...(byCounty.get(county?.fips)?.values() || [])].filter(ready)
  .sort((a, b) => a.name.localeCompare(b.name, 'en'));

/** A released city by its county and slug, or null. */
function city(county, slug) {
  const found = byCounty.get(county?.fips)?.get(String(slug || '').toLowerCase());
  return ready(found) ? found : null;
}

/** A released city by GEOID, or null. */
const cityByGeoid = (geoid) => (ready(byGeoid.get(geoid)) ? byGeoid.get(geoid) : null);

/** The Census's medians for a city, from the survey data/cities.json names, or null. */
function homesOf(city) {
  if (!city.built && !city.value) return null;
  return {
    median_year_built: city.built,
    median_year_built_open: city.built ? city.builtOpen : null,
    median_value: city.value,
    median_value_open: city.value ? city.valueOpen : null,
    survey: data.sources?.homes_survey || null,
    source: 'U.S. Census Bureau, American Community Survey 5-year estimates',
    url: 'https://data.census.gov/',
  };
}

module.exports = { citiesOf, city, cityByGeoid, homesOf, CITIES };
