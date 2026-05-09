# VesselSync

VesselSync is a real-time fleet command dashboard for maritime vessel monitoring, geofencing, routing directives, proximity alerts, weather-aware simulation, and captain escalation workflows.

## Environment variables

Required:

- `ANTHROPIC_API_KEY` (from console.anthropic.com)

Create `.env.local`:

```bash
ANTHROPIC_API_KEY=your_key_here
```

## Run locally

```bash
npm install
npm run dev
```

- Frontend (Next.js): `http://localhost:3000`
- Socket/API server: `http://localhost:3001`
- Playback endpoint: `http://localhost:3001/api/playback`

## Docker

```bash
docker compose up --build
```
