import { formatOperationalTime } from '../lib/timeFormat';

function severityScore(alert) {
  if (alert.severity === 'high') return 5;
  if (typeof alert.severity === 'number') return alert.severity;
  return 1;
}

export default function AlertPanel({ alerts, onAck }) {
  const unacked = alerts
    .filter((alert) => alert.status === 'active')
    .sort((a, b) => severityScore(b) - severityScore(a));

  if (unacked.length === 0) {
    return <p style={{ fontSize: '0.75rem', color: '#475569', margin: 0 }}>No active alerts.</p>;
  }

  return (
    <>
      {unacked.map((alert) => (
        <div className={`alert-card severity-${severityScore(alert) >= 5 ? 'emergency' : severityScore(alert) >= 4 ? 'critical' : severityScore(alert) >= 2 ? 'warning' : 'normal'}`} key={alert.id}>
          <strong>
            {alert.type === 'distress' ? '🚨 Distress'
              : alert.zoneName ? '🛑 Geofence'
                : '⚠️ Proximity'}
          </strong>
          <div>
            {alert.message || (alert.zoneName
              ? `${alert.shipId} entered ${alert.zoneName}`
              : `${alert.ship1Id} ↔ ${alert.ship2Id}`)}
          </div>
          <small suppressHydrationWarning>{alert.timestamp ? formatOperationalTime(alert.timestamp) : '--'}</small>
          <div style={{ marginTop: 6 }}>
            <button className="btn-danger" type="button" onClick={() => onAck(alert.id)} style={{ fontSize: '0.68rem', padding: '4px 10px' }}>
              Acknowledge
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
