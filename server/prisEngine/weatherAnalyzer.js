function severityFromScore(score) {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function distance(a, b) {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return Math.sqrt((dLat * dLat) + (dLng * dLng));
}

function defaultStormCells(now) {
  return [
    {
      id: 'storm-alpha',
      center: { lat: 24.72 + (Math.sin(now / 45000) * 0.06), lng: 57.78 },
      radiusDeg: 0.22,
      level: 'warning'
    },
    {
      id: 'storm-bravo',
      center: { lat: 25.46, lng: 56.63 + (Math.cos(now / 55000) * 0.08) },
      radiusDeg: 0.18,
      level: 'critical'
    }
  ];
}

function annotateWeatherRisk(pathPoints, weatherRiskProvider) {
  const stormCells = defaultStormCells(Date.now());
  return pathPoints.map((point) => {
    const providerRisk = weatherRiskProvider?.(point.lat, point.lng);
    let score = providerRisk?.adverse ? 62 : 12;
    let stormId = null;

    for (const storm of stormCells) {
      if (distance(point, storm.center) <= storm.radiusDeg) {
        const stormScore = storm.level === 'critical' ? 90 : 68;
        if (stormScore > score) {
          score = stormScore;
          stormId = storm.id;
        }
      }
    }

    return {
      ...point,
      weatherRisk: score,
      weatherSeverity: severityFromScore(score),
      stormId
    };
  });
}

module.exports = {
  annotateWeatherRisk,
  defaultStormCells
};
