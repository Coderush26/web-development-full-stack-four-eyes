import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
const ALERT_BEEP_DATA_URI = 'data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTAAAACAgICAgICAgP///wAAAP///4CAgICAgID///8AAAD///+AgICAgICA';

export function useFleetSocket(shipId) {
  const [ships, setShips] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [zones, setZones] = useState([]);
  const [directives, setDirectives] = useState({});
  const [directiveResponses, setDirectiveResponses] = useState([]);
  const [connected, setConnected] = useState(false);
  const [backendHealthy, setBackendHealthy] = useState(false);
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

    socket.on('alert:added', () => {
      new Audio(ALERT_BEEP_DATA_URI).play().catch(() => {});
    });
    socket.on('directive:sent', (directive) => {
      setDirectives((prev) => ({ ...prev, [directive.shipId]: directive }));
    });
    socket.on('directive:response', (response) => {
      setDirectiveResponses((prev) => [...prev, response]);
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
      socket.disconnect();
    };
  }, [shipId]);

  const sendDirective = (targetShipId, action, params) => {
    socketRef.current?.emit('directive:send', { shipId: targetShipId, action, params });
  };

  const respondDirective = (targetShipId, response, message) => {
    socketRef.current?.emit('directive:respond', { shipId: targetShipId, response, message });
  };

  const ackAlert = (alertId) => {
    socketRef.current?.emit('alert:ack', { alertId, by: shipId ? `captain:${shipId}` : 'command' });
  };

  const resolveAlert = (alertId) => {
    socketRef.current?.emit('alert:resolve', { alertId, by: shipId ? `captain:${shipId}` : 'command' });
  };

  const addZone = (polygon, name) => {
    socketRef.current?.emit('zone:add', { polygon, name });
  };

  const deleteZone = (zoneId) => {
    socketRef.current?.emit('zone:delete', { zoneId });
  };

  const updateZone = (zoneId, polygon, name) => {
    socketRef.current?.emit('zone:update', { zoneId, polygon, name });
  };

  return {
    ships,
    alerts,
    zones,
    directives,
    directiveResponses,
    connected,
    backendHealthy,
    sendDirective,
    respondDirective,
    ackAlert,
    resolveAlert,
    addZone,
    deleteZone,
    updateZone,
    socketUrl: SOCKET_URL
  };
}
