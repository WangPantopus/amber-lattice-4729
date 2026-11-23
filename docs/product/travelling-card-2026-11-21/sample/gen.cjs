// Travelling card sample: builds site/index.html from page.html + the US outline (us-atlas, already projected to
// 975x610) + the towns placed with the same projection. usage: node gen.cjs
const fs = require('fs');
const path = require('path');
const topojson = require('topojson-client');
const us = require('us-atlas/states-albers-10m.json');

(async () => {
  const { geoAlbersUsa } = await import('d3-geo');
  const proj = geoAlbersUsa().scale(1300).translate([487.5, 305]);

  const ring = (pts) => {
    let out = ''; let px; let py;
    pts.forEach(([x, y], i) => {
      const rx = Math.round(x); const ry = Math.round(y);
      if (i && rx === px && ry === py) return;
      out += `${i ? 'L' : 'M'}${rx},${ry}`; px = rx; py = ry;
    });
    return `${out}Z`;
  };
  const toPath = (geom) => {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    return polys.map((poly) => poly.map(ring).join('')).join('');
  };
  const states = {};
  for (const f of topojson.feature(us, us.objects.states).features) {
    if (f.properties.name === 'District of Columbia') continue;
    states[f.properties.name] = toPath(f.geometry);
  }

  // [first name, shown name, town, state code, state name, lon, lat, month, day]
  const stops = [
    ['Juniper', 'Juniper H.', 'Vancouver', 'WA', 'Washington', -122.6615, 45.6387, 'Nov', 21],
    ['Hazel', 'Hazel Q.', 'Boise', 'ID', 'Idaho', -116.2023, 43.615, 'Nov', 23],
    ['Theo', 'Theo B.', 'Denver', 'CO', 'Colorado', -104.9903, 39.7392, 'Nov', 25],
    ['Nora', 'Nora P.', 'Austin', 'TX', 'Texas', -97.7431, 30.2672, 'Nov', 28],
    ['Owen', 'Owen S.', 'Tampa', 'FL', 'Florida', -82.4572, 27.9506, 'Dec', 1],
    ['Ivy', 'Ivy M.', 'Asheville', 'NC', 'North Carolina', -82.5515, 35.5951, 'Dec', 3],
    ['Cass', 'Cass R.', 'Columbus', 'OH', 'Ohio', -82.9988, 39.9612, 'Dec', 5],
    ['Rory', 'Rory V.', 'Portland', 'ME', 'Maine', -70.2553, 43.6591, 'Dec', 8],
    ['Holly', 'Holly L.', 'Duluth', 'MN', 'Minnesota', -92.1005, 46.7867, 'Dec', 10],
    ['Maya', 'Maya O.', 'Santa Fe', 'NM', 'New Mexico', -105.9378, 35.687, 'Dec', 12],
  ].map(([first, shown, town, st, state, lon, lat, mon, day]) => {
    const [x, y] = proj([lon, lat]);
    return { first, shown, town, st, state, lon, lat, mon, day, x: Math.round(x), y: Math.round(y) };
  });

  const data = JSON.stringify({ states, stops });
  const page = fs.readFileSync(path.join(__dirname, 'page.html'), 'utf8');
  if (!page.includes('/*__DATA__*/')) throw new Error('page.html has no data slot');
  const out = page.replace('/*__DATA__*/', () => `const DATA = ${data};`);
  fs.writeFileSync(path.join(__dirname, '../site/index.html'), out);
  console.log(`index.html ${(out.length / 1024).toFixed(0)} KB, map ${(data.length / 1024).toFixed(0)} KB, ${Object.keys(states).length} states`);
})().catch((e) => { console.error(e); process.exit(1); });
