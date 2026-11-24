'use strict';

/**
 * PFAS in a home's water system: EPA's fifth Unregulated Contaminant Monitoring Rule (UCMR 5, 2023-2025) results for
 * the public water system that serves the point, from EPA's own PFAS Analytic Tools service (layer 1, UCMR results by
 * system, updated as EPA releases data). U.S. government data, no key.
 *
 * The answer is the system's: how many PFAS results it reported and how many were at or above EPA's minimum reporting
 * level, never a test of this home's tap. EPA cautions against comparing places (systems that test more find more), so
 * no rating against other systems is made. Cached by water system id (PWSID), never by address.
 */

const { readThrough } = require('../placeSectionCache');

const UCMR_URL = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/PFAS_Analytic_Tools_Layers/FeatureServer/1/query';
const CYCLE = 'UCMR 5 (2023-2025)';
const DAY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;
const PWSID = /^[A-Z]{2}\d{7}$/;

async function query(params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${UCMR_URL}?${new URLSearchParams({ f: 'json', ...params })}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`UCMR ${res.status}`);
    const body = await res.json();
    if (body?.error) throw new Error(`UCMR ${body.error.code || 'error'}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A system's UCMR 5 PFAS results: `{ system, tested, found, contaminants }`, or null where EPA has none for it (a
 * system too small to be sampled, or not yet released).
 */
async function forSystem(pwsid) {
  const id = String(pwsid || '').trim().toUpperCase();
  if (!PWSID.test(id)) return null;
  const { payload } = await readThrough({
    cacheKey: `pws:${id}`,
    sectionId: '_ucmr5_pfas',
    reuseStored: true,
    ttlMs: 30 * DAY_MS,
    fetch: async () => {
      const where = `F_PWS_ID='${id}' AND UCMR_Cycle='${CYCLE}'`;
      const [all, found] = await Promise.all([
        query({ where, returnCountOnly: 'true' }),
        query({ where: `${where} AND Result_At_or_Above_UCMR_MRL='Yes'`, outFields: 'Contaminant,PWS_Name', returnGeometry: 'false', resultRecordCount: '2000' }),
      ]);
      const tested = Number(all?.count) || 0;
      if (!tested) return null;
      const rows = (found?.features || []).map((feature) => feature.attributes || {});
      return {
        system: rows[0]?.PWS_Name || null,
        tested,
        found: rows.length,
        contaminants: [...new Set(rows.map((row) => String(row.Contaminant || '').trim()).filter(Boolean))].sort(),
      };
    },
  });
  return payload || null;
}

/** The meters' row for a system's results: `{ label, level, word }`. */
function meterRow(result) {
  if (!result) return null;
  if (!result.found) return { label: 'PFAS in water', level: 1, word: `None found · ${result.tested} tests` };
  return { label: 'PFAS in water', level: 3, word: `Found in ${result.found} of ${result.tested} tests` };
}

module.exports = { forSystem, meterRow };
