// ============================================================
// PLACE PREVIEW SERVICE — the anonymous T0 "taste", unlocked
//
// Composes the free Band-A section snapshot for a POINT (no home, no
// user) so the signed-out preview shows the same truths the claimed
// dashboard shows — as a one-shot snapshot. Everything here is public,
// location-keyed data (weather, air, alerts, FEMA, USGS, USFS, EPA,
// Census, HUD, civic districts); the only layer that stays behind a
// wall is Band B (ATTOM property facts), which is paid and exact.
//
// Why the snapshot leaks nothing: the recurring value of an account is
// *saving* the place and getting it *every morning* — not reading one
// number a weather app already gives away. (Wedge v2, D1.)
//
// Two rules the route relies on:
//   • Each section carries its own time budget (PLACE_PREVIEW_SECTION_
//     BUDGET_MS, default 3500). A slow provider degrades ONLY its own
//     section to a retryable `error`; the underlying fetch keeps running
//     so the shared PlaceSectionCache is warm for the next visitor.
//   • No cache key ever contains the typed address — adapters key by
//     geohash / county / state, and the synthetic "home" passed to them
//     is identified by its geohash-6 cell, never by the search.
//
// The aha card: pickAha() ranks the ready sections by how *non-obvious*
// the fact is for this exact spot and returns one headline the visitor
// did not know about their own address, with the follow-up question the
// claim answers. When every layer is quiet, that is itself the card.
// ============================================================

const { serializePlaceSection } = require('../serializers/placeIntelligenceSerializer');
const { encodeGeohash } = require('../utils/geohash');
const { isInCascadiaRegion } = require('../utils/geo');
const logger = require('../utils/logger');
const adapters = require('./placeSectionAdapters');
const placeIntelligenceService = require('./placeIntelligenceService');
const ballotSummary = require('./ballot/summary');

// The per-section budget, the race against it and the retryable error a late
// section becomes are shared with a saved home's Place.
const { sectionBudgetMs, withBudget, failedSections: failed } = placeIntelligenceService;

// The lookup's sections, in their base order (LOOKUPORDER, 2026-11-24). Each
// client draws the groups in its own order (or the answer's `layout`) and keeps
// this order inside a group; Risk and Health are then ranked by their stand-out
// score (orderSections). Sunrise is not on the lookup: it stays on a home's
// Place and on Today.
const PREVIEW_SECTION_ORDER = [
  'flood', 'seismic', 'wildfire',
  'lead_radon', 'drinking_water', 'environmental_hazards',
  'census_context', 'block_density',
  'alerts', 'air_quality', 'weather',
  'rent_band',
  'civic_districts', 'civic_election',
];

// Preview-facing density labels. The signed-out card must never read as
// a zero: below the floor it is an invitation, not an absence. The
// Founding-Neighbor line is only printed while the cell's founding window
// actually has open slots (services/place/foundingWindow) — a promise the
// rank system rations, not a slogan.
const PREVIEW_DENSITY_LABELS = {
  none: 'Block Founder slots are open here',
  forming: 'Your block is starting to form',
  few: 'A few verified homes nearby',
  growing: 'Growing activity near this area',
};
const NO_SLOTS_LABELS = {
  none: 'Be one of the first verified here',
  forming: 'Your block is starting to form',
};

function previewDensityLabel(bucket, foundingOpen = true) {
  const b = PREVIEW_DENSITY_LABELS[bucket] ? bucket : 'none';
  if (!foundingOpen && NO_SLOTS_LABELS[b]) return NO_SLOTS_LABELS[b];
  return PREVIEW_DENSITY_LABELS[b];
}

// Today's composer applies the budget to each of its providers itself and
// settles by then; the race around it only catches something unexpected.
const TODAY_RACE_GRACE_MS = 500;

// Ballot's boundary lookup ends a little before its section's budget does, so
// a slow geocoder still leaves time to show the dates without the count.
function ballotLookupMs(budgetMs = sectionBudgetMs()) {
  return Math.max(Math.floor(budgetMs / 2), budgetMs - 500);
}

// The election row. While ballot_p0 is on (`ballot` carries the route's
// boundary lookup) it is Ballot's: the checked dates and official links for
// the point's state, the card a Home there shows. Otherwise, or when that
// fails, the plain row.
async function composeElection(home, ballot, budgetMs) {
  if (ballot) {
    try {
      // The live count gets only what is left of the section's budget.
      const deadline = Date.now() + (budgetMs > 0 ? budgetMs : sectionBudgetMs());
      const summary = await ballotSummary.summaryForPoint(
        { lat: home.map_center_lat, lng: home.map_center_lng, state: home.state },
        { timeoutMs: ballotLookupMs(budgetMs), lookup: ballot.lookup, deadline },
      );
      if (summary) return [adapters.ballotElectionSection(summary)];
    } catch (err) {
      logger.warn('placePreview: ballot election row failed', { error: err.message });
    }
  }
  return adapters.composeCivicElection(home);
}

