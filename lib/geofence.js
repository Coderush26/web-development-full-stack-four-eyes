const turf = require('@turf/turf');
const { NAVIGABLE_WATER } = require('./navigation');

const geofenceState = new Map();
const warnedPairs = new Set();

function zoneToPolygon(zone) {
  if (zone.polygon?.type === 'Polygon') {
    return turf.polygon(zone.polygon.coordinates);
  }
  const ring = (zone.coords || []).map(([lat, lng]) => [lng, lat]);
  return turf.polygon([ring]);
}

function init(io) {
  console.log('[PHASE 3 COMPLETE]');
}

function checkGeofences(ships, zones) {
  const rerouteShipIds = [];
  const alerts = [];
  for (const ship of ships) {
    const shipPoint = turf.point([ship.lng, ship.lat]);
    for (const zone of zones) {
      const zoneKey = `${ship.id}:${zone.id}`;
      const inside = turf.booleanPointInPolygon(shipPoint, zoneToPolygon(zone));
      const wasInside = geofenceState.get(zoneKey) === true;

      if (inside && !wasInside) {
        ship.status = 'rerouting';
        rerouteShipIds.push(ship.id);
        alerts.push({
          type: 'geofence',
          shipId: ship.id,
          zoneId: zone.id,
          zoneName: zone.name,
          severity: 5,
          message: `Ship ${ship.id} entered ${zone.name}`
        });
      }

      geofenceState.set(zoneKey, inside);
    }
  }
  return { rerouteShipIds, alerts };
}

function checkProximity(ships) {
  const alerts = [];
  for (let i = 0; i < ships.length; i += 1) {
    for (let j = i + 1; j < ships.length; j += 1) {
      const ship1 = ships[i];
      const ship2 = ships[j];
      const key = [ship1.id, ship2.id].sort().join(':');
      const distanceKm = turf.distance(
        turf.point([ship1.lng, ship1.lat]),
        turf.point([ship2.lng, ship2.lat]),
        { units: 'kilometers' }
      );

      if (distanceKm < 2 && !warnedPairs.has(key)) {
        warnedPairs.add(key);
        alerts.push({
          type: 'proximity',
          ship1Id: ship1.id,
          ship2Id: ship2.id,
          distanceKm: Number(distanceKm.toFixed(2)),
          severity: 4,
          message: `${ship1.id} is within ${Number(distanceKm.toFixed(2))} km of ${ship2.id}`
        });
      }

      if (distanceKm >= 2) {
        warnedPairs.delete(key);
      }
    }
  }
  return alerts;
}

function routeIntersectsZones(ship, zones) {
  if (!Array.isArray(ship.path) || ship.path.length === 0 || zones.length === 0) {
    return false;
  }

  const points = [{ lat: ship.lat, lng: ship.lng }, ...ship.path];
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    const line = turf.lineString([
      [from.lng, from.lat],
      [to.lng, to.lat]
    ]);
    for (const zone of zones) {
      const polygon = zoneToPolygon(zone);
      if (turf.booleanIntersects(line, polygon)) {
        return true;
      }
    }
  }
  return false;
}

function checkAll(ships, zones) {
  const geofenceResult = checkGeofences(ships, zones);
  const proximityAlerts = checkProximity(ships);
  return {
    rerouteShipIds: geofenceResult.rerouteShipIds,
    alerts: [...geofenceResult.alerts, ...proximityAlerts]
  };
}

module.exports = {
  NAVIGABLE_WATER,
  init,
  checkAll,
  routeIntersectsZones
};
