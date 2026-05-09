import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message, shipId } = req.body || {};
  if (!message || !shipId) {
    return res.status(400).json({ error: 'message and shipId are required' });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `You are a maritime emergency analyst. Extract structured data from this distress message.
      
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
    });

    const text = response.content?.[0]?.text || '{}';
    const parsed = JSON.parse(text);
    console.log('[PHASE 8 COMPLETE]');
    res.json({ shipId, ...parsed });
  } catch (err) {
    console.error('[DISTRESS API] Error parsing or calling Anthropic:', err);
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