// ── Remote Band-A layers for a point ─────────────────────────
// Returns envelopes for the layers that need a provider round-trip.
// Flood / census / density are assembled by the route (it already has
// them) via assemblePreviewSections.
async function composePreviewSections({ lat, lng, city = null, state = null, resolveTract = null, ballot = null }) {
  const gh6 = encodeGeohash(lat, lng, 6);
  // The route resolves the tract ONCE (a thunk shared with the census
  // teaser and the money lead); county falls out of it for free, so the
  // radon / rent / water adapters never re-geocode the point.
  // null = no shared resolution offered (adapters may geocode themselves);
  // '' = shared resolution ran and failed (adapters must NOT retry it).
  let countyFips = null;
  if (typeof resolveTract === 'function') {
    countyFips = '';
    try {
      const tract = await resolveTract();
      if (tract && tract.stateCode && tract.countyCode) countyFips = `${tract.stateCode}${tract.countyCode}`;
    } catch {
      countyFips = '';
    }
  }
  // The adapters take a "home"; this one is a point with a geohash for
  // an id (their warn-logs print it) and no exact-record fields.
  const home = {
    id: `preview:${gh6}`,
    map_center_lat: lat,
    map_center_lng: lng,
    city,
    state,
    year_built: null,
    bedrooms: null,
    county_fips: countyFips,
  };
  const ms = sectionBudgetMs();
  const tasks = [
    withBudget(
      () => placeIntelligenceService.composeTodayForPoint(lat, lng, { budgetMs: ms }),
      ms + TODAY_RACE_GRACE_MS,
      failed(['weather', 'air_quality', 'alerts']),
    ),
    withBudget(() => adapters.composeSeismic(home), ms, failed(['seismic'])),
    withBudget(() => adapters.composeWildfire(home), ms, failed(['wildfire'])),
    withBudget(() => adapters.composeLeadRadon(home), ms, failed(['lead_radon'])),
    withBudget(() => adapters.composeDrinkingWater(home), ms, failed(['drinking_water'])),
    withBudget(() => adapters.composeEnvironmentalHazards(home), ms, failed(['environmental_hazards'])),
    withBudget(() => adapters.composeRentBand(home), ms, failed(['rent_band'])),
    withBudget(() => adapters.composeCivicDistricts(home), ms, failed(['civic_districts'])),
    withBudget(() => composeElection(home, ballot, ms), ms, failed(['civic_election'])),
  ];
  const settled = await Promise.all(tasks);
  return settled.flat();
}

// ── Local layers the route already holds ─────────────────────
function floodEnvelope(flood) {
  if (!flood || !flood.flood_zone) {
    return serializePlaceSection('flood', { status: 'unavailable' });
  }
  const zone = String(flood.flood_zone).toUpperCase();
  const inSfha = zone.startsWith('A') || zone.startsWith('V');
  return serializePlaceSection('flood', {
    data: {
      zone: flood.flood_zone,
      zone_label: `Zone ${flood.flood_zone}`,
      risk_level: placeIntelligenceService.floodRiskLevel(flood.flood_zone),
      in_sfha: inSfha,
      insurance_required: inSfha,
      plain_meaning: flood.flood_zone_description || '',
    },
  });
}

function censusEnvelope(area) {
  const has = area && (area.median_year_built != null || area.median_home_value != null);
  if (!has) return serializePlaceSection('census_context', { status: 'unavailable' });
  const parts = [];
  if (area.median_year_built) parts.push(`most homes here were built around ${area.median_year_built}`);
  if (area.median_home_value) {
    parts.push(`the typical one is valued near $${Math.round(area.median_home_value).toLocaleString('en-US')}`);
  }
  const summary = parts.length
    ? `${parts.join(', and ')}.`.replace(/^./, (m) => m.toUpperCase())
    : 'Census tract context for this area.';
  return serializePlaceSection('census_context', {
    data: {
      median_year_built: area.median_year_built ?? null,
      median_home_value: area.median_home_value ?? null,
      tract_name: null,
      summary,
    },
  });
}

function densityEnvelope(bucket, foundingOpen = true) {
  const b = PREVIEW_DENSITY_LABELS[bucket] ? bucket : 'none';
  return serializePlaceSection('block_density', {
    data: { bucket: b, label: previewDensityLabel(b, foundingOpen), founding_open: Boolean(foundingOpen) },
  });
}

// Merge the remote envelopes with the route's local layers into the
// curated order. Unknown ids are dropped; missing ids are omitted (a
// section that no composer produced is simply not shown). `late` names
// the route's layers that ran out of time: retryable errors.
function assemblePreviewSections({ remote = [], flood = null, area = null, bucket = 'none', foundingOpen = true, late = [] }) {
  const byId = new Map();
  for (const env of remote) if (env && env.id) byId.set(env.id, env);
  byId.set('flood', floodEnvelope(flood));
  byId.set('census_context', censusEnvelope(area));
  byId.set('block_density', densityEnvelope(bucket, foundingOpen));
  for (const env of failed(late.filter((id) => byId.has(id)))()) byId.set(env.id, env);
  return PREVIEW_SECTION_ORDER.filter((id) => byId.has(id)).map((id) => byId.get(id));
}

