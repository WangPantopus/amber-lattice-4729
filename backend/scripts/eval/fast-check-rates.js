#!/usr/bin/env node
/**
 * Fast check tries by kind and week (FASTVERIFY). Every try of a phone, location or bill check writes one
 * AddressVerificationEvent row (event_type 'fast_check', provider = the kind, status pass | miss | refused | error,
 * reasons = codes). Those rows hold no person, home, address or number, so this prints counts only.
 *
 * usage: node scripts/eval/fast-check-rates.js [--weeks <n>] [--json]
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (the database to read).
 */

const STATUSES = ['pass', 'miss', 'refused', 'error'];
const KINDS = ['phone', 'location', 'document'];

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

/** Monday of the ISO week holding this time, as YYYY-MM-DD (UTC). */
function weekOf(iso) {
  const day = new Date(iso);
  const monday = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

async function main() {
  // eslint-disable-next-line global-require
  const db = require('../../config/supabaseAdmin');
  const weeks = Math.max(1, Math.min(104, Number.parseInt(option('weeks', '12'), 10) || 12));
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('AddressVerificationEvent').select('provider, status, reasons, created_at')
      .eq('event_type', 'fast_check').gte('created_at', since).order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`could not read the tries: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const table = new Map();
  for (const row of rows) {
    const key = `${weekOf(row.created_at)}|${row.provider}`;
    if (!table.has(key)) table.set(key, { week: weekOf(row.created_at), kind: row.provider, reasons: {}, ...Object.fromEntries(STATUSES.map((s) => [s, 0])) });
    const cell = table.get(key);
    if (STATUSES.includes(row.status)) cell[row.status] += 1;
    for (const reason of Array.isArray(row.reasons) ? row.reasons : []) cell.reasons[reason] = (cell.reasons[reason] || 0) + 1;
  }
  const lines = [...table.values()].sort((a, b) => a.week.localeCompare(b.week) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ since, weeks, total: rows.length, rows: lines }, null, 2)}\n`);
    return;
  }
  console.log(`Fast check tries since ${since.slice(0, 10)} (${rows.length} in all)`);
  console.log(['week of', 'kind', ...STATUSES, 'pass rate', 'reasons'].join('\t'));
  for (const line of lines) {
    const checked = line.pass + line.miss;
    const rate = checked ? `${Math.round((100 * line.pass) / checked)}%` : '-';
    const reasons = Object.entries(line.reasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(', ');
    console.log([line.week, line.kind, ...STATUSES.map((s) => line[s]), rate, reasons || '-'].join('\t'));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
