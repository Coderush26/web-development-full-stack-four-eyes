const cache = new Map();

// 5 minutes — respects Open-Meteo free tier rate limits
// Ships move slowly so stale weather data is acceptable
const CACHE_MS = 5 * 60 * 1000;

// Jitter delay (ms) between sequential fetch calls to avoid burst 429s
const FETCH_JITTER_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWeather(lat, lng) {
  const roundedLat = Number(lat.toFixed(1));
  const roundedLng = Number(lng.toFixed(1));
  const cacheKey = `${roundedLat}:${roundedLng}`;
  const now = Date.now();

  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_MS) {
    return cached.value;
  }

  // If stale cache exists, return it immediately — fetch happens async with jitter
  if (cached) {
    _fetchAndUpdate(cacheKey, roundedLat, roundedLng).catch(() => {});
    return cached.value;
  }

  // First time — must fetch synchronously
  return _fetchAndUpdate(cacheKey, roundedLat, roundedLng);
}

let _fetchQueue = Promise.resolve();

async function _fetchAndUpdate(cacheKey, lat, lng) {
  // Chain onto a shared queue with jitter to serialize all requests
  _fetchQueue = _fetchQueue.then(() => sleep(FETCH_JITTER_MS));
  await _fetchQueue;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m&wind_speed_unit=ms`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo responded ${response.status}`);
    }

    const data = await response.json();
    const windSpeed = Number(data?.current?.wind_speed_10m || 0);
    const value = { adverse: windSpeed > 15, windSpeed };
    cache.set(cacheKey, { timestamp: Date.now(), value });
    return value;
  } catch (error) {
    const cached = cache.get(cacheKey);
    if (!cached) {
      // Only log when there's no stale fallback — reduces noise
      console.warn(`[WEATHER] Fetch failed for ${cacheKey}: ${error.message}`);
    }
    return cached?.value || { adverse: false, windSpeed: 0 };
  }
}

function getWeatherRiskSync(lat, lng) {
  const roundedLat = Number(lat.toFixed(1));
  const roundedLng = Number(lng.toFixed(1));
  const cacheKey = `${roundedLat}:${roundedLng}`;
  const cached = cache.get(cacheKey);
  if (!cached) {
    return { adverse: false, windSpeed: null, stale: true };
  }

  const stale = Date.now() - cached.timestamp >= CACHE_MS;
  return {
    adverse: Boolean(cached.value?.adverse),
    windSpeed: Number.isFinite(cached.value?.windSpeed) ? cached.value.windSpeed : null,
    stale
  };
}

console.log('[PHASE 4 COMPLETE]');

module.exports = { fetchWeather, getWeatherRiskSync };
