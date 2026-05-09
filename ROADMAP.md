# 🗺️ Implementation Roadmap — Fleet Command

Here is the structured 10-phase sequence to build the Fleet Command system during the 4-hour hackathon. Each phase must be completed and verified before proceeding to the next.

---

## 🏁 Phase Progress Overview

| Phase | Component | Status | Verification Checkpoint |
| :---: | :--- | :---: | :--- |
| **1** | [Custom Server & Socket Foundation](#phase-1--custom-server--socket-foundation) | `[ ]` | Server starts, tick logs output every 1s |
| **2** | [Routing Engine](#phase-2--routing-engine) | `[ ]` | `computePath` successfully deflects waypoints around zones |
| **3** | [Geofence & Proximity Checks](#phase-3--geofence--proximity-checks) | `[ ]` | Entering a zone triggers an active socket alert |
| **4** | [Weather Integration](#phase-4--weather-integration) | `[ ]` | Wind speed is successfully fetched and cached per cell |
| **5** | [Playback Ring Buffer](#phase-5--playback-ring-buffer) | `[ ]` | `/api/playback` returns snapshots history successfully |
| **6** | [Socket Event Contracts](#phase-6--socket-event-contracts) | `[ ]` | Core bi-directional events establish connection |
| **7** | [Next.js Map Frontend](#phase-7--nextjs-map-frontend) | `[ ]` | 15 vessels render and interpolate smoothly on Leaflet map |
| **8** | [AI Distress Parsing](#phase-8--ai-distress-parsing) | `[ ]` | Claude Haiku correctly returns structured distress JSON |
| **9** | [Role Interfaces UI](#phase-9--role-interfaces-ui) | `[ ]` | Command direct-flow sends instructions to Captain inbox |
| **10**| [Dockerization](#phase-10--dockerization) | `[ ]` | Docker Compose successfully deploys both client and server |

---

## 🛠️ Phase Checklists

### Phase 1 — Custom Server & Socket Foundation
- [ ] Initialize `package.json` with required dependencies.
- [ ] Generate `data/fleet.json` with 15 real-time starting vessels.
- [ ] Implement `server.js` running on Express + Socket.IO (Port 3001).
- [ ] Implement `lib/simulator.js` with position advancing, bearing, and fuel calculations.
- [ ] **Verify**: `node server.js` starts, logs `[PHASE 1 COMPLETE]`, and triggers a 1s tick.

### Phase 2 — Routing Engine
- [ ] Implement `lib/router.js` with waypoint deflection logic.
- [ ] Use Turf.js `booleanPointInPolygon` and `distance` functions.
- [ ] **Verify**: `computePath(ship, [])` returns the correct array of waypoints ending at the port. Log `[PHASE 2 COMPLETE]`.

### Phase 3 — Geofence & Proximity Checks
- [ ] Implement `lib/geofence.js` with active zone checks.
- [ ] Implement `O(N^2)` ship-to-ship distance checks (< 2km).
- [ ] **Verify**: Moving a vessel into a test zone triggers a geofence alert. Log `[PHASE 3 COMPLETE]`.

### Phase 4 — Weather Integration
- [ ] Implement `lib/weather.js` pointing to Open-Meteo.
- [ ] Create cell round-off key caching mechanism (60s cache).
- [ ] Update vessel positions with weather modifiers every 60s.
- [ ] **Verify**: Weather checks correctly return wind velocity and set `inWeather`. Log `[PHASE 4 COMPLETE]`.

### Phase 5 — Playback Ring Buffer
- [ ] Implement `lib/playback.js` with ring buffer (`MAX_SNAPSHOTS = 120`).
- [ ] Expose `GET /api/playback` on Express.
- [ ] **Verify**: Active request returns the snapshot buffer. Log `[PHASE 5 COMPLETE]`.

### Phase 6 — Socket Event Contracts
- [ ] Define solid socket contracts for `fleet:state`, `fleet:update`, `directive:send`, `zone:add`.
- [ ] Ensure perfect client-server naming parity.
- [ ] **Verify**: Socket connection emits state updates successfully. Log `[PHASE 6 COMPLETE]`.

### Phase 7 — Next.js Map Frontend
- [ ] Create `hooks/useFleetSocket.js` using `socket.io-client`.
- [ ] Implement `components/FleetMap.jsx` using `MapContainer` & `TileLayer`.
- [ ] Build client-side marker coordinate `lerp` in `ShipMarker.jsx`.
- [ ] **Verify**: Vessels slide smoothly across the map on tick updates. Log `[PHASE 7 COMPLETE]`.

### Phase 8 — AI Distress Parsing
- [ ] Implement `pages/api/distress.js` with `@anthropic-ai/sdk`.
- [ ] Create system instruction prompting Claude Haiku 4.5.
- [ ] **Verify**: POST with sample emergency message outputs parsed JSON. Log `[PHASE 8 COMPLETE]`.

### Phase 9 — Role Interfaces UI
- [ ] Build `/command` dashboard (Full-Screen Map + AlertPanel + Directives).
- [ ] Build `/captain?ship=SHIP-01` dashboard (Vessel Stats + Inbox + Escalate Distress Panel).
- [ ] **Verify**: Action sent from Command shows immediately in Captain's Inbox. Log `[PHASE 9 COMPLETE]`.

### Phase 10 — Dockerization
- [ ] Build standard production-grade `Dockerfile`.
- `[ ]` Formulate `docker-compose.yml` linking Ports `3000` & `3001`.
- [ ] **Verify**: System successfully initializes via `docker compose up`. Log `[PHASE 10 COMPLETE]`.
