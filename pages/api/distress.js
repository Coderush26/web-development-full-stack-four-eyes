export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { message, shipId } = req.body || {};
  if (!message || !shipId) {
    return res.status(400).json({ error: 'message and shipId are required' });
  }

  const text = String(message).toLowerCase();
  let severity = 3;
  let incidentType = 'unknown';
  let immediateRisk = false;
  let injuries = null;
  let damagePct = null;

  if (/fire|smoke|burn/.test(text)) {
    severity = 5;
    incidentType = 'fire';
    immediateRisk = true;
  } else if (/collision|hit|crash/.test(text)) {
    severity = 5;
    incidentType = 'collision';
    immediateRisk = true;
  } else if (/injur|medical|bleed/.test(text)) {
    severity = 4;
    incidentType = 'medical';
    immediateRisk = true;
  } else if (/engine|mechanic|failure|breakdown/.test(text)) {
    severity = 4;
    incidentType = 'mechanical';
  } else if (/storm|wind|wave|weather/.test(text)) {
    severity = 4;
    incidentType = 'weather';
  } else if (/cargo|spill|leak/.test(text)) {
    severity = 4;
    incidentType = 'cargo';
  }

  const injuriesMatch = text.match(/(\d+)\s*(injur|crew|person|people)/);
  if (injuriesMatch) injuries = Number(injuriesMatch[1]);
  const damageMatch = text.match(/(\d+)\s*%/);
  if (damageMatch) damagePct = Number(damageMatch[1]);

  return res.json({
    shipId,
    severity,
    incidentType,
    injuries,
    damagePct,
    immediateRisk,
    summary: String(message).slice(0, 180)
  });
}
