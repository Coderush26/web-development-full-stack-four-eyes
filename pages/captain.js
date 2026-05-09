import { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useFleetSocket } from '../hooks/useFleetSocket';

export default function CaptainPage() {
  const router = useRouter();
  const shipId = typeof router.query.ship === 'string' ? router.query.ship : '';
  const { ships, directives, respondDirective, connected } = useFleetSocket(shipId || undefined);
  const [distressText, setDistressText] = useState('');
  const [distressResult, setDistressResult] = useState(null);
  const ownShip = useMemo(() => ships.find((ship) => ship.id === shipId), [ships, shipId]);
  const latestDirective = shipId ? directives[shipId] : undefined;

  if (!shipId) {
    return <div className="error-page">No ship ID provided</div>;
  }

  async function escalate() {
    respondDirective(shipId, 'ESCALATE', distressText);
    const response = await fetch('/api/distress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipId, message: distressText })
    });
    const parsed = await response.json();
    setDistressResult(parsed);
  }

  return (
    <div className="captain-layout">
      <header className="topbar">
        <h1>VesselSync - CAPTAIN TERMINAL</h1>
        <div className={connected ? 'status online' : 'status offline'}>
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      {!ownShip ? <p>Loading ship telemetry...</p> : (
        <div className="captain-grid">
          <section className="panel">
            <h3>{ownShip.name} ({ownShip.id})</h3>
            <div>Status: {ownShip.status}</div>
            <div>Speed: {ownShip.speed} knots</div>
            <div>Cargo: {ownShip.cargo}</div>
            <div>Destination: {ownShip.destination.name}</div>
            <div className="fuel-track">
              <div
                className="fuel-fill"
                style={{ width: `${Math.max(0, Math.min(100, (ownShip.fuel / ownShip.fuelCapacity) * 100))}%` }}
              />
            </div>
          </section>

          <section className="panel">
            <h3>Directive Inbox</h3>
            {!latestDirective ? <p>No directives yet.</p> : (
              <>
                <div>Action: {latestDirective.action}</div>
                <small>Received: {new Date(latestDirective.timestamp).toLocaleTimeString()}</small>
                <div className="row">
                  <button className="btn-primary" type="button" onClick={() => respondDirective(shipId, 'ACCEPT')}>
                    ACCEPT
                  </button>
                </div>
                <label>
                  Escalation message
                  <textarea
                    value={distressText}
                    onChange={(event) => setDistressText(event.target.value)}
                    placeholder="Describe injuries, damage, and immediate risk..."
                  />
                </label>
                <button className="btn-secondary" type="button" onClick={escalate}>
                  ESCALATE
                </button>
              </>
            )}

            {distressResult ? (
              <pre className="json-result">{JSON.stringify(distressResult, null, 2)}</pre>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
