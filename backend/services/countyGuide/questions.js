'use strict';

/**
 * The questions people ask about a county's property records, each answered with the office that holds the answer.
 * Written once, filled per county from what its page holds: a question whose answer the page doesn't hold is left out.
 * Facts only, never advice. The answers are also the page's FAQ structured data, so they are whole sentences.
 */

const { dateWords } = require('./offices');

const joined = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

// "the Orleans Parish Assessor", "the City of Boston"; "Clark County" and "Providence's assessor" as they are.
const OFFICE_END = /(Assessor|Assessors Office|Appraiser|Auditor|Treasurer|Administrator|District|Commission|Office|Commissioner|Collector|Lister|Recorder|Clerk|Service|Agency|Department|Division|Center)$/;
function withThe(office) {
  if (!office || /^the /i.test(office) || office.includes("'s ")) return office;
  return OFFICE_END.test(office) || /^City (of|and) /.test(office) || office === 'District of Columbia' ? `the ${office}` : office;
}

function recordsQuestion(county, offices) {
  const search = offices.rows.find((row) => row.id === 'property_search');
  if (search?.city_only) {
    return {
      id: 'records',
      q: `How do I look up property records in ${county.inName}?`,
      a: `The property search linked here is that of ${withThe(search.office)}${search.host ? ` (${search.host})` : ''}, which covers homes in that city or township only. Pantopus's lookup on this page shows what public records say about any address in ${county.inName}.`,
      office: search.office,
      url: search.url,
    };
  }
  if (search) {
    const runBy = search.office ? ` run by ${withThe(search.office)}` : '';
    return {
      id: 'records',
      q: `How do I look up property records in ${county.inName}?`,
      a: `Each property's record is in the property search${runBy}${search.host ? ` (${search.host})` : ''}. Pantopus's lookup on this page shows what public records say about one address.`,
      office: search.office,
      url: search.url,
    };
  }
  if (offices.towns.length) {
    return {
      id: 'records',
      q: `How do I look up property records in ${county.inName}?`,
      a: `In ${county.state.name}, each town keeps its own property records. The towns' own property cards are listed on this page. Pantopus's lookup shows what public records say about one address.`,
    };
  }
  return null;
}

// The rows read by hand carry their own question and answer, as read on the office's site.
function officeQuestions(offices) {
  return offices.rows
    .filter((row) => row.q && row.a)
    .map((row) => ({ id: row.id, q: row.q, a: row.a, office: row.office, url: row.url }));
}

function hazardQuestion(county, hazards) {
  if (!hazards?.rows?.length) return null;
  const top = Math.max(...hazards.rows.map((row) => row.level));
  const named = hazards.rows.filter((row) => row.level === top).map((row) => row.label.toLowerCase());
  const version = hazards.version ? ` (${hazards.version})` : '';
  const rated = top >= 3
    ? `rates ${county.inName} ${hazards.rows.find((row) => row.level === top).word.toLowerCase()} for ${joined(named)}, its highest ratings there`
    : `rates no hazard in ${county.inName} above ${top === 2 ? 'relatively low' : 'very low'}`;
  return {
    id: 'hazards',
    q: `What natural hazards does FEMA rate for ${county.inName}?`,
    a: `FEMA's National Risk Index${version} ${rated}. Each rating is for the whole ${county.state.unit}, not a test of any home.`,
    office: 'FEMA',
    url: 'https://hazards.fema.gov/nri/',
  };
}

function disasterQuestion(county, disasters) {
  if (!disasters?.total) return null;
  const latest = disasters.items[0];
  const since = disasters.first ? ` since ${disasters.first.slice(0, 4)}` : '';
  const what = [latest.id, latest.incident ? latest.incident.toLowerCase() : null].filter(Boolean).join(', ');
  return {
    id: 'disasters',
    q: `Have federal disasters been declared in ${county.inName}?`,
    a: `FEMA lists ${disasters.total.toLocaleString('en-US')} federal ${disasters.total === 1 ? 'declaration' : 'declarations'} naming ${county.inName}${since}, the latest on ${dateWords(latest.date)} (${what}).`,
    office: 'FEMA',
    url: 'https://www.fema.gov/disaster/declarations',
  };
}

const RADON_WORDS = { 1: 'zone 1, the highest radon potential', 2: 'zone 2, moderate radon potential', 3: 'zone 3, low radon potential' };

function radonQuestion(county, radon) {
  if (!radon?.zone) return null;
  return {
    id: 'radon',
    q: `What is ${county.inName}'s radon zone?`,
    a: `EPA's Map of Radon Zones (1993) puts ${county.inName} in ${RADON_WORDS[radon.zone]}. The zone is for the ${county.state.unit}, not a test of any home; only a test shows a home's level.`,
    office: 'EPA',
    url: 'https://www.epa.gov/radon/epa-map-radon-zones',
  };
}

function exemptionQuestion(county, exemption) {
  if (!exemption) return null;
  return {
    id: 'exemption',
    q: `Is there a homestead exemption in ${county.state.name}?`,
    a: exemption.note,
    office: exemption.source_name,
    url: exemption.source_url,
  };
}

function appealQuestion(county, appeal) {
  if (!appeal) return null;
  return {
    id: 'appeal',
    q: `How is a property's value appealed in ${county.state.name}?`,
    a: appeal.note,
    office: appeal.source.name,
    url: appeal.source.url,
  };
}

function floodZoneQuestion(county) {
  return {
    id: 'flood_zone',
    q: `How do I find a home's flood zone in ${county.inName}?`,
    a: "FEMA's Flood Map Service Center (msc.fema.gov) holds the official flood maps. Pantopus's lookup reads the same FEMA map for an address.",
    office: 'FEMA',
    url: 'https://msc.fema.gov/portal/home',
  };
}

/** The county's questions, in the order people ask them. */
function questionsOf(county, parts) {
  return [
    recordsQuestion(county, parts.offices),
    ...officeQuestions(parts.offices),
    floodZoneQuestion(county),
    hazardQuestion(county, parts.hazards),
    disasterQuestion(county, parts.disasters),
    radonQuestion(county, parts.radon),
    exemptionQuestion(county, parts.exemption),
    appealQuestion(county, parts.appeal),
  ].filter(Boolean);
}

module.exports = { questionsOf };
