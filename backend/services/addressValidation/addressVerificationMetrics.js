const WINDOW_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const MAX_SAMPLES_PER_BUCKET = 2000;
const MAX_LABEL_BUCKETS = 200;

const counters = new Map();
const histograms = new Map();

function normalizeLabelValue(value) {
  if (value === undefined || value === null || value === '') return 'none';
  return String(value).replace(/[,\n\r]/g, '_');
}

function labelsKey(labels = {}) {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '_total';
  return keys.map((key) => `${key}=${normalizeLabelValue(labels[key])}`).join(',');
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function incCounter(name, labels = {}) {
  if (!counters.has(name)) counters.set(name, new Map());
  const bucket = counters.get(name);
  const key = labelsKey(labels);
  if (!bucket.has(key) && bucket.size >= MAX_LABEL_BUCKETS) return;
  bucket.set(key, (bucket.get(key) || 0) + 1);
}

function recordHistogram(name, value, labels = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;

  if (!histograms.has(name)) histograms.set(name, new Map());
  const metric = histograms.get(name);
  const key = labelsKey(labels);
  if (!metric.has(key)) {
    if (metric.size >= MAX_LABEL_BUCKETS) return;
    metric.set(key, {
      values: new Float64Array(MAX_SAMPLES_PER_BUCKET),
      timestamps: new Float64Array(MAX_SAMPLES_PER_BUCKET),
      head: 0,
      count: 0,
    });
  }

  const bucket = metric.get(key);
  const idx = (bucket.head + bucket.count) % MAX_SAMPLES_PER_BUCKET;
  bucket.values[idx] = parsed;
  bucket.timestamps[idx] = Date.now();
  if (bucket.count < MAX_SAMPLES_PER_BUCKET) {
    bucket.count += 1;
  } else {
    bucket.head = (bucket.head + 1) % MAX_SAMPLES_PER_BUCKET;
  }
}

function evictExpired(bucket, cutoff) {
  while (bucket.count > 0 && bucket.timestamps[bucket.head] < cutoff) {
    bucket.head = (bucket.head + 1) % MAX_SAMPLES_PER_BUCKET;
    bucket.count -= 1;
  }
}

function cleanupHistograms() {
  const cutoff = Date.now() - WINDOW_MS;
  for (const metric of histograms.values()) {
    for (const bucket of metric.values()) {
      evictExpired(bucket, cutoff);
    }
  }
}

setInterval(cleanupHistograms, CLEANUP_INTERVAL_MS).unref();

function getSnapshot() {
  const cutoff = Date.now() - WINDOW_MS;
  const snapshot = {
    counters: {},
    histograms: {},
  };

  for (const [name, metric] of counters.entries()) {
    snapshot.counters[name] = {};
    for (const [key, value] of metric.entries()) {
      snapshot.counters[name][key] = value;
    }
  }

  for (const [name, metric] of histograms.entries()) {
    snapshot.histograms[name] = {};
    for (const [key, bucket] of metric.entries()) {
      evictExpired(bucket, cutoff);
      const active = new Array(bucket.count);
      for (let i = 0; i < bucket.count; i += 1) {
        active[i] = bucket.values[(bucket.head + i) % MAX_SAMPLES_PER_BUCKET];
      }
      active.sort((left, right) => left - right);
      snapshot.histograms[name][key] = {
        count: active.length,
        p50_ms: Math.round(percentile(active, 50)),
        p95_ms: Math.round(percentile(active, 95)),
        p99_ms: Math.round(percentile(active, 99)),
        max_ms: Math.round(active[active.length - 1] || 0),
      };
    }
  }

  return snapshot;
}

function resetForTests() {
  counters.clear();
  histograms.clear();
}

module.exports = {
  incCounter,
  recordHistogram,
  getSnapshot,
  resetForTests,
};
