const express = require('express');
const http = require('http');
const next = require('next');
const { Server } = require('socket.io');
const simulator = require('./lib/simulator');
const geofence = require('./lib/geofence');
const router = require('./lib/router');
const playback = require('./lib/playback');

const socketApp = express();
socketApp.use(express.json());

let zones = [];
const latestDirectives = new Map();

socketApp.get('/api/playback', (_req, res) => {
  res.json(playback.getSnapshots());
});

const socketHttpServer = http.createServer(socketApp);
const io = new Server(socketHttpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

function toLeafletCoords(geoJsonPolygon) {
  const outerRing = geoJsonPolygon?.coordinates?.[0] || [];
  return outerRing.map(([lng, lat]) => [lat, lng]);
}

io.on('connection', (socket) => {
  console.log(`[SOCKET] Connected: ${socket.id}`);
  socket.emit('fleet:state', simulator.getAllShips());
  socket.emit('zone:updated', { zones });

  const handshakedShipId = socket.handshake.query?.shipId;
  if (typeof handshakedShipId === 'string' && latestDirectives.has(handshakedShipId)) {
    socket.emit('directive:sent', latestDirectives.get(handshakedShipId));
  }

  socket.on('directive:send', (payload) => {
    const { shipId, action, params } = payload || {};
    const ship = simulator.getShip(shipId);
    if (!ship) {
      return;
    }

    if (action === 'reroute' && params?.destination) {
      ship.destination = params.destination;
      ship.status = 'rerouting';
      ship.path = router.computePath(ship, zones);
    } else if (action === 'hold') {
      ship.status = 'stopped';
      ship.path = [];
    } else if (action === 'divert' && params?.waypoint) {
      ship.status = 'rerouting';
      ship.path = [params.waypoint, ship.destination];
    }

    const directive = {
      shipId,
      fromRole: 'command',
      action,
      params,
      timestamp: Date.now()
    };
    latestDirectives.set(shipId, directive);
    io.emit('directive:sent', directive);
  });

  socket.on('directive:respond', (payload) => {
    const responseEvent = {
      shipId: payload?.shipId,
      response: payload?.response,
      message: payload?.message,
      timestamp: Date.now()
    };
    io.emit('directive:response', responseEvent);
  });

  socket.on('zone:add', (payload) => {
    if (!payload?.polygon || payload?.polygon?.type !== 'Polygon') {
      return;
    }

    const zone = {
      id: `ZONE-${Date.now()}`,
      name: payload.name || 'Restricted Zone',
      polygon: payload.polygon,
      coords: toLeafletCoords(payload.polygon)
    };
    zones = [...zones, zone];
    io.emit('zone:updated', { zones });
  });

  socket.on('zone:delete', (payload) => {
    zones = zones.filter((zone) => zone.id !== payload?.zoneId);
    io.emit('zone:updated', { zones });
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] Disconnected: ${socket.id}`);
  });
});

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const nextHandler = nextApp.getRequestHandler();

async function start() {
  geofence.init(io);

  socketHttpServer.listen(3001, () => {
    simulator.startTick({ io, getZones: () => zones });
    console.log('[SERVER] Socket server on :3001');
    console.log('[PHASE 1 COMPLETE]');
  });

  await nextApp.prepare();
  const nextExpress = express();
  nextExpress.all('*', (req, res) => nextHandler(req, res));
  nextExpress.listen(3000, () => {
    console.log('[SERVER] Next.js on :3000');
    console.log('[PHASE 10 COMPLETE]');
  });
}

start().catch((error) => {
  console.error('[SERVER] Startup failed:', error);
  process.exit(1);
});
