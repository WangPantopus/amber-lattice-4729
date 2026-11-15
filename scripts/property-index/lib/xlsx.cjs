'use strict';
// A spreadsheet's first sheet, row by row, holding only the columns asked for. Read as text from inside the zip, so a large roll isn't
// held in memory and nothing else in the sheet (owner names, mailing addresses) leaves this loop. Handles the cell types county exports use:
// numbers and text written in the cell. Shared strings are read only when a connector asks (`sharedStrings`), and then only the strings its
// columns point to are kept: the table is streamed and every other string (owner names, mailing addresses) is passed over. Without the
// option a sheet that needs them stops the build.

const { spawn } = require('node:child_process');

const decode = (text) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[name]));
const CELL = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs;

async function* sheetRows(file, columns, { sharedStrings = false } = {}) {
  if (sharedStrings) {
    yield* sharedRows(file, columns);
    return;
  }
  const unzip = spawn('unzip', ['-p', file, 'xl/worksheets/sheet1.xml'], { stdio: ['ignore', 'pipe', 'ignore'] });
  unzip.stdout.setEncoding('utf8');
  let rest = '';
  let positions = null;
  for await (const chunk of unzip.stdout) {
    rest += chunk;
    let end;
    while ((end = rest.indexOf('</row>')) >= 0) {
      const row = rest.slice(0, end);
      rest = rest.slice(end + 6);
      const cells = new Map();
      for (const [, column, attributes, inner] of row.matchAll(CELL)) {
        if (/t="s"/.test(attributes)) throw new Error('The sheet uses shared strings');
        const value = /<(?:v|t)[^>]*>(.*?)<\/(?:v|t)>/s.exec(inner || '')?.[1];
        if (value !== undefined) cells.set(column, decode(value).trim());
      }
      if (!positions) {
        const header = new Map();
        for (const [column, name] of cells) if (!header.has(name)) header.set(name, column);
        const missing = columns.filter((name) => !header.has(name));
        if (missing.length) throw new Error(`The sheet no longer has ${missing.join(', ')}`);
        positions = columns.map((name) => header.get(name));
        continue;
      }
      const out = {};
      columns.forEach((name, i) => { out[name] = cells.get(positions[i]) ?? ''; });
      yield out;
    }
  }
}

/** A sheet's cells, row by row, as column -> { value, shared } (shared: the value is an index into the shared strings). */
async function* cellRows(file) {
  const unzip = spawn('unzip', ['-p', file, 'xl/worksheets/sheet1.xml'], { stdio: ['ignore', 'pipe', 'ignore'] });
  unzip.stdout.setEncoding('utf8');
  let rest = '';
  for await (const chunk of unzip.stdout) {
    rest += chunk;
    let end;
    while ((end = rest.indexOf('</row>')) >= 0) {
      const row = rest.slice(0, end);
      rest = rest.slice(end + 6);
      const cells = new Map();
      for (const [, column, attributes, inner] of row.matchAll(CELL)) {
        const value = /<(?:v|t)[^>]*>(.*?)<\/(?:v|t)>/s.exec(inner || '')?.[1];
        if (value !== undefined) cells.set(column, { value: decode(value).trim(), shared: /t="s"/.test(attributes) });
      }
      yield cells;
    }
  }
}

/** The shared strings at the wanted positions, streamed: no other string is kept. */
async function sharedAt(file, wanted) {
  const unzip = spawn('unzip', ['-p', file, 'xl/sharedStrings.xml'], { stdio: ['ignore', 'pipe', 'ignore'] });
  unzip.stdout.setEncoding('utf8');
  const found = new Map();
  let rest = '';
  let index = 0;
  for await (const chunk of unzip.stdout) {
    rest += chunk;
    let end;
    while ((end = rest.indexOf('</si>')) >= 0) {
      if (wanted.has(index)) {
        const item = rest.slice(rest.lastIndexOf('<si', end), end).replace(/<rPh[\s\S]*?<\/rPh>/g, '');
        found.set(index, decode([...item.matchAll(/<t(?:\s[^>]*)?>(.*?)<\/t>/gs)].map((m) => m[1]).join('')).trim());
      }
      rest = rest.slice(end + 5);
      index += 1;
    }
  }
  return found;
}

/** sheetRows for a sheet that keeps its text in shared strings: reads the sheet three times and the strings twice, keeping only what's asked. */
async function* sharedRows(file, columns) {
  let first = null;
  for await (const cells of cellRows(file)) { first = cells; break; }
  if (!first) throw new Error('The sheet has no header row');
  const headerStrings = await sharedAt(file, new Set([...first.values()].filter((c) => c.shared).map((c) => Number(c.value))));
  const header = new Map();
  for (const [column, cell] of first) {
    const name = cell.shared ? headerStrings.get(Number(cell.value)) : cell.value;
    if (name !== undefined && !header.has(name)) header.set(name, column);
  }
  const missing = columns.filter((name) => !header.has(name));
  if (missing.length) throw new Error(`The sheet no longer has ${missing.join(', ')}`);
  const positions = columns.map((name) => header.get(name));
  const wanted = new Set();
  let seen = false;
  for await (const cells of cellRows(file)) {
    if (!seen) { seen = true; continue; }
    for (const position of positions) {
      const cell = cells.get(position);
      if (cell?.shared) wanted.add(Number(cell.value));
    }
  }
  const strings = await sharedAt(file, wanted);
  seen = false;
  for await (const cells of cellRows(file)) {
    if (!seen) { seen = true; continue; }
    const out = {};
    columns.forEach((name, i) => {
      const cell = cells.get(positions[i]);
      out[name] = !cell ? '' : cell.shared ? (strings.get(Number(cell.value)) ?? '') : cell.value;
    });
    yield out;
  }
}

module.exports = { sheetRows };