// The groups whose cards stay whatever their status (the stand-out card's
// "The cards below show what could not be checked" points at them), and whose
// missing layers make a quiet address read as incomplete.
const CORE_GROUPS = new Set(['risk_readiness', 'health_environment', 'today']);
const NOT_CHECKED = new Set(['error', 'unavailable']);

// ── The aha card ─────────────────────────────────────────────
const DATA_BEARING = new Set(['ready', 'partial', 'stale']);
const ready = (env) => env && DATA_BEARING.has(env.status) && env.data;

function toneFor(score) {
  if (score >= 75) return 'alert';
  if (score >= 45) return 'watch';
  return 'info';
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The one step at the end of a stand-out card, from the agency behind the fact
// (LOOKUPORDER WORDS.md; each line names the page it rests on there).
const STEPS = {
  radon: 'What to do: test. The EPA says to fix a home at 4 pCi/L or more.',
  flood_high: 'What to do: check your flood insurance. FEMA says homes in high-risk areas with a government-backed mortgage must carry it, and a new policy usually takes 30 days to start.',
  flood_moderate: 'What to do: ask what flood insurance would cost. A new policy usually takes 30 days to start.',
  earthquake: 'What to do: secure heavy things that can tip, like bookcases and the water heater.',
  wildfire: 'What to do: keep leaves, debris and anything that burns at least 30 feet from the house.',
  water: 'What to do: read your water system\'s yearly report. It is due to customers by July 1.',
  epa_sites: 'What to do: look the site up on the EPA\'s ECHO to see what the violation was.',
};

function withStep(detail, step) {
  const text = String(detail || '').trim();
  if (!step) return text;
  return text ? `${/[.!?]$/.test(text) ? text : `${text}.`} ${step}` : step;
}

function firstSentence(text) {
  const clean = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!clean) return null;
  const sentence = clean.split(/(?<=[.!?])\s/)[0];
  return sentence.length > 220 ? null : sentence;
}

