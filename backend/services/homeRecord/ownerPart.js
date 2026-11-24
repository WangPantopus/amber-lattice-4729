'use strict';

/**
 * The parts of a home's record that open for its confirmed owner (~/pantopus-home-record/design/Owner.dc.html), from what
 * Pantopus already holds for the Home: its copy of the county record (propertyRecords/homeRecord.js), the estimate and
 * similar homes read from it, the systems ledger and the exemption check. Callers check that the viewer is the
 * confirmed owner before any of this is read.
 */

const homeValueCard = require('../homeValueCard');
const homeSystemsService = require('../homeSystemsService');
const exemptionCheckService = require('../exemptionCheckService');
const similarHomes = require('../propertyRecords/similarHomes');
const { coversMoreThanHome, COVERS_MORE_NOTE } = require('../propertyRecords/salePrice');
const { stateCode } = require('../propertyRecords/addressKey');
const { SALE_PRICES_NOT_PUBLIC } = require('../../data/valuePractice');
const logger = require('../../utils/logger');
const recordingAlerts = require('./recordingAlerts');
const { groundBlock } = require('./ground');
const zoningLinks = require('./zoningLinks');
const protect = require('./protect');
const placeIntelligenceService = require('../placeIntelligenceService');
const { recordSource } = require('./openPart');
const { positive, grouped, money, dateLabel } = require('./words');

const LOWEST_SALE_PRICE = 1000;

/** Each [year, amount] on record, the current year's included, oldest first. */
function byYear(current, history) {
  const years = new Map();
  for (const entry of Array.isArray(history) ? history : []) {
    if (Array.isArray(entry) && Number.isInteger(entry[0]) && positive(entry[1])) years.set(entry[0], entry[1]);
  }
  if (Number.isInteger(current.year) && positive(current.amount)) years.set(current.year, current.amount);
  return [...years].sort((a, b) => a[0] - b[0]);
}

// Where the estimate sits on its track: its range in the middle 40%, so the low and high ends read as a band.
function estimatePart(estimate) {
  if (!estimate || !positive(estimate.value) || !(estimate.high > estimate.low)) return null;
  const span = estimate.high - estimate.low;
  const start = estimate.low - span * 0.75;
  const width = span * 2.5;
  const at = (amount) => Math.round(Math.max(0, Math.min(1, (amount - start) / width)) * 100) / 100;
  return {
    label: estimate.level === 1 ? 'Pantopus estimate' : 'Rough Pantopus estimate',
    text: `${money(estimate.low)} to ${money(estimate.high)}`,
    low: at(estimate.low),
    high: at(estimate.high),
    mark: at(estimate.value),
    note: homeValueCard.estimateNote(estimate),
  };
}

/** The `value` block: the county's market value by year, and the estimate beside it. Null without a market value. */
function valueBlock(copy, estimate) {
  const { facts } = copy;
  if (!positive(facts.market_value)) return null;
  const years = byYear({ year: facts.value_year, amount: facts.market_value }, facts.value_history);
  const latest = years[years.length - 1];
  const before = years.length > 1 ? years[years.length - 2] : null;
  let chip = null;
  if (before && latest && latest[1] !== before[1]) {
    const change = latest[1] - before[1];
    chip = { tone: 'neutral', text: `${money(Math.abs(change))} ${change > 0 ? 'more' : 'less'} than ${before[0]}` };
  }
  return {
    kind: 'value',
    id: 'county_value',
    label: Number.isInteger(facts.value_year) ? `County market value, ${facts.value_year}` : 'County market value',
    value: money(facts.market_value),
    chip,
    bars: years.length > 1 ? years.map(([year, amount]) => ({ year: `'${String(year).slice(2)}`, amount: Math.round(amount) })) : [],
    source: recordSource(copy),
    estimate: estimatePart(estimate),
  };
}

/** With no market value, the value card Place draws (homeValueCard.js), as a `card`. */
function valueCardBlock(copy, estimate, similar, state) {
  const built = homeValueCard.build({
    source: 'record',
    county_values: copy.facts,
    area: { state },
    estimate,
    similar_homes: similar,
    value_match: copy.match,
    value_card_source: recordSource(copy),
  });
  if (!built || !built.value) return null;
  return {
    kind: 'card', id: 'county_value', title: built.title, chip: null, lead: built.value,
    rows: built.rows, notes: built.notes, source: built.source, action: null,
  };
}

