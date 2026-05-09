import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useFleetSocket(shipId) {
  const [ships, setShips] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [zones, setZones] = useState([]);
  const [directives, setDirectives] = useState({});
  const [directiveResponses, setDirectiveResponses] = useState([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io('http://localhost:3001', {
      query: shipId ? { shipId } : undefined
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('fleet:state', setShips);
    socket.on('fleet:update', setShips);
    socket.on('zone:updated', ({ zones: nextZones }) => setZones(nextZones));

    socket.on('alert:geofence', (alert) => {
      setAlerts((prev) => [...prev, { ...alert, id: Date.now() + Math.random(), acked: false }]);
      new Audio('/alert.mp3').play().catch(() => {});
    });
    socket.on('alert:proximity', (alert) => {
      setAlerts((prev) => [...prev, { ...alert, id: Date.now() + Math.random(), acked: false }]);
    });
    socket.on('directive:sent', (directive) => {
      setDirectives((prev) => ({ ...prev, [directive.shipId]: directive }));
    });
    socket.on('directive:response', (response) => {
      setDirectiveResponses((prev) => [...prev, response]);
    });

    console.log('[PHASE 6 COMPLETE]');

    return () => {
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
    setAlerts((prev) => prev.map((alert) => (alert.id === alertId ? { ...alert, acked: true } : alert)));
  };

  const addZone = (polygon, name) => {
    socketRef.current?.emit('zone:add', { polygon, name });
  };

  const deleteZone = (zoneId) => {
    socketRef.current?.emit('zone:delete', { zoneId });
  };

  return {
    ships,
    alerts,
    zones,
    directives,
    directiveResponses,
    connected,
    sendDirective,
    respondDirective,
    ackAlert,
    addZone,
    deleteZone
  };
}
