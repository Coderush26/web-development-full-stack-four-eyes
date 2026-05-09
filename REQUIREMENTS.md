# 📋 Requirements Specification — Fleet Command

## 1. Data Specifications (`fleet.json`)
The system must be preloaded with exactly **15 ships** in the Strait of Hormuz / Persian Gulf region.
* **Geographical Bounds**:
  * Latitude: `22.0` to `27.5`
  * Longitude: `54.0` to `60.5`
* **Vessel Object Schema**:
  ```json
  {
    "id": "SHIP-01",
    "name": "MV Hormuz Titan",
    "lat": 26.1,
    "lng": 56.3,
    "heading": 210,
    "speed": 12,
    "fuel": 8500,
    "fuelCapacity": 10000,
    "cargo": "Crude Oil — 280,000 barrels",
    "destination": { "name": "Port of Fujairah", "lat": 25.11, "lng": 56.34 },
    "status": "normal",
    "inWeather": false,
    "path": [],
    "alerts": []
  }
  ```
* **Variety Rules**: Speeds must vary between `8` and `18` knots. Six different destination ports must be distributed across the region. No two vessels should start within `10km` of each other.

---

## 2. Navigable Water Constraints
All vessel movements must remain within the designated navigable convex polygon in `lib/geofence.js`:
```javascript
const NAVIGABLE_WATER = {
  type: 'Polygon',
  coordinates: [[
    [54.0, 22.5], [60.5, 22.5], [60.5, 27.0],
    [57.5, 27.5], [54.5, 26.5], [54.0, 24.0], [54.0, 22.5]
  ]]
}
```

---

## 3. Simulation Engine (`lib/simulator.js`)
Runs on a continuous **1-second interval** (`1000ms` tick):
* **Movement Calculation**: For vessels with path waypoints, advance position along calculated great-circle bearing.
  * Speed converted: `Knots * 1.852 = km/h`
  * Distance per tick: `speedKmH / 3600`
  * Shift waypoint when within `0.05km`.
* **Fuel Consumption**: `fuel -= (inWeather ? 0.03 * 1.3 : 0.03)` per tick. If fuel drops to `0`, state becomes `stopped`.

---

## 4. Routing Engine (`lib/router.js`)
Implements a custom deflection routing logic:
* Computes a direct line, placing **8 evenly-spaced waypoints**.
* Checks each waypoint using Turf.js `booleanPointInPolygon` against active zone polygons.
* Deflects waypoints by `0.3 degrees` perpendicular to the direction line (trying both left and right directions, selecting the one that keeps the vessel within the `NAVIGABLE_WATER` polygon).

---

## 5. Geofence & Proximity Checks (`lib/geofence.js`)
* **Geofence Check**: If a vessel crosses into an active zone, trigger `'alert:geofence'`, update vessel state to `rerouting`, and initiate `computePath`.
* **Proximity Check**: Compares all vessel pairs $O(N^2)$. If distance is `< 2km` and pair hasn't been warned, trigger `'alert:proximity'`.

---

## 6. Weather & Environmental Engine (`lib/weather.js`)
* Fetches current wind speeds from Open-Meteo API.
* Restrictive wind speed: `> 15 m/s` qualifies as adverse weather.
* Round lat/lng coordinates to `1 decimal place` and cache results for **60 seconds** in a `Map()` cache to prevent API rate limiting.
* Update vessel status every `60 ticks`.

---

## 7. Playback Buffer (`lib/playback.js`)
* Implements a state ring buffer capturing deep-cloned vessel state snapshots every **30 seconds**.
* Max capacity: **120 snapshots** (retaining exactly 60 minutes of historical tracking).
* Exposes `GET /api/playback` endpoint.

---

## 8. AI Distress Parser (`pages/api/distress.js`)
* Accepts distress text transmissions from Vessel Captains.
* Interfaces with **Anthropic Claude Haiku 4.5** using prompt engineering to enforce structured JSON response:
  ```json
  {
    "severity": 1-5,
    "incidentType": "fire|medical|mechanical|collision|weather|cargo|unknown",
    "injuries": number | null,
    "damagePct": 0-100 | null,
    "immediateRisk": true | false,
    "summary": "..."
  }
  ```

---

## 9. Role-Based Dashboards & UI
### Command Dashboard (`/command`)
* **Full-Width Interactive Leaflet Map**: Displays positions, movement vectors, and active/restricted zones.
* **Alert Feed**: Displays unacknowledged alerts sorted by severity desc with quick-action acknowledge buttons.
* **Leaflet Draw Toolbar**: Command operators can draw custom polygons on the map to create real-time geofenced zones.
* **Directives Panel**: Option to send `Hold Position`, `Reroute to Port`, or `Divert to Waypoint` directly to vessels.

### Captain Dashboard (`/captain?ship=SHIP-01`)
* Focuses strictly on a single vessel's parameters (fuel bar, current destination, status badges).
* **Directive Inbox**: Shows latest incoming orders with quick `ACCEPT` or `ESCALATE` toggles.
* **Escalate UI**: Textarea input for writing distress messages, feeding directly into the AI distress analyzer.
