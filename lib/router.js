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

function computePath(ship, zones = []) {
  const start = { lat: ship.lat, lng: ship.lng };
  const destination = { lat: ship.destination.lat, lng: ship.destination.lng };
  const destinationPoint = turf.point([destination.lng, destination.lat]);

  if (isInsideAnyZone(destinationPoint, zones)) {
    ship.status = 'stranded';
    return [];
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

      for (const candidate of candidates) {
        const candidatePoint = turf.point([candidate.lng, candidate.lat]);
        const insideNavigable = turf.booleanPointInPolygon(candidatePoint, navigablePolygon);
        const insideZone = isInsideAnyZone(candidatePoint, zones);
        if (insideNavigable && !insideZone) {
          waypoint = candidate;
          break;
        }
      }
    }

    waypoints.push({
      lat: Number(waypoint.lat.toFixed(6)),
      lng: Number(waypoint.lng.toFixed(6))
    });
  }

  waypoints.push(destination);
  return waypoints;
}

console.log('[PHASE 2 COMPLETE]');

module.exports = { computePath };
