// ─── Regional weather strategy ───────────────────────────────────────────────
// All 15 ships operate within the Strait of Hormuz (~500 km wide).
// One weather reading for the region center is accurate enough for all ships.
// This reduces API calls from ~15/min (→ 21,600/day) to 1 per 15 min (→ 96/day).
// Uses Stormglass API.

const REGION_CENTER = { lat: 25.5, lng: 56.5 }; // Center of Strait of Hormuz
const CACHE_TTL_MS = 15 * 60 * 1000;             // Refresh every 15 minutes
const CACHE_KEY = `${REGION_CENTER.lat}:${REGION_CENTER.lng}`;
const STORMGLASS_API_KEY = process.env.STORMGLASS_API_KEY || 'e5257b0a-4b8b-11f1-81a8-0242ac120004-e5257b78-4b8b-11f1-81a8-0242ac120004';

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
  // Use Stormglass API
  const url = `https://api.stormglass.io/v2/weather/point?lat=${REGION_CENTER.lat}&lng=${REGION_CENTER.lng}&params=windSpeed`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': STORMGLASS_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`Stormglass responded ${response.status}`);
    }

    const data = await response.json();
    
    // Stormglass returns an array of 'hours'
    let windSpeed = 0;
    if (data?.hours?.length > 0 && data.hours[0].windSpeed) {
      windSpeed = data.hours[0].windSpeed.sg || Object.values(data.hours[0].windSpeed)[0] || 0;
    }

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
