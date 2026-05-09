# VesselSync

VesselSync is a real-time fleet command dashboard for maritime vessel monitoring, geofencing, routing directives, proximity alerts, weather-aware simulation, and captain escalation workflows.

## Environment variables

Required:

- `OPENROUTER_API_KEY` (from openrouter.ai)
- (Compatibility) `ANTHROPIC_API_KEY` is also accepted by `/api/distress` as a fallback key name.
- `NEXT_PUBLIC_SOCKET_URL` (backend realtime URL, e.g. `http://localhost:3001`)

Create `.env.local`:

```bash
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

`OPENROUTER_MODEL` is optional; default is a free OpenRouter model.

## Run locally

```bash
npm install
npm run dev:backend
npm run dev
```

- Frontend (Next.js): `http://localhost:3000`
- Realtime backend (Socket/API): `http://localhost:3001`
- Backend health endpoint: `http://localhost:3001/health`
- Playback endpoint: `http://localhost:3001/api/playback`

## Docker

```bash
docker compose up --build
```