// Each builder takes the section's data and the previewed point ({ lat, lng },
// or null) and returns { score, grade, headline, detail, follow_up } or null.
// A follow_up names only what claiming really gives: the home's Place page, the morning briefing or
// the alert push. Never a reminder or an alert that doesn't exist.
const AHA_BUILDERS = {
  alerts(d) {
    const active = Array.isArray(d.active) ? d.active : [];
    if (!active.length) return null;
    const rank = { warning: 100, watch: 70, advisory: 50 };
    const top = active.slice().sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0))[0];
    const label = { warning: 'Warning', watch: 'Watch', advisory: 'Advisory' }[top.severity] || 'Alert';
    return {
      score: rank[top.severity] || 50,
      grade: label,
      headline: `${top.event || 'A weather alert'}: in effect right now`,
      // The step is the National Weather Service's own instruction, when it gives one.
      detail: withStep(
        (top.headline && top.headline !== top.event ? top.headline : top.description || '').slice(0, 160),
        firstSentence(top.original_instruction || top.instruction),
      ),
      follow_up: 'Claim this address and we\'ll wake you for the next one.',
    };
  },
  air_quality(d) {
    const scores = { hazardous: 95, very_unhealthy: 95, unhealthy: 95, unhealthy_sensitive: 80, moderate: 40, good: 8 };
    const score = scores[d.category] ?? 8;
    return {
      score,
      grade: Number.isFinite(Number(d.index)) ? `AQI ${d.index}` : null,
      headline: `Air right now: ${d.category_label || d.category}`,
      detail: d.health_message || '',
      follow_up: 'Claim this address to get a smoke-day alert every morning.',
    };
  },
  flood(d) {
    const level = d.risk_level;
    const score = level === 'high' ? 95 : level === 'moderate' ? 65 : 6;
    const headline = level === 'high'
      ? 'This address sits in a FEMA high-risk flood zone'
      : level === 'moderate'
        ? 'This address sits in a moderate flood-risk zone'
        : 'Minimal flood risk on FEMA\'s map';
    return {
      score,
      grade: d.zone_label || (d.zone ? `Zone ${d.zone}` : null),
      headline,
      detail: withStep(
        d.plain_meaning || (level === 'high' ? 'Flood insurance is usually required for a mortgage here.' : ''),
        level === 'high' ? STEPS.flood_high : level === 'moderate' ? STEPS.flood_moderate : null,
      ),
      follow_up: 'Claim it for the full risk picture.',
    };
  },
  wildfire(d) {
    const cls = d.burnable ? Number(d.hazard_class) : null;
    const score = cls === 5 ? 92 : cls === 4 ? 85 : cls === 3 ? 55 : cls === 2 ? 12 : 10;
    const where = d.scope === 'nearby' ? 'within a quarter mile' : 'around this address';
    return {
      score,
      grade: d.hazard_label || null,
      headline: d.burnable
        ? `${d.hazard_label} wildfire hazard ${where}`
        : 'This point is classed as non-burnable land',
      detail: withStep(d.summary || '', d.burnable && cls != null && cls >= 3 ? STEPS.wildfire : null),
      follow_up: cls != null && cls >= 3
        ? 'Claim it to get smoke-day and burn-ban alerts every morning.'
        : 'Claim it to hear the morning that changes.',
    };
  },
  seismic(d, point) {
    const sdc = String(d.design_category || '').toUpperCase();
    const score = { E: 85, D: 78, C: 45, B: 8, A: 6 }[sdc] ?? 20;
    const high = sdc === 'D' || sdc === 'E';
    // D and E reach well past the Pacific Northwest (Southern California,
    // Utah, Alaska, Memphis, Charleston), so only a point in the Cascadia
    // region is told it is there. The retrofit advice holds everywhere.
    const cascadia = Boolean(point) && isInCascadiaRegion(point.lat, point.lng);
    return {
      score,
      grade: sdc ? `Category ${sdc}` : null,
      headline: high
        ? `Earthquake design category ${sdc}: new homes here are built for high shaking`
        : sdc ? `Earthquake design category ${sdc} at this point` : 'Earthquake design demand for this point',
      detail: high
        ? withStep(`${cascadia ? 'This is the Cascadia zone. ' : ''}Homes built before the modern code often are not bolted to their foundations; a retrofit is the usual fix.`, STEPS.earthquake)
        : d.summary || '',
      follow_up: 'Claim it for the full risk picture.',
    };
  },
  lead_radon(d) {
    const zone = Number(d.radon_zone);
    if (!Number.isFinite(zone)) return null;
    // Zone 1 outranks a design category: it is the EPA's top band, most
    // people have never heard it about their county, and the next step
    // costs a test kit. (Audit 2026-09-01: Clark County, WA is zone 1.)
    const score = zone === 1 ? 80 : zone === 2 ? 42 : 10;
    if (zone === 1) {
      return {
        score,
        grade: 'Radon zone 1',
        headline: 'This county is in the EPA\'s highest radon band',
        detail: withStep('Zone 1 means the predicted average indoor level is above the EPA action level. Only a test tells you about this home.', STEPS.radon),
        follow_up: 'The EPA recommends testing every home, whatever the zone.',
      };
    }
    const level = zone === 2 ? 'Moderate' : 'Low';
    return {
      score,
      grade: `Radon zone ${zone}`,
      headline: `${level} radon potential for this county`,
      detail: withStep(d.summary || '', zone === 2 ? STEPS.radon : null),
      follow_up: 'The EPA recommends testing every home, whatever the zone.',
    };
  },
  environmental_hazards(d) {
    const count = Number(d.facilities_within_mile) || 0;
    const n = d.notable || {};
    const snc = Number(n.significant_noncompliance) || 0;
    const viol = Number(n.violations_3yr) || 0;
    const tri = Number(n.toxic_release_reporters) || 0;
    const top = Array.isArray(d.facilities) && d.facilities[0];
    // A raw count of permits never leads; violations do.
    let score = 8;
    let grade = `${count} nearby`;
    let headline = count === 0 ? 'No EPA-registered sites within a mile' : `${plural(count, 'EPA-registered site', 'EPA-registered sites')} within a mile`;
    let detail = 'Permits and inspections on record, no violations. Regulated activity, not contamination.';
    const sncIndustrial = Number(n.significant_noncompliance_industrial) || 0;
    if (sncIndustrial > 0 && top && !top.construction) {
      score = 74; grade = 'Violation';
      headline = `${top.name} is in significant noncompliance with EPA rules`;
      detail = `Within a mile of this address. ${viol > 1 ? `${viol} sites nearby had violations in the last 3 years.` : ''}`.trim();
    } else if (snc > 0 && top) {
      // A subdivision's stormwater permit, not a smokestack: worth a line, not a headline.
      score = 46; grade = 'Permit lapse';
      headline = `A construction site within a mile is out of compliance with its stormwater permit`;
      detail = `${top.name}. Erosion-control paperwork and inspections, not emissions.`;
    } else if (viol > 0 && top) {
      score = 52; grade = plural(viol, 'violation', 'violations');
      headline = `${plural(viol, 'site', 'sites')} within a mile had EPA violations in the last 3 years`;
      detail = `Nearest on record: ${top.name}. Regulated activity, not necessarily exposure.`;
    } else if (tri > 0) {
      score = 40; grade = `${tri} TRI`;
      headline = `${plural(tri, 'facility reports', 'facilities report')} toxic releases within a mile`;
      detail = 'Reporting to the Toxics Release Inventory is disclosure, not a violation.';
    }
    // A violation on record (not a disclosure-only TRI report) gets the step.
    if (score >= 46) detail = withStep(detail, STEPS.epa_sites);
    return { score, grade, headline, detail, follow_up: 'Claim it to see the sites on record near this home.' };
  },
  drinking_water(d) {
    const n = Number(d.violation_count) || 0;
    const bad = Boolean(d.recent_health_violations) && n > 0;
    const name = d.utility_name || 'Your water system';
    return {
      score: bad ? 74 : 12,
      grade: bad ? plural(n, 'violation', 'violations') : 'No violations',
      headline: bad
        ? `${name}: ${plural(n, 'health-based violation', 'health-based violations')} in 5 years`
        : `${name}: no health-based violations in 5 years`,
      detail: withStep(d.summary || '', bad ? STEPS.water : null),
      follow_up: 'Claim it to see your water system\'s full record.',
    };
  },
  rent_band(d) {
    const lo = Number(d.band_low);
    const hi = Number(d.band_high);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    const bedrooms = Number(d.bedrooms);
    const label = bedrooms === 0 ? 'studio' : `${Number.isFinite(bedrooms) ? bedrooms : 2}-bedroom`;
    return {
      score: 30,
      grade: `$${lo.toLocaleString('en-US')}+`,
      headline: `Typical ${label} rent nearby: $${lo.toLocaleString('en-US')}–$${hi.toLocaleString('en-US')} a month`,
      detail: d.summary || '',
      follow_up: 'Claim it to compare with what this home is worth.',
    };
  },
  civic_election(d) {
    // Ballot's row is the election's own card (the web shows it as the teaser
    // under the aha), so it never doubles as the aha: the ranking is unchanged.
    if (d.election_id) return null;
    const days = Number(d.days_until);
    if (!d.name || !Number.isFinite(days)) return null;
    return {
      score: days <= 45 ? 66 : 28,
      grade: `${days} days`,
      headline: `${d.name} is ${plural(days, 'day', 'days')} away`,
      detail: 'Check your county elections office for registration and ballot deadlines.',
      follow_up: 'Claim it to see this election and your districts on its page.',
    };
  },
  civic_districts(d) {
    const districts = Array.isArray(d.districts) ? d.districts : [];
    if (!districts.length) return null;
    const house = districts.find((x) => x.office_label === 'U.S. House');
    const others = districts.filter((x) => x !== house).map((x) => x.office_label.toLowerCase());
    return {
      score: 22,
      grade: null,
      headline: house ? house.name : `${plural(districts.length, 'district represents', 'districts represent')} this address`,
      detail: others.length ? `Plus ${others.join(', ')}.` : '',
      follow_up: 'Claim it to see who holds each seat.',
    };
  },
  census_context(d) {
    if (!d.median_year_built) return null;
    return {
      score: 18,
      grade: `${d.median_year_built}`,
      headline: `Most homes here were built around ${d.median_year_built}`,
      detail: d.summary || '',
      follow_up: 'Claim it to see this home\'s own record.',
    };
  },
};

