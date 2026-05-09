const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const simulator = require('./lib/simulator');
const geofence = require('./lib/geofence');
const router = require('./lib/router');
const playback = require('./lib/playback');
const weather = require('./lib/weather');
const prisEngine = require('./server/prisEngine');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const INCIDENT_TYPES = new Set(['fire', 'medical', 'mechanical', 'collision', 'weather', 'cargo', 'unknown']);
const FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemma-2-9b-it:free'
];

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});

let zones = [];
const latestDirectives = new Map();
const pendingAcceptedDirectives = new Map();
let alerts = [];
const trackedShips = new Map();
const latestIntelligenceByShip = new Map();
let emergencyEventsToday = 0;
let emergencyCountDate = new Date().toDateString();

function toLeafletCoords(geoJsonPolygon) {
  const outerRing = geoJsonPolygon?.coordinates?.[0] || [];
  return outerRing.map(([lng, lat]) => [lat, lng]);
}

function normalizePolygon(polygon) {
  const ring = polygon?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) {
    return null;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
  return { type: 'Polygon', coordinates: [closed] };
}

function addAlert(partial) {
  const alert = {
    id: `ALERT-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
    status: 'active',
    ackedBy: null,
    resolvedBy: null,
    ...partial
  };
  alerts = [...alerts, alert]
    .sort((a, b) => (b.severity || 1) - (a.severity || 1))
    .slice(0, 300);
  io.emit('alert:added', alert);
  io.emit('alert:state', alerts);
  return alert;
}

function ingestAlerts(nextAlerts = []) {
  for (const alert of nextAlerts) {
    addAlert(alert);
  }
}

function extractJson(text) {
  const cleaned = (text || '').trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {}
  const fenced = cleaned.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }
  const objectLike = cleaned.match(/\{[\s\S]*\}/);
  if (objectLike?.[0]) {
    try {
      return JSON.parse(objectLike[0]);
    } catch {}
  }
  return null;
}

function normalizeDistressResult(parsed, originalMessage) {
  const severityRaw = Number(parsed?.severity);
  const severity = Number.isFinite(severityRaw)
    ? Math.max(1, Math.min(5, Math.round(severityRaw)))
    : 3;
  const incidentTypeRaw = String(parsed?.incidentType || 'unknown').toLowerCase();
  const incidentType = INCIDENT_TYPES.has(incidentTypeRaw) ? incidentTypeRaw : 'unknown';
  const injuriesRaw = parsed?.injuries;
  const injuries = injuriesRaw == null || Number.isNaN(Number(injuriesRaw))
    ? null
    : Math.max(0, Math.round(Number(injuriesRaw)));
  const damageRaw = parsed?.damagePct;
  const damagePct = damageRaw == null || Number.isNaN(Number(damageRaw))
    ? null
    : Math.max(0, Math.min(100, Math.round(Number(damageRaw))));

  return {
    severity,
    incidentType,
    injuries,
    damagePct,
    immediateRisk: Boolean(parsed?.immediateRisk),
    summary: String(parsed?.summary || originalMessage)
  };
}

async function parseDistressWithModel(message) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY (or ANTHROPIC_API_KEY) is not configured');
  }
  const model = process.env.OPENROUTER_MODEL || FREE_MODELS[0];
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 256,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'You are a maritime emergency analyst. Return ONLY valid JSON.'
        },
        {
          role: 'user',
          content: `Extract structured data from this distress message.

Distress message: "${message}"

Respond with ONLY valid JSON, no explanation:
{
  "severity": 1-5,
  "incidentType": "fire|medical|mechanical|collision|weather|cargo|unknown",
  "injuries": number or null,
  "damagePct": 0-100 or null,
  "immediateRisk": true|false,
  "summary": "one sentence"
}`
        }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}`);
  }
  const data = await response.json();
  const text = String(data?.choices?.[0]?.message?.content || '');
  const parsed = extractJson(text);
  if (!parsed) {
    throw new Error('Model did not return valid JSON');
  }
  return normalizeDistressResult(parsed, message);
}

function recomputeShipPath(ship, reason) {
  const route = router.computeRoute(ship, zones, { getWeatherRiskAt: weather.getWeatherRiskSync });
  ship.path = route.path;
  ship.insufficientFuel = route.insufficientFuel;
  ship.estimatedFuelRequired = route.estimatedFuelRequired;

  if (route.stranded) {
    ship.status = 'stranded';
    addAlert({
      type: 'stranded',
      shipId: ship.id,
      severity: 5,
      message: `Ship ${ship.id} stranded during ${reason}`
    });
    return;
  }
  if (route.insufficientFuel && ship.status !== 'stopped') {
    ship.status = 'insufficient_fuel';
  } else if (ship.status !== 'stopped') {
    ship.status = 'normal';
  }
}

