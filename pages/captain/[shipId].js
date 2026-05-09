import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useFleetSocket } from '../../hooks/useFleetSocket';
import { formatOperationalTime } from '../../lib/timeFormat';

const FleetMap = dynamic(() => import('../../components/FleetMap'), { ssr: false });

export default function CaptainCockpitPage() {
  const router = useRouter();
  const shipId = typeof router.query.shipId === 'string' ? router.query.shipId : '';
  const {
    ships,
    zones,
    alerts,
    routeIntelligenceByShip,
    emergencyBroadcast,
    directives,
    respondDirective,
    connected,
    backendHealthy,
    socketUrl,
    audioSeverity,
    selectShipForIntelligence,
    sendCaptainDistressSignal
  } = useFleetSocket(shipId || undefined);
  const [distressText, setDistressText] = useState('');
  const [distressResult, setDistressResult] = useState(null);
  const [distressState, setDistressState] = useState('idle');
  const [fuelBurnRate, setFuelBurnRate] = useState(0);
  const lastFuelRef = useRef(null);
  const ownShip = useMemo(() => ships.find((ship) => ship.id === shipId), [ships, shipId]);
  const latestDirective = shipId ? directives[shipId] : undefined;
  const personalAlerts = useMemo(
    () => alerts
      .filter((alert) => alert.status === 'active' && (alert.shipId === shipId || alert.ship1Id === shipId || alert.ship2Id === shipId))
      .slice(0, 5),
    [alerts, shipId]
  );
  const intelligence = shipId ? routeIntelligenceByShip[shipId] : null;
  const riskScore = intelligence?.routeAnalysis?.riskScore ?? 0;
  const aiThreatLevel = intelligence?.routeAnalysis?.threatLevel || 'LOW';
  const aiConfidence = intelligence?.routeAnalysis?.confidence || 0;
  const aiRecommendation = intelligence?.routeAnalysis?.recommendation?.reason || 'Maintain route and monitor upcoming sectors.';
  const routeHazards = (intelligence?.updatedRoute?.riskAnnotatedPoints || []).filter((p) => p.risk?.totalRisk >= 70).slice(0, 6);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('vesselsync_role', 'captain');
  }, []);

  useEffect(() => {
    if (!shipId) return;
    selectShipForIntelligence(shipId);
  }, [shipId, selectShipForIntelligence]);

  useEffect(() => {
    if (!ownShip) return;
    if (lastFuelRef.current == null) {
      lastFuelRef.current = ownShip.fuel;
      return;
    }
    const delta = Math.max(0, lastFuelRef.current - ownShip.fuel);
    setFuelBurnRate(Number((delta * 60).toFixed(2)));
    lastFuelRef.current = ownShip.fuel;
  }, [ownShip]);

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

  async function sendDistressSignal() {
    if (!shipId) return;
    setDistressState('sending');
    const message = distressText?.trim() || 'Distress signal: vessel requires immediate command support.';
    sendCaptainDistressSignal(shipId, message);
    try {
      const response = await fetch(`${socketUrl}/api/distress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipId, message })
      });
      const parsed = await response.json();
      setDistressResult(parsed);
      setDistressState('sent');
    } catch {
      setDistressState('failed');
    }
  }

  if (!shipId) {
    return null;
  }

  return (
    <div className="captain-layout">
      <header className="topbar">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/favicon.ico?v=2" alt="Logo" width="20" height="20" />
          VesselSync - CAPTAIN COCKPIT
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`audio-state-badge ${String(audioSeverity || 'NORMAL').toLowerCase()}`}>
            Audio State: {audioSeverity || 'NORMAL'}
          </span>
          <button className="btn-secondary" onClick={() => router.push('/captain')}>Switch Vessel</button>
          <div className={connected && backendHealthy ? 'status online' : 'status offline'}>
            {connected && backendHealthy ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </header>

      {!ownShip ? (
        <div className="panel" style={{ margin: 16 }}>
          <h3>Loading ship telemetry...</h3>
          <p style={{ color: '#94a3b8' }}>Waiting for vessel stream {shipId}.</p>
        </div>
      ) : (
        <div className={`captain-cockpit ${emergencyBroadcast?.shipId === shipId ? 'emergency' : ''}`}>
          <section className="captain-top-status">
            <div><span>Ship</span><strong>{ownShip.name}</strong></div>
            <div><span>Status</span><strong>{ownShip.status}</strong></div>
            <div><span>Fuel</span><strong>{Math.round((ownShip.fuel / ownShip.fuelCapacity) * 100)}%</strong></div>
            <div><span>ETA</span><strong>{Math.max(4, Math.round((ownShip.path?.length || 0) / Math.max(ownShip.speed, 6) * 4))} min</strong></div>
          </section>

          <section className="captain-left-panel panel">
            <h3>Ship System Telemetry</h3>
            <div className="captain-status-grid">
              <div><span>Engine</span><strong>{ownShip.status === 'stopped' ? 'offline' : 'operational'}</strong></div>
              <div><span>Fuel Burn Rate</span><strong>{fuelBurnRate} L/min</strong></div>
              <div><span>Speed</span><strong>{ownShip.speed} kn</strong></div>
              <div><span>Heading</span><strong>{ownShip.heading}°</strong></div>
              <div><span>Environment</span><strong>{ownShip.inWeather ? 'adverse' : 'clear'}</strong></div>
              <div><span>Coordinates</span><strong>{ownShip.lat.toFixed(3)}, {ownShip.lng.toFixed(3)}</strong></div>
            </div>
            <div className="fuel-track">
              <div className="fuel-fill" style={{ width: `${Math.max(0, Math.min(100, (ownShip.fuel / ownShip.fuelCapacity) * 100))}%` }} />
            </div>
          </section>

          <section className="captain-center-panel panel">
            <h3>Mini Route Map</h3>
            <div style={{ height: 350 }}>
              <FleetMap
                ships={[ownShip]}
                zones={zones}
                role="captain"
                emergencyBroadcast={emergencyBroadcast}
                tacticalInspection={intelligence ? {
                  enabled: true,
                  shipId,
                  routeModel: {
                    route: {
                      fullPath: intelligence.updatedRoute?.fullPath || [],
                      completed: intelligence.updatedRoute?.completed || [],
                      remaining: intelligence.updatedRoute?.remaining || []
                    }
                  },
                  riskIntelligence: {
                    points: intelligence.updatedRoute?.riskAnnotatedPoints || []
                  }
                } : { enabled: false }}
              />
            </div>
            <div className="captain-hazards">
              {(routeHazards.length === 0 ? [{ risk: { totalRisk: 12 }, sequence: 0 }] : routeHazards).map((hazard) => (
                <div key={`haz-${hazard.sequence}`} className="captain-hazard-row">
                  <span>Upcoming hazard sector</span>
                  <strong>{hazard.risk.totalRisk}%</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="captain-right-panel panel">
            <h3>AI Navigation Assistant</h3>
            <div className={`captain-risk-chip ${riskScore >= 75 ? 'critical' : riskScore >= 45 ? 'warning' : 'normal'}`}>
              Risk Level: {aiThreatLevel} ({riskScore}%)
            </div>
            <p>{aiRecommendation}</p>
            <div className="captain-ai-meta">Confidence: {aiConfidence}%</div>
            <button className="captain-distress-btn" type="button" onClick={sendDistressSignal}>
              🚨 Send Distress Signal
            </button>
            <div className="captain-distress-state">
              {distressState === 'sending' && 'Sending emergency broadcast...'}
              {distressState === 'sent' && 'Emergency broadcast sent to Command Center.'}
              {distressState === 'failed' && 'Failed to send distress, try again.'}
            </div>
            <label style={{ marginTop: 10, display: 'block' }}>
              Distress message
              <textarea
                value={distressText}
                onChange={(event) => setDistressText(event.target.value)}
                placeholder="Engine overheating, smoke visible near stern..."
              />
            </label>
            {!latestDirective ? (
              <p style={{ marginTop: 10 }}>No active command directives.</p>
            ) : (
              <div className="captain-directive-box">
                <strong>Directive: {latestDirective.action}</strong>
                <small suppressHydrationWarning>{formatOperationalTime(latestDirective.timestamp)}</small>
                <button className="btn-primary" type="button" onClick={() => respondDirective(shipId, 'ACCEPT')}>
                  Accept Order
                </button>
                <button className="btn-secondary" type="button" onClick={escalate}>
                  Escalate to AI
                </button>
              </div>
            )}
          </section>

          <section className="captain-bottom-alerts">
            {personalAlerts.length === 0 ? (
              <div className="captain-alert-item">
                <strong>no active alerts</strong>
                <span>All monitored sectors currently stable.</span>
              </div>
            ) : personalAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`captain-alert-item severity-${(typeof alert.severity === 'number' ? alert.severity : 2) >= 4 ? 'critical' : 'warning'}`}
              >
                <strong>{alert.type || 'alert'} • {alert.shipId || ownShip.id}</strong>
                <span>{alert.message}</span>
              </div>
            ))}
          </section>

          {distressResult ? (
            <pre className="json-result" style={{ margin: 16 }}>{JSON.stringify(distressResult, null, 2)}</pre>
          ) : null}
        </div>
      )}
    </div>
  );
}
