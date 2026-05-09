import { analyzeWeatherAlongRoute } from './weatherAnalyzer';

function distance(a, b) {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return Math.sqrt((dLat * dLat) + (dLng * dLng));
}

function zoneContainsPoint(zone, point) {
  const coords = zone?.coords || [];
  if (coords.length < 3) return false;
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][1];
    const yi = coords[i][0];
    const xj = coords[j][1];
    const yj = coords[j][0];

    const intersect = ((yi > point.lat) !== (yj > point.lat))
      && (point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || 0.000001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function severityFromTotal(totalRisk) {
  if (totalRisk >= 75) return 'high';
  if (totalRisk >= 45) return 'medium';
  return 'low';
}

export function computeRouteRiskIntelligence({
  routeModel,
  selectedShip,
  ships = [],
  zones = [],
  weatherZones = []
}) {
  const routePoints = routeModel?.route?.fullPath || [];
  const weatherAnalyzed = analyzeWeatherAlongRoute(routePoints, weatherZones);

  const enrichedPoints = weatherAnalyzed.map((point, index) => {
    const weatherRisk = point.weather.score;
    let collisionRisk = 0;
    let restrictedZoneRisk = 0;

    for (const ship of ships) {
      if (ship.id === selectedShip.id) continue;
      const d = distance(point, { lat: ship.lat, lng: ship.lng });
      if (d < 0.1) collisionRisk = Math.max(collisionRisk, 90);
      else if (d < 0.18) collisionRisk = Math.max(collisionRisk, 68);
      else if (d < 0.25) collisionRisk = Math.max(collisionRisk, 42);
    }

    for (const zone of zones) {
      if (zoneContainsPoint(zone, point)) {
        restrictedZoneRisk = Math.max(restrictedZoneRisk, 88);
      }
    }

    const totalRisk = Math.min(
      100,
      Math.round((weatherRisk * 0.42) + (collisionRisk * 0.33) + (restrictedZoneRisk * 0.25))
    );

    return {
      lat: point.lat,
      lng: point.lng,
      sequence: index,
      risk: {
        weather: weatherRisk,
        collision: collisionRisk,
        restrictedZone: restrictedZoneRisk,
        totalRisk
      }
    };
  });

  const overallRouteRisk = Math.round(
    enrichedPoints.reduce((sum, point) => sum + point.risk.totalRisk, 0) / Math.max(1, enrichedPoints.length)
  );
  const highRiskPoints = enrichedPoints.filter((point) => point.risk.totalRisk >= 70);
  const threats = [];
  if (enrichedPoints.some((point) => point.risk.weather >= 60)) threats.push('Storm ahead');
  if (enrichedPoints.some((point) => point.risk.collision >= 60)) threats.push('High vessel congestion');
  if (enrichedPoints.some((point) => point.risk.restrictedZone >= 60)) threats.push('Restricted corridor risk');

  const recommendation = overallRouteRisk >= 75
    ? 'Reroute 18km southeast to avoid stacked risk sectors.'
    : overallRouteRisk >= 50
      ? 'Reduce speed and shift route corridor by 8km.'
      : 'Maintain route with continuous monitoring.';

  return {
    points: enrichedPoints,
    overallRouteRisk,
    threatLevel: severityFromTotal(overallRouteRisk),
    confidence: Math.min(97, 78 + Math.round(overallRouteRisk * 0.2)),
    threats,
    recommendation,
    dangerousSegments: highRiskPoints.map((point) => point.sequence)
  };
}
