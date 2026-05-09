import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import audioManager from '../src/services/audio/audioManager';
import * as turf from '@turf/turf';
import {
  get,
  onValue,
  ref,
  runTransaction,
  set
} from 'firebase/database';
import seedFleet from '../data/fleet.json';
import { getFirebaseDb } from '../src/firebase/clientApp';

const STATE_PATH = 'vesselsync/state';
const SOURCE_PATH = 'vesselsync/sourceData';
const ALERT_BEEP_URL = '/beep.mp3';
const INCIDENT_TYPES = ['fire', 'medical', 'mechanical', 'collision', 'weather', 'cargo', 'unknown'];

function normalizeShip(ship, idx) {
  const id = String(ship?.id || ship?.shipId || `SHIP-${String(idx + 1).padStart(2, '0')}`).trim();
  return {
    ...ship,
    id,
    shipId: id,
    name: ship?.name || id,
    path: Array.isArray(ship?.path) ? ship.path : [],
    destination: ship?.destination || { name: 'Unknown', lat: Number(ship?.lat || 0), lng: Number(ship?.lng || 0) }
  };
}

function buildShipsFromFirebaseSourceData(sourceData) {
  const ports = Array.isArray(sourceData?.ports) ? sourceData.ports : [];
  const fleet = Array.isArray(sourceData?.fleet) ? sourceData.fleet : [];
  const portMap = new Map(
    ports.map((port) => [
      String(port.id),
      {
        name: port.name || String(port.id),
        lat: Number(port.position?.[0] || 0),
        lng: Number(port.position?.[1] || 0)
      }
    ])
  );

  return fleet.map((ship, idx) => {
    const destination = portMap.get(String(ship.destination)) || {
      name: String(ship.destination || 'Unknown destination'),
      lat: Number(ship.position?.[0] || ship.lat || 0),
      lng: Number(ship.position?.[1] || ship.lng || 0)
    };
    const fuel = Number(ship.fuel || 0);
    return normalizeShip({
      id: ship.shipId || ship.id,
      shipId: ship.shipId || ship.id,
      name: ship.name || `Vessel ${idx + 1}`,
      lat: Number(ship.position?.[0] || ship.lat || 0),
      lng: Number(ship.position?.[1] || ship.lng || 0),
      heading: Number(ship.heading || 0),
      speed: Number(ship.speed || 0),
      fuel,
      fuelCapacity: Math.max(fuel, Math.round(fuel * 1.25)),
      cargo: ship.cargo || 'Unknown cargo',
      destination,
      status: ship.status || 'normal',
      inWeather: false,
      path: [],
      alerts: []
    }, idx);
  });
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

function baseState() {
  const ships = Array.isArray(seedFleet)
    ? seedFleet.map((ship, idx) => normalizeShip(ship, idx))
    : (() => {
      const ports = Array.isArray(seedFleet?.ports) ? seedFleet.ports : [];
      const portMap = new Map(
        ports.map((port) => [
          port.id,
          {
            name: port.name,
            lat: Number(port.position?.[0] || 0),
            lng: Number(port.position?.[1] || 0)
          }
        ])
      );
      const fleetItems = Array.isArray(seedFleet?.fleet) ? seedFleet.fleet : [];
      return fleetItems.map((ship, idx) => {
        const destination = portMap.get(ship.destination) || {
          name: String(ship.destination || 'Unknown destination'),
          lat: Number(ship.position?.[0] || 0),
          lng: Number(ship.position?.[1] || 0)
        };
        const fuel = Number(ship.fuel || 0);
        return {
          id: ship.shipId || ship.id || `SHIP-${String(idx + 1).padStart(2, '0')}`,
          name: ship.name || `Vessel ${idx + 1}`,
          lat: Number(ship.position?.[0] || ship.lat || 0),
          lng: Number(ship.position?.[1] || ship.lng || 0),
          heading: Number(ship.heading || 0),
          speed: Number(ship.speed || 0),
          fuel,
          fuelCapacity: Math.max(fuel, Math.round(fuel * 1.25)),
          cargo: ship.cargo || 'Unknown cargo',
          destination,
          status: ship.status || 'normal',
          inWeather: false,
          path: [],
          alerts: []
        };
      });
    })();

  return {
    ships,
    zones: [],
    alerts: [],
    directives: {},
    directiveResponses: [],
    events: [],
    updatedAt: Date.now()
  };
}

function buildStateFromSourceData(sourceData) {
  const ships = buildShipsFromFirebaseSourceData(sourceData);
  if (!ships.length) {
    return null;
  }
  return {
    ships,
    zones: [],
    alerts: [],
    directives: {},
    directiveResponses: [],
    events: [],
    updatedAt: Date.now()
  };
}

function parseDistressLocally(message) {
  const msg = String(message || '').toLowerCase();
  let severity = 3;
  let incidentType = 'unknown';
  let immediateRisk = false;
  let injuries = null;
  let damagePct = null;

  if (/fire|smoke|burn/.test(msg)) {
    incidentType = 'fire';
    severity = 5;
    immediateRisk = true;
  } else if (/collision|hit|crash/.test(msg)) {
    incidentType = 'collision';
    severity = 5;
    immediateRisk = true;
  } else if (/injur|medical|bleed/.test(msg)) {
    incidentType = 'medical';
    severity = 4;
    immediateRisk = true;
  } else if (/engine|mechanic|failure|breakdown/.test(msg)) {
    incidentType = 'mechanical';
    severity = 4;
  } else if (/storm|wind|wave|weather/.test(msg)) {
    incidentType = 'weather';
    severity = 4;
  } else if (/cargo|spill|leak/.test(msg)) {
    incidentType = 'cargo';
    severity = 4;
  }

  const injuryMatch = msg.match(/(\d+)\s*(injur|crew|person|people)/);
  if (injuryMatch) injuries = Number(injuryMatch[1]);
  const damageMatch = msg.match(/(\d+)\s*%/);
  if (damageMatch) damagePct = Number(damageMatch[1]);

  return {
    severity,
    incidentType: INCIDENT_TYPES.includes(incidentType) ? incidentType : 'unknown',
    injuries,
    damagePct,
    immediateRisk,
    summary: String(message || '').slice(0, 180) || 'Distress report received'
  };
}

function zonePolygon(zone) {
  return turf.polygon(zone.polygon.coordinates);
}

function ensureStateShape(state) {
  if (!state || typeof state !== 'object') {
    return baseState();
  }
  state.ships = Array.isArray(state.ships) ? state.ships : [];
  state.ships = state.ships.map((ship, idx) => normalizeShip(ship, idx));
  state.zones = Array.isArray(state.zones) ? state.zones : [];
  state.alerts = Array.isArray(state.alerts) ? state.alerts : [];
  state.directives = state.directives && typeof state.directives === 'object' ? state.directives : {};
  state.directiveResponses = Array.isArray(state.directiveResponses) ? state.directiveResponses : [];
  state.events = Array.isArray(state.events) ? state.events : [];
  return state;
}

function addAlert(state, partial) {
  ensureStateShape(state);
  const alert = {
    id: `ALERT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    status: 'active',
    ...partial
  };
  state.alerts = [...state.alerts, alert]
    .sort((a, b) => (b.severity || 1) - (a.severity || 1))
    .slice(0, 300);
  state.events = [
    ...state.events,
    {
      type: 'alert',
      timestamp: alert.timestamp,
      alertId: alert.id,
      severity: alert.severity
    }
  ].slice(-600);
}

function applyDirective(state, ship, directive) {
  if (!ship || !directive) return;
  if (directive.action === 'hold') {
    ship.path = [];
    ship.status = 'stopped';
  } else if (directive.action === 'reroute' && directive.params?.destination) {
    ship.destination = directive.params.destination;
    ship.path = [directive.params.destination];
    ship.status = 'rerouting';
  } else if (directive.action === 'divert' && directive.params?.waypoint) {
    ship.path = [directive.params.waypoint, ship.destination];
    ship.status = 'rerouting';
  }
}

function applyTick(state) {
  ensureStateShape(state);
  const zones = state.zones || [];
  const activePairs = new Set();

  for (const ship of state.ships) {
    const directive = state.directives?.[ship.id];
    if (directive?.status === 'accepted_pending_tick') {
      applyDirective(state, ship, directive);
      state.directives[ship.id] = { ...directive, status: 'applied' };
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
      ship.fuel = 0;
      ship.status = 'stopped';
    }

    for (const zone of zones) {
      const inside = turf.booleanPointInPolygon(
        turf.point([ship.lng, ship.lat]),
        zonePolygon(zone)
      );
      if (inside) {
        const key = `GEOFENCE:${ship.id}:${zone.id}`;
        const already = state.alerts.some((a) => a.status !== 'resolved' && a.dedupeKey === key);
        if (!already) {
          addAlert(state, {
            type: 'geofence',
            dedupeKey: key,
            severity: 5,
            shipId: ship.id,
            zoneId: zone.id,
            zoneName: zone.name,
            message: `${ship.id} entered ${zone.name}`
          });
        }
        if (!ship.path?.length && ship.status !== 'stopped') {
          ship.path = [ship.destination];
          ship.status = 'rerouting';
        }
      }
    }
  }

  for (let i = 0; i < state.ships.length; i += 1) {
    for (let j = i + 1; j < state.ships.length; j += 1) {
      const ship1 = state.ships[i];
      const ship2 = state.ships[j];
      const distanceKm = turf.distance(
        turf.point([ship1.lng, ship1.lat]),
        turf.point([ship2.lng, ship2.lat]),
        { units: 'kilometers' }
      );
      const pairKey = ['PROX', ship1.id, ship2.id].sort().join(':');
      if (distanceKm < 2) {
        activePairs.add(pairKey);
        const already = state.alerts.some((a) => a.status !== 'resolved' && a.dedupeKey === pairKey);
        if (!already) {
          addAlert(state, {
            type: 'proximity',
            dedupeKey: pairKey,
            severity: 4,
            ship1Id: ship1.id,
            ship2Id: ship2.id,
            distanceKm: Number(distanceKm.toFixed(2)),
            message: `${ship1.id} within ${Number(distanceKm.toFixed(2))} km of ${ship2.id}`
          });
        }
      }
    }
  }

  state.alerts = state.alerts.filter((a) => {
    if (a.type !== 'proximity') return true;
    if (a.status === 'resolved') return true;
    return activePairs.has(a.dedupeKey);
  });

  state.updatedAt = Date.now();
  return state;
}

export function useFleetSocket(shipId) {
  const dbRef = useRef(null);
  const stateRef = useRef(null);
  const [ships, setShips] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [zones, setZones] = useState([]);
  const [directives, setDirectives] = useState({});
  const [directiveResponses, setDirectiveResponses] = useState([]);
  const [connected, setConnected] = useState(false);
  const [backendHealthy, setBackendHealthy] = useState(true);
  const [routeIntelligenceByShip, setRouteIntelligenceByShip] = useState({});
  const [emergencyBroadcast, setEmergencyBroadcast] = useState(null);
  const [prisTrackedShips, setPrisTrackedShips] = useState({});
  const [prisSystemMetrics, setPrisSystemMetrics] = useState(null);
  const [audioSeverity, setAudioSeverity] = useState('NORMAL');
  const previousSeverityRef = useRef('NORMAL');
  const socketRef = useRef(null);
  const prevAlertCountRef = useRef(0);
  const isCommand = !shipId;
  const normalizeShips = (nextShips) => (Array.isArray(nextShips)
    ? nextShips.map((ship) => ({
      ...ship,
      destination: ship.destination ? { ...ship.destination } : ship.destination,
      path: Array.isArray(ship.path) ? ship.path.map((point) => ({ ...point })) : []
    }))
    : []);

  useEffect(() => {
    const db = getFirebaseDb();
    dbRef.current = db;
    const sRef = ref(db, STATE_PATH);
    const sourceRef = ref(db, SOURCE_PATH);
    stateRef.current = sRef;

    const connectedRef = ref(db, '.info/connected');
    const unsubConn = onValue(connectedRef, (snap) => {
      setConnected(Boolean(snap.val()));
    });

    const unsubState = onValue(sRef, (snap) => {
      const value = snap.val();
      if (!value) {
        get(sourceRef)
          .then((sourceSnap) => {
            const fromFirebase = buildStateFromSourceData(sourceSnap.val());
            return set(sRef, fromFirebase || baseState());
          })
          .catch(() => set(sRef, baseState()));
        return;
      }
      setShips(Array.isArray(value.ships) ? value.ships : []);
      setZones(Array.isArray(value.zones) ? value.zones : []);
      setAlerts(Array.isArray(value.alerts) ? value.alerts : []);
      setDirectives(value.directives || {});
      setDirectiveResponses(Array.isArray(value.directiveResponses) ? value.directiveResponses : []);
      setBackendHealthy(true);

      const nextCount = Array.isArray(value.alerts) ? value.alerts.length : 0;
      if (nextCount > prevAlertCountRef.current) {
        const beep = new Audio(ALERT_BEEP_URL);
        beep.play().catch(() => {});
      }
      prevAlertCountRef.current = nextCount;
    });

    return () => {
      unsubConn();
      unsubState();
    };
  }, []);

  useEffect(() => {
    if (!isCommand || !stateRef.current) return undefined;
    const timer = setInterval(() => {
      runTransaction(stateRef.current, (current) => {
        const state = current || baseState();
        return applyTick(state);
      }).catch(() => {});
    }, 1000);

    return () => clearInterval(timer);
  }, [isCommand]);

  useEffect(() => {
    const highestAlertSeverity = alerts.reduce((highest, alert) => {
      const s = typeof alert.severity === 'number' ? alert.severity : alert.severity === 'high' ? 4 : 1;
      return Math.max(highest, s);
    }, 0);

    const highestRouteThreat = Object.values(routeIntelligenceByShip || {}).reduce((highest, update) => {
      const threat = update?.routeAnalysis?.threatLevel;
      if (threat === 'HIGH') return Math.max(highest, 4);
      if (threat === 'MEDIUM') return Math.max(highest, 2);
      return highest;
    }, 0);

    const highestFuelSeverity = ships.reduce((highest, ship) => {
      const fuelPct = ship?.fuelCapacity ? (ship.fuel / ship.fuelCapacity) * 100 : 100;
      if (fuelPct <= 12) return Math.max(highest, 4);
      if (fuelPct <= 28) return Math.max(highest, 2);
      return highest;
    }, 0);

    const emergencyActive = emergencyBroadcast && (Date.now() - emergencyBroadcast.timestamp) < 20_000;
    if (emergencyActive) {
      setAudioSeverity('EMERGENCY');
      audioManager.setSeverity('EMERGENCY');
      return;
    }

    const merged = Math.max(highestAlertSeverity, highestRouteThreat, highestFuelSeverity);
    let nextSeverity = 'NORMAL';
    if (merged >= 4) nextSeverity = 'CRITICAL';
    else if (merged >= 2) nextSeverity = 'WARNING';

    if (previousSeverityRef.current !== nextSeverity && (nextSeverity === 'CRITICAL' || nextSeverity === 'WARNING')) {
      audioManager.triggerAiEscalationCue();
    }
    previousSeverityRef.current = nextSeverity;
    setAudioSeverity(nextSeverity);
    audioManager.setSeverity(nextSeverity);
  }, [alerts, routeIntelligenceByShip, emergencyBroadcast, ships]);

  const sendDirective = useCallback((targetShipId, action, params) => {
    if (!stateRef.current) return;
    runTransaction(stateRef.current, (current) => {
      const state = current || baseState();
      state.directives = state.directives || {};
      state.directives[targetShipId] = {
        id: `DIR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        shipId: targetShipId,
        fromRole: 'command',
        action,
        params: params || {},
        status: 'pending_captain',
        timestamp: Date.now()
      };
      state.events = [...(state.events || []), {
        type: 'directive_sent',
        timestamp: Date.now(),
        shipId: targetShipId,
        action
      }].slice(-600);
      state.updatedAt = Date.now();
      return state;
    }).catch(() => {});
  }, []);

  const respondDirective = useCallback((targetShipId, response, message) => {
    if (!stateRef.current) return;
    runTransaction(stateRef.current, (current) => {
      const state = current || baseState();
      const directive = state.directives?.[targetShipId];
      if (!directive) return state;

      const responseItem = {
        shipId: targetShipId,
        directiveId: directive.id,
        response,
        message: message || null,
        timestamp: Date.now()
      };
      state.directiveResponses = [...(state.directiveResponses || []), responseItem].slice(-300);

      if (response === 'ACCEPT') {
        state.directives[targetShipId] = { ...directive, status: 'accepted_pending_tick' };
      } else {
        state.directives[targetShipId] = { ...directive, status: 'escalated_distress' };
        if (message) {
          const parsed = parseDistressLocally(message);
          addAlert(state, {
            type: 'distress',
            shipId: targetShipId,
            severity: parsed.severity,
            incidentType: parsed.incidentType,
            injuries: parsed.injuries,
            damagePct: parsed.damagePct,
            immediateRisk: parsed.immediateRisk,
            message: parsed.summary
          });
        }
      }
      state.updatedAt = Date.now();
      return state;
    }).catch(() => {});
  }, []);

  const ackAlert = useCallback((alertId) => {
    if (!stateRef.current) return;
    runTransaction(stateRef.current, (current) => {
      const state = current || baseState();
      state.alerts = (state.alerts || []).map((a) => (
        a.id === alertId && a.status === 'active'
          ? { ...a, status: 'acknowledged', ackedAt: Date.now(), ackedBy: shipId ? `captain:${shipId}` : 'command' }
          : a
      ));
      return state;
    }).catch(() => {});
  }, [shipId]);

  const resolveAlert = useCallback((alertId) => {
    if (!stateRef.current) return;
    runTransaction(stateRef.current, (current) => {
      const state = current || baseState();
      state.alerts = (state.alerts || []).map((a) => (
        a.id === alertId
          ? { ...a, status: 'resolved', resolvedAt: Date.now(), resolvedBy: shipId ? `captain:${shipId}` : 'command' }
          : a
      ));
      return state;
    }).catch(() => {});
  }, [shipId]);

  const addZone = useCallback((polygon, name) => {
    if (!stateRef.current || !polygon) return;
    runTransaction(stateRef.current, (current) => {
      const state = current || baseState();
      const zone = {
        id: `ZONE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: name || 'Restricted Zone',
        polygon,
        coords: polygon.coordinates[0].map(([lng, lat]) => [lat, lng])
      };
      state.zones = [...(state.zones || []), zone];
      state.updatedAt = Date.now();
      return state;
    }).catch(() => {});
  }, []);

  const deleteZone = useCallback((zoneId) => {
    if (!stateRef.current) return;
    runTransaction(stateRef.current, (current) => {
      const state = current || baseState();
      state.zones = (state.zones || []).filter((z) => z.id !== zoneId);
      state.updatedAt = Date.now();
      return state;
    }).catch(() => {});
  }, []);

  const updateZone = useCallback((zoneId, polygon, name) => {
    if (!stateRef.current || !polygon) return;
    runTransaction(stateRef.current, (current) => {
      const state = current || baseState();
      state.zones = (state.zones || []).map((z) => (
        z.id === zoneId
          ? { ...z, name: name || z.name, polygon, coords: polygon.coordinates[0].map(([lng, lat]) => [lat, lng]) }
          : z
      ));
      state.updatedAt = Date.now();
      return state;
    }).catch(() => {});
  }, []);

  const sendCaptainDistressSignal = useCallback((targetShipId, message) => {
    socketRef.current?.emit('captain:distress_signal', { shipId: targetShipId, message });
  }, []);

  return {
    ships,
    alerts,
    distressEvents: alerts.filter((a) => a.type === 'distress'),
    zones,
    directives,
    directiveResponses,
    routeIntelligenceByShip,
    emergencyBroadcast,
    prisTrackedShips,
    prisSystemMetrics,
    audioSeverity,
    connected,
    backendHealthy,
    sendDirective,
    respondDirective,
    ackAlert,
    resolveAlert,
    addZone,
    deleteZone,
    updateZone,
    selectShipForIntelligence: () => {},
    applyAiReroute: () => {},
    pausePrisShip: () => {},
    resumePrisShip: () => {},
    deepScanPrisShip: () => {},
    forceRecomputePrisShip: () => {},
    sendCaptainDistressSignal,
    socketUrl: typeof window !== 'undefined' ? window.location.origin : ''
  };
}
