// A Moment's weather stamp ("31°F · Snow", plan "Moments: Text and Draw, and the Live mark with weather", Part 3,
// approved 2026-11-20): the weather right now at a point, as the Post sheet offers it (POST /place-preview with
// `weather: true`) and as a Moment taken here keeps it (POST / with `show_weather`). The server always reads it
// itself; a value a phone sends is never stored.
//
// It reads the one weather entry point (context/weatherProvider.fetchWeather: WeatherKit, then Open-Meteo, cached per
// ~5 km for 10 minutes) within a short budget, takes only a fresh reading (served live or from that cache, never the
// hours-old copy Open-Meteo falls back on when it is down, nor a failure), and folds the sky into nine plain kinds
// (placeIntelligenceService.mapConditionCode), because the two sources name finer conditions differently. Strong wind
// reads "Wind 38 mph" whatever the sky. It never throws and never waits past its budget: no reading, no stamp.

const logger = require('../../utils/logger');
const { fetchWeather } = require('../context/weatherProvider');

// How long a post or the Post sheet waits for the weather. The read keeps going past it and fills the cache, so the
// post that follows the sheet usually finds it there.
const BUDGET_MS = 2000;
// The sources that count as now: a live read, or the cache that holds one for 10 minutes. Never 'cache_stale' (up to
// 6 hours old), 'error' or 'unavailable'.
const FRESH_SOURCES = new Set(['live', 'cache']);
// A backstop on top of the source: a reading older than this is never shown as now.
const MAX_AGE_MS = 30 * 60 * 1000;
// From this wind speed the stamp names the wind instead of the sky.
const STRONG_WIND_MPH = 25;
const WORDS = {
  clear: 'Clear',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  rain: 'Rain',
  snow: 'Snow',
  sleet: 'Sleet',
  thunderstorm: 'Thunderstorm',
  wind: 'Windy',
};
const KINDS = Object.keys(WORDS);

/** A number from a reading, or null (a missing value is not 0). */
function numberOf(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The stamp a fetchWeather result makes, { temp_f, kind, label }, or null when it isn't a fresh reading of the
 * temperature and the sky. `kind` is one of KINDS (the sky, for the pill's icon); `label` the words the pill shows.
 */
function stampOf(result, now = Date.now()) {
  if (!result || !FRESH_SOURCES.has(result.source) || !result.current) return null;
  const fetchedAt = Date.parse(result.fetchedAt || '');
  if (!Number.isFinite(fetchedAt) || now - fetchedAt > MAX_AGE_MS) return null;
  const { current } = result;
  const temp = numberOf(current.temp_f);
  if (temp == null || !current.condition_code) return null;
  // Read here, not at load: the Moments store reads stored stamps through this module without Place's services.
  const { mapConditionCode } = require('../placeIntelligenceService');
  const kind = mapConditionCode(current.condition_code);
  const wind = numberOf(current.wind_mph);
  const label = wind != null && wind >= STRONG_WIND_MPH ? `Wind ${Math.round(wind)} mph` : WORDS[kind];
  // `|| 0`: a reading just below 0°F rounds to 0, never to -0.
  return { temp_f: Math.round(temp) || 0, kind, label };
}

/** The weather stamp at a point right now, or null: within `budgetMs`, never throws. */
async function weatherAt(latitude, longitude, { budgetMs = BUDGET_MS } = {}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const started = Date.now();
  let timer = null;
  try {
    // The read goes on after the budget (it fills the cache); its late answer, or a late failure, is dropped.
    const reading = Promise.resolve().then(() => fetchWeather(latitude, longitude)).catch((error) => {
      logger.warn('moments.weather.failed', { error: error.message });
      return null;
    });
    const result = await Promise.race([
      reading,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(undefined), budgetMs);
        if (typeof timer.unref === 'function') timer.unref();
      }),
    ]);
    if (result === undefined) {
      logger.info('moments.weather.over_budget', { budget_ms: budgetMs });
      return null;
    }
    const stamp = stampOf(result);
    if (!stamp) logger.debug('moments.weather.none', { source: result?.source || null, ms: Date.now() - started });
    return stamp;
  } catch (error) {
    logger.warn('moments.weather.failed', { error: error.message });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A stored stamp as everyone reads it, or null when it isn't one this module made. */
function shownStamp(stored) {
  if (!stored || typeof stored !== 'object') return null;
  const temp = numberOf(stored.temp_f);
  if (temp == null || !KINDS.includes(stored.kind) || typeof stored.label !== 'string' || !stored.label) return null;
  return { temp_f: temp, kind: stored.kind, label: stored.label };
}

module.exports = { weatherAt, stampOf, shownStamp, KINDS, BUDGET_MS, STRONG_WIND_MPH };
