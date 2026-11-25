#!/usr/bin/env node
/**
 * Made-up names: CI guard on the one door to "who wrote it".
 *
 * A post or a reply under a made-up name is stored under one system account, and the account that wrote it is kept
 * only in "PenNameOwner", reached through the pen_name_* database functions. backend/services/penName/owner.js is
 * the only file that may call those functions or name that table. If any other file could, a feed, a profile or a
 * notice written later might join a made-up name to its account without anyone noticing.
 *
 * This script fails (exit 1) when:
 *   1. a backend file other than owner.js calls a pen_name_* function or names "PenNameOwner"; or
 *   2. the system account's id differs between owner.js, notificationService.js (which can't require owner.js at
 *      load) and the migration that creates the account.
 *
 * Run via:    node backend/scripts/ci/check-pen-name-owner.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND = path.join(REPO_ROOT, 'backend');
const OWNER_FILE = path.join(BACKEND, 'services', 'penName', 'owner.js');
const SKIP_DIRS = new Set(['node_modules', 'tests', 'coverage', '.git']);
const SELF = path.resolve(__filename);

const FORBIDDEN = [
  { name: 'a pen_name_* database function', test: (line) => /rpc\(\s*['"`]pen_name_/.test(line) },
  { name: 'the "PenNameOwner" table', test: (line) => /['"`]PenNameOwner['"`]/.test(line) },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(c|m)?js$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isComment(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function main() {
  const problems = [];
  for (const file of walk(BACKEND)) {
    if (file === OWNER_FILE || file === SELF) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (isComment(line)) return;
      for (const rule of FORBIDDEN) {
        if (rule.test(line)) problems.push(`${path.relative(REPO_ROOT, file)}:${index + 1} uses ${rule.name}`);
      }
    });
  }

  const idIn = (file, pattern) => (pattern.exec(fs.readFileSync(file, 'utf8')) || [])[1] || null;
  const UUID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
  const ownerId = idIn(OWNER_FILE, new RegExp(`SYSTEM_ACCOUNT_ID = '${UUID}'`));
  const noticeId = idIn(path.join(BACKEND, 'services', 'notificationService.js'), new RegExp(`PEN_NAME_SYSTEM_ACCOUNT_ID = '${UUID}'`));
  const migrationsDir = path.join(REPO_ROOT, 'supabase', 'migrations');
  const migration = fs.readdirSync(migrationsDir).find((name) => name.endsWith('_pen_names.sql'));
  const migrationId = migration ? idIn(path.join(migrationsDir, migration), new RegExp(`SELECT '${UUID}'::uuid`)) : null;
  if (!ownerId || ownerId !== noticeId || ownerId !== migrationId) {
    problems.push(`the system account's id differs: owner.js ${ownerId}, notificationService.js ${noticeId}, migration ${migrationId}`);
  }

  if (!problems.length) {
    process.stdout.write('OK: only services/penName/owner.js reaches "who wrote it".\n');
    return 0;
  }
  process.stdout.write('FAIL: made-up names, who wrote it:\n');
  for (const problem of problems) process.stdout.write(`  - ${problem}\n`);
  process.stdout.write('Go through backend/services/penName/owner.js instead (docs/product/made-up-names/README.md).\n');
  return 1;
}

if (require.main === module) process.exit(main());
module.exports = { main };
