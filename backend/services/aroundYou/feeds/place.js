/**
 * A region as the feeds see it. Its centre is the first person's point, so every outside request and every distance
 * uses the centre rounded to two decimals (about 1 km), and no point is ever logged.
 */

const { haversineM } = require('../../seederProvisioningService');

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function centre(region) {
  return { lat: round2(region.lat), lng: round2(region.lng) };
}

function km(region, lat, lng) {
  const c = centre(region);
  return haversineM(c.lat, c.lng, Number(lat), Number(lng)) / 1000;
}

// The place a title is measured from: "Camas, WA" -> "Camas", "Portland Metro" -> "Portland".
function placeName(region) {
  const name = String(region.display_name || '').split(',')[0].replace(/\s+metro$/i, '').trim();
  return name || 'here';
}

const POINTS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

// The compass direction from the region's centre to a point.
function direction(region, lat, lng) {
  const c = centre(region);
  const toRad = (deg) => (deg * Math.PI) / 180;
  const y = Math.sin(toRad(lng - c.lng)) * Math.cos(toRad(lat));
  const x = Math.cos(toRad(c.lat)) * Math.sin(toRad(lat))
    - Math.sin(toRad(c.lat)) * Math.cos(toRad(lat)) * Math.cos(toRad(lng - c.lng));
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return POINTS[Math.round(bearing / 45) % 8];
}

// A date as people read it, in the region's time zone: "Tuesday, Nov 24".
function dayLabel(at, timeZone, { weekday = false, year = false } = {}) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'America/Los_Angeles',
    ...(weekday ? { weekday: 'long' } : {}),
    month: 'short',
    day: 'numeric',
    ...(year ? { year: 'numeric' } : {}),
  }).format(at);
}

module.exports = { round2, centre, km, placeName, direction, dayLabel };
