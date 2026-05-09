const turf = require('@turf/turf');
const { NAVIGABLE_WATER } = require('./navigation');
const navigablePolygon = turf.polygon(NAVIGABLE_WATER.coordinates);

function zoneToPolygon(zone) {
  if (zone.polygon?.type === 'Polygon') {
    return turf.polygon(zone.polygon.coordinates);
  }
  const ring = (zone.coords || []).map(([lat, lng]) => [lng, lat]);
  return turf.polygon([ring]);
}

function isInsideAnyZone(point, zones) {
  return zones.some((zone) => turf.booleanPointInPolygon(point, zoneToPolygon(zone)));
}

function estimateFuelRequired(ship, path, getWeatherRiskAt) {
  if (!path.length) {
    return 0;
  }

  const points = [{ lat: ship.lat, lng: ship.lng }, ...path];
  let required = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    const segmentKm = turf.distance(
      turf.point([from.lng, from.lat]),
      turf.point([to.lng, to.lat]),
      { units: 'kilometers' }
    );
    const sampleLat = (from.lat + to.lat) / 2;
    const sampleLng = (from.lng + to.lng) / 2;
    const inWeather = getWeatherRiskAt(sampleLat, sampleLng).adverse;
    required += inWeather ? 0.03 * 1.3 * segmentKm : 0.03 * segmentKm;
  }
  return Number(required.toFixed(2));
}

function computeRoute(ship, zones = [], options = {}) {
  const getWeatherRiskAt = options.getWeatherRiskAt || (() => ({ adverse: false }));
  const start = { lat: ship.lat, lng: ship.lng };
  const destination = { lat: ship.destination.lat, lng: ship.destination.lng };
  const destinationPoint = turf.point([destination.lng, destination.lat]);

  if (isInsideAnyZone(destinationPoint, zones)) {
    return {
      path: [],
      stranded: true,
      insufficientFuel: false,
      estimatedFuelRequired: 0,
      reason: 'destination_blocked'
    };
  }

  const dLat = destination.lat - start.lat;
  const dLng = destination.lng - start.lng;
  const length = Math.sqrt(dLat * dLat + dLng * dLng) || 1;
  const perpendicular = { lat: -dLng / length, lng: dLat / length };

  const waypoints = [];
  for (let i = 1; i <= 8; i += 1) {
    const t = i / 9;
    let waypoint = {
      lat: start.lat + dLat * t,
      lng: start.lng + dLng * t
    };

    const waypointPoint = turf.point([waypoint.lng, waypoint.lat]);
    if (isInsideAnyZone(waypointPoint, zones)) {
      const candidates = [
        {
          lat: waypoint.lat + perpendicular.lat * 0.3,
          lng: waypoint.lng + perpendicular.lng * 0.3
        },
        {
          lat: waypoint.lat - perpendicular.lat * 0.3,
          lng: waypoint.lng - perpendicular.lng * 0.3
        }
      ];

      let bestCandidate = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        const candidatePoint = turf.point([candidate.lng, candidate.lat]);
        const insideNavigable = turf.booleanPointInPolygon(candidatePoint, navigablePolygon);
        const insideZone = isInsideAnyZone(candidatePoint, zones);
        if (!insideNavigable || insideZone) {
          continue;
        }

        const weatherRisk = getWeatherRiskAt(candidate.lat, candidate.lng).adverse ? 1 : 0;
        const distPenalty = turf.distance(
          turf.point([candidate.lng, candidate.lat]),
          destinationPoint,
          { units: 'kilometers' }
        );
        const score = weatherRisk * 1000 + distPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        waypoint = bestCandidate;
      } else {
        return {
          path: [],
          stranded: true,
          insufficientFuel: false,
          estimatedFuelRequired: 0,
          reason: 'no_navigable_detour'
        };
      }
    }

    waypoints.push({
      lat: Number(waypoint.lat.toFixed(6)),
      lng: Number(waypoint.lng.toFixed(6))
    });
  }

  waypoints.push(destination);
  const estimatedFuelRequired = estimateFuelRequired(ship, waypoints, getWeatherRiskAt);
  const insufficientFuel = ship.fuel < estimatedFuelRequired;
  return {
    path: waypoints,
    stranded: false,
    insufficientFuel,
    estimatedFuelRequired
  };
}

function computePath(ship, zones = [], options = {}) {
  return computeRoute(ship, zones, options).path;
}

console.log('[PHASE 2 COMPLETE]');

module.exports = { computePath, computeRoute };
