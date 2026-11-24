'use strict';

/**
 * The home record page's words and number formats (contract v1, ~/pantopus-home-record/SPEC.md section 3). Strings are
 * final words: the apps draw them as they come and never build a sentence.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];

const positive = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);
const grouped = (n, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits });
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/** "Fifteen" for 15, "21" past twenty: the start of a sentence. */
const countWord = (n) => (n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n));

/** "Nov 3, 2026" from "2026-11-03"; null otherwise. */
function dateLabel(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/** "Jun 2022" from a date; null otherwise. */
function monthLabel(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{1,2})/.exec(value.trim());
  if (!match) return null;
  const [year, month] = match.slice(1).map(Number);
  return month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${year}` : null;
}

// The record's kind of home (identity.js `home_type`), as a person says it.
const HOME_TYPES = {
  house: 'House',
  townhouse: 'Townhouse',
  condo: 'Condo',
  apartment: 'Apartment',
  studio: 'Studio',
  multi_unit: 'Multi-unit building',
  mobile_home: 'Mobile home',
};

const plural = (n, one, many) => `${grouped(n, 2)} ${n === 1 ? one : many}`;

const PRIVACY_NOTE = 'Only the confirmed owner sees those parts. People who look up this address never do, and no owner\'s name is shown to anyone.';
const AREA_NOTE = 'Ratings for the area, not a test of this home.';

const FOOTERS = {
  lookup: 'A free look at what is public about this address. Nothing here is advice, and nothing is for sale.',
  member: 'A free look at what is public about this address. Nothing here is advice, and nothing is for sale.',
  owner: 'Every line names the office it came from. This is your home\'s public record, not advice.',
};

// The founder's words for the promise (SPEC rule 10): free; verify your identity and your address; usually within hours.
const PROMISE = {
  title: 'Yours for proving it\'s your home',
  body: 'No payment, no card, no subscription. Show that you own this home and the whole record opens.',
  steps: [
    { title: 'Show one document', line: 'A deed, a closing statement or a property tax bill.' },
    { title: 'Confirm it\'s you', line: 'A photo of your ID and a selfie.' },
    { title: 'We check it, usually within hours', line: 'Then every part above opens, and stays open.' },
  ],
};

module.exports = {
  positive, grouped, money, countWord, dateLabel, monthLabel, plural, HOME_TYPES, PRIVACY_NOTE, AREA_NOTE, FOOTERS, PROMISE,
};