function applyDirectiveOnTick(directive) {
  const { shipId, action, params } = directive;
  const ship = simulator.getShip(shipId);
  if (!ship) {
    return;
  }
  if (action === 'reroute' && params?.destination) {
    ship.destination = params.destination;
    ship.status = 'rerouting';
    recomputeShipPath(ship, 'accepted_reroute');
  } else if (action === 'hold') {
    ship.status = 'stopped';
    ship.path = [];
  } else if (action === 'divert' && params?.waypoint) {
    ship.destination = params.waypoint;
    ship.status = 'rerouting';
    recomputeShipPath(ship, 'accepted_divert');
  }
}

function rerouteShipsIntersectingZones(reason) {
  const ships = simulator.getAllShips();
  const impacted = ships.filter((ship) => geofence.routeIntersectsZones(ship, zones));
  for (const ship of impacted) {
    ship.status = 'rerouting';
    recomputeShipPath(ship, reason);
  }
}

function getModeIntervalMs(mode) {
  if (mode === 'deepScan') return 3000;
  if (mode === 'paused') return Number.POSITIVE_INFINITY;
  return 8000;
}

function getBackendLoadIndicator() {
  const active = Array.from(trackedShips.values()).filter((entry) => entry.active).length;
  if (active >= 7) return 'high';
  if (active >= 4) return 'medium';
  return 'low';
}

function emitPrisMetrics() {
  const today = new Date().toDateString();
  if (today !== emergencyCountDate) {
    emergencyCountDate = today;
    emergencyEventsToday = 0;
  }
  const trackedEntries = Array.from(trackedShips.entries());
  const activeEntries = trackedEntries.filter(([, entry]) => entry.active);
  const activeRiskScores = activeEntries
    .map(([shipId]) => latestIntelligenceByShip.get(shipId)?.routeAnalysis?.riskScore)
    .filter((value) => typeof value === 'number');
  const averageRiskScore = activeRiskScores.length
    ? Math.round(activeRiskScores.reduce((sum, value) => sum + value, 0) / activeRiskScores.length)
    : 0;

  io.emit('pris:system:metrics', {
    timestamp: Date.now(),
    activePrisShips: activeEntries.length,
    trackedShips: trackedEntries.length,
    averageRiskScore,
    emergencyEventsToday,
    backendLoad: getBackendLoadIndicator()
  });
}

function emitTrackedShipsState() {
  io.emit('pris:tracked:state', Object.fromEntries(trackedShips.entries()));
}

function updateTrackedShip(shipId, patch) {
  const current = trackedShips.get(shipId) || {
    active: true,
    lastUpdate: 0,
    mode: 'standard',
    routeStatus: 'monitoring'
  };
  trackedShips.set(shipId, { ...current, ...patch });
  emitTrackedShipsState();
  emitPrisMetrics();
}

function emitRouteIntelligence(shipId, forcedRoutePoints, modeOverride) {
  const ship = simulator.getShip(shipId);
  if (!ship) {
    return null;
  }
  const tracked = trackedShips.get(shipId);
  const mode = modeOverride || tracked?.mode || 'standard';
  const snapshot = prisEngine.buildIntelligenceSnapshot({
    ship,
    ships: simulator.getAllShips(),
    zones,
    getWeatherRiskAt: weather.getWeatherRiskSync,
    forcedRoutePoints,
    mode
  });
  latestIntelligenceByShip.set(shipId, snapshot);
  updateTrackedShip(shipId, {
    active: mode !== 'paused',
    mode,
    lastUpdate: Date.now(),
    routeStatus: snapshot.routeAnalysis?.recommendation?.action === 'REROUTE' ? 'reroute-advised' : 'monitoring'
  });
  io.emit('route:intelligence:update', snapshot);

  if (snapshot.routeAnalysis.riskScore >= 86) {
    const today = new Date().toDateString();
    if (today !== emergencyCountDate) {
      emergencyCountDate = today;
      emergencyEventsToday = 0;
    }
    emergencyEventsToday += 1;
    io.emit('emergency:intelligence:broadcast', {
      shipId,
      timestamp: Date.now(),
      severity: snapshot.routeAnalysis.threatLevel,
      riskScore: snapshot.routeAnalysis.riskScore,
      message: `Critical predictive risk for ${shipId}: ${snapshot.routeAnalysis.threats[0] || 'Escalation detected'}`
    });
    emitPrisMetrics();
  }
  return snapshot;
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    uptimeMs: Math.round(process.uptime() * 1000),
    ships: simulator.getAllShips().length,
    zones: zones.length,
    alerts: alerts.length
  });
});

app.get('/api/playback', (_req, res) => {
  res.json(playback.getSnapshots());
});

