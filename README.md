# VesselSync

VesselSync is a real-time fleet command dashboard for maritime vessel monitoring, geofencing, routing directives, proximity alerts, weather-aware simulation, and captain escalation workflows.

## Environment variables

Required:

- `OPENROUTER_API_KEY` (from openrouter.ai)

Create `.env.local`:

```bash
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
```

`OPENROUTER_MODEL` is optional; default is a free OpenRouter model.

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
