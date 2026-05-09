const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');
const geofence = require('./geofence');
const router = require('./router');
const weather = require('./weather');
const playback = require('./playback');

let fleet = [];
let ioInstance = null;
let getZones = () => [];
let tickInterval = null;
let tickCounter = 0;

function loadFleet() {
  const dataPath = path.join(__dirname, '..', 'data', 'fleet.json');
  const raw = fs.readFileSync(dataPath, 'utf8');
  fleet = JSON.parse(raw);
}

function getAllShips() {
  return fleet;
}

function getShip(id) {
  return fleet.find((ship) => ship.id === id);
}

function updateShip(id, patch) {
  const ship = getShip(id);
  if (!ship) {
    return null;
  }
  Object.assign(ship, patch);
  return ship;
}

function bearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1R = lat1 * Math.PI / 180;
  const lat2R = lat2 * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2R);
  const x = Math.cos(lat1R) * Math.sin(lat2R) -
            Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function moveAlongBearing(lat, lng, bearingDeg, distKm) {
  const R = 6371;
  const d = distKm / R;
  const b = bearingDeg * Math.PI / 180;
  const lat1 = lat * Math.PI / 180;
  const lng1 = lng * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) +
                Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1),
                Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI };
}

async function refreshWeather() {
  await Promise.all(fleet.map(async (ship) => {
    const result = await weather.fetchWeather(ship.lat, ship.lng);
    ship.inWeather = result.adverse;
  }));
}

function tick() {
  tickCounter += 1;

  if (tickCounter % 60 === 0) {
    refreshWeather().catch((error) => {
      console.error('[WEATHER] Refresh failed:', error);
    });
  }

  for (const ship of fleet) {
    if (ship.path?.length) {
      const waypoint = ship.path[0];
      const waypointBearing = bearing(ship.lat, ship.lng, waypoint.lat, waypoint.lng);
      ship.heading = Math.round(waypointBearing);

      const speedKmH = ship.speed * 1.852;
      const distanceThisTick = speedKmH / 3600;
      const next = moveAlongBearing(ship.lat, ship.lng, waypointBearing, distanceThisTick);
      ship.lat = Number(next.lat.toFixed(6));
      ship.lng = Number(next.lng.toFixed(6));

      const distToWaypoint = turf.distance(
        turf.point([ship.lng, ship.lat]),
        turf.point([waypoint.lng, waypoint.lat]),
        { units: 'kilometers' }
      );

      if (distToWaypoint <= 0.05) {
        ship.path.shift();
        if (ship.path.length === 0) {
          ship.status = 'stopped';
        }
      }
    }

    const fuelBurn = ship.inWeather ? 0.03 * 1.3 : 0.03;
    ship.fuel = Number(Math.max(ship.fuel - fuelBurn, 0).toFixed(2));
    if (ship.fuel <= 0) {
      ship.status = 'stopped';
      ship.fuel = 0;
    }
  }

  const zones = getZones();
  const rerouteShipIds = geofence.checkAll(fleet, zones);
  for (const shipId of rerouteShipIds) {
    const ship = getShip(shipId);
    if (ship) {
      ship.path = router.computePath(ship, zones);
    }
  }

  playback.maybeSnapshot(fleet);
  if (ioInstance) {
    ioInstance.emit('fleet:update', fleet);
  }
}

function startTick({ io, getZones: getZonesFn }) {
  ioInstance = io;
  getZones = getZonesFn || (() => []);

  if (fleet.length === 0) {
    loadFleet();
  }
  if (!tickInterval) {
    tickInterval = setInterval(tick, 1000);
  }

  refreshWeather().catch((error) => {
    console.error('[WEATHER] Initial refresh failed:', error);
  });
}

module.exports = {
  startTick,
  getAllShips,
  getShip,
  updateShip
};