function lastSaleBlock(copy, state) {
  const { facts } = copy;
  const many = coversMoreThanHome(facts);
  const price = positive(facts.sale_price) >= LOWEST_SALE_PRICE && !many ? money(facts.sale_price) : null;
  const when = dateLabel(facts.sale_date) || (typeof facts.sale_month === 'string' ? facts.sale_month : null);
  if (!price && !when) return null;
  const notPublic = !price && !many ? SALE_PRICES_NOT_PUBLIC[state] : null;
  return {
    kind: 'rows',
    id: 'last_sale',
    title: 'Last sale',
    lead: null,
    rows: [
      price ? { label: 'Price', value: price, mono: false, chip: null } : null,
      when ? { label: price ? 'Date' : 'Date of the last transfer', value: when, mono: false, chip: null } : null,
      facts.sale_document ? { label: 'Document number', value: String(facts.sale_document), mono: true, chip: null } : null,
    ].filter(Boolean),
    note: many ? COVERS_MORE_NOTE : (notPublic ? `Sale prices aren't public in ${notPublic}.` : `From ${recordSource(copy)}.`),
    action: null,
  };
}

/**
 * The `timeline` block from the county's recorded lines (`recorded_history`, homerec-index; on a served copy only once its
 * county is on the switch file's new_columns list): newest first, the county's own word for each, no names. A price
 * shows on sales only; a deed covering several accounts says so, and the newest sale's price is left off where Last sale
 * leaves it off (salePrice.js).
 */
