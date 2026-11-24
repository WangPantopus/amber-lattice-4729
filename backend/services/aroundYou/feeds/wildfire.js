/**
 * Wildfires near a region, from the National Interagency Fire Center's current incident list (WFIGS, read once a run
 * for the whole country). Kept: wildfires within 80 km of the centre, not fully contained, changed in the last three
 * days, and either 10 acres or more or within 25 km. Summer fires stay listed for months at 95 to 100% contained; the
 * three-day rule leaves those out.
 *
 * Link: the fire's InciWeb page when InciWeb lists it (matched on the dispatch unit and the name), else the fire's own
 * record in the national incident list.
 */

const { readJson, readFeed } = require('./http');
const { km, placeName, direction, dayLabel } = require('./place');

const SOURCE = 'wildfire:nifc';
const SERVICE = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query';
const INCIWEB_LIST = 'https://inciweb.wildfire.gov/incidents/rss.xml';
const FIELDS = [
  'IncidentName', 'IncidentSize', 'PercentContained', 'POOCounty', 'POOState', 'FireDiscoveryDateTime',
  'ModifiedOnDateTime_dt', 'UniqueFireIdentifier', 'IncidentTypeCategory',
];
const WITHIN_KM = 80;
const SMALL_WITHIN_KM = 25;
const MIN_ACRES = 10;
const CHANGED_MS = 3 * 24 * 3_600_000;
const KM_PER_MILE = 1.609344;

function slug(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// "AUSTIN" -> "Austin"; a name already in mixed case is left as written.
function fireName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  const cased = name === name.toUpperCase()
    ? name.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    : name;
  return /\bfire$/i.test(cased) ? cased : `${cased} Fire`;
}

// The country's wildfires that are still burning and changed lately, read once a run.
async function currentFires(now = Date.now()) {
  const params = new URLSearchParams({
    where: "IncidentTypeCategory='WF'",
    outFields: FIELDS.join(','),
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '4000',
    f: 'json',
  });
  const data = await readJson(`${SERVICE}?${params}`);
  if (data?.error) throw new Error(`wildfire list: ${data.error.message || 'error'}`);
  return (data?.features || [])
    .map(({ attributes: a = {}, geometry: g = {} }) => ({
      id: a.UniqueFireIdentifier,
      name: a.IncidentName,
      acres: Number(a.IncidentSize),
      contained: a.PercentContained == null ? null : Number(a.PercentContained),
      county: a.POOCounty,
      state: String(a.POOState || '').replace(/^US-/, ''),
      discovered: Number(a.FireDiscoveryDateTime) || null,
      changed: Number(a.ModifiedOnDateTime_dt) || null,
      lat: Number(g.y),
      lng: Number(g.x),
    }))
    .filter((fire) => fire.id && fire.name && Number.isFinite(fire.lat) && Number.isFinite(fire.lng)
      && !(fire.contained >= 100) && fire.changed && now - fire.changed <= CHANGED_MS);
}

// InciWeb's pages by slug ("vaglf-white-oak-flat-fire"); the slug starts with the dispatch unit.
async function inciwebPages() {
  const xml = await readFeed(INCIWEB_LIST, { accept: 'application/rss+xml, application/xml' });
  return [...xml.matchAll(/<link>\s*https?:\/\/inciweb\.wildfire\.gov\/incident-information\/([a-z0-9-]+)\s*<\/link>/gi)]
    .map((match) => match[1].toLowerCase());
}

function fireLink(fire, pages) {
  const unit = slug(String(fire.id).split('-')[1]);
  const name = slug(String(fire.name).replace(/\bfire$/i, ''));
  const page = unit && name && pages.find((candidate) => candidate.startsWith(`${unit}-`) && candidate.includes(name));
  if (page) return `https://inciweb.wildfire.gov/incident-information/${page}`;
  const params = new URLSearchParams({
    where: `UniqueFireIdentifier='${String(fire.id).replace(/'/g, "''")}'`, outFields: FIELDS.join(','), f: 'html',
  });
  return `${SERVICE}?${params}`;
}

function number(value) {
  return Math.round(value).toLocaleString('en-US');
}

// The rows for one region.
function wildfireRows(region, fires, pages) {
  const rows = [];
  for (const fire of fires) {
    const distance = km(region, fire.lat, fire.lng);
    if (distance > WITHIN_KM) continue;
    if (!(fire.acres >= MIN_ACRES) && distance > SMALL_WITHIN_KM) continue;
    const miles = Math.max(1, Math.round(distance / KM_PER_MILE));
    const size = Number.isFinite(fire.acres) && fire.acres > 0 ? `${number(fire.acres)} acres` : 'size not reported';
    const contained = fire.contained == null ? 'containment not reported' : `${Math.round(fire.contained)}% contained`;
    const title = `${fireName(fire.name)}: ${size}, ${contained}, ${miles} miles ${direction(region, fire.lat, fire.lng)} of ${placeName(region)}`;
    const county = fire.county ? `${fire.county} County${fire.state ? `, ${fire.state}` : ''}. ` : '';
    const found = fire.discovered ? `Found ${dayLabel(new Date(fire.discovered), region.timezone)}. ` : '';
    const body = `${county}${found}Reported by the National Interagency Fire Center; last updated ${dayLabel(new Date(fire.changed), region.timezone)}.`;
    rows.push({
      source: SOURCE, feedId: fire.id, category: 'safety', priority: 1, title, body, url: fireLink(fire, pages),
    });
  }
  return rows;
}

async function readWildfires() {
  const [fires, pages] = await Promise.all([currentFires(), inciwebPages().catch(() => [])]);
  return { fires, pages };
}

module.exports = { SOURCE, readWildfires, wildfireRows, fireName };