app.post('/api/distress', async (req, res) => {
  const { message, shipId } = req.body || {};
  if (!message || !shipId) {
    return res.status(400).json({ error: 'message and shipId are required' });
  }
  let parsed;
  try {
    parsed = await parseDistressWithModel(message);
  } catch (error) {
    console.error('[DISTRESS API] fallback parser used:', error.message);
    parsed = {
      severity: 3,
      incidentType: 'unknown',
      injuries: null,
      damagePct: null,
      immediateRisk: false,
      summary: message
    };
  }

  const result = { shipId, ...parsed };
  addAlert({
    type: 'distress',
    shipId,
    severity: result.severity,
    incidentType: result.incidentType,
    injuries: result.injuries,
    damagePct: result.damagePct,
    immediateRisk: result.immediateRisk,
    message: result.summary
  });
  io.emit('distress:parsed', result);
  res.json(result);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log(`[SOCKET] Connected: ${socket.id}`);
  socket.emit('fleet:state', simulator.getAllShips());
  socket.emit('zone:updated', { zones });
  socket.emit('alert:state', alerts);
  socket.emit('directive:state', Object.fromEntries(latestDirectives.entries()));
  socket.emit('route:intelligence:state', Object.fromEntries(latestIntelligenceByShip.entries()));
  socket.emit('pris:tracked:state', Object.fromEntries(trackedShips.entries()));
  emitPrisMetrics();

  const handshakedShipId = socket.handshake.query?.shipId;
  if (typeof handshakedShipId === 'string' && latestDirectives.has(handshakedShipId)) {
    socket.emit('directive:sent', latestDirectives.get(handshakedShipId));
  }

  socket.on('directive:send', (payload) => {
    const { shipId, action, params } = payload || {};
    const ship = simulator.getShip(shipId);
    if (!ship || !action) {
      return;
    }
    const directive = {
      id: `DIR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      shipId,
      fromRole: 'command',
      action,
      params: params || {},
      status: 'pending_captain',
      timestamp: Date.now()
    };
    latestDirectives.set(shipId, directive);
    io.emit('directive:sent', directive);
  });

  socket.on('ship:selected', (payload) => {
    const shipId = payload?.shipId;
    if (!shipId) {
      return;
    }
    updateTrackedShip(shipId, {
      active: true,
      mode: trackedShips.get(shipId)?.mode === 'deepScan' ? 'deepScan' : 'standard'
    });
    emitRouteIntelligence(shipId);
  });

  socket.on('ship:apply_ai_reroute', (payload) => {
    const shipId = payload?.shipId;
    if (!shipId) {
      return;
    }
    const baseline = latestIntelligenceByShip.get(shipId) || emitRouteIntelligence(shipId);
    if (!baseline) {
      return;
    }
    const alternativePoints = prisEngine.buildAlternativeRoutePoints(baseline);
    emitRouteIntelligence(shipId, alternativePoints);
  });

  socket.on('captain:distress_signal', (payload) => {
    const shipId = payload?.shipId;
    const message = String(payload?.message || 'Captain distress signal triggered').trim();
    if (!shipId) return;
    const ship = simulator.getShip(shipId);
    if (ship) {
      ship.status = 'distress';
    }
    addAlert({
      type: 'distress',
      shipId,
      severity: 5,
      incidentType: 'unknown',
      immediateRisk: true,
      message
    });
    emergencyEventsToday += 1;
    io.emit('emergency:intelligence:broadcast', {
      shipId,
      timestamp: Date.now(),
      severity: 'HIGH',
      riskScore: 96,
      message
    });
    emitPrisMetrics();
  });

  socket.on('pris:ship:pause', (payload) => {
    const shipId = payload?.shipId;
    if (!shipId) return;
    updateTrackedShip(shipId, { active: false, mode: 'paused', routeStatus: 'paused' });
  });

  socket.on('pris:ship:resume', (payload) => {
    const shipId = payload?.shipId;
    if (!shipId) return;
    updateTrackedShip(shipId, { active: true, mode: 'standard', routeStatus: 'monitoring' });
    emitRouteIntelligence(shipId, undefined, 'standard');
  });

  socket.on('pris:ship:deep_scan', (payload) => {
    const shipId = payload?.shipId;
    if (!shipId) return;
    updateTrackedShip(shipId, { active: true, mode: 'deepScan', routeStatus: 'deep-scan-active' });
    emitRouteIntelligence(shipId, undefined, 'deepScan');
  });

  socket.on('pris:ship:force_recompute', (payload) => {
    const shipId = payload?.shipId;
    if (!shipId) return;
    const mode = trackedShips.get(shipId)?.mode || 'standard';
    emitRouteIntelligence(shipId, undefined, mode);
  });

  socket.on('directive:respond', async (payload) => {
    const shipId = payload?.shipId;
    const latest = shipId ? latestDirectives.get(shipId) : null;
    if (!latest) {
      return;
    }

    const response = payload?.response;
    const responseEvent = {
      shipId,
      directiveId: latest.id,
      response,
      message: payload?.message,
      timestamp: Date.now()
    };

    if (response === 'ACCEPT') {
      latest.status = 'accepted_pending_tick';
      pendingAcceptedDirectives.set(latest.id, latest);
      io.emit('directive:sent', latest);
    } else {
      latest.status = 'escalated_distress';
      io.emit('directive:sent', latest);
      if (response === 'ESCALATE_DISTRESS' && payload?.message) {
        try {
          const parsed = await parseDistressWithModel(payload.message);
          const distress = { shipId, ...parsed };
          addAlert({
            type: 'distress',
            shipId,
            severity: distress.severity,
            incidentType: distress.incidentType,
            injuries: distress.injuries,
            damagePct: distress.damagePct,
            immediateRisk: distress.immediateRisk,
            message: distress.summary
          });
          io.emit('distress:parsed', distress);
        } catch (error) {
          addAlert({
            type: 'distress',
            shipId,
            severity: 3,
            message: payload.message
          });
        }
      }
    }
    io.emit('directive:response', responseEvent);
  });

  socket.on('alert:ack', (payload) => {
    alerts = alerts.map((alert) => {
      if (alert.id !== payload?.alertId || alert.status !== 'active') {
        return alert;
      }
      return {
        ...alert,
        status: 'acknowledged',
        ackedBy: payload?.by || 'operator',
        ackedAt: Date.now()
      };
    });
    io.emit('alert:state', alerts);
  });

  socket.on('alert:resolve', (payload) => {
    alerts = alerts.map((alert) => {
      if (alert.id !== payload?.alertId) {
        return alert;
      }
      return {
        ...alert,
        status: 'resolved',
        resolvedBy: payload?.by || 'operator',
        resolvedAt: Date.now()
      };
    });
    io.emit('alert:state', alerts);
  });

  socket.on('zone:add', (payload) => {
    const normalized = normalizePolygon(payload?.polygon);
    if (!normalized) {
      return;
    }

    const zone = {
      id: `ZONE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: payload.name || 'Restricted Zone',
      polygon: normalized,
      coords: toLeafletCoords(normalized)
    };
    zones = [...zones, zone];
    io.emit('zone:updated', { zones });
    rerouteShipsIntersectingZones('zone_add');
    for (const [trackedShipId, entry] of trackedShips.entries()) {
      if (entry.active) emitRouteIntelligence(trackedShipId);
    }
  });

  socket.on('zone:update', (payload) => {
    const normalized = normalizePolygon(payload?.polygon);
    if (!normalized || !payload?.zoneId) {
      return;
    }
    zones = zones.map((zone) => (
      zone.id === payload.zoneId
        ? { ...zone, polygon: normalized, coords: toLeafletCoords(normalized), name: payload.name || zone.name }
        : zone
    ));
    io.emit('zone:updated', { zones });
    rerouteShipsIntersectingZones('zone_edit');
    for (const [trackedShipId, entry] of trackedShips.entries()) {
      if (entry.active) emitRouteIntelligence(trackedShipId);
    }
  });

  socket.on('zone:delete', (payload) => {
    zones = zones.filter((zone) => zone.id !== payload?.zoneId);
    io.emit('zone:updated', { zones });
    rerouteShipsIntersectingZones('zone_delete');
    for (const [trackedShipId, entry] of trackedShips.entries()) {
      if (entry.active) emitRouteIntelligence(trackedShipId);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] Disconnected: ${socket.id}`);
  });
});

function start() {
  geofence.init(io);
  server.listen(Number(process.env.BACKEND_PORT || 3001), () => {
    simulator.startTick({
      io,
      getZones: () => zones,
      onTickStart: () => {
        for (const directive of pendingAcceptedDirectives.values()) {
          applyDirectiveOnTick(directive);
          directive.status = 'applied';
          io.emit('directive:sent', directive);
          pendingAcceptedDirectives.delete(directive.id);
        }
        for (const [trackedShipId, entry] of trackedShips.entries()) {
          if (!entry.active || entry.mode === 'paused') {
            continue;
          }
          const intervalMs = getModeIntervalMs(entry.mode);
          const due = (Date.now() - (entry.lastUpdate || 0)) >= intervalMs;
          if (due) {
            emitRouteIntelligence(trackedShipId, undefined, entry.mode);
          }
        }
      },
      onAlerts: (nextAlerts) => {
        ingestAlerts(nextAlerts);
      }
    });
    console.log('[SERVER] Backend realtime server on :3001');
  });
}

start();
