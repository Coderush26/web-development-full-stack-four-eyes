import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useFleetSocket } from '../hooks/useFleetSocket';

const FleetMap = dynamic(() => import('../components/FleetMap'), { ssr: false });

export default function CaptainPage() {
  const router = useRouter();
  const shipId = typeof router.query.ship === 'string' ? router.query.ship : '';
  const { ships, zones, directives, respondDirective, connected, backendHealthy, socketUrl } = useFleetSocket(shipId || undefined);
  const [distressText, setDistressText] = useState('');
  const [distressResult, setDistressResult] = useState(null);
  const ownShip = useMemo(() => ships.find((ship) => ship.id === shipId), [ships, shipId]);
  const latestDirective = shipId ? directives[shipId] : undefined;

  if (!shipId) {
    return <div className="error-page">No ship ID provided</div>;
  }

  async function escalate() {
    respondDirective(shipId, 'ESCALATE_DISTRESS', distressText);
    const response = await fetch(`${socketUrl}/api/distress`, {
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
        <div className={connected && backendHealthy ? 'status online' : 'status offline'}>
          {connected && backendHealthy ? 'Connected' : 'Disconnected'}
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

          <section className="panel" style={{ minHeight: 360 }}>
            <h3>Navigation Map (Read-only)</h3>
            <div style={{ height: 320 }}>
              <FleetMap
                ships={[ownShip]}
                zones={zones}
                role="captain"
              />
            </div>
          </section>

          <section className="panel">
            <h3>Directive Inbox</h3>
            {!latestDirective ? <p>No directives yet.</p> : (
              <>
                <div style={{ marginBottom: 10, padding: '10px 12px', background: 'rgba(0,242,254,0.06)', borderLeft: '3px solid #00f2fe', borderRadius: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 6 }}>
                    {latestDirective.action === 'hold' && '🛑 Hold Position'}
                    {latestDirective.action === 'reroute' && '🔀 Reroute to Port'}
                    {latestDirective.action === 'divert' && '📍 Divert to Waypoint'}
                    {!['hold','reroute','divert'].includes(latestDirective.action) && `Order: ${latestDirective.action}`}
                  </div>

                  {latestDirective.action === 'reroute' && latestDirective.params?.destination && (
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                      <div>📌 Destination: <strong style={{ color: '#e2e8f0' }}>{latestDirective.params.destination.name}</strong></div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {latestDirective.params.destination.lat?.toFixed(4)}°N, {latestDirective.params.destination.lng?.toFixed(4)}°E
                      </div>
                    </div>
                  )}

                  {latestDirective.action === 'divert' && latestDirective.params?.waypoint && (
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                      <div>📌 Waypoint: <strong style={{ color: '#e2e8f0' }}>
                        {latestDirective.params.waypoint.lat?.toFixed(4)}°N, {latestDirective.params.waypoint.lng?.toFixed(4)}°E
                      </strong></div>
                    </div>
                  )}

                  {latestDirective.action === 'hold' && (
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Stop engines and maintain current position.</div>
                  )}

                  <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#475569' }}>
                    From: Fleet HQ &nbsp;·&nbsp; {new Date(latestDirective.timestamp).toLocaleTimeString()} &nbsp;·&nbsp;
                    <span style={{ color: latestDirective.status === 'accepted_pending_tick' ? '#22c55e' : latestDirective.status === 'escalated_distress' ? '#ef4444' : '#f59e0b' }}>
                      {latestDirective.status?.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                <div className="row" style={{ gap: 8 }}>
                  <button className="btn-primary" type="button" onClick={() => respondDirective(shipId, 'ACCEPT')}>
                    ✓ ACCEPT ORDER
                  </button>
                </div>
                <label style={{ marginTop: 10, display: 'block' }}>
                  Escalation message
                  <textarea
                    value={distressText}
                    onChange={(event) => setDistressText(event.target.value)}
                    placeholder="Describe injuries, damage, and immediate risk..."
                  />
                </label>
                <button className="btn-secondary" type="button" onClick={escalate}>
                  ⚠ ESCALATE
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
