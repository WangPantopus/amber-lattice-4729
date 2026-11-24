#!/usr/bin/env node
'use strict';

/**
 * The county pages' counts, per county, for the last N days (Pacific days):
 *
 *   visits     page visits, from the pages' own beacon (visits.js), crawlers left out
 *   lookups    distinct browsers whose lookup preview was seen with the route county-page:<FIPS> (t0_preview_viewed)
 *   signups    distinct browsers that opened the sign-up form on that route (register_started)
 *   accounts   accounts made by those browsers afterwards (t1_account_created joined by the funnel's anonymous id)
 *
 * Counts only: no anon id, account or address is printed. Run with the backend's environment:
 *   node backend/services/countyGuide/report.cjs [--days 30] [--json]
 */

const supabaseAdmin = require('../../config/supabaseAdmin');
const places = require('./places');
const { readDays } = require('./visits');

const args = process.argv.slice(2);
const days = Math.max(1, Math.min(90, Number(args[args.indexOf('--days') + 1]) || 30));
const asJson = args.includes('--json');
const ROUTE = /^county-page:(\d{5})$/;

async function rows(query) {
  const all = [];
  for (let from = 0; from < 100000; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

async function main() {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const byCounty = new Map();
  const row = (fips) => {
    if (!byCounty.has(fips)) byCounty.set(fips, { fips, visits: 0, lookups: new Set(), signups: new Set(), accounts: 0 });
    return byCounty.get(fips);
  };

  for (const counts of Object.values(await readDays(days))) {
    for (const [fips, n] of Object.entries(counts)) row(fips).visits += n;
  }

  const funnel = await rows(() => supabaseAdmin.from('FunnelEvent')
    .select('event_type, anon_id, meta, created_at')
    .in('event_type', ['t0_preview_viewed', 'register_started'])
    .like('meta->>route', 'county-page:%')
    .gte('created_at', since)
    .order('created_at', { ascending: true }));
  const firstSeen = new Map();
  for (const event of funnel) {
    const match = ROUTE.exec(event.meta?.route || '');
    if (!match || !event.anon_id) continue;
    const county = row(match[1]);
    (event.event_type === 'register_started' ? county.signups : county.lookups).add(event.anon_id);
    if (!firstSeen.has(event.anon_id)) firstSeen.set(event.anon_id, { fips: match[1], at: event.created_at });
  }

  const anonIds = [...firstSeen.keys()];
  for (let at = 0; at < anonIds.length; at += 200) {
    const { data, error } = await supabaseAdmin.from('FunnelEvent')
      .select('anon_id, created_at')
      .eq('event_type', 't1_account_created')
      .in('anon_id', anonIds.slice(at, at + 200));
    if (error) throw new Error(error.message);
    for (const account of data || []) {
      const seen = firstSeen.get(account.anon_id);
      if (seen && account.created_at >= seen.at) row(seen.fips).accounts += 1;
    }
  }

  const report = [...byCounty.values()]
    .map((county) => {
      const place = places.countyByFips(county.fips);
      return {
        fips: county.fips,
        county: place ? `${place.name}, ${place.state.abbr}` : county.fips,
        visits: county.visits,
        lookups: county.lookups.size,
        signups: county.signups.size,
        accounts: county.accounts,
      };
    })
    .sort((a, b) => b.visits - a.visits || b.lookups - a.lookups);

  if (asJson) {
    console.log(JSON.stringify({ days, counties: report }, null, 2));
    return;
  }
  const total = report.reduce((sum, r) => ({ visits: sum.visits + r.visits, lookups: sum.lookups + r.lookups, signups: sum.signups + r.signups, accounts: sum.accounts + r.accounts }), { visits: 0, lookups: 0, signups: 0, accounts: 0 });
  console.log(`County pages, last ${days} days: ${total.visits} visits, ${total.lookups} lookups, ${total.signups} sign-ups started, ${total.accounts} accounts`);
  for (const r of report.slice(0, 50)) {
    console.log(`${r.county.padEnd(40)} ${String(r.visits).padStart(7)} visits ${String(r.lookups).padStart(5)} lookups ${String(r.signups).padStart(4)} sign-ups ${String(r.accounts).padStart(4)} accounts`);
  }
}

main().catch((err) => {
  console.error(`The county pages report failed: ${err.message}`);
  process.exit(1);
});
