# VesselSync

VesselSync is a real-time fleet command dashboard for maritime vessel monitoring, geofencing, routing directives, proximity alerts, weather-aware simulation, and captain escalation workflows.

This project is now configured for **Firebase Spark-safe mode**:
- Uses Firebase Realtime Database as the shared state store.
- No separate backend deployment is required for core fleet operations.
- Distress parsing runs with local rule-based extraction (no secret key required on Spark).

## Environment variables

Required: none for Spark-safe mode.

## Run locally

```bash
npm install
npm run dev
```

- Frontend (Next.js): `http://localhost:3000`
- Realtime state sync: Firebase Realtime DB (`vesselsync-itu-default-rtdb`)
