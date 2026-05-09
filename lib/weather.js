// ─── Regional weather strategy ───────────────────────────────────────────────
// All 15 ships operate within the Strait of Hormuz (~500 km wide).
// One weather reading for the region center is accurate enough for all ships.
// This reduces API calls from ~15/min (→ 21,600/day) to 1 per 15 min (→ 96/day).
// Open-Meteo free tier limit: ~10,000/day — we stay well within it.

const REGION_CENTER = { lat: 25.5, lng: 56.5 }; // Center of Strait of Hormuz
const CACHE_TTL_MS = 15 * 60 * 1000;             // Refresh every 15 minutes
const CACHE_KEY = `${REGION_CENTER.lat}:${REGION_CENTER.lng}`;

let regionCache = null;      // { value: { adverse, windSpeed }, fetchedAt: timestamp }
let fetchInFlight = false;   // Prevents concurrent requests

async function fetchWeather(lat, lng) {
  const now = Date.now();

  // If cache is valid, return it immediately
  if (regionCache && now - regionCache.fetchedAt < CACHE_TTL_MS) {
    return regionCache.value;
  }

  // If a fetch is already in flight, return the cache (even if stale)
  // or a default safe value if no cache exists yet.
  if (fetchInFlight) {
    return regionCache?.value || { adverse: false, windSpeed: 0 };
  }

  fetchInFlight = true;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${REGION_CENTER.lat}&longitude=${REGION_CENTER.lng}&current=wind_speed_10m&wind_speed_unit=ms`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo responded ${response.status}`);
    }

    const data = await response.json();
    const windSpeed = Number(data?.current?.wind_speed_10m || 0);
    const value = { adverse: windSpeed > 15, windSpeed };
    
    regionCache = { fetchedAt: now, value };
    return value;
  } catch (error) {
    if (!regionCache) {
      console.warn(`[WEATHER] Regional fetch failed: ${error.message}`);
    }
    return regionCache?.value || { adverse: false, windSpeed: 0 };
  } finally {
    fetchInFlight = false;
  }
}

function getWeatherRiskSync(lat, lng) {
  if (!regionCache) {
    return { adverse: false, windSpeed: null, stale: true };
  }

  const stale = Date.now() - regionCache.fetchedAt >= CACHE_TTL_MS;
  return {
    adverse: Boolean(regionCache.value?.adverse),
    windSpeed: Number.isFinite(regionCache.value?.windSpeed) ? regionCache.value.windSpeed : null,
    stale
  };
}

console.log('[PHASE 4 COMPLETE]');

module.exports = { fetchWeather, getWeatherRiskSync };