// Facts worth naming on the calm card, when they are calm.
function calmFacts(byId) {
  const facts = [];
  const flood = ready(byId.get('flood'));
  if (flood && flood.risk_level === 'minimal') facts.push('minimal flood risk');
  const wf = ready(byId.get('wildfire'));
  if (wf && (!wf.burnable || Number(wf.hazard_class) <= 2)) facts.push('low wildfire hazard');
  const air = ready(byId.get('air_quality'));
  if (air && air.category === 'good') facts.push('good air today');
  const alerts = ready(byId.get('alerts'));
  if (alerts && Array.isArray(alerts.active) && alerts.active.length === 0) facts.push('no active weather alerts');
  const seismic = ready(byId.get('seismic'));
  if (seismic && /^[AB]$/i.test(String(seismic.design_category))) facts.push('low earthquake demand');
  return facts;
}

const AHA_FLOOR = 35;

function pickAha(sections, point = null) {
  const byId = new Map();
  for (const env of sections || []) if (env && env.id) byId.set(env.id, env);

  let best = null;
  for (const id of Object.keys(AHA_BUILDERS)) {
    const data = ready(byId.get(id));
    if (!data) continue;
    let built = null;
    try {
      built = AHA_BUILDERS[id](data, point);
    } catch {
      built = null;
    }
    if (!built) continue;
    if (!best || built.score > best.score) best = { section_id: id, ...built };
  }

  if (!best || best.score < AHA_FLOOR) {
    const facts = calmFacts(byId);
    // A timed-out or missing layer is not evidence that the address is quiet.
    // Keep the facts we do have, without an all-clear over failed cards.
    // Only Risk, Health and Right now count: a tract with no Census figures or
    // an address with no districts on file is not a gap in the risk picture.
    const incomplete = !byId.size || [...byId.values()].some((env) =>
      CORE_GROUPS.has(env.group) && NOT_CHECKED.has(env.status));
    if (incomplete) {
      return {
        section_id: null,
        tone: 'info',
        grade: 'Partial',
        headline: 'Some public information is still missing',
        detail: (facts.length ? `${facts.join(', ')}. `.replace(/^./, (m) => m.toUpperCase()) : '')
          + 'The cards below show what could not be checked. This is not a complete risk picture.',
        follow_up: 'Save this address to check back later.',
      };
    }
    const listed = facts.length
      ? `${facts.join(', ')}.`.replace(/^./, (m) => m.toUpperCase())
      : 'Nothing on the public layers stands out for this spot.';
    return {
      section_id: null,
      tone: 'calm',
      grade: 'Quiet',
      headline: 'Quiet on every layer',
      detail: `${listed} That's rarer than you'd think.`,
      follow_up: 'Claim this address to know the morning that changes.',
    };
  }

  const { score, ...card } = best;
  return { ...card, tone: toneFor(score) };
}

