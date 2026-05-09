# GRAPH_REPORT.md — Fleet Command
> Auto-generated knowledge graph report for AI coding agents.
> Read this file FIRST before touching any code in this repository.
> Status: ✅ All 10 phases verified passing by Copilot agent.

---

## 🔵 GOD NODES — Most Connected, Everything Flows Through These

| Node | File | Why It's Central |
|------|------|-----------------|
| **`simulator.js`** | `lib/simulator.js` | The simulation heart. Runs the 1s tick loop. Owns `fleet[]` array in memory. Calls `geofence`, `weather`, `router`, `playback` every tick. Emits `fleet:update` via `io`. |
| **`server.js`** | `server.js` | Entry point. Creates Express + Socket.IO server on `:3001`. Creates Next.js frontend on `:3000`. Passes `io` + `getZones` callback into simulator. Owns the in-memory `zones[]` array and `latestDirectives` Map. |
| **`useFleetSocket.js`** | `hooks/useFleetSocket.js` | The single client-side data hub. Every frontend page (`command.js`, `captain.js`) uses this hook. Manages all socket subscriptions and emits all client events. |
| **`fleet[]` (in-memory)** | `lib/simulator.js` L9 | The only source of truth for ship state. Lives in Node.js RAM. NO database. Mutated directly by tick loop, directives, and geofence callbacks. |
| **`zones[]` (in-memory)** | `server.js` L13 | The only source of truth for restricted zones. Owned by `server.js`. Passed by reference via `getZones()` callback to `simulator.js`. |

---

## 🕸️ FULL DEPENDENCY GRAPH

```
server.js
├── lib/simulator.js       ← startTick({ io, getZones })
│   ├── lib/geofence.js    ← checkAll(fleet, zones) → returns rerouteShipIds[]
│   │   └── lib/router.js  ← computePath(ship, zones) [called on geofence breach]
│   ├── lib/router.js      ← computePath(ship, zones) [called on directive:send reroute]
│   ├── lib/weather.js     ← fetchWeather(lat, lng) [every 60 ticks, async]
│   └── lib/playback.js    ← maybeSnapshot(fleet) [every 30 ticks]
├── lib/geofence.js        ← init(io) [called once at startup]
├── lib/router.js          ← computePath() [called in directive:send handler]
├── lib/playback.js        ← getSnapshots() [GET /api/playback]
└── next.js (port 3000)
    └── pages/
        ├── index.js       → redirects to /command
        ├── command.js     → uses useFleetSocket(), FleetMap, AlertPanel, DirectiveModal
        │   ├── hooks/useFleetSocket.js
        │   ├── components/FleetMap.jsx     → ShipMarker, ZoneLayer, DrawToolbar
        │   │   ├── components/ShipMarker.jsx  ← RAF lerp animation, Leaflet Marker
        │   │   └── components/ZoneLayer.jsx   ← renders zone polygons
        │   ├── components/AlertPanel.jsx   ← sorts by severity, ack button
        │   └── components/DirectiveModal.jsx  ← hold/reroute/divert actions
        └── captain.js     → uses useFleetSocket(shipId), POST /api/distress
            └── pages/api/distress.js      ← Anthropic claude-haiku-4-5-20251001
```

---

## 📡 SOCKET EVENT CONTRACT (Server ↔ Client)

### Server → Client
| Event | Payload | When |
|-------|---------|------|
| `fleet:state` | `Ship[]` | On initial socket connection |
| `fleet:update` | `Ship[]` | Every 1 second tick |
| `alert:geofence` | `{ shipId, zoneName, severity:'high', timestamp }` | When ship enters zone for first time |
| `alert:proximity` | `{ ship1Id, ship2Id, distanceKm, timestamp }` | When 2 ships < 2km apart (once per pair) |
| `directive:sent` | `{ shipId, fromRole, action, params, timestamp }` | After command sends a directive |
| `directive:response` | `{ shipId, response, message, timestamp }` | After captain responds |
| `zone:updated` | `{ zones: Zone[] }` | When zone is added or deleted |

### Client → Server
| Event | Payload | Effect |
|-------|---------|--------|
| `directive:send` | `{ shipId, action, params }` | `hold` → stops ship. `reroute` → calls `computePath`. `divert` → sets waypoint+dest as path |
| `directive:respond` | `{ shipId, response, message }` | Broadcasts `directive:response` to all |
| `zone:add` | `{ polygon: GeoJSON, name }` | Appends to `zones[]`, broadcasts `zone:updated` |
| `zone:delete` | `{ zoneId }` | Removes from `zones[]`, broadcasts `zone:updated` |

---

## 🗂️ DATA STRUCTURES

