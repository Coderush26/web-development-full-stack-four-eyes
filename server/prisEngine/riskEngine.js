function polygonContains(zone, point) {
  const coords = zone?.coords || [];
  if (coords.length < 3) return false;
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][1];
    const yi = coords[i][0];
    const xj = coords[j][1];
    const yj = coords[j][0];
    const crosses = ((yi > point.lat) !== (yj > point.lat))
      && (point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || 0.000001) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

function distance(a, b) {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return Math.sqrt((dLat * dLat) + (dLng * dLng));
}

function level(totalRisk) {
  if (totalRisk >= 85) return 'HIGH';
  if (totalRisk >= 55) return 'MEDIUM';
  return 'LOW';
}

function evaluateRisk({ ship, ships, zones, weatherAnnotatedPoints }) {
  const points = weatherAnnotatedPoints.map((point, index) => {
    let collision = 0;
    let restricted = 0;

    for (const otherShip of ships) {
      if (otherShip.id === ship.id) continue;
      const d = distance(point, { lat: otherShip.lat, lng: otherShip.lng });
      if (d < 0.11) collision = Math.max(collision, 92);
      else if (d < 0.18) collision = Math.max(collision, 72);
      else if (d < 0.26) collision = Math.max(collision, 46);
    }

    for (const zone of zones) {
      if (polygonContains(zone, point)) restricted = Math.max(restricted, 88);
    }

    const totalRisk = Math.min(100, Math.round(
      (point.weatherRisk * 0.44) +
      (collision * 0.34) +
      (restricted * 0.22)
    ));

    return {
      lat: point.lat,
      lng: point.lng,
      sequence: index,
      risk: {
        weather: point.weatherRisk,
        collision,
        restrictedZone: restricted,
        totalRisk
      }
    };
  });

  const riskScore = Math.round(points.reduce((sum, point) => sum + point.risk.totalRisk, 0) / Math.max(1, points.length));
  const threats = [];
  if (points.some((point) => point.risk.weather >= 65)) threats.push('Storm ahead (ETA 12 min)');
  if (points.some((point) => point.risk.collision >= 60)) threats.push('High congestion zone');
  if (points.some((point) => point.risk.restrictedZone >= 60)) threats.push('Restricted corridor risk');

  const recommendation = riskScore >= 70
    ? {
      action: 'REROUTE',
      route: `alt-${ship.id}-${Date.now()}`,
      reason: 'Avoid storm cell + congestion cluster'
    }
    : {
      action: 'MONITOR',
      route: null,
      reason: 'Continue current route with active monitoring'
    };

  return {
    riskScore,
    threatLevel: level(riskScore),
    confidence: Math.min(98, 80 + Math.round(riskScore * 0.18)),
    threats,
    recommendation,
    riskAnnotatedPoints: points
  };
}

module.exports = {
  evaluateRisk
};