// ── The lookup's order (LOOKUPORDER, 2026-11-24) ─────────────
// Everything below is computed from the sections already in hand: no provider
// call, no database read.

// A section's stand-out score, or null when its builder has nothing to say.
function scoreOf(env, point) {
  const data = ready(env);
  const build = env && AHA_BUILDERS[env.id];
  if (!data || !build) return null;
  try {
    const built = build(data, point);
    return built && Number.isFinite(built.score) ? built.score : null;
  } catch {
    return null;
  }
}

const activeAlerts = (env) => {
  const data = ready(env);
  return data && Array.isArray(data.active) ? data.active : [];
};

// Risk and Health: a section at or above the stand-out floor moves ahead,
// highest first; the rest keep the base order (flood, earthquake, wildfire;
// radon and lead, water, EPA sites), so calm cards are not reshuffled by the few
// points between their scores. Right now opens on an alert while one is
// active, then air, then weather.
function orderSections(sections, point = null) {
  const list = (sections || []).filter(Boolean);
  const base = new Map(list.map((env, i) => [env, i]));
  const scores = new Map(list.map((env) => [env, scoreOf(env, point)]));
  const alertsFirst = activeAlerts(list.find((env) => env.id === 'alerts')).length > 0;
  const todayRank = alertsFirst
    ? { alerts: 0, air_quality: 1, weather: 2 }
    : { air_quality: 0, weather: 1, alerts: 2 };
  const groupOrder = [];
  const byGroup = new Map();
  for (const env of list) {
    const g = env.group || '';
    if (!byGroup.has(g)) { byGroup.set(g, []); groupOrder.push(g); }
    byGroup.get(g).push(env);
  }
  const out = [];
  for (const g of groupOrder) {
    const members = byGroup.get(g).slice();
    if (g === 'risk_readiness' || g === 'health_environment') {
      const lead = (env) => {
        const score = scores.get(env);
        return Number.isFinite(score) && score >= AHA_FLOOR ? score : -1;
      };
      members.sort((a, b) => lead(b) - lead(a) || base.get(a) - base.get(b));
    } else if (g === 'today') {
      members.sort((a, b) => (todayRank[a.id] ?? 9) - (todayRank[b.id] ?? 9) || base.get(a) - base.get(b));
    }
    out.push(...members);
  }
  return out;
}

// What the could-not-check line names (WORDS.md: "Could not check today: Homes here, Next election.").
const CHECK_LABELS = {
  flood: 'Flood',
  seismic: 'Earthquake',
  wildfire: 'Wildfire',
  lead_radon: 'Radon',
  drinking_water: 'Water',
  environmental_hazards: 'EPA sites',
  census_context: 'Homes here',
  alerts: 'Weather alerts',
  air_quality: 'Air today',
  weather: 'Weather',
  rent_band: 'Rent',
  civic_districts: 'Districts',
  civic_election: 'Next election',
};

function notCheckedFor(sections) {
  return (sections || [])
    .filter((env) => env && NOT_CHECKED.has(env.status) && CHECK_LABELS[env.id])
    .map((env) => ({ id: env.id, label: CHECK_LABELS[env.id] }));
}

// The list a client draws: every Risk, Health and Right now section whatever its
// status (an `error` offers Try again; the stand-out card's "The cards below show
// what could not be checked" stays true in the store apps), every `error`, and
// no `unavailable` section outside those groups: those go to `not_checked`.
function visibleSections(sections) {
  return (sections || []).filter((env) => env
    && (CORE_GROUPS.has(env.group) || env.status !== 'unavailable'));
}

