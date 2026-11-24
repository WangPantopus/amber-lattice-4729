'use strict';

/**
 * Zoning, in words: the government whose code sets a home's zoning district, and its own page saying what each district
 * allows. Pantopus doesn't say what may be built; the government's page does. A hand-read table, official pages only.
 *
 * Clark County, WA's record writes a zoning code with its government's mark after it ("R-6 : VAN"), so the mark picks
 * the government; the district is the part before it.
 */

// County FIPS → the record's government mark → the government and its page. Read November 23, 2026, on each government's
// own site or the official code host it links to (codepublishing.com's old chapter links no longer reach the chapter).
//   `codeChanged`: the government replaced its districts after the county's record was written, so the page names
//   different districts; the link then doesn't name the record's code.
//   `pageFor(district)`: where the code splits a government's districts across chapters.
const CLARK_URBAN = 'https://ecode360.com/50978625'; // Chapter 40.220, urban residential districts
const CLARK_RURAL = 'https://ecode360.com/50978441'; // rural and resource districts
const GOVERNMENTS = {
  53011: {
    // Vancouver Municipal Code 20.410, Zoning Districts; its new districts took effect July 31, 2026.
    VAN: { name: 'Vancouver', url: 'https://vancouver.municipal.codes/VMC/20.410', codeChanged: true },
    // Camas Municipal Code 18.07, Use Authorization (linked from the city's Development Services page).
    CAM: { name: 'Camas', url: 'https://library.municode.com/wa/camas/codes/code_of_ordinances?nodeId=TIT18ZO_CH18.07USAU' },
    // Washougal Municipal Code Title 18, Zoning (linked from cityofwashougal.us/369/Zoning).
    WAS: { name: 'Washougal', url: 'https://ecode360.com/49441579' },
    // Battle Ground Municipal Code Title 17, Zoning.
    BAG: { name: 'Battle Ground', url: 'https://ecode360.com/48663673' },
    // Ridgefield Development Code 18.205.020, the master use table (linked from ridgefieldwa.us/196/Zoning).
    RGF: { name: 'Ridgefield', url: 'https://library.municode.com/wa/ridgefield/codes/code_of_ordinances?nodeId=CO_TIT18DECO_CH18.205US_18.205.020MAUSTA' },
    // La Center Municipal Code, Division 2, Zoning.
    LAC: { name: 'La Center', url: 'https://ecode360.com/46860538' },
    // Yacolt Municipal Code Title 18, Zoning.
    YAC: { name: 'Yacolt', url: 'https://ecode360.com/47303632' },
    // Woodland Municipal Code Title 17, Zoning.
    WDL: { name: 'Woodland', url: 'https://library.municode.com/wa/woodland/codes/code_of_ordinances?nodeId=TIT17ZO' },
    // Clark County Code Title 40 (linked from clark.wa.gov/community-development/unified-development-code-title-40).
    CLK: {
      name: 'Clark County',
      url: 'https://clark.wa.gov/community-development/unified-development-code-title-40',
      pageFor: (district) => (/^(R1-\d|R$|OR\b)/.test(district) ? CLARK_URBAN
        : /^(R-\d|RC-|AG-|FR-|CR-)/.test(district) ? CLARK_RURAL : null),
    },
  },
};

/** `{ district, name, url }` for a copy's zoning code, or null where the table has no page for it. */
function zoningOf(copy) {
  const raw = typeof copy?.facts?.zoning === 'string' ? copy.facts.zoning.trim() : '';
  if (!raw) return null;
  const marked = /^(.+?)\s*:\s*([A-Z]{2,4})$/.exec(raw);
  const district = (marked ? marked[1] : raw).trim();
  const government = marked ? GOVERNMENTS[String(copy.jurisdiction)]?.[marked[2]] : null;
  if (!government) return { district, name: null, url: null, codeChanged: false };
  return { district, name: government.name, url: government.pageFor?.(district) || government.url, codeChanged: Boolean(government.codeChanged) };
}

/** The Lot and zoning block's action: the government's own page, or null. */
function actionFor(copy) {
  const zoning = zoningOf(copy);
  if (!zoning?.url) return null;
  if (zoning.codeChanged) return { label: `Read ${zoning.name}'s zoning code`, url: zoning.url };
  return { label: `Read what ${zoning.district} allows on ${zoning.name}'s page`, url: zoning.url };
}

module.exports = { zoningOf, actionFor, GOVERNMENTS };
