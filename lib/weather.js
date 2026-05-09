const cache = new Map();
const CACHE_MS = 60_000;

async function fetchWeather(lat, lng) {
  const roundedLat = Number(lat.toFixed(1));
  const roundedLng = Number(lng.toFixed(1));
  const cacheKey = `${roundedLat}:${roundedLng}`;
  const now = Date.now();

  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_MS) {
    return cached.value;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLng}&current=wind_speed_10m&wind_speed_unit=ms`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo responded ${response.status}`);
  }

  const data = await response.json();
  const windSpeed = Number(data?.current?.wind_speed_10m || 0);
  const value = {
    adverse: windSpeed > 15,
    windSpeed
  };
  cache.set(cacheKey, { timestamp: now, value });
  return value;
}

console.log('[PHASE 4 COMPLETE]');

module.exports = { fetchWeather };