// The election's days ahead, when it is ahead (a Ballot card after the vote is not).
function electionDaysAhead(data) {
  if (!data) return null;
  if (data.phase === 'after') return null;
  const days = Number(data.days_until);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

const GLANCE_WINDOW_DAYS = 45;
const GLANCE_MAX = 9;
const GLANCE_VALUE_MAX = 28;
const TONE_RANK = { alert: 0, watch: 1, calm: 2, info: 3 };
// The fixed vocabulary, in its tie order.
const GLANCE_IDS = ['alerts', 'air', 'flood', 'earthquake', 'wildfire', 'radon', 'lead', 'water', 'epa_sites', 'homes_here', 'election'];

const AIR_SHORT = {
  good: 'Good',
  moderate: 'Moderate',
  unhealthy_sensitive: 'Unhealthy for some',
  unhealthy: 'Unhealthy',
  very_unhealthy: 'Very unhealthy',
  hazardous: 'Hazardous',
};

function shortDollars(n) {
  const v = Math.round(Number(n));
  if (v >= 1000000) return `$${(v / 1000000).toFixed(2).replace(/\.?0+$/, '')}M`;
  return `$${v.toLocaleString('en-US')}`;
}

// A row's tone: the section's stand-out score through toneFor; below the floor,
// calm when the fact is a clear one and info when it is neither good nor bad.
function toneOf(score, clear) {
  if (Number.isFinite(score) && score >= AHA_FLOOR) return toneFor(score);
  return clear ? 'calm' : 'info';
}

// Each row builder: (data, score) => { value, tone } or null.
function glanceRows(sections, point = null) {
  const byId = new Map();
  for (const env of sections || []) if (env && env.id) byId.set(env.id, env);
  const rows = [];
  const add = (id, label, sectionId, built, score) => {
    if (!built || !built.value) return;
    // Never cut inside a word: past 28 characters, the value ends at the last whole word.
    const value = built.value.length > GLANCE_VALUE_MAX
      ? built.value.slice(0, GLANCE_VALUE_MAX + 1).replace(/[\s,·]+\S*$/, '').trim()
      : built.value;
    rows.push({ id, label, value, tone: built.tone, section_id: sectionId, _score: Number.isFinite(score) ? score : -1 });
  };
  const with_ = (sectionId, fn) => {
    const env = byId.get(sectionId);
    const data = ready(env);
    if (!data) return;
    fn(data, scoreOf(env, point));
  };

  with_('alerts', (d, score) => {
    const active = Array.isArray(d.active) ? d.active : [];
    if (!active.length) return;
    const rank = { warning: 100, watch: 70, advisory: 50 };
    const top = active.slice().sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0))[0];
    add('alerts', 'Alert', 'alerts', { value: top.event || 'Weather alert', tone: toneOf(score, false) }, score);
  });
  with_('air_quality', (d, score) => {
    const name = AIR_SHORT[d.category] || d.category_label;
    if (!name) return;
    const index = Number(d.index);
    add('air', 'Air today', 'air_quality', {
      value: Number.isFinite(index) ? `${name} · ${index}` : name,
      tone: toneOf(score, d.category === 'good'),
    }, score);
  });
  with_('flood', (d, score) => {
    const value = { high: 'High-risk zone', moderate: 'Moderate', minimal: 'Minimal' }[d.risk_level];
    if (value) add('flood', 'Flood', 'flood', { value, tone: toneOf(score, d.risk_level === 'minimal') }, score);
  });
  with_('seismic', (d, score) => {
    const sdc = String(d.design_category || '').toUpperCase();
    const value = (sdc === 'D' || sdc === 'E') ? 'Built for high shaking'
      : sdc === 'C' ? 'Moderate shaking'
        : (sdc === 'A' || sdc === 'B') ? 'Low shaking' : null;
    if (value) add('earthquake', 'Earthquake', 'seismic', { value, tone: toneOf(score, sdc === 'A' || sdc === 'B') }, score);
  });
  with_('wildfire', (d, score) => {
    const cls = Number(d.hazard_class);
    let value = null;
    if (!d.burnable) value = 'Not burnable land';
    else if (cls >= 4) value = 'High hazard nearby';
    else if (cls === 3) value = 'Moderate hazard nearby';
    else if (cls === 1 || cls === 2) value = 'Low hazard';
    if (value) add('wildfire', 'Wildfire', 'wildfire', { value, tone: toneOf(score, !d.burnable || cls <= 2) }, score);
  });
  with_('lead_radon', (d, score) => {
    const zone = Number(d.radon_zone);
    const value = { 1: 'Highest band', 2: 'Moderate band', 3: 'Lowest band' }[zone];
    if (value) add('radon', 'Radon', 'lead_radon', { value, tone: toneOf(score, zone === 3) }, score);
    if (d.lead_paint_risk) add('lead', 'Lead paint', 'lead_radon', { value: 'Depends on build year', tone: 'info' }, null);
  });
  with_('drinking_water', (d, score) => {
    const bad = Boolean(d.recent_health_violations) && Number(d.violation_count) > 0;
    add('water', 'Water', 'drinking_water', {
      value: bad ? 'Health violation on record' : 'No violations, 5 years',
      tone: toneOf(score, !bad),
    }, score);
  });
  with_('environmental_hazards', (d, score) => {
    const count = Number(d.facilities_within_mile);
    if (!Number.isFinite(count)) return;
    const n = d.notable || {};
    const withViolation = Number(n.violations_3yr) || Number(n.significant_noncompliance) || 0;
    let value;
    if (withViolation > 0) value = `${withViolation} of ${count} with a violation`;
    else if (count === 0) value = 'None within a mile';
    // WORDS.md's "M sites, none with violations" runs past 28 characters at any count.
    else value = `${plural(count, 'site', 'sites')}, no violations`;
    add('epa_sites', 'EPA sites', 'environmental_hazards', { value, tone: toneOf(score, withViolation === 0) }, score);
  });
  with_('census_context', (d) => {
    const parts = [];
    if (Number(d.median_home_value) > 0) parts.push(`Near ${shortDollars(d.median_home_value)}`);
    if (Number(d.median_year_built) > 0) parts.push(parts.length ? `built ~${d.median_year_built}` : `Built ~${d.median_year_built}`);
    if (parts.length) add('homes_here', 'Homes here', 'census_context', { value: parts.join(' · '), tone: 'info' }, null);
  });
  with_('civic_election', (d, score) => {
    const days = electionDaysAhead(d);
    if (days == null || days > GLANCE_WINDOW_DAYS) return;
    // Ballot's own row has no stand-out score; an election this close is worth a look.
    const s = Number.isFinite(score) ? score : 66;
    const value = days === 0 ? 'Today' : `In ${plural(days, 'day', 'days')}`;
    add('election', 'Election', 'civic_election', { value, tone: toneOf(s, false) }, s);
  });

  rows.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]
    || b._score - a._score
    || GLANCE_IDS.indexOf(a.id) - GLANCE_IDS.indexOf(b.id));
  // Past nine rows, "Lead paint" (the same line for every address) gives way
  // first: the glance keeps its "Homes here" row (SPEC 1.7).
  const kept = rows.length > GLANCE_MAX ? rows.filter((row) => row.id !== 'lead') : rows;
  return kept.slice(0, GLANCE_MAX).map(({ _score, ...row }) => row);
}

