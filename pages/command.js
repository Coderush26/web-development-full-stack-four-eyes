import { useMemo, useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import AlertPanel from '../components/AlertPanel';
import DirectiveModal from '../components/DirectiveModal';
import { useFleetSocket } from '../hooks/useFleetSocket';

const FleetMap = dynamic(() => import('../components/FleetMap'), { ssr: false });

const PORTS = [
  { name: 'Port of Fujairah', lat: 25.11, lng: 56.34 },
  { name: 'Port of Jebel Ali', lat: 25.01, lng: 55.06 },
  { name: 'Bandar Abbas Port', lat: 27.14, lng: 56.21 },
  { name: 'Port of Khasab', lat: 26.2, lng: 56.25 },
  { name: 'Sohar Port', lat: 24.41, lng: 56.63 },
  { name: 'Port of Muscat', lat: 23.62, lng: 58.59 }
];

export default function CommandPage() {
  const { ships, alerts, zones, connected, ackAlert, addZone, sendDirective } = useFleetSocket();
  const [selectedShip, setSelectedShip] = useState(null);
  const [inspectedShip, setInspectedShip] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [playbackIndex, setPlaybackIndex] = useState(-1);

  useEffect(() => { console.log('[PHASE 9 COMPLETE]'); }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/playback');
        if (res.ok) setSnapshots(await res.json());
      } catch (e) { /* silent */ }
    };
    const id = setInterval(load, 15000);
    load();
    return () => clearInterval(id);
  }, []);

  const sortedShips = useMemo(
    () => [...ships].sort((a, b) => a.id.localeCompare(b.id)),
    [ships]
  );

  const displayShips = playbackIndex === -1 ? ships : (snapshots[playbackIndex]?.ships || []);

  // Keep inspected ship data fresh
  const liveInspected = useMemo(() => {
    if (!inspectedShip) return null;
    return displayShips.find(s => s.id === inspectedShip.id) || inspectedShip;
  }, [inspectedShip, displayShips]);

  const fuelPct = useCallback((ship) => {
    if (!ship?.fuelCapacity) return 0;
    return Math.round((ship.fuel / ship.fuelCapacity) * 100);
  }, []);

  const fuelClass = useCallback((pct) => {
    if (pct > 50) return 'high';
    if (pct > 20) return 'medium';
    return 'low';
  }, []);

  const unackedAlerts = useMemo(
    () => alerts.filter(a => !a.acked),
    [alerts]
  );

  return (
    <div className="layout">
      {/* ─── LEFT SIDEBAR ─── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">⚓</div>
            <h1>VesselSync</h1>
          </div>
          <div className="sidebar-status">
            <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
            {connected ? 'System Online' : 'Disconnected'} • {ships.length} vessels
          </div>
        </div>

        <div className="sidebar-ships">
          <div className="sidebar-section-title">Fleet Vessels</div>
          {sortedShips.map((ship) => (
            <div
              key={ship.id}
              className={`ship-card ${inspectedShip?.id === ship.id ? 'active' : ''}`}
              onClick={() => setInspectedShip(ship)}
            >
              <div className={`ship-card-icon ${ship.status}`}>🚢</div>
              <div className="ship-card-info">
                <div className="ship-card-name">{ship.name}</div>
                <div className="ship-card-meta">
                  <span>{ship.speed} kn</span>
                  <span>{fuelPct(ship)}% fuel</span>
                </div>
              </div>
              <span className={`ship-card-status ${ship.status}`}>{ship.status}</span>
            </div>
          ))}
        </div>

        {unackedAlerts.length > 0 && (
          <div className="sidebar-alerts">
            <div className="sidebar-section-title">⚠ Alerts ({unackedAlerts.length})</div>
            <AlertPanel alerts={alerts} onAck={ackAlert} />
          </div>
        )}
      </aside>

      {/* ─── MAIN MAP AREA ─── */}
      <main className="main-content">
        <div className="map-container">
          <FleetMap
            ships={displayShips}
            zones={zones}
            role="command"
            onAddZone={addZone}
            onIssueDirective={(ship) => {
              setInspectedShip(ship);
              setSelectedShip(ship);
            }}
          />
        </div>

        {/* ─── FLOATING TELEMETRY CARD ─── */}
        {liveInspected && (
          <div className="telemetry-card">
            <div className="telemetry-card-header">
              <div>
                <div className="telemetry-ship-name">{liveInspected.name}</div>
                <div className="telemetry-ship-id">{liveInspected.id} • {liveInspected.cargo}</div>
              </div>
              <button className="telemetry-close" onClick={() => setInspectedShip(null)}>✕</button>
            </div>

            <div className="telemetry-grid">
              <div className="telemetry-stat">
                <div className="telemetry-stat-label">Speed</div>
                <div className="telemetry-stat-value speed">
                  {liveInspected.speed} <span className="telemetry-stat-unit">knots</span>
                </div>
              </div>
              <div className="telemetry-stat">
                <div className="telemetry-stat-label">Heading</div>
                <div className="telemetry-stat-value heading">
                  {liveInspected.heading}° <span className="telemetry-stat-unit">bearing</span>
                </div>
              </div>
              <div className="telemetry-stat">
                <div className="telemetry-stat-label">Fuel</div>
                <div className={`telemetry-stat-value fuel ${fuelPct(liveInspected) < 20 ? 'low' : ''}`}>
                  {Math.round(liveInspected.fuel)} <span className="telemetry-stat-unit">L</span>
                </div>
              </div>
              <div className="telemetry-stat">
                <div className="telemetry-stat-label">Status</div>
                <div className="telemetry-stat-value status">{liveInspected.status}</div>
              </div>
            </div>

            <div className="telemetry-fuel-section">
              <div className="telemetry-fuel-header">
                <span className="telemetry-fuel-label">Fuel Level</span>
                <span className={`telemetry-fuel-pct ${fuelClass(fuelPct(liveInspected)) === 'low' ? 'fuel low' : ''}`}
                  style={{ color: fuelPct(liveInspected) > 50 ? '#4ade80' : fuelPct(liveInspected) > 20 ? '#fbbf24' : '#f87171' }}>
                  {fuelPct(liveInspected)}%
                </span>
              </div>
              <div className="fuel-bar">
                <div
                  className={`fuel-bar-fill ${fuelClass(fuelPct(liveInspected))}`}
                  style={{ width: `${fuelPct(liveInspected)}%` }}
                />
              </div>
            </div>

            <div className="telemetry-details">
              <div className="telemetry-detail-row">
                <span>Destination</span>
                <span>{liveInspected.destination?.name}</span>
              </div>
              <div className="telemetry-detail-row">
                <span>Position</span>
                <span>{liveInspected.lat?.toFixed(4)}, {liveInspected.lng?.toFixed(4)}</span>
              </div>
              <div className="telemetry-detail-row">
                <span>Weather</span>
                <span style={{ color: liveInspected.inWeather ? '#f87171' : '#4ade80' }}>
                  {liveInspected.inWeather ? '⛈ Adverse' : '☀ Clear'}
                </span>
              </div>
            </div>

            <div className="telemetry-actions">
              <button className="btn-primary" onClick={() => setSelectedShip(liveInspected)}>
                Issue Directive
              </button>
              <button className="btn-secondary" onClick={() => setInspectedShip(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ─── PLAYBACK PANEL ─── */}
        {snapshots.length > 0 && (
          <footer className="playback-panel">
            <div className="playback-control">
              <span className="playback-label">
                ⏱ {playbackIndex === -1
                  ? <strong>LIVE</strong>
                  : <strong>{new Date(snapshots[playbackIndex]?.timestamp).toLocaleTimeString()}</strong>}
              </span>
              <input
                type="range"
                min="-1"
                max={snapshots.length - 1}
                value={playbackIndex}
                onChange={(e) => setPlaybackIndex(Number(e.target.value))}
                className="playback-slider"
              />
              <button className="btn-secondary" onClick={() => setPlaybackIndex(-1)}>Go Live</button>
            </div>
          </footer>
        )}
      </main>

      <DirectiveModal
        open={Boolean(selectedShip)}
        ship={selectedShip}
        ports={PORTS}
        onClose={() => setSelectedShip(null)}
        onSend={(action, params) => {
          if (selectedShip) sendDirective(selectedShip.id, action, params);
          setSelectedShip(null);
        }}
      />
    </div>
  );
}
