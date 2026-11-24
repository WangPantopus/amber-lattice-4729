'use strict';
// Which lines of a county's sales table are this home changing hands at that price. A deed or a reason that moves title
// without selling the home isn't a sale: an easement, a quit claim, a gift, part of an interest, a boundary change, timber,
// a transfer inside a company, a correction. A real sale stays a sale however it came about: an estate, a family, a foreclosure, a new
// house, several parcels sold together (as for Clark, #3592).

const NOT_A_SALE = /QUIT ?-?CLAIM|\bQCD?\b|EASEMENT|RIGHT[- ]OF[- ]WAY|\bR\/W\b|\bGIFT|LOVE ?(AND|&) ?AFFECTION|PARTIAL INT|PART(IAL)? INTEREST|LESS THAN (A )?(FULL|100)|\d+ ?% INTEREST|PERCENT INTEREST|BOUNDARY|SEGREGATION|TIMBER|CORP(ORATE)? TRANSFER|WITHIN A CORPORATION|CORRECT|CORCT|DEED OF TRUST|\bMORTGAGE\b|\bLIEN\b|RELEASE|ORDER OF TAKING|CONDEMN|NO REAL PROPERTY/i;

// Below this a line is a recording fee or a token, whatever its deed says.
const TOKEN_PRICE = 1000;

/** Every word a county says about a line (its deed type, its reason), and its price. */
function isHomeSale(price, ...words) {
  return Number(price) > TOKEN_PRICE && !words.some((text) => NOT_A_SALE.test(String(text ?? '')));
}

// A home's recorded history keeps its newest lines, so one parcel a developer split into hundreds can't fill a page.
const MOST_LINES = 30;

/**
 * One line of a county's sales table as recorded history (facts.js `recorded_history`), or null when it has no date or no word
 * for what it is. `sale`: this home changing hands at that price, by the connector's own rule for its last sale, so the
 * newest sale here is the Last sale row; any other line keeps no price, since a price on a quit claim or an easement isn't
 * the home's. `word`: the county's own word for the line, in sentence case; a sale needs none ("Sale" on screens). `parcels`:
 * how many accounts the line's deed covers, where more than one, so its price reads as theirs together. Never a name.
 */
function historyLine({ date, sale, word = null, price = null, document = null, parcels = null }) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : null;
  if (!day || (!sale && !word)) return null;
  const line = { date: day, sale: Boolean(sale), word: word || null };
  if (sale && Number(price) > 0) line.price = Number(price);
  const number = String(document ?? '').trim();
  if (number && !/^(NULL|NONE|N\/A|0+)$/i.test(number)) line.document = number;
  if (Number(parcels) > 1) line.parcels = Number(parcels);
  return line;
}

/**
 * A home's lines, newest first (a sale before the other lines of its day), as the fact a release holds; null with none.
 * `since`: the first year the county's table holds, which screens say, since nothing older is in it.
 */
function recordedHistory(lines, { since }) {
  const kept = lines.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date) || Number(b.sale) - Number(a.sale) || String(a.document || '').localeCompare(String(b.document || '')));
  return kept.length ? { since: String(since), lines: kept.slice(0, MOST_LINES) } : null;
}

/**
 * A county's name for a kind of line as a screen says it: "Quit Claim Deed" and "QUIT CLAIM DEED" read "Quit claim deed".
 * Short all-capital words a county writes that way inside mixed case stay ("US Marshall Deed"), and so do initials ("U.S."). Null for a name that says
 * nothing ("Unknown", "Other", "N/A").
 */
function countyWord(text) {
  const name = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!name || /^(unknown|other|none|n\/?a|misc\.?|miscellaneous)$/i.test(name)) return null;
  const mixed = /[a-z]/.test(name);
  const words = name.split(' ').map((word, i) => {
    if ((mixed && /^[A-Z]{2,4}$/.test(word)) || /^([A-Z]\.){2,}$/.test(word)) return word;
    const lower = word.toLowerCase();
    return i === 0 ? lower.replace(/[a-z]/, (letter) => letter.toUpperCase()) : lower;
  });
  return words.join(' ');
}

module.exports = { isHomeSale, TOKEN_PRICE, NOT_A_SALE, historyLine, recordedHistory, countyWord };