function historyBlock(copy) {
  const history = copy.facts.recorded_history;
  const lines = history && Array.isArray(history.lines) ? history.lines : [];
  if (!lines.length) return null;
  const newestSale = lines.find((line) => line && line.sale);
  const items = lines.filter((line) => line && dateLabel(line.date)).map((line) => {
    const hidePrice = line === newestSale && coversMoreThanHome(copy.facts);
    const price = line.sale && !hidePrice && positive(line.price) >= LOWEST_SALE_PRICE ? money(line.price) : null;
    const parcels = positive(line.parcels) > 1 ? Math.round(line.parcels) : null;
    return {
      title: typeof line.word === 'string' && line.word.trim() ? line.word.trim() : 'Sale',
      right: price ? (parcels ? `${price} for ${parcels} parcels` : price) : null,
      strong: Boolean(line.sale),
      line: dateLabel(line.date),
      mono: line.document ? `Doc ${line.document}` : null,
    };
  });
  if (!items.length) return null;
  const since = /^\d{4}$/.test(String(history.since || '')) ? history.since : null;
  return {
    kind: 'timeline',
    id: 'recorded_history',
    title: 'Recorded history',
    items,
    note: `${since ? `The county's lines for this home since ${since}, when its table begins.` : 'The county\'s lines for this home.'} No names are shown. From ${recordSource(copy)}.`,
  };
}

function taxBlock(copy) {
  const { facts } = copy;
  const years = byYear({ year: facts.tax_year, amount: facts.tax_amount }, facts.tax_history).reverse();
  if (!years.length) return null;
  return {
    kind: 'rows',
    id: 'property_tax',
    title: 'Property tax, year by year',
    lead: null,
    rows: years.map(([year, amount]) => ({ label: String(year), value: money(amount), mono: false, chip: null })),
    note: `From ${recordSource(copy)}.`,
    action: null,
  };
}

function similarBlock(copy, similar) {
  if (!similar) return null;
  const found = similarHomes.card(similar);
  return { ...found, kind: 'card', id: 'similar_homes', title: 'Similar homes on this street', source: recordSource(copy), action: null };
}

const SYSTEMS_SHOWN = ['roof', 'hvac', 'water_heater', 'electrical_panel'];
const SYSTEM_TITLES = { hvac: 'Heating' };
const SYSTEM_TONES = { ok: 'low', aging: 'mid', past_expected: 'high' };

/** The `bars` block from the systems ledger: each system's age against its typical service life. */
async function systemsBlock(row, copy) {
  const yearBuilt = positive(copy?.facts?.year_built) || positive(row.year_built);
  const ledger = await homeSystemsService.getSystemsLedger({ id: row.id, year_built: yearBuilt });
  const items = (ledger?.systems || []).filter((system) => SYSTEMS_SHOWN.includes(system.key) && system.age_years != null).map((system) => {
    const estimated = system.source === 'estimated';
    const years = `${system.age_years} ${system.age_years === 1 ? 'year' : 'years'} old`;
    return {
      title: SYSTEM_TITLES[system.key] || system.label,
      right: estimated ? `About ${years}` : years,
      tone: SYSTEM_TONES[system.status] || 'low',
      fill: Math.round(Math.max(0, Math.min(1, system.age_years / system.typical_life_high)) * 100) / 100,
      line: `${system.source_label} · typical life ${system.typical_life_low} to ${system.typical_life_high} years`,
    };
  });
  if (!items.length) return null;
  return { kind: 'bars', id: 'systems', title: 'What that says about the house', items, note: 'Service life is the typical range, not a prediction.' };
}

function lotBlock(copy) {
  const { facts } = copy;
  const acres = positive(facts.lot_acres);
  const sqft = positive(facts.lot_sqft);
  // The district without the record's government mark ("R-6 : VAN" reads "R-6").
  const zoned = zoningLinks.zoningOf(copy);
  const zoning = zoned ? zoned.district : null;
  const size = [acres ? `${grouped(acres, 2)} ${acres === 1 ? 'acre' : 'acres'}` : null, sqft ? `${grouped(Math.round(sqft))} sq ft` : null].filter(Boolean).join(' · ');
  const rows = [
    size ? { label: 'Lot size', value: size, mono: false, chip: null } : null,
    zoning ? { label: 'Zoning', value: zoning, mono: true, chip: null } : null,
  ].filter(Boolean);
  if (!rows.length) return null;
  return {
    kind: 'rows', id: 'lot_zoning', title: 'Lot and zoning', lead: null, rows,
    note: `From ${recordSource(copy)}.${zoned?.name ? ` ${zoned.name} sets this zoning; what it allows is on its own page.` : ''}${zoned?.codeChanged ? ` ${zoned.name} replaced its zoning districts in 2026, so its page may name this one differently.` : ''}`,
    action: zoningLinks.actionFor(copy),
  };
}

/** The exemption check (exemptionCheckService.js) as a `card`; null when the county's record can't say. */
async function exemptionsBlock(row) {
  const check = await exemptionCheckService.getExemptionCheck(row);
  const data = check?.status === 'ready' ? check.data : null;
  if (!data || !['on_file', 'none_on_file'].includes(data.filing_status)) return null;
  const program = data.state_program || {};
  const action = program.source_url && /^https:\/\//.test(program.source_url)
    ? { label: `See ${program.source_name ? `${program.source_name}'s` : 'the state\'s'} page`, url: program.source_url }
    : null;
  if (data.filing_status === 'on_file') {
    return {
      kind: 'card', id: 'exemptions', title: 'Exemptions on file', chip: { tone: 'success', text: 'On file' },
      lead: 'The county\'s record shows this exemption on your home.',
      rows: data.exemptions.map((label, i) => ({ id: `exemption_${i + 1}`, label: String(label), value: 'On file' })),
      notes: [], source: check.provenance?.label || null, action,
    };
  }
  return {
    kind: 'card', id: 'exemptions', title: 'Exemptions on file', chip: { tone: 'warning', text: 'None appears on file' },
    // The state's own page says who may apply: the card says only what the record shows (rule 6, facts not advice).
    lead: `The county's record shows no property tax exemption on this home.${program.source_name ? ` The ${program.source_name}'s page says who can apply for one.` : ''}`,
    rows: [], notes: [], source: check.provenance?.label || null, action,
  };
}

const CFPB_PMI = 'https://www.consumerfinance.gov/ask-cfpb/when-can-i-remove-private-mortgage-insurance-pmi-from-my-loan-en-202/';

/**
 * The rule on private mortgage insurance, in the Consumer Financial Protection Bureau's terms (read November 23, 2026),
 * with the county's last sale price and the two marks figured from it. Facts and arithmetic, never a suggestion: it
 * doesn't know whether the owner has a loan, or whether the last sale was theirs, and says so.
 */
function mortgageInsuranceBlock(copy) {
  const facts = copy?.facts || {};
  const price = positive(facts.sale_price) >= LOWEST_SALE_PRICE && !coversMoreThanHome(facts) ? facts.sale_price : null;
  if (!price) return null;
  return {
    kind: 'card',
    id: 'mortgage_insurance',
    title: 'Mortgage insurance',
    chip: null,
    lead: 'On a conventional loan, the law lets you ask your servicer to cancel private mortgage insurance once the balance is scheduled to reach 80% of the home\'s original value, and it ends by itself at 78%. FHA and VA loans have their own rules.',
    rows: [
      { id: 'last_sale', label: 'Last sale price on the county\'s record', value: money(price) },
      { id: 'pmi_80', label: '80% of that price', value: money(price * 0.8) },
      { id: 'pmi_78', label: '78% of that price', value: money(price * 0.78) },
    ],
    notes: ['"Original value" generally means the price you paid or the appraisal when you bought, whichever is lower. The county\'s last sale may not be your purchase.'],
    source: 'Consumer Financial Protection Bureau',
    action: { label: 'Read the rule on the CFPB\'s page', url: CFPB_PMI },
  };
}

