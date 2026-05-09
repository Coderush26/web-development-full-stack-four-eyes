export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
  const response = await fetch(`${backendUrl}/api/distress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body || {})
  });
  const body = await response.json();
  res.status(response.status).json(body);
}
