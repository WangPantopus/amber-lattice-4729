// Every require() the API (app.js) and the worker (worker.js) can reach by a literal path resolves: a renamed or
// missing file, or a package that isn't a production dependency of the backend, fails here instead of crashing them
// after a release (Jest never loads jobs/index.js, so a dangling require there passed CI once). Nothing is executed:
// the files are only read, so no secrets, database or network are needed.
//
//   node scripts/deploy/check-requires.cjs [root] [entry ...]
//
// CI runs it inside the disposable production image (root /app, its own node_modules), so a file the image leaves out
// fails too. Locally: node scripts/deploy/check-requires.cjs backend
const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');

const root = path.resolve(process.argv[2] || '/app');
const entries = (process.argv.length > 3 ? process.argv.slice(3) : ['app.js', 'worker.js']).map((file) => path.join(root, file));
const builtins = new Set(builtinModules);
const dependencies = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies || {}));
const REQUIRE = /\brequire\(\s*(['"])([^'"\n]+)\1\s*\)/g;
// Requires meant to find nothing while their module is absent: each catches MODULE_NOT_FOUND and carries on. A new one
// fails this check until it's listed here, with why.
const OPTIONAL = new Set([
  // The Pulse redesign's composer checks: compose fails open while the module isn't there (its contract section 2.5).
  'services/pulse/compose.js ./safety/composerChecks',
]);

// A require inside a comment isn't one.
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// The package a specifier names: "@scope/name" or "name", without a subpath.
const packageOf = (spec) => spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/');
const shown = (file) => path.relative(root, file) || file;

const seen = new Set();
const queue = [...entries];
const problems = [];
const packages = new Set();
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    problems.push(`${shown(file)} can't be read (${err.code})`);
    continue;
  }
  for (const [, , spec] of code(text).matchAll(REQUIRE)) {
    const bare = spec.startsWith('node:') ? spec.slice(5) : spec;
    if (builtins.has(bare)) continue;
    const local = spec.startsWith('.') || spec.startsWith('/');
    if (!local && !dependencies.has(packageOf(spec))) {
      problems.push(`${shown(file)}: require('${spec}') names a package that isn't in the backend's dependencies`);
      continue;
    }
    let resolved;
    try {
      resolved = require.resolve(spec, { paths: [path.dirname(file)] });
    } catch {
      if (!OPTIONAL.has(`${shown(file)} ${spec}`)) problems.push(`${shown(file)}: require('${spec}') doesn't resolve`);
      continue;
    }
    if (!local) packages.add(packageOf(spec));
    else if (/\.c?js$/.test(resolved) && !resolved.split(path.sep).includes('node_modules')) queue.push(resolved);
  }
}

if (problems.length) {
  console.error(`Startup requires: ${problems.length} problem${problems.length === 1 ? '' : 's'} reachable from ${entries.map(shown).join(', ')}:`);
  for (const line of problems) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`Startup requires resolve: ${seen.size} files reachable from ${entries.map(shown).join(', ')}, ${packages.size} packages`);