### Ship Object (lives in `fleet[]`)
```js
{
  id: "SHIP-01",                // string — unique key
  name: "MV Hormuz Titan",      // string
  lat: 26.1,                    // number — mutated every tick
  lng: 56.3,                    // number — mutated every tick
  heading: 210,                 // number — degrees, updated toward next waypoint
  speed: 12,                    // number — knots (fixed)
  fuel: 8500,                   // number — decrements by 0.03/tick (0.039 in weather)
  fuelCapacity: 10000,          // number — for fuel% calc
  cargo: "Crude Oil...",        // string
  destination: { name, lat, lng }, // object — mutable via reroute directive
  status: "normal",             // "normal"|"rerouting"|"distressed"|"stopped"|"stranded"
  inWeather: false,             // boolean — updated every 60 ticks from Open-Meteo
  path: [{ lat, lng }],        // array — waypoints. Consumed FIFO. Empty = stopped.
  alerts: []                    // array — unused in current impl (alerts go via Socket.IO)
}
```

### Zone Object (lives in `zones[]`)
```js
{
  id: "ZONE-1234567890",        // string — Date.now() key
  name: "Restricted Zone ...",  // string
  polygon: { type:'Polygon', coordinates: [[lng,lat],...] }, // GeoJSON [lng,lat] order
  coords: [[lat,lng], ...]      // Leaflet format [lat,lng] — for rendering
}
```

> ⚠️ **CRITICAL**: Turf.js uses `[lng, lat]` order everywhere. Ship objects use `{ lat, lng }`.
> Always convert: `turf.point([ship.lng, ship.lat])`. Zones store BOTH formats.

---

## ⚙️ CORE ALGORITHMS

### Movement (simulator.js tick)
```
Every 1000ms for each ship with path.length > 0:
  1. bearing = atan2 formula from current → next waypoint
  2. distKm = (speed * 1.852) / 3600   ← km traveled in 1 second
  3. newPos = spherical great-circle projection along bearing
  4. if turf.distance(current, waypoint) <= 0.05km → shift waypoint, check if path empty
  5. fuel -= inWeather ? 0.039 : 0.03
  6. if fuel <= 0 → status = 'stopped'
```

### Routing (router.js)
```
computePath(ship, zones):
  1. If destination inside any zone → status='stranded', return []
  2. Generate 8 evenly-spaced waypoints along direct line (t = 1/9 to 8/9)
  3. For each waypoint inside a zone:
     - Deflect ±0.3° perpendicular to the direct line
     - Pick whichever side is inside NAVIGABLE_WATER AND outside zones
  4. Append destination as final waypoint
  Return: [{lat, lng}, ..., destination]
```

### Geofencing (geofence.js)
```
checkGeofences(ships, zones):
  - O(N*M) loop — 15 ships × zones
  - Tracks previous state in geofenceState Map (key = "shipId:zoneId")
  - ONLY fires alert on transition: outside → inside (not repeat)
  - Returns: shipIds[] that need re-routing

checkProximity(ships):
  - O(N²) loop — 105 pairs for 15 ships
  - warnedPairs Set prevents duplicate alerts while pair stays < 2km
  - Auto-clears from Set when distance >= 2km
```

### Weather (weather.js)
```
fetchWeather(lat, lng):
  - Rounds lat/lng to 1 decimal for cache key ("26.1:56.3")
  - Cache TTL: 60,000ms — uses Map() keyed by rounded coords
  - Endpoint: api.open-meteo.com/v1/forecast?current=wind_speed_10m&wind_speed_unit=ms
  - Returns: { adverse: windSpeed > 15, windSpeed }
  - NOTE: Open-Meteo returns 429 occasionally — error is caught, previous cache used
```

### Playback (playback.js)
```
maybeSnapshot(fleet):
  - Snapshots every 30 ticks (30 seconds)
  - Stores deep clone (JSON.parse/stringify) of full fleet array
  - Max 120 snapshots (60 minutes). Oldest popped via .shift()
  - Exposed at: GET http://localhost:3001/api/playback
```

---

## 🖥️ FRONTEND PAGES

### `/command` → pages/command.js
- **Role**: Command Headquarters. Sees all 15 ships.
- **Layout**: Full-width map (left) + side panel (right: alerts, ship list)
- **Key interactions**: Click ship on map → `DirectiveModal`. Draw polygon → `zone:add`.
- **Leaflet Draw**: Only enabled for `role="command"` in `FleetMap`. Polygon drawn → GeoJSON → `addZone()` → socket → server.

### `/captain?ship=SHIP-01` → pages/captain.js
- **Role**: Single vessel captain. Only sees own ship telemetry.
- **Key interactions**: ACCEPT directive → `directive:respond(ACCEPT)`. ESCALATE → POST `/api/distress` + `directive:respond(ESCALATE, message)`.
- **No ship param** → renders error state.

### `/` → pages/index.js
- Simple redirect/portal to choose role (Command or Captain).

---

## 🧩 COMPONENT MAP

