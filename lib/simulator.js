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
let onAlerts = () => {};
let onTickStart = () => {};
let tickInterval = null;
let tickCounter = 0;

function loadFleet() {
  const dataPath = path.join(__dirname, '..', 'data', 'fleet.json');
  const raw = fs.readFileSync(dataPath, 'utf8');
  const parsed = JSON.parse(raw);
  
  if (Array.isArray(parsed)) {
    fleet = parsed;
  } else if (parsed.fleet && parsed.ports) {
    const portsMap = {};
    parsed.ports.forEach(p => {
      portsMap[p.id] = { name: p.name, lat: p.position[0], lng: p.position[1] };
    });
    
    fleet = parsed.fleet.map(s => ({
      id: s.shipId || s.id,
      name: s.name,
      lat: s.position[0],
      lng: s.position[1],
      heading: s.heading,
      speed: s.speed,
      fuel: s.fuel,
      fuelCapacity: s.fuelCapacity || (s.fuel * 1.5),
      cargo: s.cargo,
      destination: portsMap[s.destination] || { name: s.destination, lat: 0, lng: 0 },
      status: s.status || 'normal',
      inWeather: false,
      path: [],
      alerts: []
    }));
  }
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

function recomputeShipRoute(ship, zones) {
  const route = router.computeRoute(ship, zones, {
    getWeatherRiskAt: weather.getWeatherRiskSync
  });
  ship.path = route.path;
  ship.estimatedFuelRequired = route.estimatedFuelRequired;
  ship.insufficientFuel = route.insufficientFuel;

  if (route.stranded) {
    ship.status = 'stranded';
    return {
      type: 'stranded',
      shipId: ship.id,
      severity: 5,
      message: `Ship ${ship.id} is stranded: no valid path to destination`
    };
  }

  if (route.insufficientFuel && ship.status !== 'stopped') {
    ship.status = 'insufficient_fuel';
  } else if (!route.insufficientFuel && ship.status === 'insufficient_fuel') {
    ship.status = 'normal';
  }

  if (ship.path.length > 0 && ship.status !== 'insufficient_fuel') {
    ship.status = 'normal';
  }
  return null;
}

function tick() {
  tickCounter += 1;
  onTickStart();

  if (tickCounter % 60 === 0) {
    refreshWeather().catch((error) => {
      console.error('[WEATHER] Refresh failed:', error);
    });
  }

  for (const ship of fleet) {
    if (!ship.path?.length && ship.status !== 'stopped' && ship.status !== 'stranded') {
      const startAlert = recomputeShipRoute(ship, getZones());
      if (startAlert) {
        onAlerts([startAlert]);
      }
    }

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

    if (ship.status !== 'stopped' && ship.status !== 'stranded') {
      const projected = router.computeRoute(ship, getZones(), {
        getWeatherRiskAt: weather.getWeatherRiskSync
      });
      ship.estimatedFuelRequired = projected.estimatedFuelRequired;
      ship.insufficientFuel = projected.insufficientFuel;
      if (projected.insufficientFuel && ship.status === 'normal') {
        ship.status = 'insufficient_fuel';
      }
    }
  }

  const zones = getZones();
  const checkResult = geofence.checkAll(fleet, zones);
  for (const shipId of checkResult.rerouteShipIds) {
    const ship = getShip(shipId);
    if (ship) {
      const alert = recomputeShipRoute(ship, zones);
      if (alert) {
        onAlerts([alert]);
      }
    }
  }
  if (checkResult.alerts.length) {
    onAlerts(checkResult.alerts);
  }

  playback.maybeSnapshot(fleet);
  if (ioInstance) {
    ioInstance.emit('fleet:update', fleet);
  }
}

function startTick({ io, getZones: getZonesFn, onAlerts: onAlertsFn, onTickStart: onTickStartFn }) {
  ioInstance = io;
  getZones = getZonesFn || (() => []);
  onAlerts = onAlertsFn || (() => {});
  onTickStart = onTickStartFn || (() => {});

  if (fleet.length === 0) {
    loadFleet();
  }
  const zones = getZones();
  const startupAlerts = [];
  for (const ship of fleet) {
    const alert = recomputeShipRoute(ship, zones);
    if (alert) {
      startupAlerts.push(alert);
    }
  }
  if (startupAlerts.length) {
    onAlerts(startupAlerts);
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
