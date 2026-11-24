// ============================================================
// The lookup's money card (LOOKUPORDER, founder 2026-11-24: "make the money
// related obvious somewhere front, like home values, taxes, and possibly make
// a curve or graph or chart over the years").
//
// Area figures only, every one already in hand on the lookup path:
//   value  the tract's median home value (Census ACS B25077_001E, the teaser's)
//   tax    the tract's median real estate taxes paid (ACS B25103_001E, the same call)
//   trend  FHFA's House Price Index for the county (and the ZIP's last year where
//          it has one), from the property index's per-state file, read through
//          propertyRecords/areaTrend.js with its own short wait (null, never late)
//
// Never this home's value or tax bill: those are the home's own record, for its
// confirmed owner (founder, 2026-11-22). The card points at the record instead.
// The curve is a price-change index, never turned into dollars.
//
// LOOKUP_MONEY=off leaves the card and the home-value dollar card out.
// ============================================================

const areaTrend = require('../propertyRecords/areaTrend');
const { stateCode } = require('../propertyRecords/addressKey');

const CENSUS_SOURCE = 'U.S. Census · American Community Survey';
const TREND_SOURCE = 'FHFA House Price Index';
const RECORD_LINE = 'This home\'s own county value and tax bill, year by year, are in its full record.';
const AREA_FOOT = 'Area figures, not this home.';

const enabled = () => String(process.env.LOOKUP_MONEY || '').trim().toLowerCase() !== 'off';

const dollars = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const positive = (n) => Number.isFinite(Number(n)) && Number(n) > 0;
const round1 = (n) => Math.round(n * 10) / 10;

/** The state's index file, or null (no index here, an unknown state, or not read in time). Never throws. */
function trendFile(state) {
  if (!enabled()) return Promise.resolve(null);
  const code = stateCode(state);
  if (!code) return Promise.resolve(null);
  return areaTrend.stateFile(code).catch(() => null);
}

/**
 * The county's curve and the last year's change (the ZIP's own where it has one).
 * @param {object|null} file  areaTrend's state file
 * @param {{ countyFips: string|null, zip: string|null, countyName: string|null }} area
 */
function trendFrom(file, { countyFips, zip, countyName }) {
  if (!file || !countyFips) return null;
  const years = Array.isArray(file.level_years) ? file.level_years : null;
  const levels = file.county_levels && file.county_levels[countyFips];
  if (!years || !Array.isArray(levels) || years.length < 2 || levels.length !== years.length) return null;
  if (!levels.every(positive) || !years.every((y) => Number.isInteger(y))) return null;
  const base = levels[0];
  const since = levels.map((level) => round1((level / base - 1) * 100));

  const zip5 = typeof zip === 'string' && /^\d{5}/.test(zip) ? zip.slice(0, 5) : null;
  const zipChange = zip5 && file.zips ? file.zips[zip5] : undefined;
  const countyChange = file.counties ? file.counties[countyFips] : undefined;
  let scope = null;
  let last = null;
  if (Number.isFinite(zipChange)) { scope = 'zip'; last = zipChange; }
  else if (Number.isFinite(countyChange)) { scope = 'county'; last = countyChange; }
  if (scope == null) return null;

  return {
    scope,
    // What `last_change_pct` is about: the ZIP, or the county the curve draws.
    area_name: scope === 'zip' ? `ZIP ${zip5}` : (countyName || 'the county'),
    county_name: countyName || null,
    year: Number.isInteger(file.year) ? file.year : years[years.length - 1],
    last_change_pct: round1(last),
    since_year: years[0],
    since_change_pct: since[since.length - 1],
    years: years.slice(),
    change_since_first_pct: since,
    source: TREND_SOURCE,
  };
}

/**
 * The `money` block, or null when nothing is held.
 * @param {{ area: object|null, file: object|null, countyFips: string|null, zip: string|null, countyName: string|null }} input
 */
function buildMoney({ area, file, countyFips, zip, countyName }) {
  if (!enabled()) return null;
  const value = area && positive(area.median_home_value)
    ? { amount: Math.round(area.median_home_value), label: 'Typical home value', scope: 'census tract', source: CENSUS_SOURCE }
    : null;
  const tax = area && positive(area.median_real_estate_taxes)
    ? { amount: Math.round(area.median_real_estate_taxes), label: 'Typical property tax a year', scope: 'census tract', source: CENSUS_SOURCE }
    : null;
  const trend = trendFrom(file, { countyFips, zip, countyName });
  if (!value && !tax && !trend) return null;
  return {
    ...(value ? { value } : {}),
    ...(trend ? { trend } : {}),
    ...(tax ? { tax } : {}),
    record_line: RECORD_LINE,
  };
}

function changeClause(trend) {
  const pct = `${Math.abs(trend.last_change_pct).toFixed(1)}%`;
  const verb = trend.last_change_pct > 0 ? `rose ${pct}` : trend.last_change_pct < 0 ? `fell ${pct}` : 'held steady';
  return `Prices across ${trend.area_name} ${verb} in ${trend.year}`;
}

/**
 * The dollar card the store apps already draw (`money_lead`), as owning money:
 * kind 'home_value' while the tract has a typical home value, else null.
 */
function homeValueLead(money) {
  if (!money || !money.value) return null;
  const amount = money.value.amount;
  const halves = [];
  if (money.trend) halves.push(changeClause(money.trend));
  // "about $4,350": the tax to the nearest ten dollars in words; the card's own figure stays exact.
  if (money.tax) halves.push(`owners here typically pay about ${dollars(Math.round(money.tax.amount / 10) * 10)} a year in property tax`);
  const sentence = halves.length ? `${halves.join(', and ')}.`.replace(/^./, (c) => c.toUpperCase()) : '';
  return {
    kind: 'home_value',
    headline: `Homes around here are typically valued near ${dollars(amount)}`,
    detail: `${sentence ? `${sentence} ` : ''}${AREA_FOOT}`,
    // Both phones type low/high as Int: whole dollars only.
    low: amount,
    high: amount,
    scope: 'census tract',
    source: ['U.S. Census', ...(money.trend ? ['FHFA'] : [])].join(' · '),
  };
}

module.exports = { enabled, trendFile, trendFrom, buildMoney, homeValueLead, RECORD_LINE };
