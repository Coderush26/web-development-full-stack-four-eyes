function pointDistance(a, b) {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return Math.sqrt((dLat * dLat) + (dLng * dLng));
}

function severityFromScore(score) {
  if (score >= 75) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export function analyzeWeatherAlongRoute(routePoints = [], weatherZones = []) {
  return routePoints.map((point) => {
    let weatherScore = 5;
    let matchedStorm = null;

    for (const zone of weatherZones) {
      const radius = zone.radiusDeg || 0.24;
      const distance = pointDistance(point, zone.center);
      if (distance <= radius) {
        const zoneScore = zone.level === 'critical' ? 92 : zone.level === 'warning' ? 64 : 38;
        if (zoneScore > weatherScore) {
          weatherScore = zoneScore;
          matchedStorm = zone;
        }
      }
    }

    return {
      ...point,
      weather: {
        score: weatherScore,
        severity: severityFromScore(weatherScore),
        stormId: matchedStorm?.id || null
      }
    };
  });
}
