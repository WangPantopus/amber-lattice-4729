'use strict';
// A spreadsheet's first sheet, row by row, holding only the columns asked for. Read as text from inside the zip, so a large roll isn't
// held in memory and nothing else in the sheet (owner names, mailing addresses) leaves this loop. Handles the cell types county exports use:
// numbers and text written in the cell. Shared strings aren't read; a sheet that needs them stops the build.

const { spawn } = require('node:child_process');

const decode = (text) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[name]));
const CELL = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs;

// The workbook's shared text table, in order, for a sheet whose text cells point into it (t="s"). It holds every text cell of the sheet,
// owner names included, but only the asked-for columns are looked up in it, and the table never leaves sheetRows.
async function sharedTable(file) {
  const unzip = spawn('unzip', ['-p', file, 'xl/sharedStrings.xml'], { stdio: ['ignore', 'pipe', 'ignore'] });
  unzip.stdout.setEncoding('utf8');
  const table = [];
  let rest = '';
  for await (const chunk of unzip.stdout) {
    rest += chunk;
    let end;
    while ((end = rest.indexOf('</si>')) >= 0) {
      const item = rest.slice(rest.indexOf('<si>') + 4, end);
      rest = rest.slice(end + 5);
      table.push(decode([...item.matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((m) => m[1]).join('')).trim());
    }
  }
  return table;
}

// With { sharedStrings: true } a sheet whose text cells point into the shared table is read too; without it such a sheet stops the build
// as before.
async function* sheetRows(file, columns, { sharedStrings = false } = {}) {
  const table = sharedStrings ? await sharedTable(file) : null;
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
        const shared = /t="s"/.test(attributes);
        if (shared && !table) throw new Error('The sheet uses shared strings');
        const value = /<(?:v|t)[^>]*>(.*?)<\/(?:v|t)>/s.exec(inner || '')?.[1];
        if (value === undefined) continue;
        if (shared) {
          // Only the header row and the asked-for columns are looked up.
          if (positions && !positions.includes(column)) continue;
          const text = table[Number(value)];
          if (text === undefined) throw new Error('A cell points past the shared text table');
          cells.set(column, text);
        } else cells.set(column, decode(value).trim());
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

module.exports = { sheetRows };
