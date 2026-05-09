const turf = require('@turf/turf');

const NAVIGABLE_WATER = {
  type: 'Polygon',
  coordinates: [[
    [54.0, 22.5], [60.5, 22.5], [60.5, 27.0],
    [57.5, 27.5], [54.5, 26.5], [54.0, 24.0], [54.0, 22.5]
  ]]
};

let ioInstance = null;
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
  ioInstance = io;
  console.log('[PHASE 3 COMPLETE]');
}

function checkGeofences(ships, zones) {
  const rerouteShipIds = [];
  for (const ship of ships) {
    const shipPoint = turf.point([ship.lng, ship.lat]);
    for (const zone of zones) {
      const zoneKey = `${ship.id}:${zone.id}`;
      const inside = turf.booleanPointInPolygon(shipPoint, zoneToPolygon(zone));
      const wasInside = geofenceState.get(zoneKey) === true;

      if (inside && !wasInside) {
        ship.status = 'rerouting';
        rerouteShipIds.push(ship.id);
        if (ioInstance) {
          ioInstance.emit('alert:geofence', {
            shipId: ship.id,
            zoneName: zone.name,
            severity: 'high',
            timestamp: Date.now()
          });
        }
      }

      geofenceState.set(zoneKey, inside);
    }
  }
  return rerouteShipIds;
}

function checkProximity(ships) {
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
        if (ioInstance) {
          ioInstance.emit('alert:proximity', {
            ship1Id: ship1.id,
            ship2Id: ship2.id,
            distanceKm: Number(distanceKm.toFixed(2)),
            timestamp: Date.now()
          });
        }
      }

      if (distanceKm >= 2) {
        warnedPairs.delete(key);
      }
    }
  }
}

function checkAll(ships, zones) {
  const rerouteShipIds = checkGeofences(ships, zones);
  checkProximity(ships);
  return rerouteShipIds;
}

module.exports = {
  NAVIGABLE_WATER,
  init,
  checkAll
};
