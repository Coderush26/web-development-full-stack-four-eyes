function severityScore(alert) {
  if (alert.severity === 'high') {
    return 5;
  }
  if (typeof alert.severity === 'number') {
    return alert.severity;
  }
  return 1;
}

export default function AlertPanel({ alerts, onAck }) {
  const unacked = alerts
    .filter((alert) => !alert.acked)
    .sort((a, b) => severityScore(b) - severityScore(a));

  return (
    <aside className="panel">
      <h3>Alerts</h3>
      {unacked.length === 0 ? <p>No active alerts.</p> : null}
      {unacked.map((alert) => (
        <div className="alert-card" key={alert.id}>
          <strong>{alert.zoneName ? 'Geofence Alert' : 'Proximity Alert'}</strong>
          <div>{alert.zoneName ? `Ship ${alert.shipId} entered ${alert.zoneName}` : `${alert.ship1Id} near ${alert.ship2Id}`}</div>
          <small>{new Date(alert.timestamp || Date.now()).toLocaleTimeString()}</small>
          <button className="btn-secondary" type="button" onClick={() => onAck(alert.id)}>
            Acknowledge
          </button>
        </div>
      ))}
    </aside>
  );
}
