const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const INCIDENT_TYPES = new Set(['fire', 'medical', 'mechanical', 'collision', 'weather', 'cargo', 'unknown']);
const FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemma-2-9b-it:free'
];

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

function normalizeResult(parsed, originalMessage) {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message, shipId } = req.body || {};
  if (!message || !shipId) {
    return res.status(400).json({ error: 'message and shipId are required' });
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });
    }

    const model = process.env.OPENROUTER_MODEL || FREE_MODELS[0];
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'VesselSync'
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
      const errorText = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${errorText.slice(0, 400)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.map((part) => part?.text || '').join('')
      : String(content || '');

    const parsed = extractJson(text);
    if (!parsed) {
      throw new Error('Model did not return valid JSON');
    }

    const normalized = normalizeResult(parsed, message);
    console.log('[PHASE 8 COMPLETE]');
    res.json({ shipId, ...normalized });
  } catch (err) {
    console.error('[DISTRESS API] Error parsing or calling OpenRouter:', err);
    res.json({
      shipId,
      severity: 3,
      incidentType: 'unknown',
      injuries: null,
      damagePct: null,
      immediateRisk: false,
      summary: message
    });
  }
}