// The side-by-side test (SPEC 6): off unless LOOKUP_ORDER_SPLIT is set, and the
// founder's step. LOOKUP_ORDER_SPLIT_SHARE (0..1, default 0.5) is the share that
// sees the new order; LOOKUP_ORDER_SPLIT_UNTIL (an ISO date) ends it.
function splitConfig(now = Date.now()) {
  const on = ['1', 'on', 'true', 'yes'].includes(String(process.env.LOOKUP_ORDER_SPLIT || '').trim().toLowerCase());
  const shareRaw = Number(process.env.LOOKUP_ORDER_SPLIT_SHARE);
  const share = Number.isFinite(shareRaw) && shareRaw >= 0 && shareRaw <= 1 ? shareRaw : 0.5;
  const untilRaw = String(process.env.LOOKUP_ORDER_SPLIT_UNTIL || '').trim();
  const untilMs = untilRaw ? Date.parse(untilRaw) : NaN;
  const until = Number.isFinite(untilMs) ? new Date(untilMs).toISOString() : null;
  return { on: on && (until == null || untilMs > now), share, until };
}

// The blocks a client draws, in order. A client skips a block it does not know
// or has nothing to draw for. The Ballot card goes right after the stand-out
// card while the election is at most 45 days ahead; otherwise clients draw it
// at the top of the civic group.
function layoutFor(sections) {
  const election = (sections || []).find((env) => env && env.id === 'civic_election');
  const data = ready(election);
  const days = data && data.election_id ? electionDaysAhead(data) : null;
  const ballotUp = days != null && days <= GLANCE_WINDOW_DAYS;
  return {
    version: 'v2',
    order: [
      'aha', ...(ballotUp ? ['ballot'] : []), 'glance', 'money', 'record', 'ask',
      'group:risk_readiness', 'group:health_environment', 'section:census_context',
      'group:today', 'group:money_signals', 'group:civic', 'section:block_density',
      'locked', 'not_checked', 'privacy',
    ],
    split: splitConfig(),
  };
}

// The lookup's new fields from the full section list (pickAha reads the same
// full list first): the list to draw, the glance, what could not be checked
// and the order.
function shapeLookup(sections, point = null) {
  const ordered = orderSections(sections, point);
  return {
    sections: visibleSections(ordered),
    glance: glanceRows(ordered, point),
    not_checked: notCheckedFor(ordered),
    layout: layoutFor(ordered),
  };
}

module.exports = {
  composePreviewSections,
  assemblePreviewSections,
  pickAha,
  shapeLookup,
  orderSections,
  glanceRows,
  layoutFor,
  PREVIEW_SECTION_ORDER,
  PREVIEW_DENSITY_LABELS,
  previewDensityLabel,
  // Exported for unit testing.
  withBudget,
  sectionBudgetMs,
  ballotLookupMs,
};
