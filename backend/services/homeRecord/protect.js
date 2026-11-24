'use strict';

/**
 * Two of the owner's "Protect your home" cards, in their smallest honest form (~/pantopus-home-record/DECISIONS.md,
 * November 23, 2026). Neither says anything Pantopus doesn't hold.
 *
 *   claims   the owner's right to the insurance claims report on their home (C.L.U.E., made by LexisNexis): free once
 *            every 12 months under federal law, seven years of claims by any owner. The report itself is the owner's
 *            to request; reading one back to them waits for a household document kind built against a real report.
 *   recalls  the Consumer Product Safety Commission's recalls naming each kind of system the house has, over ten years.
 *            The household hasn't named brands or models, so the card never says whether theirs is recalled.
 */

const { readThrough } = require('../placeSectionCache');
const logger = require('../../utils/logger');

const CLUE_REQUEST_URL = 'https://consumer.risk.lexisnexis.com/request';
const CPSC_RECALLS_API = 'https://www.saferproducts.gov/RestWebServices/Recall';
const CPSC_RECALLS_PAGE = 'https://www.cpsc.gov/Recalls';
const RECALL_YEARS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

/** The owner's claims-report card. */
function claimsCard() {
  return {
    kind: 'card',
    id: 'claims',
    title: 'Insurance claims on this home',
    chip: null,
    lead: 'Federal law lets you get the C.L.U.E. report on your home free once every 12 months. It lists the insurance claims filed on this home in the last seven years, by any owner. LexisNexis makes the report, and you ask them for it.',
    rows: [],
    notes: [],
    source: 'Fair Credit Reporting Act',
    action: { label: 'Request your report on LexisNexis\'s site', url: CLUE_REQUEST_URL },
  };
}

// The kinds of system the house has, by the CPSC's product words.
const RECALL_KINDS = [
  { label: 'Water heaters', product: 'water heater' },
  { label: 'Furnaces', product: 'furnace' },
  { label: 'Circuit breakers', product: 'circuit breaker' },
];

async function recallsNaming(product, since) {
  const { payload } = await readThrough({
    cacheKey: `cpsc:${product.replace(/\s+/g, '_')}`,
    sectionId: `_recalls_${since}`,
    reuseStored: true,
    ttlMs: DAY_MS,
    fetch: async () => {
      const params = new URLSearchParams({ format: 'json', ProductName: product, RecallDateStart: `${since}-01-01` });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(`${CPSC_RECALLS_API}?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`CPSC ${res.status}`);
        const body = await res.json();
        // An empty list is an answer here, not a failure: cache it as a count.
        return Array.isArray(body) ? { count: body.length } : null;
      } finally {
        clearTimeout(timer);
      }
    },
  });
  return payload ? payload.count : null;
}

/** The owner's recalls card: recalls naming each kind, over ten years. Null when the CPSC can't be read. */
async function recallsCard(now = new Date()) {
  const since = now.getUTCFullYear() - RECALL_YEARS;
  const counts = await Promise.all(RECALL_KINDS.map((kind) => recallsNaming(kind.product, since).catch((err) => {
    logger.info('homeRecord.recalls_later', { error: err.message });
    return null;
  })));
  const rows = RECALL_KINDS.map((kind, i) => (counts[i] === null ? null : {
    id: `recalls_${kind.product.replace(/\s+/g, '_')}`,
    label: `${kind.label}, since ${since}`,
    value: counts[i] === 1 ? '1 recall' : `${counts[i]} recalls`,
  })).filter(Boolean);
  if (!rows.length) return null;
  return {
    kind: 'card',
    id: 'recalls',
    title: 'Recalls on what is in the house',
    chip: null,
    lead: 'Pantopus doesn\'t know the brand and model of what is in your house, so it can\'t say whether yours is recalled. These are the federal recalls naming each kind; the CPSC\'s list says which brands and models.',
    rows,
    notes: [],
    // No "checked" date: the counts are cached for a day, so the render time would not be when they were read.
    source: 'Consumer Product Safety Commission',
    action: { label: 'Search the CPSC\'s recalls', url: CPSC_RECALLS_PAGE },
  };
}

module.exports = { claimsCard, recallsCard };