| Component | Props In | Events Out | Notes |
|-----------|----------|------------|-------|
| `FleetMap` | `ships, zones, role, onAddZone, onIssueDirective` | `onAddZone(polygon, name)`, `onIssueDirective(ship)` | Dynamic import (no SSR). Leaflet only renders client-side. |
| `ShipMarker` | `ship, onIssueDirective` | Click → `onIssueDirective(ship)` | Uses RAF lerp over 900ms. Calls `marker.setLatLng()` directly — NOT React re-render. |
| `ZoneLayer` | `zones` | — | Renders red semi-transparent Polygons. |
| `AlertPanel` | `alerts, onAck` | `onAck(alertId)` | Sorts unacked alerts by severity desc. |
| `DirectiveModal` | `open, ship, ports, onClose, onSend` | `onSend(action, params)` | Conditional fields: port dropdown (reroute), lat/lng inputs (divert). |

---

## 🌐 API ENDPOINTS

| Method | Path | Server | Description |
|--------|------|--------|-------------|
| GET | `/api/playback` | Express :3001 | Returns snapshot array of historical fleet states |
| POST | `/api/distress` | Next.js :3000 | Sends message to Claude Haiku, returns structured JSON |

### `/api/distress` Response Schema
```js
{
  shipId: string,
  severity: 1-5,
  incidentType: "fire|medical|mechanical|collision|weather|cargo|unknown",
  injuries: number | null,
  damagePct: 0-100 | null,
  immediateRisk: boolean,
  summary: string
}
```

---

## 🚨 KNOWN ISSUES & GOTCHAS

1. **Open-Meteo 429s**: Weather API rate-limits occasionally. The error propagates up — the `refreshWeather()` in `simulator.js` catches it with `.catch()` but ships keep their PREVIOUS `inWeather` value. This is acceptable behavior.

2. **`latestDirectives` Map in server.js**: Stores only the LAST directive per ship. Replayed to new socket connections with matching `shipId` query param. Captain page passes `shipId` as query param on socket connect.

3. **No authentication**: Roles are URL-only. `/command` = HQ, `/captain?ship=X` = Captain X. Anyone can access either URL.

4. **Duplicate `NAVIGABLE_WATER` constant**: Defined in BOTH `lib/geofence.js` and `lib/router.js`. Not imported from a shared source. If you update it, update BOTH files.

5. **`alerts` field on Ship objects**: Defined in `fleet.json` schema but never written to. All alerts go via Socket.IO events, not ship object fields.

6. **Leaflet SSR**: `FleetMap` MUST be imported via `next/dynamic` with `{ ssr: false }`. Leaflet accesses `window` — will crash on server render.

7. **Zone coordinate dual format**: Zones have both `polygon` (GeoJSON `[lng,lat]`) and `coords` (Leaflet `[lat,lng]`). `router.js` and `geofence.js` both have a `zoneToPolygon()` helper that handles both formats — check which format a zone has before converting.

8. **`console.log('[PHASE X COMPLETE]')` spam**: Library files (`router.js`, `weather.js`, `playback.js`) log phase checkpoints at module load time, not at runtime. These fire once on startup.

---

## 🗺️ NAVIGABLE WATER BOUNDARY
```
[54.0, 22.5] → [60.5, 22.5] → [60.5, 27.0] → [57.5, 27.5] → [54.5, 26.5] → [54.0, 24.0] → [54.0, 22.5]
```
All routing keeps ships INSIDE this convex polygon (Strait of Hormuz + Persian Gulf).

---

## 💡 SUGGESTED QUESTIONS FOR AGENTS

1. **"How do I add a new ship to the fleet?"** → Edit `data/fleet.json`. Server reads it once at `startTick()`. Restart needed.
2. **"How do I add a new socket event?"** → Add `socket.on(...)` in `server.js`. Add `socket.on(...)` in `useFleetSocket.js`. Return new state from the hook.
3. **"How do I change fuel burn rate?"** → `lib/simulator.js` L105: `0.03` constant (× 1.3 in weather).
4. **"How do I change waypoint count in routing?"** → `lib/router.js` L40: `for (let i = 1; i <= 8; ...)`. Change `8` and `9` together.
5. **"Where is ship state persisted?"** → Nowhere. It's pure in-memory. Server restart resets everything to `fleet.json` starting values.

---

## ✅ PHASE COMPLETION STATUS

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Custom Express + Socket.IO server + simulator tick | ✅ DONE |
| 2 | Routing engine with waypoint deflection | ✅ DONE |
| 3 | Geofence + proximity checks | ✅ DONE |
| 4 | Weather integration (Open-Meteo, 60s cache) | ✅ DONE |
| 5 | Playback ring buffer + GET /api/playback | ✅ DONE |
| 6 | Socket event contracts (all 7 server→client, 4 client→server) | ✅ DONE |
| 7 | FleetMap + ShipMarker lerp animation | ✅ DONE |
| 8 | AI distress parsing via Claude Haiku | ✅ DONE |
| 9 | Command + Captain role interfaces | ✅ DONE |
| 10 | Dockerfile + docker-compose.yml | ✅ DONE |

---

*Confidence tags: All relationships marked EXTRACTED (found directly in source code). No INFERRED or AMBIGUOUS relationships.*