const settle = (label, read) => read.catch((err) => {
  logger.warn('homeRecord.owner_part_failed', { part: label, error: err.message });
  return null;
});

/**
 * The owner's blocks, in the drawn order, with the open facts and the area's meters (`open`) after the house's own parts.
 * `above`: the picture from above, where the drawn page has the lot through the years.
 * `extras`: the estimate and similar homes already read for this copy.
 */
async function ownerBlocks({ row, copy, extras, above = null, open }) {
  const state = stateCode(row.state);
  const [systems, exemptions, recalls] = await Promise.all([
    settle('systems', systemsBlock(row, copy)),
    copy ? settle('exemptions', exemptionsBlock(row)) : null,
    // The CPSC on the section budget, as every outside source here: past it the card waits for the next look.
    settle('recalls', placeIntelligenceService.withinBudget(protect.recallsCard(), placeIntelligenceService.sectionBudgetMs())),
  ]);
  const blocks = copy
    ? [
      valueBlock(copy, extras.estimate) || valueCardBlock(copy, extras.estimate, extras.similar, state),
      // Where the drawn page has the lot through the years: the newest picture until those land.
      above,
      // The recorded lines hold the last sale; without them, the last sale on its own.
      historyBlock(copy) || lastSaleBlock(copy, state),
      taxBlock(copy),
      similarBlock(copy, extras.similar),
      systems,
      groundBlock(extras.ground),
      recalls,
      lotBlock(copy),
    ]
    : [above, systems, groundBlock(extras.ground), recalls];
  const protecting = [protect.claimsCard(), copy ? recordingAlerts.card(copy.jurisdiction) : null, exemptions, mortgageInsuranceBlock(copy)].filter(Boolean);
  return [
    ...blocks,
    ...open,
    { kind: 'section_label', id: 'protect_label', text: 'Protect your home' },
    ...protecting,
  ].filter(Boolean);
}

/**
 * A buyer's systems block (SPEC section 8): ages from the year built only, never from what a household said. Permits
 * will date a system here too once they are held.
 */
function buyerSystemsBlock(copy) {
  const yearBuilt = positive(copy?.facts?.year_built);
  if (!yearBuilt) return null;
  const items = homeSystemsService.SYSTEM_DEFS.filter((def) => SYSTEMS_SHOWN.includes(def.key))
    .map((def) => homeSystemsService.projectSystem(def, null, yearBuilt))
    .filter((system) => system.age_years != null)
    .map((system) => ({
      title: SYSTEM_TITLES[system.key] || system.label,
      right: `About ${system.age_years} ${system.age_years === 1 ? 'year' : 'years'} old`,
      tone: SYSTEM_TONES[system.status] || 'low',
      fill: Math.round(Math.max(0, Math.min(1, system.age_years / system.typical_life_high)) * 100) / 100,
      line: `${system.source_label} \u00b7 typical life ${system.typical_life_low} to ${system.typical_life_high} years`,
    }));
  if (!items.length) return null;
  return {
    kind: 'bars', id: 'systems', title: 'What that says about the house', items,
    note: 'From year built only. An owner may know more. Service life is the typical range, not a prediction.',
  };
}

/**
 * A signed-in buyer's opened county blocks (SPEC section 8, the public half), in the drawn order. Only for a county on
 * `buyer_report`; the caller checks. Nothing the owner added: no exemptions, tax status, mortgage insurance or systems
 * the household dated.
 */
function buyerCountyBlocks({ copy, extras, state }) {
  if (!copy) return [];
  return [
    valueBlock(copy, extras.estimate) || valueCardBlock(copy, extras.estimate, extras.similar, state),
    historyBlock(copy) || lastSaleBlock(copy, state),
    taxBlock(copy),
    similarBlock(copy, extras.similar),
    buyerSystemsBlock(copy),
  ];
}

module.exports = { ownerBlocks, buyerCountyBlocks, lotBlock, valueBlock, estimatePart };
