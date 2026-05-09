import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import audioManager from '../src/services/audio/audioManager';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
export function useFleetSocket(shipId) {
  const [ships, setShips] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [distressEvents, setDistressEvents] = useState([]);
  const [zones, setZones] = useState([]);
  const [directives, setDirectives] = useState({});
  const [directiveResponses, setDirectiveResponses] = useState([]);
  const [connected, setConnected] = useState(false);
  const [backendHealthy, setBackendHealthy] = useState(false);
  const [routeIntelligenceByShip, setRouteIntelligenceByShip] = useState({});
  const [emergencyBroadcast, setEmergencyBroadcast] = useState(null);
  const [prisTrackedShips, setPrisTrackedShips] = useState({});
  const [prisSystemMetrics, setPrisSystemMetrics] = useState(null);
  const socketRef = useRef(null);
  const normalizeShips = (nextShips) => (Array.isArray(nextShips)
    ? nextShips.map((ship) => ({
      ...ship,
      destination: ship.destination ? { ...ship.destination } : ship.destination,
      path: Array.isArray(ship.path) ? ship.path.map((point) => ({ ...point })) : []
    }))
    : []);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      query: shipId ? { shipId } : undefined,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10_000
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('fleet:state', (nextShips) => setShips(normalizeShips(nextShips)));
    socket.on('fleet:update', (nextShips) => setShips(normalizeShips(nextShips)));
    socket.on('zone:updated', ({ zones: nextZones }) => setZones(nextZones));
    socket.on('alert:state', setAlerts);

    socket.on('alert:added', () => {});
    socket.on('directive:sent', (directive) => {
      setDirectives((prev) => ({ ...prev, [directive.shipId]: directive }));
    });
    socket.on('directive:response', (response) => {
      setDirectiveResponses((prev) => [...prev, response]);
    });
    socket.on('distress:parsed', (event) => {
      setDistressEvents((prev) => [event, ...prev].slice(0, 100));
    });
    socket.on('route:intelligence:state', (nextState) => {
      setRouteIntelligenceByShip(nextState || {});
    });
    socket.on('route:intelligence:update', (update) => {
      if (!update?.shipId) return;
      setRouteIntelligenceByShip((prev) => ({
        ...prev,
        [update.shipId]: update
      }));

    });
    socket.on('emergency:intelligence:broadcast', (payload) => {
      setEmergencyBroadcast(payload);
    });
    socket.on('pris:tracked:state', (nextState) => {
      setPrisTrackedShips(nextState || {});
    });
    socket.on('pris:system:metrics', (metrics) => {
      setPrisSystemMetrics(metrics);
    });

    console.log('[PHASE 6 COMPLETE]');

    let cancelled = false;
    const runHealthCheck = async () => {
      try {
        const response = await fetch(`${SOCKET_URL}/health`);
        if (!cancelled) {
          setBackendHealthy(response.ok);
        }
      } catch {
        if (!cancelled) {
          setBackendHealthy(false);
        }
      }
    };

    runHealthCheck();
    const healthTimer = setInterval(runHealthCheck, 15_000);

    return () => {
      cancelled = true;
      clearInterval(healthTimer);
      audioManager.stopAll();
      socket.disconnect();
    };
  }, [shipId]);

  useEffect(() => {
    const highestAlertSeverity = alerts.reduce((highest, alert) => {
      if (alert.status !== 'active') return highest;
      const next = typeof alert.severity === 'number'
        ? alert.severity
        : alert.severity === 'high' ? 4 : 2;
      return Math.max(highest, next);
    }, 0);

    const highestRouteThreat = Object.values(routeIntelligenceByShip || {}).reduce((highest, update) => {
      const threat = update?.routeAnalysis?.threatLevel;
      if (threat === 'HIGH') return Math.max(highest, 4);
      if (threat === 'MEDIUM') return Math.max(highest, 2);
      return highest;
    }, 0);

    const emergencyActive = emergencyBroadcast && (Date.now() - emergencyBroadcast.timestamp) < 20_000;
    if (emergencyActive) {
      audioManager.setSeverity('EMERGENCY');
      return;
    }

    const merged = Math.max(highestAlertSeverity, highestRouteThreat);
    if (merged >= 4) audioManager.setSeverity('CRITICAL');
    else if (merged >= 2) audioManager.setSeverity('WARNING');
    else audioManager.setSeverity('NORMAL');
  }, [alerts, routeIntelligenceByShip, emergencyBroadcast]);

  const sendDirective = useCallback((targetShipId, action, params) => {
    socketRef.current?.emit('directive:send', { shipId: targetShipId, action, params });
  }, []);

  const respondDirective = useCallback((targetShipId, response, message) => {
    socketRef.current?.emit('directive:respond', { shipId: targetShipId, response, message });
  }, []);

  const ackAlert = useCallback((alertId) => {
    socketRef.current?.emit('alert:ack', { alertId, by: shipId ? `captain:${shipId}` : 'command' });
  }, [shipId]);

  const resolveAlert = useCallback((alertId) => {
    socketRef.current?.emit('alert:resolve', { alertId, by: shipId ? `captain:${shipId}` : 'command' });
  }, [shipId]);

  const addZone = useCallback((polygon, name) => {
    socketRef.current?.emit('zone:add', { polygon, name });
  }, []);

  const deleteZone = useCallback((zoneId) => {
    socketRef.current?.emit('zone:delete', { zoneId });
  }, []);

  const updateZone = useCallback((zoneId, polygon, name) => {
    socketRef.current?.emit('zone:update', { zoneId, polygon, name });
  }, []);

  const selectShipForIntelligence = useCallback((targetShipId) => {
    socketRef.current?.emit('ship:selected', { shipId: targetShipId });
  }, []);

  const applyAiReroute = useCallback((targetShipId) => {
    socketRef.current?.emit('ship:apply_ai_reroute', { shipId: targetShipId });
  }, []);

  const pausePrisShip = useCallback((targetShipId) => {
    socketRef.current?.emit('pris:ship:pause', { shipId: targetShipId });
  }, []);

  const resumePrisShip = useCallback((targetShipId) => {
    socketRef.current?.emit('pris:ship:resume', { shipId: targetShipId });
  }, []);

  const deepScanPrisShip = useCallback((targetShipId) => {
    socketRef.current?.emit('pris:ship:deep_scan', { shipId: targetShipId });
  }, []);

  const forceRecomputePrisShip = useCallback((targetShipId) => {
    socketRef.current?.emit('pris:ship:force_recompute', { shipId: targetShipId });
  }, []);

  return {
    ships,
    alerts,
    distressEvents,
    zones,
    directives,
    directiveResponses,
    routeIntelligenceByShip,
    emergencyBroadcast,
    prisTrackedShips,
    prisSystemMetrics,
    connected,
    backendHealthy,
    sendDirective,
    respondDirective,
    ackAlert,
    resolveAlert,
    addZone,
    deleteZone,
    updateZone,
    selectShipForIntelligence,
    applyAiReroute,
    pausePrisShip,
    resumePrisShip,
    deepScanPrisShip,
    forceRecomputePrisShip,
    socketUrl: SOCKET_URL
  };
}
