'use strict';
// Wise County, Texas: the Wise County Appraisal District's certified roll (PACS layout 8.0.32), from the Data Downloads tab of its public
// Reports page. The page fetches its files through its portal's file service with an anonymous visitor token that the portal hands every
// visitor; this reader fetches the same way, the roll only, and never calls the portal's property search or account services. Neither the
// page, the layout nor the roll states terms. Baths are on most homes, bedrooms on almost none, so the county stays short of the go-live
// bar until the district adds them.

const { pacsCounty } = require('../lib/pacs-county.cjs');
const { USER_AGENT } = require('../lib/tables.cjs');

const SITE = 'www.wise-cad.com';
const API = 'https://prod-container.trueprodigyapi.com';

async function call(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'User-Agent': USER_AGENT, Origin: `https://${SITE}`, ...options.headers }, signal: AbortSignal.timeout(120000) });
  // A challenge or a refusal is a block: stop, never work around it.
  if (!response.ok) throw new Error(`The district's portal answered ${response.status} for ${new URL(url).pathname}`);
  return response.json();
}

// The newest certified roll on the Data Downloads tab, and the visitor token the page itself would send for it.
async function locate() {
  const office = (await call(`${API}/trueprodigy/officelookup/${SITE}`)).results?.office;
  if (!office) throw new Error('The portal no longer names the district\'s office');
  const token = (await call(`${API}/trueprodigy/cadpublic/auth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ office }) })).user?.token;
  if (!token) throw new Error('The portal no longer issues a visitor token');
  const headers = { Authorization: token, 'Cache-Control': 'no-cache' };
  const reports = (await call(`${API}/public/reportcategory/Data%20Downloads/search`, { headers })).results || [];
  const rolls = reports.filter((report) => /^Cert/i.test(report.reportType || '') && /Certified Roll|Certified Data . All Property$/i.test(report.reportName || '') && /\.zip$/i.test(report.reportS3ID || ''));
  if (!rolls.length) throw new Error('The Data Downloads tab no longer lists a certified roll');
  const newest = rolls.sort((a, b) => Number(b.reportYear) - Number(a.reportYear) || String(b.createDt).localeCompare(String(a.createDt)))[0];
  const s3 = newest.reportS3ID;
  const name = `${newest.reportYear}-${s3.split('/').pop()}`;
  // Since November 2026 the file service answers with a short-lived signed link to the file, which the page then opens; the link
  // carries its own signature, so it's fetched without the visitor token.
  const file = await call(`${API}/public/filedownload/${s3.split('/').map(encodeURIComponent).join('/')}`, { headers });
  if (!/^https:\/\/[^/]+\.amazonaws\.com\//.test(file?.url || '')) throw new Error('The portal\'s file service no longer answers with a link to the roll');
  return { url: file.url, name, headers: {} };
}

module.exports = pacsCounty({
  fips: '48497',
  county: 'Wise County',
  publisher: 'Wise County Appraisal District',
  source: 'tx-wise',
  page: 'https://www.wise-cad.com/reports',
  locate,
  bedrooms: ['Number of Bedrooms'],
  baths: ['BATHS', 'Plumbing'],
  // The district's state code list: A3 is a waterfront house, not a townhouse.
  uses: { A3: 'house' },
});
